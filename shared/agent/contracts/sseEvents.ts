export const SSE_EVENT_SCHEMA_VERSION = 'sse.v1' as const;

export type SseEventEnvelope<T extends SseEventType, P> = {
  schema: typeof SSE_EVENT_SCHEMA_VERSION;
  type: T;
  /** ISO 8601 timestamp emitted at serialization time */
  ts: string;
  payload: P;
};

export type SseEventType =
  // 现有 (兼容)
  | 'text_delta'
  | 'tool_call'
  | 'done'
  | 'error'
  // 新增
  | 'tool_start'
  | 'tool_done'
  | 'tool_error'
  | 'reasoning_delta'
  | 'pipeline_stage_start'
  | 'pipeline_stage_end'
  | 'usage_summary'
  | 'clarification'
  // 编辑器流专属:edit_request 携带 editor 实际应用的 operations
  | 'edit_request';

export interface SseTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export type SseEventPayloadByType = {
  text_delta: { text: string };
  tool_call: { id: string; name: string; arguments: string };
  done: {
    usage?: SseTokenUsage;
    stopReason?: 'end_turn' | 'max_tokens';
    response_id?: string;
    reasoningContent?: string;
  };
  error: {
    message: string;
    schema_error?: boolean;
    originalType?: string;
    truncated?: boolean;
  };
  tool_start: { name: string; toolCallId?: string; ts: string };
  tool_done: { name: string; toolCallId?: string; durationMs: number };
  tool_error: { name: string; toolCallId?: string; error: string };
  reasoning_delta: { delta: string };
  pipeline_stage_start: {
    stage: 'designer' | 'critic' | 'schema' | 'verifier';
    attempt: number;
  };
  pipeline_stage_end: {
    stage: 'designer' | 'critic' | 'schema' | 'verifier';
    attempt: number;
    durationMs: number;
    status: 'ok' | 'failed';
    error?: string;
  };
  usage_summary: { model: string; usage: SseTokenUsage; totalCostUsd?: number };
  clarification: { question: string; options: { label: string; value: string }[] };
  edit_request: { data: string };
};

/** 老 ProviderStreamEvent 之外的 8 个新事件 type 集合 (前端订阅口过滤用) */
export const NEW_STRUCTURED_SSE_EVENT_TYPES: ReadonlySet<SseEventType> = new Set([
  'tool_start',
  'tool_done',
  'tool_error',
  'reasoning_delta',
  'pipeline_stage_start',
  'pipeline_stage_end',
  'usage_summary',
  'clarification',
]);
