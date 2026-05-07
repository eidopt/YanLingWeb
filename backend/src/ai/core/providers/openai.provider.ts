import OpenAI from 'openai';

import type {
  AIProvider,
  ContentPart,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from './types';

type ResponseInputItem =
  | { role: 'user'; content: string | ResponseContentPart[]; }
  | { role: 'developer'; content: string; }
  | { role: 'assistant'; content: string; }
  | { type: 'function_call'; call_id: string; name: string; arguments: string; }
  | { type: 'function_call_output'; call_id: string; output: string; };

type ResponseContentPart =
  | { type: 'input_text'; text: string; }
  | { type: 'input_image'; image_url: string; };

interface OpenAIStreamEvent {
  type: string;
  delta?: string;
  item?: { type: string; call_id: string; name: string; arguments: string; };
  response?: {
    usage?: { input_tokens: number; output_tokens: number; };
    incomplete_details?: { reason: string; };
  };
}

const CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
};

export class OpenAIProvider implements AIProvider {
  readonly name: string;
  private client: OpenAI;
  private abortController: AbortController | null = null;

  constructor(apiKey: string, baseURL?: string, name?: string) {
    this.name = name ?? 'openai';
    this.client = new OpenAI({ apiKey, baseURL });
  }

  getCapabilities(): ProviderCapabilities {
    return CAPABILITIES;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const abortController = new AbortController();
    this.abortController = abortController;

    const { instructions, input } = convertMessages(request.messages);
    const tools = request.tools ? convertTools(request.tools) : undefined;

    const requestParams: Record<string, unknown> = {
      model: request.model,
      instructions,
      input,
      stream: true,
      ...(tools && { tools }),
      ...(request.reasoningEffort && request.reasoningEffort !== 'medium' && {
        reasoning: { effort: request.reasoningEffort },
      }),
    };

    let streamIter: AsyncIterable<OpenAIStreamEvent>;
    try {
      const raw = await this.client.responses.create(requestParams);
      streamIter = raw as unknown as AsyncIterable<OpenAIStreamEvent>;
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
      return;
    }

    try {
      for await (const event of streamIter) {
        if (abortController.signal.aborted) { break; }

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
          const isMaxTokens = event.response?.incomplete_details?.reason === 'max_output_tokens';
          yield {
            type: 'done',
            usage: usage ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
            } : undefined,
            stopReason: isMaxTokens ? 'max_tokens' : 'end_turn',
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
        if (!text) { continue; }
        if (!instructions) {
          instructions = text;
        } else {
          extraContext += (extraContext ? '\n\n' : '') + text;
        }
        break;
      }
      case 'developer': {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) { input.push({ role: 'developer', content: text }); }
        break;
      }
      case 'user':
        input.push({ role: 'user', content: convertContent(msg.content) });
        break;
      case 'assistant': {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text) { input.push({ role: 'assistant', content: text }); }
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

function convertContent(
  content: string | ContentPart[],
): string | ResponseContentPart[] {
  if (typeof content === 'string') { return content; }
  return content.map((part) => {
    if (part.type === 'image_url') {
      return { type: 'input_image' as const, image_url: part.image_url.url };
    }
    return { type: 'input_text' as const, text: part.text };
  });
}

function convertTools(
  tools: ProviderTool[],
): { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; }[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
