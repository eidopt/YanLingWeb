import { parseSseEnvelope } from './backendProxy.provider.events';
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('parseSseEnvelope', () => {
  void it('returns ok envelope for valid sse.v1 envelope (T15)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'tool_start',
      ts: '2026-06-09T00:00:00.000Z',
      payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
    });
    const result = parseSseEnvelope(raw);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.type, 'tool_start');
    assert.deepEqual(result.envelope.payload, { name: 'foo', ts: '2026-06-09T00:00:00.000Z' });
  });

  void it('rejects non-matching schema (T16)', () => {
    const raw = JSON.stringify({ schema: 'sse.v0', type: 'text_delta', payload: {} });
    const result = parseSseEnvelope(raw);
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('unsupported schema'));
  });

  void it('rejects unknown type (T17)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'unknown_thing',
      payload: {},
    });
    const result = parseSseEnvelope(raw);
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('unknown type'));
  });

  void it('rejects non-JSON input (T16 衍生)', () => {
    const result = parseSseEnvelope('not json {');
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('parse failed'));
  });
});
