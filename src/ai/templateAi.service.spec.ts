/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BackendProxyProvider } from './core/providers/backendProxy.provider';
import { TemplateAiService } from './templateAi.service';
import type { SseEventEnvelope, SseEventType } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('TemplateAiService pipeline events', () => {
  void it('emits pipeline_stage event when onStructuredEvent fires pipeline_stage_start/end', () => {
    const events: { type: string; data: string }[] = [];
    let capturedCallback: ((env: SseEventEnvelope<any, unknown>) => void) | null = null;

    // Mock BackendProxyProvider stub with the minimum surface used by TemplateAiService
    const mockProvider: Partial<BackendProxyProvider> = {
      resetConversation: () => undefined,
      cancel: () => undefined,
      stream: undefined as never,
    };
    Object.defineProperty(mockProvider, 'onStructuredEvent', {
      get: () => capturedCallback,
      set: (cb) => {
        capturedCallback = cb as typeof capturedCallback;
      },
      configurable: true,
    });

    // Inject mock provider via the test seam — synchronous, no microtask wait.
    const service = new TemplateAiService(() => null, undefined, undefined, mockProvider as BackendProxyProvider);

    // Capture the callback synchronously by triggering generate() and catching
    // the rejection (the agent chain is not wired in this unit test).
    void service
      .generate({
        prompt: 'test',
        onEvent: (event) => events.push({ type: event.type, data: event.data }),
      })
      .catch(() => {
        /* expected: agent chain is not fully wired in this unit test */
      });

    assert.ok(capturedCallback, 'expected TemplateAiService to register onStructuredEvent on the provider');
    type AnyEnvelope = SseEventEnvelope<SseEventType, unknown>;
    const callback = capturedCallback as unknown as (env: AnyEnvelope) => void;

    // Simulate pipeline_stage_start envelope arrival via the callback
    const startEnvelope: SseEventEnvelope<'pipeline_stage_start', { stage: string; attempt: number }> = {
      schema: 'sse.v1',
      type: 'pipeline_stage_start',
      ts: '2026-06-09T00:00:00Z',
      payload: { stage: 'designer', attempt: 1 },
    };
    callback(startEnvelope);

    const endEnvelope: SseEventEnvelope<
      'pipeline_stage_end',
      { stage: string; attempt: number; durationMs: number; status: 'ok' | 'failed'; error?: string }
    > = {
      schema: 'sse.v1',
      type: 'pipeline_stage_end',
      ts: '2026-06-09T00:00:01Z',
      payload: { stage: 'designer', attempt: 1, durationMs: 5000, status: 'ok' },
    };
    callback(endEnvelope);

    // Expect 2 events of type 'pipeline_stage'
    const pipelineEvents = events.filter((e) => e.type === 'pipeline_stage');
    assert.equal(pipelineEvents.length, 2, `expected 2 pipeline_stage events, got ${pipelineEvents.length}`);
    assert.deepEqual(JSON.parse(pipelineEvents[0].data), {
      phase: 'start',
      stage: 'designer',
      attempt: 1,
    });
    assert.deepEqual(JSON.parse(pipelineEvents[1].data), {
      phase: 'end',
      stage: 'designer',
      attempt: 1,
      durationMs: 5000,
      status: 'ok',
    });
  });

  void it('drops envelopes delivered to a stale generate() callback', () => {
    // Single shared provider. The provider's onStructuredEvent setter is called
    // twice — once by the first generate() and once by the second. We capture
    // the FIRST callback before the second generate() overwrites it, then
    // verify that late envelopes delivered to the first (now-stale) callback
    // are dropped by the per-call sequence token.
    const callbackHistory: ((env: SseEventEnvelope<any, unknown>) => void)[] = [];
    const mockProvider: Partial<BackendProxyProvider> = {
      resetConversation: () => undefined,
      cancel: () => undefined,
      stream: undefined as never,
    };
    Object.defineProperty(mockProvider, 'onStructuredEvent', {
      get: () => callbackHistory[callbackHistory.length - 1] ?? undefined,
      set: (cb) => {
        callbackHistory.push(cb as (env: SseEventEnvelope<any, unknown>) => void);
      },
      configurable: true,
    });

    const eventsFirst: { type: string; data: string }[] = [];
    const eventsSecond: { type: string; data: string }[] = [];

    const service = new TemplateAiService(() => null, undefined, undefined, mockProvider as BackendProxyProvider);

    // First call: registers callback index 0. We don't await — we only care
    // about the closure registration side effect, not the failed agent run.
    void service
      .generate({
        prompt: 'first',
        onEvent: (e) => eventsFirst.push({ type: e.type, data: e.data }),
      })
      .catch(() => undefined);

    assert.equal(callbackHistory.length, 1, 'first generate() should have registered a callback');
    const firstCb = callbackHistory[0];

    // Second call: registers callback index 1, which bumps the sequence token.
    void service
      .generate({
        prompt: 'second',
        onEvent: (e) => eventsSecond.push({ type: e.type, data: e.data }),
      })
      .catch(() => undefined);

    assert.equal(callbackHistory.length, 2, 'second generate() should have registered a second callback');
    const secondCb = callbackHistory[1];

    // A late envelope arrives at the FIRST (stale) callback. The token check
    // inside the closure should drop it.
    firstCb({
      schema: 'sse.v1',
      type: 'pipeline_stage_start',
      ts: '2026-06-09T00:00:00Z',
      payload: { stage: 'stale', attempt: 1 },
    });

    // The second (active) callback receives its own envelope.
    secondCb({
      schema: 'sse.v1',
      type: 'pipeline_stage_start',
      ts: '2026-06-09T00:00:00Z',
      payload: { stage: 'active', attempt: 1 },
    });

    // The stale call's onEvent should be empty — the envelope was dropped.
    assert.equal(eventsFirst.length, 0, `stale call should not receive any envelopes, got ${eventsFirst.length}`);
    // The active call's onEvent should have received exactly one envelope.
    const active = eventsSecond.filter((e) => e.type === 'pipeline_stage');
    assert.equal(active.length, 1, `active call should receive 1 envelope, got ${active.length}`);
    assert.deepEqual(JSON.parse(active[0].data), { phase: 'start', stage: 'active', attempt: 1 });
  });
});
