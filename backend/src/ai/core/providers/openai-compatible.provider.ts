import OpenAI from 'openai';
import type { ChatCompletionChunk, ChatCompletionTool } from 'openai/resources/index';

import type {
  AIProvider,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from './types';
import { purifyMessages } from './messagePurifier';
import { buildCompatibleCapabilities } from './modelCapabilities';

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

/** Default capabilities — used when no model-specific override is found */
// (removed: capabilities now built dynamically via buildCompatibleCapabilities)

function numberProperty(value: object, key: string): number | undefined {
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'number' && Number.isFinite(item) ? item : undefined;
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
  private abortController: AbortController | null = null;
  private readonly caps: ProviderCapabilities;

  constructor(apiKey: string, baseURL?: string, name?: string) {
    this.name = name ?? 'openai-compatible';
    this.client = new OpenAI({ apiKey, baseURL });
    this.caps = buildCompatibleCapabilities();
  }

  getCapabilities(): ProviderCapabilities {
    return this.caps;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const abortController = new AbortController();
    this.abortController = abortController;

    // Purify messages for this provider's capabilities before converting
    const purified = purifyMessages(request.messages, this.caps);
    const messages = convertMessages(purified);
    const tools = request.tools ? convertTools(request.tools) : undefined;

    let streamIter: AsyncIterable<ChatCompletionChunk>;
    try {
      streamIter = await this.client.chat.completions.create({
        model: request.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools && { tools }),
      });
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
      return;
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
    let responseId: string | undefined;

    try {
      for await (const chunk of streamIter) {
        if (abortController.signal.aborted) {
          break;
        }

        // Merge usage from the last chunk (usage is only present on the final chunk)
        // DeepSeek returns prompt_cache_hit_tokens / prompt_cache_miss_tokens in usage
        if (chunk.usage) {
          const cacheHitTokens = numberProperty(chunk.usage, 'prompt_cache_hit_tokens');
          const cacheMissTokens =
            numberProperty(chunk.usage, 'prompt_cache_miss_tokens') ??
            (cacheHitTokens === undefined
              ? undefined
              : Math.max(0, chunk.usage.prompt_tokens - cacheHitTokens));
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            cacheHitTokens,
            cacheMissTokens,
          };
        }

        if (typeof chunk.id === 'string') {
          responseId = chunk.id;
        }

        const choice = chunk.choices.length > 0 ? chunk.choices[0] : undefined;
        if (!choice) {
          continue;
        }

        // 1. Capture reasoning_content (accumulated — DeepSeek streams it per-char)
        const delta = choice.delta as Record<string, string | undefined>;
        const reasoningDelta = delta.reasoning_content;
        if (reasoningDelta) {
          reasoningBuffer += reasoningDelta;
        }

        // 2. Text delta — don't emit reasoning content as text
        const contentDelta = choice.delta.content;
        if (contentDelta) {
          yield { type: 'text_delta', text: contentDelta };
        }

        // 2. Tool call deltas (accumulate across chunks)
        const toolCallDeltas = choice.delta.tool_calls;
        if (toolCallDeltas) {
          for (const delta of toolCallDeltas) {
            const index = delta.index;
            let acc = toolCallAccumulators.get(index);

            if (!acc) {
              acc = { id: delta.id ?? '', name: '', arguments: '' };
              toolCallAccumulators.set(index, acc);
            }

            if (delta.id) {
              acc.id = delta.id;
            }
            if (delta.function?.name) {
              acc.name = delta.function.name;
            }
            if (delta.function?.arguments) {
              acc.arguments += delta.function.arguments;
            }
          }
        }

        // 3. On finish_reason, flush accumulated tool calls and emit done
        if (choice.finish_reason) {
          // Emit all accumulated tool calls
          const sortedIndices = [...toolCallAccumulators.keys()].sort();
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

          const isMaxTokens = choice.finish_reason === 'length';
          yield {
            type: 'done',
            usage,
            stopReason: isMaxTokens ? 'max_tokens' : 'end_turn',
            ...(responseId && { response_id: responseId }),
            ...(reasoningBuffer && { reasoningContent: reasoningBuffer }),
          };
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

// ── Message conversion ──────────────────────────────────────────────────

function convertMessages(messages: ProviderMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
      case 'developer':
        // Chat Completions uses 'system' for both system and developer messages
        result.push({ role: 'system', content: msg.content as string });
        break;

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
        if (msg.reasoningContent) {
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
        if (msg.reasoningContent) {
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
