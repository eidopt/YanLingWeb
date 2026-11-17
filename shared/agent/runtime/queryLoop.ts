import type { ProviderMessage, ProviderRequest, ProviderStreamEvent } from '../contracts/provider';
import type { PendingToolCall, QueryLoopConfig, QueryResult, ToolResult } from '../contracts/queryLoop';

export type { PendingToolCall, QueryLoopConfig, QueryResult, ToolResult, ToolSpec } from '../contracts/queryLoop';

const MAX_ITERATIONS = 20;
const MAX_API_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;
const RETRY_DELAY_MS = 1000;
const MAX_SAME_TOOL_REPEAT = 3;
const MAX_OUTPUT_TOKENS_RECOVERY = 3;
const MAX_CONTINUATION_RETRIES = 3;
const MAX_TOOL_RETRIES = 3;
const TOOL_RETRY_DELAY_MS = 500;
const BYTES_PER_TOKEN = 4;
const IMAGE_MAX_TOKEN_SIZE = 2000;
const MICRO_KEEP_RECENT = 6;
const LARGE_RESULT_THRESHOLD = 1000;

function roughTokenCount(content: string): number {
  return Math.round(content.length / BYTES_PER_TOKEN);
}

function tokenCountWithEstimation(messages: readonly ProviderMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      total += roughTokenCount(message.content);
    } else {
      for (const part of message.content) {
        if ('text' in part && typeof part.text === 'string') {
          total += roughTokenCount(part.text);
        } else if ('type' in part && part.type === 'image_url') {
          total += IMAGE_MAX_TOKEN_SIZE;
        } else {
          total += roughTokenCount(JSON.stringify(part));
        }
      }
    }
    if (message.toolArguments) {
      total += roughTokenCount(message.toolArguments);
    }
  }
  return Math.ceil(total * (4 / 3));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function truncateToolResult(content: string, toolName: string): string {
  if (content.length <= 340) {
    return content;
  }
  return [
    `[Tool result truncated - ${toolName}: original ${content.length} chars]`,
    '',
    content.slice(0, 200),
    '...',
    content.slice(-80),
  ].join('\n');
}

function microcompactMessages(messages: ProviderMessage[]): ProviderMessage[] {
  const toolIdsInOrder: string[] = [];
  const sizeMap = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === 'tool_call' && msg.toolCallId) {
      toolIdsInOrder.push(msg.toolCallId);
      if (msg.toolName) {
        nameMap.set(msg.toolCallId, msg.toolName);
      }
    }
    if (msg.role === 'tool_result' && msg.toolCallId && typeof msg.content === 'string') {
      sizeMap.set(msg.toolCallId, msg.content.length);
    }
  }

  const large = toolIdsInOrder.filter((id) => (sizeMap.get(id) ?? 0) >= LARGE_RESULT_THRESHOLD);
  if (large.length <= MICRO_KEEP_RECENT) {
    return messages;
  }

  const keepSet = new Set(large.slice(-MICRO_KEEP_RECENT));
  const trimSet = new Set(large.filter((id) => !keepSet.has(id)));

  return messages.map((msg) => {
    if (msg.role !== 'tool_result' || !msg.toolCallId || !trimSet.has(msg.toolCallId)) {
      return msg;
    }
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.includes('[Tool result truncated')) {
      return msg;
    }
    return {
      ...msg,
      content: truncateToolResult(content, nameMap.get(msg.toolCallId) ?? 'unknown'),
    };
  });
}

function compactConversation(messages: ProviderMessage[]): ProviderMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const recent = nonSystem.slice(-12);
  const old = nonSystem.slice(0, Math.max(0, nonSystem.length - recent.length));
  const summary =
    old
      .filter((m) => typeof m.content === 'string' && (m.role === 'user' || m.role === 'tool_result'))
      .slice(-12)
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : '';
        return `- ${m.role}: ${content.slice(0, 180)}`;
      })
      .join('\n') || 'Prior work recorded.';
  return [
    ...system,
    {
      role: 'user',
      content: [
        '[Compaction - prior context compressed]',
        '',
        summary,
        '',
        '[Continue from here. Do not repeat completed work.]',
      ].join('\n'),
    },
    ...recent,
  ];
}

function parseToolArguments(argumentsText: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(argumentsText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function executeToolCall(
  call: PendingToolCall,
  cfg: QueryLoopConfig,
): Promise<{ call: PendingToolCall; result: ToolResult }> {
  const args = parseToolArguments(call.arguments);
  if (!args) {
    return {
      call,
      result: { output: JSON.stringify({ error: 'Invalid JSON arguments' }) },
    };
  }

  cfg.onToolEvent({ name: call.name, status: 'start' });

  let result: ToolResult = {
    output: JSON.stringify({ error: 'Tool execution failed after max retries' }),
  };
  let retries = 0;

  while (retries <= MAX_TOOL_RETRIES) {
    try {
      result = await cfg.toolExecutor(call.name, args);
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = ['timeout', 'network', 'ECONNRESET', 'ETIMEDOUT', '503', '502'].some((item) =>
        message.includes(item),
      );

      if (retryable && retries < MAX_TOOL_RETRIES) {
        retries += 1;
        await new Promise((resolve) => setTimeout(resolve, TOOL_RETRY_DELAY_MS * Math.pow(2, retries)));
        continue;
      }

      result = { output: JSON.stringify({ error: message }) };
      break;
    }
  }

  const isError = result.output.startsWith('{"error');
  cfg.onToolEvent({ name: call.name, status: isError ? 'error' : 'done' });
  return { call, result };
}

async function executeToolCalls(
  pendingCalls: PendingToolCall[],
  cfg: QueryLoopConfig,
): Promise<{ call: PendingToolCall; result: ToolResult }[]> {
  const canRunInParallel =
    pendingCalls.length > 1 && pendingCalls.every((call) => cfg.toolSpecs.get(call.name)?.supportsParallel === true);

  if (canRunInParallel) {
    return Promise.all(pendingCalls.map((call) => executeToolCall(call, cfg)));
  }

  const results: { call: PendingToolCall; result: ToolResult }[] = [];
  for (const call of pendingCalls) {
    if (cfg.isCancelled()) {
      break;
    }
    results.push(await executeToolCall(call, cfg));
  }
  return results;
}

export class QueryLoop {
  private iterations = 0;
  private consecutiveErrors = 0;
  private continuationRetries = 0;
  private hasAttemptedReactiveCompact = false;
  private hasAttemptedProactiveCompact = false;
  private lastToolSig = '';
  private sameToolCount = 0;
  private maxOutputTokensEscalated = false;
  private maxOutputTokensRecovery = 0;
  private consecutiveNodeNotFoundErrors = 0;
  private nodeNotFoundIds: string[] = [];

  constructor(private readonly cfg: QueryLoopConfig) {}

  async run(messages: ProviderMessage[]): Promise<QueryResult> {
    let current = [...messages];
    const maxIter = this.cfg.maxIterations ?? MAX_ITERATIONS;
    let continuationParts: string[] = [];
    let lastResponseId: string | undefined;

    while (!this.cfg.isCancelled()) {
      this.iterations += 1;
      if (this.iterations > maxIter) {
        const err = `超过最大迭代次数 ${maxIter}，停止执行。`;
        this.cfg.onError?.(err);
        return {
          messages: current,
          finalText: '',
          iterations: this.iterations,
          stopReason: 'max_iterations',
          error: err,
          ...(lastResponseId && { responseId: lastResponseId }),
        };
      }

      current = microcompactMessages(current);

      // 主动上下文压缩：在调用 API 前预判 token 是否接近上限，避免 PTL 错误
      if (!this.hasAttemptedProactiveCompact) {
        const maxTokens = this.cfg.maxContextTokens ?? 128_000;
        if (tokenCountWithEstimation(current) > maxTokens * 0.7) {
          current = compactConversation(current);
          this.hasAttemptedProactiveCompact = true;
          this.cfg.onContextCompacted?.();
          continue;
        }
      }

      const pendingCalls: PendingToolCall[] = [];
      const textChunks: string[] = [];
      let hasText = false;
      let apiError: string | null = null;
      let isPTL = false;
      let stopReason: 'end_turn' | 'max_tokens' = 'end_turn';
      let reasoningContent: string | undefined;
      const request = this.buildRequest(current);

      try {
        for await (const event of this.streamWithRetry(request)) {
          if (this.cfg.isCancelled()) {
            break;
          }
          switch (event.type) {
            case 'text_delta':
              hasText = true;
              textChunks.push(event.text);
              this.cfg.onTextDelta(event.text);
              break;
            case 'reasoning_delta':
              this.cfg.onReasoningDelta?.(event.text);
              break;
            case 'tool_call':
              pendingCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
              break;
            case 'error':
              apiError = event.message;
              isPTL = isPTLError(event.message);
              break;
            case 'done':
              if (event.stopReason) {
                stopReason = event.stopReason;
              }
              if (event.response_id) {
                lastResponseId = event.response_id;
              }
              if (event.reasoningContent) {
                reasoningContent = event.reasoningContent;
              }
              if (event.usage) {
                await this.cfg.onUsage?.(event.usage, request);
              }
              break;
          }
        }
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
        isPTL = isPTLError(apiError);
      }

      if (this.cfg.isCancelled()) {
        break;
      }

      if (
        stopReason === 'max_tokens' &&
        pendingCalls.length === 0 &&
        !hasText &&
        !this.maxOutputTokensEscalated &&
        this.maxOutputTokensRecovery < MAX_OUTPUT_TOKENS_RECOVERY
      ) {
        this.maxOutputTokensEscalated = true;
        this.maxOutputTokensRecovery += 1;
        this.iterations -= 1;
        continue;
      }

      if (isPTL && !this.hasAttemptedReactiveCompact) {
        this.hasAttemptedReactiveCompact = true;
        current = compactConversation(current);
        this.cfg.onContextCompacted?.();
        continue;
      }

      if (apiError) {
        this.consecutiveErrors += 1;
        if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || (!hasText && pendingCalls.length === 0)) {
          const err = `API错误: ${apiError}`;
          this.cfg.onError?.(err);
          return {
            messages: current,
            finalText: '',
            iterations: this.iterations,
            stopReason: 'error',
            error: err,
            ...(lastResponseId && { responseId: lastResponseId }),
          };
        }
      } else {
        this.consecutiveErrors = 0;
        this.hasAttemptedReactiveCompact = false;
        this.hasAttemptedProactiveCompact = false;
      }

      const assistantText = textChunks.join('');
      if (assistantText.trim()) {
        current.push({
          role: 'assistant',
          content: assistantText,
          ...(reasoningContent && { reasoningContent }),
        });
      }

      if (
        stopReason === 'max_tokens' &&
        pendingCalls.length === 0 &&
        assistantText.trim().length > 0 &&
        this.continuationRetries < MAX_CONTINUATION_RETRIES
      ) {
        continuationParts.push(assistantText);
        current.push({
          role: 'user',
          content: '[系统提示] 回复被截断，请继续，不要重复已完成的内容。',
        });
        this.continuationRetries += 1;
        continue;
      }

      if (pendingCalls.length === 0) {
        return {
          messages: current,
          finalText: continuationParts.length > 0 ? [...continuationParts, assistantText].join('') : assistantText,
          iterations: this.iterations,
          stopReason: 'completed',
          ...(lastResponseId && { responseId: lastResponseId }),
        };
      }

      this.continuationRetries = 0;
      continuationParts = [];

      const toolResults = await executeToolCalls(pendingCalls, this.cfg);
      if (this.cfg.isCancelled()) {
        break;
      }

      for (const { call, result } of toolResults) {
        current.push({
          role: 'tool_call',
          content: '',
          toolCallId: call.id,
          toolName: call.name,
          toolArguments: call.arguments,
          ...(reasoningContent && { reasoningContent }),
        });
        current.push({
          role: 'tool_result',
          content: result.output,
          toolCallId: call.id,
        });
      }

      this.maybeInjectLoopHint(current, pendingCalls, toolResults);

      const contextTokens = tokenCountWithEstimation(current);
      console.warn(
        `[QueryLoop] iter=${this.iterations} tools=${pendingCalls.length}` +
          ` ctx=~${Math.round(contextTokens / 1000)}k tokens`,
      );
    }

    return {
      messages: current,
      finalText: '',
      iterations: this.iterations,
      stopReason: 'cancelled',
      ...(lastResponseId && { responseId: lastResponseId }),
    };
  }

  private buildRequest(messages: ProviderMessage[]): ProviderRequest {
    return {
      model: this.cfg.model,
      messages,
      tools: this.cfg.tools,
      ...(this.cfg.requestCache ? { cache: this.cfg.requestCache } : {}),
    };
  }

  private maybeInjectLoopHint(
    messages: ProviderMessage[],
    calls: PendingToolCall[],
    toolResults: { call: PendingToolCall; result: ToolResult }[],
  ): void {
    const sig = calls.map((c) => `${c.name}:${c.arguments}`).join('|');
    if (sig === this.lastToolSig) {
      this.sameToolCount += 1;
    } else {
      this.lastToolSig = sig;
      this.sameToolCount = 0;
    }

    let hasNodeNotFound = false;
    const failedIdsThisRound: string[] = [];

    for (const tr of toolResults) {
      try {
        const parsed: unknown = JSON.parse(tr.result.output);
        if (isRecord(parsed)) {
          if ('failedId' in parsed && 'candidates' in parsed) {
            hasNodeNotFound = true;
            if (typeof parsed.failedId === 'string') {
              failedIdsThisRound.push(parsed.failedId);
            }
          } else if (
            typeof parsed.error === 'string' &&
            (parsed.error.includes('Node not found') || parsed.error.includes('AI referenced unknown'))
          ) {
            hasNodeNotFound = true;
          }

          if (Array.isArray(parsed.errors)) {
            for (const err of parsed.errors) {
              if (typeof err !== 'string') {
                continue;
              }
              try {
                // 非贪婪匹配第一个 JSON 对象，避免嵌套对象匹配出错
                const match = err.match(/\{(?:[^{}]|"(?:\\.|[^"\\])*")*\}/);
                if (match) {
                  const inner: unknown = JSON.parse(match[0]);
                  if (isRecord(inner) && typeof inner.failedId === 'string') {
                    hasNodeNotFound = true;
                    failedIdsThisRound.push(inner.failedId);
                  }
                }
              } catch {
                if (err.includes('Node not found') || err.includes('AI referenced unknown')) {
                  hasNodeNotFound = true;
                }
              }
            }
          }
        }
      } catch {
        if (tr.result.output.includes('Node not found') || tr.result.output.includes('AI referenced unknown')) {
          hasNodeNotFound = true;
        }
      }
    }

    if (hasNodeNotFound) {
      this.consecutiveNodeNotFoundErrors += 1;
      this.nodeNotFoundIds.push(...failedIdsThisRound);
    } else {
      this.consecutiveNodeNotFoundErrors = 0;
      this.nodeNotFoundIds = [];
    }

    if (this.consecutiveNodeNotFoundErrors >= 2 && this.nodeNotFoundIds.length > 0) {
      const failedIds = [...new Set(this.nodeNotFoundIds)].join(', ');
      messages.push({
        role: 'user',
        content: [
          `[系统提示] 以下节点ID连续失败: ${failedIds}。`,
          '请使用当前页面中存在的精确节点ID，或检查上一条工具返回结果中的 candidates 列表来选取匹配节点。',
          '如果仍不确定目标节点，请请求用户确认。',
        ].join(''),
      });
      this.consecutiveNodeNotFoundErrors = 0;
      this.nodeNotFoundIds = [];
      return;
    }

    if (this.sameToolCount >= MAX_SAME_TOOL_REPEAT) {
      messages.push({
        role: 'user',
        content:
          '[系统提示] 你已经连续多次执行相同操作。请换个方法，或直接告知当前问题。如果是无法确定目标节点，请让用户选择。',
      });
      this.sameToolCount = 0;
    }
  }

  private async *streamWithRetry(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
      if (this.cfg.isCancelled()) {
        return;
      }
      try {
        for await (const event of this.cfg.provider.stream(request)) {
          yield event;
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message.toLowerCase();
        const retryable =
          msg.includes('429') ||
          msg.includes('rate') ||
          msg.includes('500') ||
          msg.includes('503') ||
          msg.includes('timeout') ||
          msg.includes('network');

        if (!retryable || attempt === MAX_API_RETRIES - 1) {
          throw lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
      }
    }

    if (lastError) {
      throw lastError;
    }
  }
}

function isPTLError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return ['prompt_too_long', 'context_length', 'maximum context', 'token limit'].some((p) => lower.includes(p));
}
