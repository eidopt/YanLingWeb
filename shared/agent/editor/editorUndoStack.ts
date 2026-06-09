import type { ThemeLayoutDocument } from '../types';

export interface EditorUndoSnapshot {
  id: string;
  document: ThemeLayoutDocument;
  description: string;
  createdAt: string;
  assistantMessageId?: string;
}

export interface EditorUndoStackOptions {
  maxSize?: number;
}

export const DEFAULT_UNDO_STACK_SIZE = 20;

export class EditorUndoStack {
  private entries: EditorUndoSnapshot[] = [];
  private readonly maxSize: number;

  constructor(options: EditorUndoStackOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_UNDO_STACK_SIZE;
  }

  get size(): number {
    return this.entries.length;
  }

  get maxCapacity(): number {
    return this.maxSize;
  }

  push(snapshot: EditorUndoSnapshot): void {
    this.entries.push(snapshot);
    while (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  pop(): EditorUndoSnapshot | null {
    return this.entries.pop() ?? null;
  }

  peek(): EditorUndoSnapshot | null {
    return this.entries[this.entries.length - 1] ?? null;
  }

  list(): readonly EditorUndoSnapshot[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    this.entries = [];
  }

  toJSON(): { maxSize: number; entries: EditorUndoSnapshot[] } {
    return { maxSize: this.maxSize, entries: this.entries };
  }

  static fromJSON(json: { maxSize?: number; entries?: EditorUndoSnapshot[] }): EditorUndoStack {
    const stack = new EditorUndoStack({ maxSize: json.maxSize ?? DEFAULT_UNDO_STACK_SIZE });
    stack.entries = json.entries ?? [];
    return stack;
  }
}
