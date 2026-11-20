import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionTool } from 'openai/resources/index';

import { purifyMessages } from './messagePurifier';
import {
  buildCompatibleCapabilities,
  type CompatibleCapabilitiesOverrides,
} from './modelCapabilities';
import type {
  AIProvider,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
  ProviderToolChoice,
} from './types';

interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
}

interface CompatibleUsageAccumulator extends UsageAccumulator {
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

type CompatibleAssistantMessageParam = OpenAI.Chat.ChatCompletionAssistantMessageParam & {
  reasoning_content?: string;
};

type CompatibleCreateParams = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  prompt_cache_key?: string;
  [extra: string]: unknown;
};

type WireToolChoice = OpenAI.Chat.ChatCompletionToolChoiceOption;

/** Default capabilities — used when no model-specific override is found */
// (removed: capabilities now built dynamically via buildCompatibleCapabilities)

function numberProperty(value: object, key: string): number | undefined {
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'number' && Number.isFinite(item) ? item : undefined;
}

function extractUsage(rawUsage: unknown): CompatibleUsageAccumulator | undefined {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return undefined;
  }
  const promptTokens = numberProperty(rawUsage, 'prompt_tokens') ?? 0;
  const completionTokens = numberProperty(rawUsage, 'completion_tokens') ?? 0;
  const details = (rawUsage as { prompt_tokens_details?: unknown }).prompt_tokens_details;
  const cachedTokens =
    details && typeof details === 'object' ? numberProperty(details, 'cached_tokens') : undefined;
  const cacheHitTokens = numberProperty(rawUsage, 'prompt_cache_hit_tokens') ?? cachedTokens;
  const cacheMissTokens =
    numberProperty(rawUsage, 'prompt_cache_miss_tokens') ??
    (cacheHitTokens === undefined ? undefined : Math.max(0, promptTokens - cacheHitTokens));

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cacheHitTokens,
    cacheMissTokens,
  };
}

function toWireToolChoice(choice: ProviderToolChoice | undefined): WireToolChoice | undefined {
  if (!choice) {
    return undefined;
  }
  if (choice === 'auto' || choice === 'required') {
    return choice;
  }
  return {
    type: 'function',
    function: { name: choice.name },
  };
}

function isUnsupportedToolChoiceError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const status = (err as { status?: unknown }).status;
  const rawMessage = (err as { message?: unknown }).message;
  const message =
    err instanceof Error ? err.message : typeof rawMessage === 'string' ? rawMessage : '';
  if (/context|token|length|quota|balance/i.test(message)) {
    return false;
  }
  if (/tool_choice|thinking|not support|unsupported|invalid.*tool/i.test(message)) {
    return true;
  }
  return status === 400;
}

/**
 * OpenAI-compatible provider using the Chat Completions API (/v1/chat/completions).
 *
 * Works with DeepSeek, Azure OpenAI, Groq, Together AI, and any other provider
 * that implements the standard OpenAI chat completions streaming format.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  private client: OpenAI;
  private readonly activeControllers = new Set<AbortController>();
  private readonly caps: ProviderCapabilities;
  private forcedToolChoiceDisabledAtRuntime = false;

  constructor(
    apiKey: string,
    baseURL?: string,
    name?: string,
    capsOverrides?: CompatibleCapabilitiesOverrides,
  ) {
    this.name = name ?? 'openaiCompatible';
    this.client = new OpenAI({ apiKey, baseURL });
    this.caps = buildCompatibleCapabilities(capsOverrides);
  }

  getCapabilities(): ProviderCapabilities {
    return this.caps;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    if (request.signal?.aborted) {
      return;
    }

    const abortController = new AbortController();
    this.activeControllers.add(abortController);
    const onExternalAbort = () => {
      abortController.abort();
    };
    request.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      // Purify messages for this provider's capabilities before converting
      const purified = purifyMessages(request.messages, this.caps);
      const messages = convertMessages(purified, this.caps);
      const tools = request.tools ? convertTools(request.tools) : undefined;
      const cacheKey =
        this.caps.cacheStrategy === 'cache_key'
          ? (request.cacheKey ?? (request as { cacheKey?: string }).cacheKey)
          : undefined;
      const allowForcedToolChoice =
        this.caps.supportsForcedToolChoice !== false && !this.forcedToolChoiceDisabledAtRuntime;
      const requestedWireToolChoice =
        tools?.length && request.toolChoice
          ? request.toolChoice === 'auto' || allowForcedToolChoice
            ? toWireToolChoice(request.toolChoice)
            : undefined
          : undefined;

      const buildCreateParams = (wireToolChoice?: WireToolChoice): CompatibleCreateParams => ({
        model: request.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools && { tools }),
        ...(wireToolChoice ? { tool_choice: wireToolChoice } : {}),
        ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
        ...this.caps.extraRequestParams,
      });

      let streamIter: AsyncIterable<ChatCompletionChunk>;
      try {
        streamIter = await this.client.chat.completions.create(
          buildCreateParams(requestedWireToolChoice),
          { signal: abortController.signal },
        );
      } catch (error) {
        if (
          requestedWireToolChoice &&
          isUnsupportedToolChoiceError(error) &&
          !abortController.signal.aborted
        ) {
          if (requestedWireToolChoice !== 'auto') {
            this.forcedToolChoiceDisabledAtRuntime = true;
          }
          try {
            streamIter = await this.client.chat.completions.create(buildCreateParams(undefined), {
              signal: abortController.signal,
            });
          } catch (retryError) {
            yield {
              type: 'error',
              message: retryError instanceof Error ? retryError.message : String(retryError),
            };
            return;
          }
        } else {
          yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
          return;
        }
      }

      const toolCallAccumulators = new Map<
        number,
        {
          id: string;
          name: string;
          arguments: string;
        }
      >();
      let usage: CompatibleUsageAccumulator | undefined;
      /** Accumulated reasoning_content (DeepSeek streams it character by character) */
      let reasoningBuffer = '';
      let sawReasoningField = false;
      let responseId: string | undefined;
      let finishReason: string | null = null;
      let streamErrored = false;

      try {
        for await (const chunk of streamIter) {
          if (abortController.signal.aborted) {
            break;
          }

          // Merge usage whenever present (including trailing choices: [] usage-only chunks)
          const parsedUsage = extractUsage(chunk.usage);
          if (parsedUsage) {
            usage = parsedUsage;
          }

          if (typeof chunk.id === 'string') {
            responseId = chunk.id;
          }

          const choice = chunk.choices.length > 0 ? chunk.choices[0] : undefined;
          if (!choice) {
            continue;
          }

          // 1. Capture reasoning_content (accumulated — DeepSeek streams it per-char).
          const delta = choice.delta as Record<string, string | undefined>;
          const reasoningDelta = delta.reasoning_content;
          if (reasoningDelta !== undefined) {
            sawReasoningField = true;
            if (reasoningDelta) {
              reasoningBuffer += reasoningDelta;
              yield { type: 'reasoning_delta', text: reasoningDelta };
            }
          }

          // 2. Text delta — don't emit reasoning content as text
          const contentDelta = choice.delta.content;
          if (contentDelta) {
            yield { type: 'text_delta', text: contentDelta };
          }

          // 3. Tool call deltas (accumulate across chunks)
          const toolCallDeltas = choice.delta.tool_calls;
          if (toolCallDeltas) {
            for (const toolDelta of toolCallDeltas) {
              const index = toolDelta.index;
              let acc = toolCallAccumulators.get(index);

              if (!acc) {
                acc = { id: toolDelta.id ?? '', name: '', arguments: '' };
                toolCallAccumulators.set(index, acc);
              }

              if (toolDelta.id) {
                acc.id = toolDelta.id;
              }
              if (toolDelta.function?.name) {
                acc.name = toolDelta.function.name;
              }
              if (toolDelta.function?.arguments) {
                acc.arguments += toolDelta.function.arguments;
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }
      } catch (error) {
        streamErrored = true;
        if (!abortController.signal.aborted) {
          yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
        }
      }

      if (!abortController.signal.aborted && !streamErrored) {
        // Flush tool calls & done AFTER loop finishes so trailing choices: [] usage chunks are captured.
        const sortedIndices = [...toolCallAccumulators.keys()].sort((a, b) => a - b);
        for (const idx of sortedIndices) {
          const acc = toolCallAccumulators.get(idx);
          if (!acc?.id || !acc.name) {
            continue;
          }
          yield {
            type: 'tool_call',
            id: acc.id,
            name: acc.name,
            arguments: acc.arguments || '{}',
          };
        }

        const isMaxTokens = finishReason === 'length';
        yield {
          type: 'done',
          usage,
          stopReason: isMaxTokens ? 'max_tokens' : 'end_turn',
          ...(responseId && { response_id: responseId }),
          ...(sawReasoningField && { reasoningContent: reasoningBuffer }),
        };
      }
    } finally {
      request.signal?.removeEventListener('abort', onExternalAbort);
      this.activeControllers.delete(abortController);
    }
  }

  cancel(): void {
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
}

// ── Message conversion ──────────────────────────────────────────────────

/**
 * Convert purified ProviderMessage[] to OpenAI Chat Completions format.
 *
 * @param targetCaps the target provider's capabilities. The
 *   `cache_control` field is only emitted on the wire when the target
 *   provider's `cacheStrategy` is `'cache_control'` (Qwen). For any other
 *   cache strategy the field is dropped at this layer even if a previous
 *   pipeline stage set it — defense in depth against leaking unsupported
 *   vendor-specific fields to non-supporting providers.
 */
function convertMessages(
  messages: ProviderMessage[],
  targetCaps: ProviderCapabilities,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  const supportsCacheControl = targetCaps.cacheStrategy === 'cache_control';

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
      case 'developer': {
        // Chat Completions uses 'system' for both system and developer messages
        // Use a plain object to allow passing through extra fields like cache_control
        const systemMsg = {
          role: 'system' as const,
          content: msg.content as string,
          ...(supportsCacheControl && msg.cacheControl ? { cache_control: msg.cacheControl } : {}),
        };
        result.push(systemMsg);
        break;
      }

      case 'user': {
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content.map((part) => {
                if (part.type === 'image_url') {
                  return { type: 'image_url' as const, image_url: part.image_url };
                }
                return { type: 'text' as const, text: part.text };
              });
        result.push({ role: 'user', content });
        break;
      }

      case 'assistant': {
        const content = typeof msg.content === 'string' ? msg.content : '';
        const assistantMsg: CompatibleAssistantMessageParam = {
          role: 'assistant',
          content,
        };
        if (typeof msg.reasoningContent === 'string') {
          assistantMsg.reasoning_content = msg.reasoningContent;
        }
        result.push(assistantMsg);
        break;
      }

      case 'tool_call': {
        // Represent a tool call request as an assistant message with tool_calls
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(msg.toolArguments ?? '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        const assistantMsg: CompatibleAssistantMessageParam = {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: msg.toolCallId ?? '',
              type: 'function',
              function: {
                name: msg.toolName ?? '',
                arguments: JSON.stringify(args),
              },
            },
          ],
        };
        if (typeof msg.reasoningContent === 'string') {
          assistantMsg.reasoning_content = msg.reasoningContent;
        }
        result.push(assistantMsg);
        break;
      }

      case 'tool_result':
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId ?? '',
          content: typeof msg.content === 'string' ? msg.content : '',
        });
        break;
    }
  }

  return result;
}

function convertTools(tools: ProviderTool[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
