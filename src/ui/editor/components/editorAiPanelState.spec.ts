/* eslint-disable @typescript-eslint/no-floating-promises -- node:test's `it()` returns a Promise that the test runner consumes */
import type { ThemeLayoutDocument } from '../../layout/types';
import { EditorAiPanelState } from './editorAiPanelState';
import type { EditorUndoSnapshot } from '@shared/agent/contracts/editorUndoStack';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

const fakeDoc = (id: string): ThemeLayoutDocument => ({ themeId: id }) as unknown as ThemeLayoutDocument;
const fakeSnap = (id: string): EditorUndoSnapshot => ({
  id,
  document: fakeDoc(id),
  description: `edit ${id}`,
  createdAt: '2026-06-10T00:00:00Z',
});

// 为 Node 单测提供最小化的 localStorage 桩, 仅覆盖本测试关注的读写场景。
const memory = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => {
    memory.clear();
  },
  key: (index: number) => Array.from(memory.keys())[index] ?? null,
  get length() {
    return memory.size;
  },
};

const STORAGE_KEY = 'editor-ai-panel-state/v1';

describe('EditorAiPanelState', () => {
  beforeEach(() => {
    memory.clear();
    // 在 Node 单测中临时挂载最小化的 window 桩
    const windowRef = globalThis as unknown as { window?: { localStorage: typeof localStorageStub } };
    windowRef.window = { localStorage: localStorageStub };
  });

  it('starts empty', () => {
    const s = new EditorAiPanelState();
    assert.equal(s.size, 0);
    assert.equal(s.currentDocument, null);
    assert.equal(s.peek(), null);
  });

  it('pushSnapshot stores stack and current doc', () => {
    const s = new EditorAiPanelState();
    s.pushSnapshot(fakeSnap('a'), fakeDoc('doc-a'));
    assert.equal(s.size, 1);
    assert.equal(s.currentDocument?.themeId, 'doc-a');
    assert.equal(s.peek()?.id, 'a');
  });

  it('pop removes latest snapshot and persists', () => {
    const s = new EditorAiPanelState();
    s.pushSnapshot(fakeSnap('a'), fakeDoc('doc-a'));
    s.pushSnapshot(fakeSnap('b'), fakeDoc('doc-b'));
    const popped = s.pop();
    assert.equal(popped?.id, 'b');
    assert.equal(s.size, 1);
  });

  it('pop updates currentDocument to the restored snapshot', () => {
    const s = new EditorAiPanelState();
    s.pushSnapshot(fakeSnap('a'), fakeDoc('doc-a'));
    s.pushSnapshot(fakeSnap('b'), fakeDoc('doc-b'));
    const popped = s.pop();
    assert.equal(popped?.id, 'b');
    // pop() must mirror popped.document into currentDocument so persistence
    // stays consistent. fakeSnap('b').document.themeId === 'b'.
    assert.equal(s.currentDocument?.themeId, 'b');
  });

  it('clear resets state and storage', () => {
    const s = new EditorAiPanelState();
    s.pushSnapshot(fakeSnap('a'), fakeDoc('doc-a'));
    s.clear();
    assert.equal(s.size, 0);
    assert.equal(s.currentDocument, null);
    assert.equal(memory.has(STORAGE_KEY), false);
  });
});
