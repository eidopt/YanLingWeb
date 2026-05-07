export interface ContentPartText {
  type: 'text';
  text: string;
}

export interface ContentPartImage {
  type: 'image_url';
  image_url: { url: string; };
}

export type ContentPart = ContentPartText | ContentPartImage;

export interface ProviderMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string | ContentPart[];
  toolCallId?: string;
  toolName?: string;
  toolArguments?: string;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamEventTextDelta {
  type: 'text_delta';
  text: string;
}

export interface StreamEventToolCall {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string;
}

export interface StreamEventDone {
  type: 'done';
  usage?: { inputTokens: number; outputTokens: number; };
  stopReason?: 'end_turn' | 'max_tokens';
}

export interface StreamEventError {
  type: 'error';
  message: string;
}

export type ProviderStreamEvent =
  | StreamEventTextDelta
  | StreamEventToolCall
  | StreamEventDone
  | StreamEventError;

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsParallelToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoningEffort: boolean;
  supportsServerSideContext: boolean;
}

export interface AIProvider {
  readonly name: string;
  getCapabilities(): ProviderCapabilities;
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
  cancel(): void;
}
