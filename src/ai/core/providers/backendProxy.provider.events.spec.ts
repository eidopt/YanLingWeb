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

  void it('accepts cache_diagnostic envelope (PR-A 可观测性)', () => {
    // 字段参考 shared/agent/contracts/sseEvents.ts 的 cache_diagnostic payload.
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'cache_diagnostic',
      ts: '2026-06-10T00:00:00.000Z',
      payload: {
        prefixHash: 'a1b2c3d4e5f60718',
        cacheHitRate: 0.87,
        compactionStrategy: 'skip',
        prefixChanged: false,
      },
    });
    const result = parseSseEnvelope(raw);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.type, 'cache_diagnostic');
    assert.equal((result.envelope.payload as { prefixHash: string }).prefixHash, 'a1b2c3d4e5f60718');
    assert.equal(
      (result.envelope.payload as { cacheHitRate: number }).cacheHitRate,
      0.87,
    );
  });
});
