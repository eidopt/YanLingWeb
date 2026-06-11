import {
  SSE_EVENT_SCHEMA_VERSION,
  type SseEventEnvelope,
  type SseEventPayloadByType,
  type SseEventType,
} from '@shared/agent/contracts/sseEvents';

export const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB, 远超正常事件大小

/**
 * 把 (type, payload) 包成 envelope JSON 字符串.
 * 异常或超大 payload 降级为 error envelope (不断流).
 */
export function serializeSseEvent<T extends SseEventType>(
  type: T,
  payload: SseEventPayloadByType[T],
): string {
  const ts = new Date().toISOString();
  const envelope: SseEventEnvelope<T, typeof payload> = {
    schema: SSE_EVENT_SCHEMA_VERSION,
    type,
    ts,
    payload,
  };
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch (e) {
    return JSON.stringify(
      buildErrorEnvelope(`envelope serialization failed: ${(e as Error).message}`, type, true),
    );
  }
  if (json.length > MAX_PAYLOAD_BYTES) {
    return JSON.stringify(
      buildErrorEnvelope(`payload too large: ${json.length}B`, type, false, true),
    );
  }
  return json;
}

/**
 * try/catch 包一层 — payload 类型不匹配 (字段缺失) 时不抛, 降级为 error envelope.
 */
export function trySerializeSseEvent(type: SseEventType, payload: unknown): string {
  try {
    // 类型不匹配会在 serializeSseEvent 内 JSON.stringify 之前或之时抛错 (如访问 undefined 字段)
    return serializeSseEvent(type, payload as SseEventPayloadByType[typeof type]);
  } catch (e) {
    return JSON.stringify(
      buildErrorEnvelope(`payload invalid: ${(e as Error).message}`, type, true),
    );
  }
}

function buildErrorEnvelope(
  message: string,
  originalType: SseEventType,
  schemaError: boolean,
  truncated = false,
): SseEventEnvelope<
  'error',
  { message: string; schema_error?: boolean; originalType?: string; truncated?: boolean }
> {
  return {
    schema: SSE_EVENT_SCHEMA_VERSION,
    type: 'error',
    ts: new Date().toISOString(),
    payload: {
      message,
      ...(schemaError ? { schema_error: true } : {}),
      originalType,
      ...(truncated ? { truncated: true } : {}),
    },
  };
}
