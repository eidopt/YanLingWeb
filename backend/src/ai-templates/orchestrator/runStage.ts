import type { AIProvider, ProviderMessage, ProviderTool } from '@shared/agent/contracts/provider';
import type { ToolResult, ToolSpec } from '@shared/agent/contracts/queryLoop';
import { QueryLoop } from '@shared/agent/runtime';

import type { AiTemplatePipelineProvider } from '../../ai/pipelineProvider.port';

export interface StageRunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
}

export interface StageRunResult<T> {
  output: T;
  usage: StageRunUsage;
  iterations: number;
}

export interface StageRunOptions<T> {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userMessage: string;
  /** 必须只有 1 个工具 — stage 用结构化输出工具捕获最终结果 */
  tool: ProviderTool;
  /** 解析工具调用 args → 结构化输出。抛错表示 LLM 输出不合格 */
  parse: (args: Record<string, unknown>) => T;
  /** 可选：最大迭代次数，默认 6（结构化输出不该来回拉扯） */
  maxIterations?: number;
  /** 可选：记录每次 LLM 调用消耗的 token */
  aiProvider?: AiTemplatePipelineProvider;
  /** 可选：当前请求的用户 ID；存在时把本 stage 的 token 记入该用户名下 */
  ownerUserId?: string;
}

/**
 * 跑一个"结构化输出"风格的 stage QueryLoop。
 *
 * 模式：
 *  - 注册 1 个工具，LLM 必须调用它一次
 *  - 工具 executor 捕获 args 到闭包变量
 *  - 返回 action: 'done' 终止 loop
 *  - 累计 token usage（含 cache hit）
 *
 * 失败模式：
 *  - LLM 不调用工具 → throw "stage did not invoke tool"
 *  - LLM 调用了工具但 parse 抛错 → throw 透传
 *  - QueryLoop stopReason 是 error/max_iterations → throw
 */
export async function runStructuredStage<T>(
  options: StageRunOptions<T>,
): Promise<StageRunResult<T>> {
  let captured: T | undefined;
  let parseError: Error | undefined;
  const usage: StageRunUsage = { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 };

  const toolSpecs = new Map<string, ToolSpec>();
  toolSpecs.set(options.tool.name, { name: options.tool.name, supportsParallel: false });

  const loop = new QueryLoop({
    provider: options.provider,
    model: options.model,
    tools: [options.tool],
    toolSpecs,
    toolExecutor: (name, args): Promise<ToolResult> => {
      if (name !== options.tool.name) {
        return Promise.resolve({ output: JSON.stringify({ error: `unknown tool: ${name}` }) });
      }
      try {
        captured = options.parse(args);
        parseError = undefined;
        return Promise.resolve({ output: JSON.stringify({ accepted: true }), action: 'done' });
      } catch (err) {
        parseError = err instanceof Error ? err : new Error(String(err));
        // 诊断：把每次工具输入被拒的具体校验错误打出来（默认被当 tool result 喂回 LLM、
        // 不可见）。便于排查 SchemaGen 为何反复耗尽迭代、栽在哪条校验。
        console.warn(`[stage:${options.tool.name}] 输入被拒 → ${parseError.message}`);
        return Promise.resolve({
          output: JSON.stringify({
            error: parseError.message,
            hint: '重新调用工具，修正参数后再次提交',
          }),
        });
      }
    },
    onTextDelta: () => undefined,
    onToolEvent: () => undefined,
    onUsage: async (u) => {
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      usage.cacheHitTokens += u.cacheHitTokens ?? 0;
      if (options.ownerUserId && options.aiProvider?.recordTemplatePipelineTokenUsage) {
        await options.aiProvider.recordTemplatePipelineTokenUsage(
          options.ownerUserId,
          options.model,
          u,
        );
      }
    },
    isCancelled: () => false,
    maxIterations: options.maxIterations ?? 6,
  });

  const messages: ProviderMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userMessage },
  ];

  const result = await loop.run(messages);

  if (result.stopReason === 'error') {
    throw new Error(`stage QueryLoop error: ${result.error ?? 'unknown'}`);
  }
  if (result.stopReason === 'max_iterations') {
    throw new Error(`stage QueryLoop exceeded max iterations`);
  }
  if (parseError) {
    throw parseError;
  }
  if (captured === undefined) {
    throw new Error(
      `stage "${options.tool.name}" did not invoke tool; loop stopped with no structured output`,
    );
  }

  return { output: captured, usage, iterations: result.iterations };
}
