import { BackendProxyProvider } from './backendProxy.provider';
import type { ProviderStreamEvent } from './types';
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HttpStreamEvent, HttpStreamResult } from 'services/http/HttpClient';

interface MockHttpClient {
  stream: (path: string, options?: RequestInit) => Promise<HttpStreamResult>;
}

function createMockHttpClient(rawDataLines: string[]): MockHttpClient {
  const events: AsyncIterable<HttpStreamEvent> = (function* () {
    for (const data of rawDataLines) {
      yield Promise.resolve({ data });
    }
  })();
  return {
    stream: () =>
      Promise.resolve({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events,
      }),
  };
}

/* eslint-disable no-console */
void describe('BackendProxyProvider envelope handling', () => {
  void it('calls onStructuredEvent handler for tool_start envelope and logs to console (T18)', async () => {
    const onStructuredEvent: { type: string; payload: unknown }[] = [];
    const consoleLogSpy: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleLogSpy.push(args);
    };
    try {
      const httpClient = createMockHttpClient([
        JSON.stringify({
          schema: SSE_EVENT_SCHEMA_VERSION,
          type: 'tool_start',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
        }),
        JSON.stringify({
          schema: SSE_EVENT_SCHEMA_VERSION,
          type: 'done',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { stopReason: 'end_turn' },
        }),
      ]);
      const provider = new BackendProxyProvider(
        () => 'test-token',
        undefined,
        httpClient,
        (envelope) => onStructuredEvent.push({ type: envelope.type, payload: envelope.payload }),
      );
      const events: ProviderStreamEvent[] = [];
      for await (const ev of provider.stream({ model: 'm', messages: [] })) {
        events.push(ev);
      }
      assert.equal(onStructuredEvent.length, 1);
      assert.equal(onStructuredEvent[0]?.type, 'tool_start');
      assert.deepEqual(onStructuredEvent[0]?.payload, {
        name: 'foo',
        ts: '2026-06-09T00:00:00.000Z',
      });
      assert.ok(
        consoleLogSpy.some(
          (args) => args[0] === '[SSE]' && args[1] === 'tool_start' && typeof args[2] === 'object',
        ),
        'expected console.log to be called with [SSE, tool_start, payload]',
      );
      const doneEv = events.find((e) => e.type === 'done');
      assert.deepEqual(doneEv, {
        type: 'done',
        usage: undefined,
        stopReason: 'end_turn',
        response_id: undefined,
        reasoningContent: undefined,
      });
    } finally {
      console.log = originalLog;
    }
  });

  void it('yields legacy ProviderStreamEvent shape for old types (text_delta, done, error) (T19)', async () => {
    const onStructuredEvent: unknown[] = [];
    const httpClient = createMockHttpClient([
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'text_delta',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { text: 'hello' },
      }),
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'done',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { stopReason: 'end_turn' },
      }),
    ]);
    const provider = new BackendProxyProvider(
      () => 'test-token',
      undefined,
      httpClient,
      (envelope) => onStructuredEvent.push(envelope),
    );
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }
    assert.deepEqual(events, [
      { type: 'text_delta', text: 'hello' },
      { type: 'done', usage: undefined, stopReason: 'end_turn', response_id: undefined, reasoningContent: undefined },
    ]);
    assert.equal(onStructuredEvent.length, 0);
  });

  void it('skips invalid envelope without yielding (T16 衍生)', async () => {
    const consoleWarnSpy: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      consoleWarnSpy.push(args);
    };
    try {
      const httpClient = createMockHttpClient([
        'not json {',
        JSON.stringify({ schema: 'sse.v0', type: 'text_delta', payload: {} }),
      ]);
      const provider = new BackendProxyProvider(() => 'test-token', undefined, httpClient);
      const events: ProviderStreamEvent[] = [];
      for await (const ev of provider.stream({ model: 'm', messages: [] })) {
        events.push(ev);
      }
      assert.equal(events.length, 0);
      assert.ok(consoleWarnSpy.length > 0, 'expected console.warn to be called for invalid envelope');
    } finally {
      console.warn = originalWarn;
    }
  });
});
/* eslint-enable no-console */
