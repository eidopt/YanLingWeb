import { BackendProxyProvider } from './backendProxy.provider';
import type { ProviderStreamEvent } from './types';
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HttpClient, HttpStreamEvent } from 'services/http/HttpClient';

type MockHttpClient = Pick<HttpClient, 'json' | 'stream'>;

function createMockHttpClient(rawDataLines: string[]): MockHttpClient {
  async function* generate(): AsyncGenerator<HttpStreamEvent> {
    for (const data of rawDataLines) {
      await Promise.resolve();
      yield { data };
    }
  }
  const events: AsyncIterable<HttpStreamEvent> = {
    [Symbol.asyncIterator]: () => generate(),
  };
  return {
    json: () => Promise.reject(new Error('not used in this spec')),
    stream: () =>
      Promise.resolve({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events,
      }),
  };
}

void describe('BackendProxyProvider envelope handling', () => {
  void it('calls onStructuredEvent handler for tool_start envelope and logs to stdout (T18)', async () => {
    const onStructuredEvent: { type: string; payload: unknown }[] = [];
    const stdoutSpy: string[] = [];
    const originalWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stdoutSpy.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
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
        stdoutSpy.some((line) => line.includes('[SSE]') && line.includes('tool_start')),
        'expected stdout to contain [SSE] tool_start log',
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
      process.stdout.write = originalWrite;
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
    const stderrSpy: string[] = [];
    const originalStderr: typeof process.stderr.write = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      stderrSpy.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
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
      assert.ok(
        stderrSpy.some((line) => line.includes('[SSE] skip envelope')),
        'expected stderr to contain skip envelope log',
      );
    } finally {
      process.stderr.write = originalStderr;
    }
  });
});
