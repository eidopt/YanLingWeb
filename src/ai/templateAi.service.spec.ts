/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BackendProxyProvider } from './core/providers/backendProxy.provider';
import { TemplateAiService } from './templateAi.service';
import type { SseEventEnvelope, SseEventType } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('TemplateAiService pipeline events', () => {
  void it('emits pipeline_stage event when onStructuredEvent fires pipeline_stage_start/end', async () => {
    const events: { type: string; data: string }[] = [];
    let capturedCallback: ((env: SseEventEnvelope<any, unknown>) => void) | null = null;

    // Mock BackendProxyProvider stub with the minimum surface used by TemplateAiService
    const mockProvider: Partial<BackendProxyProvider> = {
      resetConversation: () => undefined,
      cancel: () => undefined,
      stream: undefined as never,
      onStructuredEvent: undefined,
    };

    const service = new TemplateAiService(() => null, undefined);
    // Inject mock provider
    (service as unknown as { provider: BackendProxyProvider }).provider =
      mockProvider as BackendProxyProvider;

    // Mock the onStructuredEvent property so the service setter stores our callback.
    Object.defineProperty(mockProvider, 'onStructuredEvent', {
      get: () => capturedCallback,
      set: (cb) => {
        capturedCallback = cb as typeof capturedCallback;
      },
      configurable: true,
    });

    // Trigger generate() and catch the rejection to swallow the deeper agent
    // chain. We only care about the onStructuredEvent wiring at this layer.
    void service
      .generate({
        prompt: 'test',
        onEvent: (event) => events.push({ type: event.type, data: event.data }),
      })
      .catch(() => {
        /* expected: agent chain is not fully wired in this unit test */
      });

    // Allow the service to reach `this.provider.onStructuredEvent = ...`
    // generate() awaits fetchConfig() then synchronously assigns onStructuredEvent.
    // We need to wait for the fetchConfig promise chain to resolve.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

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

    await Promise.resolve();

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
});
