import { parseSseEnvelope } from './backendProxy.provider.events';
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';

describe('parseSseEnvelope', () => {
  it('returns ok envelope for valid sse.v1 envelope (T15)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'tool_start',
      ts: '2026-06-09T00:00:00.000Z',
      payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
    });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.type).toBe('tool_start');
      expect(result.envelope.payload).toEqual({ name: 'foo', ts: '2026-06-09T00:00:00.000Z' });
    }
  });

  it('rejects non-matching schema (T16)', () => {
    const raw = JSON.stringify({ schema: 'sse.v0', type: 'text_delta', payload: {} });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unsupported schema');
    }
  });

  it('rejects unknown type (T17)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'unknown_thing',
      payload: {},
    });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unknown type');
    }
  });

  it('rejects non-JSON input (T16 衍生)', () => {
    const result = parseSseEnvelope('not json {');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('parse failed');
    }
  });
});
