import OpenAI from 'openai';

import { purifyMessages } from './messagePurifier';
import type {
  AIProvider,
  ContentPart,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
  ProviderToolChoice,
} from './types';

interface UserResponseInputItem {
  role: 'user';
  content: string | ResponseContentPart[];
}

interface DeveloperResponseInputItem {
  role: 'developer';
  content: string;
}

interface AssistantResponseInputItem {
  role: 'assistant';
  content: string;
}

interface FunctionCallResponseInputItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

interface FunctionCallOutputResponseInputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

type ResponseInputItem =
  | UserResponseInputItem
  | DeveloperResponseInputItem
  | AssistantResponseInputItem
  | FunctionCallResponseInputItem
  | FunctionCallOutputResponseInputItem;

interface InputTextResponseContentPart {
  type: 'input_text';
  text: string;
}

interface InputImageResponseContentPart {
  type: 'input_image';
  image_url: string;
}

type ResponseContentPart = InputTextResponseContentPart | InputImageResponseContentPart;

interface OpenAIStreamItem {
  type: string;
  call_id: string;
  name: string;
  arguments: string;
}

interface OpenAIStreamUsage {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
}

interface OpenAIStreamIncompleteDetails {
  reason: string;
}

interface OpenAIStreamResponse {
  id?: string;
  usage?: OpenAIStreamUsage;
  incomplete_details?: OpenAIStreamIncompleteDetails;
}

interface OpenAIStreamEvent {
  type: string;
  delta?: string;
  item?: OpenAIStreamItem;
  response?: OpenAIStreamResponse;
}

interface ResponseToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface AsyncIterableCandidate {
  [Symbol.asyncIterator]?: unknown;
}

const CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
  supportsForcedToolChoice: true,
  reasoningMode: 'none',
  cacheStrategy: 'response_id',
  supportsDeveloperRole: true,
};

function toResponsesToolChoice(
  choice: ProviderToolChoice | undefined,
): string | { type: 'function'; name: string } | undefined {
  if (!choice) {
    return undefined;
  }
  if (choice === 'auto' || choice === 'required') {
    return choice;
  }
  return { type: 'function', name: choice.name };
}

function isOpenAIStreamIterable(value: unknown): value is AsyncIterable<OpenAIStreamEvent> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const asyncIterator = (value as AsyncIterableCandidate)[Symbol.asyncIterator];
  return typeof asyncIterator === 'function';
}

export class OpenAIProvider implements AIProvider {
  readonly name: string;
  private client: OpenAI;
  private readonly activeControllers = new Set<AbortController>();

  constructor(apiKey: string, baseURL?: string, name?: string) {
    this.name = name ?? 'openai';
    this.client = new OpenAI({ apiKey, baseURL });
  }

  getCapabilities(): ProviderCapabilities {
    return CAPABILITIES;
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
      const purified = purifyMessages(request.messages, CAPABILITIES);
      const { instructions, input } = convertMessages(purified);
      const tools = request.tools ? convertTools(request.tools) : undefined;
      const toolChoice = tools?.length ? toResponsesToolChoice(request.toolChoice) : undefined;

      const requestParams: Record<string, unknown> = {
        model: request.model,
        instructions,
        input,
        stream: true,
        // Enable server-side response storage for prompt caching
        store: true,
        ...(tools && { tools }),
        ...(toolChoice && { tool_choice: toolChoice }),
        ...(request.reasoningEffort &&
          request.reasoningEffort !== 'medium' && {
            reasoning: { effort: request.reasoningEffort },
          }),
        // Pass previous_response_id to enable prompt caching (OpenAI won't
        // re-process the unchanged prefix on subsequent requests)
        ...(request.cache?.previousResponseId && {
          previous_response_id: request.cache.previousResponseId,
        }),
      };

      let streamIter: AsyncIterable<OpenAIStreamEvent>;
      try {
        const raw = await this.client.responses.create(requestParams, {
          signal: abortController.signal,
        });
        if (!isOpenAIStreamIterable(raw)) {
          yield { type: 'error', message: 'OpenAI response stream is not async iterable' };
          return;
        }
        streamIter = raw;
      } catch (error) {
        yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
        return;
      }

      try {
        for await (const event of streamIter) {
          if (abortController.signal.aborted) {
            break;
          }

          if (event.type === 'response.output_text.delta') {
            yield { type: 'text_delta', text: event.delta ?? '' };
          }

          if (event.type === 'response.output_item.done') {
            const item = event.item;
            if (item?.type === 'function_call') {
              yield {
                type: 'tool_call',
                id: item.call_id,
                name: item.name,
                arguments: item.arguments,
              };
            }
          }

          if (event.type === 'response.completed') {
            const usage = event.response?.usage;
            const cachedTokens = usage?.input_tokens_details?.cached_tokens;
            const cacheHitTokens =
              typeof cachedTokens === 'number' && Number.isFinite(cachedTokens)
                ? cachedTokens
                : undefined;
            const cacheMissTokens =
              usage && cacheHitTokens !== undefined
                ? Math.max(0, usage.input_tokens - cacheHitTokens)
                : undefined;
            const isMaxTokens = event.response?.incomplete_details?.reason === 'max_output_tokens';
            const responseId = event.response?.id;

            yield {
              type: 'done',
              usage: usage
                ? {
                    inputTokens: usage.input_tokens,
                    outputTokens: usage.output_tokens,
                    ...(cacheHitTokens !== undefined ? { cacheHitTokens } : {}),
                    ...(cacheMissTokens !== undefined ? { cacheMissTokens } : {}),
                  }
                : undefined,
              stopReason: isMaxTokens ? 'max_tokens' : 'end_turn',
              // Forward the response ID to the frontend for prompt caching
              response_id: responseId,
            };
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
        }
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

function convertMessages(messages: ProviderMessage[]): {
  instructions: string | undefined;
  input: ResponseInputItem[];
} {
  let instructions = '';
  let extraContext = '';
  const input: ResponseInputItem[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system': {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (!text) {
          continue;
        }
        if (!instructions) {
          instructions = text;
        } else {
          extraContext += (extraContext ? '\n\n' : '') + text;
        }
        break;
      }
      case 'developer': {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) {
          input.push({ role: 'developer', content: text });
        }
        break;
      }
      case 'user':
        input.push({ role: 'user', content: convertContent(msg.content) });
        break;
      case 'assistant': {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) {
          input.push({ role: 'assistant', content: text });
        }
        break;
      }
      case 'tool_call':
        if (!msg.toolCallId || !msg.toolName || msg.toolArguments == null) {
          throw new Error('tool_call messages require toolCallId, toolName, and toolArguments');
        }
        input.push({
          type: 'function_call',
          call_id: msg.toolCallId,
          name: msg.toolName,
          arguments: msg.toolArguments,
        });
        break;
      case 'tool_result':
        if (!msg.toolCallId) {
          throw new Error('tool_result messages require toolCallId');
        }
        input.push({
          type: 'function_call_output',
          call_id: msg.toolCallId,
          output: typeof msg.content === 'string' ? msg.content : '',
        });
        break;
    }
  }

  if (extraContext) {
    input.unshift({
      role: 'user',
      content: `[Additional context for this turn]\n\n${extraContext}`,
    });
  }

  return { instructions: instructions || undefined, input };
}

function convertContent(content: string | ContentPart[]): string | ResponseContentPart[] {
  if (typeof content === 'string') {
    return content;
  }
  return content.map((part) => {
    if (part.type === 'image_url') {
      return { type: 'input_image' as const, image_url: part.image_url.url };
    }
    return { type: 'input_text' as const, text: part.text };
  });
}

function convertTools(tools: ProviderTool[]): ResponseToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
