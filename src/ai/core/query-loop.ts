import {
  autoCompactIfNeeded,
  type AutoCompactState,
  createAutoCompactState,
} from './compact/autoCompact';
import { compactConversation } from './compact/compact';
import { microcompactMessages } from './compact/microCompact';
import type {
  AIProvider,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from './providers/types';
import { tokenCountWithEstimation } from './utils/tokens';

const MAX_ITERATIONS = 20;
const MAX_API_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;
const RETRY_DELAY_MS = 1000;
const MAX_SAME_TOOL_REPEAT = 3;
const MAX_OUTPUT_TOKENS_RECOVERY = 3;
const MAX_CONTINUATION_RETRIES = 3;
const MAX_TOOL_RETRIES = 3;
const TOOL_RETRY_DELAY_MS = 500;

export interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  output: string;
  action?: 'done';
}

export interface ToolSpec {
  name: string;
  supportsParallel?: boolean;
}

export interface QueryLoopConfig {
  provider: AIProvider;
  model: string;
  tools: ProviderTool[];
  toolSpecs: Map<string, ToolSpec>;
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  onTextDelta: (text: string) => void;
  onToolEvent: (event: {
    name: string;
    status: 'start' | 'done' | 'error';
    detail?: string;
  }) => void;
  onContextCompacted?: () => void;
  onError?: (msg: string) => void;
  maxIterations?: number;
  isCancelled: () => boolean;
}

export interface QueryResult {
  messages: ProviderMessage[];
  finalText: string;
  iterations: number;
  stopReason: 'completed' | 'max_iterations' | 'error' | 'cancelled';
  error?: string;
}

async function executeToolCall(
  call: PendingToolCall,
  cfg: Omit<QueryLoopConfig, 'toolExecutor'> & {
    toolExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  },
): Promise<{ call: PendingToolCall; result: ToolResult }> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>;
  } catch {
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
      const isRetryable =
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('ECONNRESET') ||
        message.includes('ETIMEDOUT') ||
        message.includes('503') ||
        message.includes('502');

      if (isRetryable && retries < MAX_TOOL_RETRIES) {
        retries += 1;
        const delay = TOOL_RETRY_DELAY_MS * Math.pow(2, retries);
        console.warn(
          `[QueryLoop] Tool ${call.name} retry ${retries}/${MAX_TOOL_RETRIES} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      result = {
        output: JSON.stringify({ error: message }),
      };
      break;
    }
  }

  const isError = result.output.startsWith('{"error');
  cfg.onToolEvent({ name: call.name, status: isError ? 'error' : 'done' });
  return { call, result };
}

async function executeToolCalls(
  pendingCalls: PendingToolCall[],
  cfg: Omit<QueryLoopConfig, 'toolExecutor'> & {
    toolExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  },
): Promise<{ call: PendingToolCall; result: ToolResult }[]> {
  const canRunInParallel = pendingCalls.length > 1 && pendingCalls.every((call) => (
    cfg.toolSpecs.get(call.name)?.supportsParallel === true
  ));

  if (canRunInParallel) {
    return Promise.all(pendingCalls.map((call) => executeToolCall(call, cfg)));
  }

  const results: { call: PendingToolCall; result: ToolResult }[] = [];
  for (const call of pendingCalls) {
    if (cfg.isCancelled()) { break; }
    results.push(await executeToolCall(call, cfg));
  }
  return results;
}

export class QueryLoop {
  private iterations = 0;
  private consecutiveErrors = 0;
  private continuationRetries = 0;
  private hasAttemptedReactiveCompact = false;
  private lastToolSig = '';
  private sameToolCount = 0;
  private autoCompactState: AutoCompactState = createAutoCompactState();
  private maxOutputTokensEscalated = false;
  private maxOutputTokensRecovery = 0;

  constructor(private readonly cfg: QueryLoopConfig) {}

  async run(messages: ProviderMessage[]): Promise<QueryResult> {
    let current = [...messages];
    const maxIter = this.cfg.maxIterations ?? MAX_ITERATIONS;
    let continuationParts: string[] = [];

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
        };
      }

      current = microcompactMessages(current);

      const compactRes = await autoCompactIfNeeded(
        current,
        this.cfg.model,
        this.autoCompactState,
        compactConversation,
      );
      if (compactRes.wasCompacted) {
        current = compactRes.messages;
        this.cfg.onContextCompacted?.();
      }
      this.autoCompactState = compactRes.state;

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
          if (this.cfg.isCancelled()) { break; }

          switch (event.type) {
            case 'text_delta':
              hasText = true;
              textChunks.push(event.text);
              this.cfg.onTextDelta(event.text);
              break;
            case 'tool_call':
              pendingCalls.push({
                id: event.id,
                name: event.name,
                arguments: event.arguments,
              });
              break;
            case 'error':
              apiError = event.message;
              isPTL = isPTLError(event.message);
              break;
            case 'done':
              if (event.stopReason) { stopReason = event.stopReason; }
              if (event.reasoningContent) { reasoningContent = event.reasoningContent; }
              break;
          }
        }
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
        isPTL = isPTLError(apiError);
      }

      if (this.cfg.isCancelled()) { break; }

      // max_tokens escalation: retry the same request with higher cap
      if (
        stopReason === 'max_tokens'
        && pendingCalls.length === 0
        && !hasText
        && !this.maxOutputTokensEscalated
        && this.maxOutputTokensRecovery < MAX_OUTPUT_TOKENS_RECOVERY
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
        if (
          this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
          || (!hasText && pendingCalls.length === 0)
        ) {
          const err = `API错误: ${apiError}`;
          this.cfg.onError?.(err);
          return {
            messages: current,
            finalText: '',
            iterations: this.iterations,
            stopReason: 'error',
            error: err,
          };
        }
      } else {
        this.consecutiveErrors = 0;
        this.hasAttemptedReactiveCompact = false;
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
        stopReason === 'max_tokens'
        && pendingCalls.length === 0
        && assistantText.trim().length > 0
        && this.continuationRetries < MAX_CONTINUATION_RETRIES
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
        const finalText = continuationParts.length > 0
          ? [...continuationParts, assistantText].join('')
          : assistantText;
        return {
          messages: current,
          finalText,
          iterations: this.iterations,
          stopReason: 'completed',
        };
      }

      this.continuationRetries = 0;
      continuationParts = [];
      this.maybeInjectLoopHint(current, pendingCalls);

      const toolResults = await executeToolCalls(
        pendingCalls,
        this.cfg,
      );

      if (this.cfg.isCancelled()) { break; }

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

      const contextTokens = tokenCountWithEstimation(current);
      console.warn(
        `[QueryLoop] iter=${this.iterations} tools=${pendingCalls.length}`
        + ` ctx=~${Math.round(contextTokens / 1000)}k tokens`,
      );
    }

    return {
      messages: current,
      finalText: '',
      iterations: this.iterations,
      stopReason: 'cancelled',
    };
  }

  private buildRequest(messages: ProviderMessage[]): ProviderRequest {
    return { model: this.cfg.model, messages, tools: this.cfg.tools };
  }

  private maybeInjectLoopHint(
    messages: ProviderMessage[],
    calls: PendingToolCall[],
  ): void {
    const sig = calls.map((c) => `${c.name}:${c.arguments}`).join('|');
    if (sig === this.lastToolSig) {
      this.sameToolCount += 1;
      if (this.sameToolCount >= MAX_SAME_TOOL_REPEAT) {
        messages.push({
          role: 'user',
          content: '[系统提示] 你已经连续多次执行相同操作。请换个方法，或直接告知当前问题。',
        });
        this.sameToolCount = 0;
      }
    } else {
      this.lastToolSig = sig;
      this.sameToolCount = 0;
    }
  }

  private async *streamWithRetry(
    request: ProviderRequest,
  ): AsyncIterable<ProviderStreamEvent> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
      if (this.cfg.isCancelled()) { return; }
      try {
        for await (const event of this.cfg.provider.stream(request)) {
          yield event;
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message.toLowerCase();
        const retryable = msg.includes('429') || msg.includes('rate')
          || msg.includes('500') || msg.includes('503')
          || msg.includes('timeout') || msg.includes('network');

        if (!retryable || attempt === MAX_API_RETRIES - 1) { throw lastError; }

        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[QueryLoop] API retry ${attempt + 1}/${MAX_API_RETRIES} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (lastError) { throw lastError; }
  }
}

function isPTLError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return ['prompt_too_long', 'context_length', 'maximum context', 'token limit']
    .some((p) => lower.includes(p));
}
