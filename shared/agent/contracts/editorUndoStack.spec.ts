import type { ThemeLayoutDocument } from '../types';
import { DEFAULT_UNDO_STACK_SIZE, EditorUndoStack } from './editorUndoStack';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const fakeDoc = (id: string): ThemeLayoutDocument => ({ themeId: id }) as unknown as ThemeLayoutDocument;

void describe('EditorUndoStack', () => {
  void it('starts empty', () => {
    const stack = new EditorUndoStack();
    assert.equal(stack.size, 0);
    assert.equal(stack.peek(), null);
    assert.equal(stack.pop(), null);
  });

  void it('pushes and pops in LIFO order', () => {
    const stack = new EditorUndoStack();
    stack.push({ id: 'a', document: fakeDoc('a'), description: 'edit a', createdAt: '2026-06-09T00:00:00Z' });
    stack.push({ id: 'b', document: fakeDoc('b'), description: 'edit b', createdAt: '2026-06-09T00:00:01Z' });
    assert.equal(stack.size, 2);
    const b = stack.pop();
    assert.equal(b?.id, 'b');
    const a = stack.pop();
    assert.equal(a?.id, 'a');
    assert.equal(stack.size, 0);
  });

  void it('enforces maxSize by dropping oldest', () => {
    const stack = new EditorUndoStack({ maxSize: 3 });
    for (let i = 0; i < 5; i++) {
      stack.push({ id: `s${i}`, document: fakeDoc(`d${i}`), description: `edit ${i}`, createdAt: 't' });
    }
    assert.equal(stack.size, 3);
    assert.equal(
      stack
        .list()
        .map((s) => s.id)
        .join(','),
      's4,s3,s2',
    );
  });

  void it('uses default max size of 20', () => {
    const stack = new EditorUndoStack();
    assert.equal(DEFAULT_UNDO_STACK_SIZE, 20);
    for (let i = 0; i < 25; i++) {
      stack.push({ id: `s${i}`, document: fakeDoc(`d${i}`), description: `edit ${i}`, createdAt: 't' });
    }
    assert.equal(stack.size, 20);
  });

  void it('list returns entries newest-first', () => {
    const stack = new EditorUndoStack();
    stack.push({ id: 'a', document: fakeDoc('a'), description: 'a', createdAt: 't' });
    stack.push({ id: 'b', document: fakeDoc('b'), description: 'b', createdAt: 't' });
    stack.push({ id: 'c', document: fakeDoc('c'), description: 'c', createdAt: 't' });
    assert.equal(
      stack
        .list()
        .map((s) => s.id)
        .join(','),
      'c,b,a',
    );
  });

  void it('peek returns the most recent without removing', () => {
    const stack = new EditorUndoStack();
    stack.push({ id: 'a', document: fakeDoc('a'), description: 'a', createdAt: 't' });
    assert.equal(stack.peek()?.id, 'a');
    assert.equal(stack.size, 1);
  });

  void it('clear removes all entries', () => {
    const stack = new EditorUndoStack();
    stack.push({ id: 'a', document: fakeDoc('a'), description: 'a', createdAt: 't' });
    stack.clear();
    assert.equal(stack.size, 0);
  });

  void it('round-trips through toJSON and fromJSON', () => {
    const stack = new EditorUndoStack();
    stack.push({ id: 'a', document: fakeDoc('a'), description: 'a', createdAt: '2026-06-09T00:00:00Z' });
    stack.push({ id: 'b', document: fakeDoc('b'), description: 'b', createdAt: '2026-06-09T00:00:01Z' });
    const json = stack.toJSON();
    const restored = EditorUndoStack.fromJSON(json);
    assert.equal(restored.size, 2);
    assert.equal(restored.peek()?.id, 'b');
  });
});
