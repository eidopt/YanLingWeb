import { EditorAiService, type EditorAiSnapshot } from './editorAi.service';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HttpClient, HttpStreamEvent, HttpStreamResult } from 'services/http/HttpClient';
import type { ThemeLayoutDocument } from 'ui/layout/types';

function createMockDocument(overrides?: Partial<ThemeLayoutDocument>): ThemeLayoutDocument {
  return {
    version: 1,
    themeId: 'test',
    themeName: 'Test',
    description: 'Test document',
    components: [],
    defaultPageId: 'p1',
    pages: [],
    layout: { id: 'root', layout: {}, children: [] },
    ...overrides,
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

void describe('EditorAiService snapshot capture', () => {
  void it('pushes a snapshot before applying edit_request envelope', async () => {
    const snapshots: EditorAiSnapshot[] = [];
    const currentDoc = createMockDocument({ themeId: 'original' });
    const mockHttp = createMockHttp([
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'edit_request',
          ts: '2026-06-09T00:00:00Z',
          payload: { data: JSON.stringify({ operations: [], reason: 'test reason' }) },
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
      document: currentDoc,
      getCurrentDocument: () => currentDoc,
      onSnapshot: (s) => snapshots.push(s),
      onEvent: () => undefined,
      applyInstructions: () => ({
        errors: [],
        applied: [],
        selectedNodeId: null,
        document: createMockDocument(),
      }),
    });
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].document.themeId, 'original');
    assert.equal(snapshots[0].description, 'test reason');
    assert.ok(snapshots[0].id);
    assert.ok(snapshots[0].createdAt);
  });

  void it('does not push a snapshot for non-edit events', async () => {
    const snapshots: EditorAiSnapshot[] = [];
    const currentDoc = createMockDocument({ themeId: 'd' });
    const mockHttp = createMockHttp([
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'reasoning_delta',
          ts: 't',
          payload: { delta: 'thinking' },
        }),
      },
      {
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'done',
          ts: 't',
          payload: {},
        }),
      },
    ]);
    const service = new EditorAiService(() => 'token', undefined, mockHttp);
    await service.editCanvas({
      prompt: 'test',
      document: currentDoc,
      getCurrentDocument: () => currentDoc,
      onSnapshot: (s) => snapshots.push(s),
      onEvent: () => undefined,
      applyInstructions: () => ({
        errors: [],
        applied: [],
        selectedNodeId: null,
        document: createMockDocument(),
      }),
    });
    assert.equal(snapshots.length, 0);
  });
});
