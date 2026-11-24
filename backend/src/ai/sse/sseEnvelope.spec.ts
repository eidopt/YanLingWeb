import { SSE_EVENT_SCHEMA_VERSION, type SseEventType } from '@shared/agent/contracts/sseEvents';

import {
  fitsSseFrame,
  MAX_PAYLOAD_BYTES,
  serializeSseEvent,
  trySerializeSseEvent,
} from './sseEnvelope';

interface ParsedEnvelope {
  schema: string;
  type: SseEventType | 'error';
  ts: string;
  payload: Record<string, unknown>;
}

const ALL_EVENT_TYPES: SseEventType[] = [
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
  'template_saved',
];

describe('serializeSseEvent', () => {
  it('wraps text_delta payload with envelope metadata (T1)', () => {
    const json = serializeSseEvent('text_delta', { text: 'hi' });
    const parsed = JSON.parse(json) as ParsedEnvelope;
    expect(parsed.schema).toBe(SSE_EVENT_SCHEMA_VERSION);
    expect(parsed.type).toBe('text_delta');
    expect(typeof parsed.ts).toBe('string');
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
    expect(parsed.payload).toEqual({ text: 'hi' });
  });

  it('degrades to error envelope when trySerializeSseEvent hits bad payload (T2)', () => {
    // 故意传一个触发循环引用的对象 (JSON.stringify 会抛 TypeError)
    interface Cyclic {
      self?: unknown;
    }
    const cyclic: Cyclic = {};
    cyclic.self = cyclic;
    const json = trySerializeSseEvent('text_delta', cyclic);
    const parsed = JSON.parse(json) as ParsedEnvelope;
    expect(parsed.type).toBe('error');
    expect(parsed.payload.schema_error).toBe(true);
    expect(parsed.payload.originalType).toBe('text_delta');
  });

  it('keeps a large edit behind a reference that still fits the frame', () => {
    const data = 'x'.repeat(MAX_PAYLOAD_BYTES);
    expect(fitsSseFrame('edit_request', { data })).toBe(false);
    expect(fitsSseFrame('edit_request', { editId: 'edit-1', bytes: data.length })).toBe(true);
  });

  it('degrades to error envelope with truncated flag when payload exceeds 64KB (T3)', () => {
    const bigText = 'x'.repeat(MAX_PAYLOAD_BYTES + 100);
    const json = serializeSseEvent('text_delta', { text: bigText });
    const parsed = JSON.parse(json) as ParsedEnvelope;
    expect(parsed.type).toBe('error');
    expect(parsed.payload.truncated).toBe(true);
    expect(parsed.payload.originalType).toBe('text_delta');
  });

  it('accepts all SseEventType string literals as type argument (T4)', () => {
    // 类型守卫: 这个测试在编译期就保证所有 type 都能通过 serializeSseEvent
    // 运行时: 跑一次确保不抛
    for (const type of ALL_EVENT_TYPES) {
      const payload = makeEmptyPayload(type);
      expect(() => serializeSseEvent(type, payload as never)).not.toThrow();
    }
    expect(ALL_EVENT_TYPES).toHaveLength(15);
  });

  it('serializes cache_diagnostic payload with prefix hash and hit rate (PR-A)', () => {
    const json = serializeSseEvent('cache_diagnostic', {
      prefixHash: 'a1b2c3d4e5f60718',
      cacheHitRate: 0.87,
      compactionStrategy: 'skip',
      prefixChanged: false,
    });
    const parsed = JSON.parse(json) as ParsedEnvelope;
    expect(parsed.type).toBe('cache_diagnostic');
    expect(parsed.payload).toEqual({
      prefixHash: 'a1b2c3d4e5f60718',
      cacheHitRate: 0.87,
      compactionStrategy: 'skip',
      prefixChanged: false,
    });
  });
});

function makeEmptyPayload(type: SseEventType): unknown {
  switch (type) {
    case 'text_delta':
      return { text: '' };
    case 'tool_call':
      return { id: '', name: '', arguments: '{}' };
    case 'done':
      return {};
    case 'error':
      return { message: '' };
    case 'tool_start':
      return { name: '', ts: new Date().toISOString() };
    case 'tool_done':
      return { name: '', durationMs: 0 };
    case 'tool_error':
      return { name: '', error: '' };
    case 'reasoning_delta':
      return { delta: '' };
    case 'pipeline_stage_start':
      return { stage: 'designer', attempt: 1 };
    case 'pipeline_stage_end':
      return { stage: 'designer', attempt: 1, durationMs: 0, status: 'ok' };
    case 'usage_summary':
      return { model: 'm', usage: { inputTokens: 0, outputTokens: 0 } };
    case 'clarification':
      return { question: '', options: [] };
    case 'edit_request':
      return { data: '{}' };
    case 'cache_diagnostic':
      return {
        prefixHash: 'a1b2c3d4e5f60718',
        cacheHitRate: 0.5,
        compactionStrategy: 'skip',
        prefixChanged: false,
      };
    case 'template_saved':
      return { templateId: 'tpl-1', action: 'created', name: '模板' };
  }
}
