/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import type { EditorAiEditCanvasOptions } from './editorAi.service';
import { EditorAiService } from './editorAi.service';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('EditorAiService envelope event translation', () => {
  void it('translates reasoning_delta envelope to reasoning event', async () => {
    const events: { type: string; data: string }[] = [];
    const mockHttp = {
      stream: async () => ({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events: (async function* () {
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'reasoning_delta',
              ts: '2026-06-09T00:00:00Z',
              payload: { delta: '让我想想...' },
            }),
          };
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'done',
              ts: '2026-06-09T00:00:01Z',
              payload: {},
            }),
          };
        })(),
      }),
    };
    const service = new EditorAiService(() => 'token', undefined, mockHttp as any);
    const opts: EditorAiEditCanvasOptions = {
      prompt: 'test',
      document: {} as any,
      getCurrentDocument: () => ({}) as any,
      onSnapshot: () => undefined,
      onEvent: (e) => events.push({ type: e.type, data: e.data }),
      applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }) as any,
    };
    await service.editCanvas(opts);
    const reasoningEvents = events.filter((e) => e.type === 'reasoning');
    assert.ok(reasoningEvents.length > 0, `expected at least one reasoning event, got ${reasoningEvents.length}`);
    assert.equal(reasoningEvents[0].data, '让我想想...');
  });

  void it('translates usage_summary envelope to usage_summary event', async () => {
    const events: { type: string; data: string }[] = [];
    const mockHttp = {
      stream: async () => ({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events: (async function* () {
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'usage_summary',
              ts: '2026-06-09T00:00:00Z',
              payload: {
                model: 'claude-opus-4-6',
                usage: { inputTokens: 100, outputTokens: 50, cacheHitTokens: 80, cacheMissTokens: 20 },
                totalCostUsd: 0.001,
              },
            }),
          };
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'done',
              ts: '2026-06-09T00:00:01Z',
              payload: {},
            }),
          };
        })(),
      }),
    };
    const service = new EditorAiService(() => 'token', undefined, mockHttp as any);
    await service.editCanvas({
      prompt: 'test',
      document: {} as any,
      getCurrentDocument: () => ({}) as any,
      onSnapshot: () => undefined,
      onEvent: (e) => events.push({ type: e.type, data: e.data }),
      applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }) as any,
    });
    const usageEvents = events.filter((e) => e.type === 'usage_summary');
    assert.equal(usageEvents.length, 1, `expected 1 usage_summary event, got ${usageEvents.length}`);
    const parsed = JSON.parse(usageEvents[0].data);
    assert.equal(parsed.model, 'claude-opus-4-6');
    assert.equal(parsed.usage.inputTokens, 100);
    assert.equal(parsed.usage.outputTokens, 50);
    assert.equal(parsed.totalCostUsd, 0.001);
  });
});
