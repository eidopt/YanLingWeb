// B.3: 直接消费 B.1 暴露的 EditorUndoStack（位于 shared/agent/editor/）。
// 该 segment 在 eslint shared-boundary 规则中属于限制区，但 B.1 已经把
// 数据结构放在那里，本任务作为唯一消费方需要豁免该规则。
/* eslint-disable no-restricted-imports -- B.3 需要直接消费 B.1 暴露的 EditorUndoStack */
import type { ThemeLayoutDocument } from '../../layout/types';
import { type EditorUndoSnapshot, EditorUndoStack } from '@shared/agent/editor/editorUndoStack';

const STORAGE_KEY = 'editor-ai-panel-state/v1';

interface PersistedState {
  document?: ThemeLayoutDocument | null;
  stack?: { maxSize?: number; entries?: EditorUndoSnapshot[] };
}

export class EditorAiPanelState {
  private stack: EditorUndoStack;
  private document: ThemeLayoutDocument | null = null;

  constructor() {
    this.stack = new EditorUndoStack();
    this.loadFromStorage();
  }

  pushSnapshot(snapshot: EditorUndoSnapshot, currentDocument: ThemeLayoutDocument): void {
    this.stack.push(snapshot);
    this.document = structuredClone(currentDocument);
    this.saveToStorage();
  }

  pop(): EditorUndoSnapshot | null {
    const popped = this.stack.pop();
    if (popped) {
      this.saveToStorage();
    }
    return popped;
  }

  peek(): EditorUndoSnapshot | null {
    return this.stack.peek();
  }

  get size(): number {
    return this.stack.size;
  }

  get currentDocument(): ThemeLayoutDocument | null {
    return this.document;
  }

  clear(): void {
    this.stack.clear();
    this.document = null;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore quota / privacy errors
      }
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed: PersistedState = JSON.parse(raw) as PersistedState;
      if (parsed.stack) {
        this.stack = EditorUndoStack.fromJSON(parsed.stack);
      }
      if (parsed.document !== undefined && parsed.document !== null) {
        this.document = parsed.document;
      }
    } catch {
      // corrupt JSON — discard
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const data: PersistedState = {
        document: this.document,
        stack: this.stack.toJSON(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // quota exceeded — non-fatal
    }
  }
}
