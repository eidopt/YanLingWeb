/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { EditorAiService, type EditorAiSnapshot } from './editorAi.service';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('EditorAiService snapshot capture', () => {
  void it('pushes a snapshot before applying edit_request envelope', async () => {
    const snapshots: EditorAiSnapshot[] = [];
    const currentDoc = { themeId: 'original' } as any;
    const mockHttp = {
      stream: async () => ({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events: (async function* () {
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'edit_request',
              ts: '2026-06-09T00:00:00Z',
              payload: { data: JSON.stringify({ operations: [], reason: 'test reason' }) },
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
      document: currentDoc,
      getCurrentDocument: () => currentDoc,
      onSnapshot: (s) => snapshots.push(s),
      onEvent: () => undefined,
      applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }) as any,
    });
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].document.themeId, 'original');
    assert.equal(snapshots[0].description, 'test reason');
    assert.ok(snapshots[0].id);
    assert.ok(snapshots[0].createdAt);
  });

  void it('does not push a snapshot for non-edit events', async () => {
    const snapshots: EditorAiSnapshot[] = [];
    const currentDoc = { themeId: 'd' } as any;
    const mockHttp = {
      stream: async () => ({
        response: { ok: true, status: 200, headers: new Map() } as unknown as Response,
        events: (async function* () {
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'reasoning_delta',
              ts: 't',
              payload: { delta: 'thinking' },
            }),
          };
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'done',
              ts: 't',
              payload: {},
            }),
          };
        })(),
      }),
    };
    const service = new EditorAiService(() => 'token', undefined, mockHttp as any);
    await service.editCanvas({
      prompt: 'test',
      document: currentDoc,
      getCurrentDocument: () => currentDoc,
      onSnapshot: (s) => snapshots.push(s),
      onEvent: () => undefined,
      applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }) as any,
    });
    assert.equal(snapshots.length, 0);
  });
});
