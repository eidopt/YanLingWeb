export interface ContentPartText {
  type: 'text';
  text: string;
}

export interface ContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = ContentPartText | ContentPartImage;

export interface ProviderMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string | ContentPart[];
  toolCallId?: string;
  toolName?: string;
  toolArguments?: string;
  reasoningContent?: string;
  /** Cache control marker for providers that support message-level caching (e.g. Qwen). */
  cacheControl?: { type: string };
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

export interface StreamEventReasoningDelta {
  type: 'reasoning_delta';
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
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  };
  stopReason?: 'end_turn' | 'max_tokens';
  response_id?: string;
  reasoningContent?: string;
}

export interface StreamEventError {
  type: 'error';
  message: string;
}

export type ProviderStreamEvent =
  | StreamEventTextDelta
  | StreamEventReasoningDelta
  | StreamEventToolCall
  | StreamEventDone
  | StreamEventError;

export type ProviderToolChoice = 'auto' | 'required' | { type: 'function'; name: string };

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderTool[];
  toolChoice?: ProviderToolChoice;
  reasoningEffort?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  cacheKey?: string;
  /** Set only when recovering from an empty max_tokens stop. Omitted requests keep the provider default. */
  maxTokens?: number;
  cache?: {
    previousResponseId?: string;
  };
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsParallelToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoningEffort: boolean;
  supportsServerSideContext: boolean;
  supportsForcedToolChoice?: boolean;

  /**
   * How to handle reasoning_content in conversation history.
   * - 'none': target doesn't recognize reasoning_content (GPT, GLM)
   * - 'passthrough': preserve if present; field is optional (DeepSeek, Kimi, Qwen, MiniMax)
   * - 'required': must be present on every assistant message (MiMo)
   *
   * For models that need an extra request parameter to enable reasoning output
   * (e.g. MiniMax needs `reasoning_split: true`), keep mode as 'passthrough'
   * and set the parameter via `extraRequestParams`.
   */
  reasoningMode: 'none' | 'passthrough' | 'required';

  /**
   * Extra request parameters injected into every API call for this provider.
   * Use for model-specific parameters that don't fit into the standard fields.
   *
   * Examples:
   * - MiniMax: `{ reasoning_split: true }` — separate reasoning output
   * - Qwen:    `{ enable_thinking: true }`  — enable chain-of-thought
   *
   * Set via AI_EXTRA_PARAMS env var (JSON string).
   */
  extraRequestParams?: Record<string, unknown>;

  /**
   * Caching strategy for this provider.
   * - 'response_id': GPT — previous_response_id + store: true
   * - 'prefix': DeepSeek — passive prefix matching, observe prompt_cache_hit_tokens
   * - 'cache_key': Kimi — prompt_cache_key parameter, response cached_tokens
   * - 'cache_control': Qwen — cache_control: {type: "ephemeral"} marker
   * - 'none': MiMo, GLM, MiniMax — no cache support
   */
  cacheStrategy: 'response_id' | 'prefix' | 'cache_key' | 'cache_control' | 'none';

  /** Whether to preserve the developer role (true) or merge into system (false). */
  supportsDeveloperRole: boolean;
}

export interface AIProvider {
  readonly name: string;
  getCapabilities(): ProviderCapabilities;
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
  cancel(): void;
}
