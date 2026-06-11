import type { EditorAiEditCanvasOptions } from './editorAi.service';
import { EditorAiService } from './editorAi.service';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HttpClient, HttpStreamEvent, HttpStreamResult } from 'services/http/HttpClient';
import type { ThemeLayoutDocument } from 'ui/layout/types';

function createMockDocument(): ThemeLayoutDocument {
  return {
    version: 1,
    themeId: 'test',
    themeName: 'Test',
    description: 'Test document',
    components: [],
    defaultPageId: 'p1',
    pages: [],
    layout: { id: 'root', alias: 'core.screen', layout: { mode: 'flow' }, children: [] },
  };
}

function toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (index < items.length) {
            return Promise.resolve({ value: items[index++], done: false });
          }
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        },
      };
    },
  };
}

function createMockHttp(events: HttpStreamEvent[]): HttpClient {
  return {
    json: () => {
      throw new Error('not implemented');
    },
    stream: (): Promise<HttpStreamResult> =>
      Promise.resolve({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events: toAsyncIterable(events),
      }),
  };
}

void describe('EditorAiService envelope event translation', () => {
  void it('translates reasoning_delta envelope to reasoning event', async () => {
    const events: { type: string; data: string }[] = [];
    const mockHttp = createMockHttp([
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'reasoning_delta',
          ts: '2026-06-09T00:00:00Z',
          payload: { delta: '让我想想...' },
        }),
      },
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'done',
          ts: '2026-06-09T00:00:01Z',
          payload: {},
        }),
      },
    ]);
    const service = new EditorAiService(() => 'token', undefined, mockHttp);
    const opts: EditorAiEditCanvasOptions = {
      prompt: 'test',
      document: createMockDocument(),
      getCurrentDocument: createMockDocument,
      onSnapshot: () => undefined,
      onEvent: (e) => events.push({ type: e.type, data: e.data }),
      applyInstructions: () => ({
        errors: [],
        applied: [],
        selectedNodeId: null,
        document: createMockDocument(),
      }),
    };
    await service.editCanvas(opts);
    const reasoningEvents = events.filter((e) => e.type === 'reasoning');
    assert.ok(reasoningEvents.length > 0, `expected at least one reasoning event, got ${reasoningEvents.length}`);
    assert.equal(reasoningEvents[0].data, '让我想想...');
  });

  void it('translates usage_summary envelope to usage_summary event', async () => {
    const events: { type: string; data: string }[] = [];
    const mockHttp = createMockHttp([
      {
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
      },
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'done',
          ts: '2026-06-09T00:00:01Z',
          payload: {},
        }),
      },
    ]);
    const service = new EditorAiService(() => 'token', undefined, mockHttp);
    await service.editCanvas({
      prompt: 'test',
      document: createMockDocument(),
      getCurrentDocument: createMockDocument,
      onSnapshot: () => undefined,
      onEvent: (e) => events.push({ type: e.type, data: e.data }),
      applyInstructions: () => ({
        errors: [],
        applied: [],
        selectedNodeId: null,
        document: createMockDocument(),
      }),
    });
    const usageEvents = events.filter((e) => e.type === 'usage_summary');
    assert.equal(usageEvents.length, 1, `expected 1 usage_summary event, got ${usageEvents.length}`);
    interface UsagePayload {
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      totalCostUsd: number;
    }
    const parsed = JSON.parse(usageEvents[0].data) as UsagePayload;
    assert.equal(parsed.model, 'claude-opus-4-6');
    assert.equal(parsed.usage.inputTokens, 100);
    assert.equal(parsed.usage.outputTokens, 50);
    assert.equal(parsed.totalCostUsd, 0.001);
  });
});
