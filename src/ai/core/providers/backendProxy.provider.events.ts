import { SSE_EVENT_SCHEMA_VERSION, type SseEventEnvelope, type SseEventType } from '@shared/agent/contracts/sseEvents';

export {
  NEW_STRUCTURED_SSE_EVENT_TYPES,
  SSE_EVENT_SCHEMA_VERSION,
  type SseEventEnvelope,
  type SseEventType,
} from '@shared/agent/contracts/sseEvents';

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'text_delta',
  'tool_call',
  'done',
  'error',
  'tool_start',
  'tool_done',
  'tool_error',
  'reasoning_delta',
  'pipeline_stage_start',
  'pipeline_stage_end',
  'usage_summary',
  'clarification',
  'edit_request',
  'cache_diagnostic',
]);

export type ParsedSseEvent =
  | { ok: true; envelope: SseEventEnvelope<SseEventType, unknown> }
  | { ok: false; reason: string };

interface EnvelopeCandidate {
  schema?: unknown;
  type?: unknown;
  ts?: unknown;
  payload?: unknown;
}

export function parseSseEnvelope(raw: string): ParsedSseEvent {
  let obj: EnvelopeCandidate;
  try {
    obj = JSON.parse(raw) as EnvelopeCandidate;
  } catch (e) {
    return { ok: false, reason: `parse failed: ${(e as Error).message}` };
  }
  if (obj.schema !== SSE_EVENT_SCHEMA_VERSION) {
    const schemaValue = 'schema' in obj ? String(obj.schema) : 'undefined';
    return { ok: false, reason: `unsupported schema: ${schemaValue}` };
  }
  if (typeof obj.type !== 'string' || !KNOWN_EVENT_TYPES.has(obj.type)) {
    const typeValue = 'type' in obj ? String(obj.type) : 'undefined';
    return { ok: false, reason: `unknown type: ${typeValue}` };
  }
  return {
    ok: true,
    envelope: {
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: obj.type as SseEventType,
      ts: typeof obj.ts === 'string' ? obj.ts : '',
      payload: obj.payload,
    },
  };
}
