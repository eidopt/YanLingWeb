import { EditorEditOutbox } from './editorEditOutbox.service';

describe('EditorEditOutbox', () => {
  it('returns a stored edit once to its owner and hides it from everyone else', () => {
    const outbox = new EditorEditOutbox();
    const editId = outbox.put('user-1', '{"operations":[]}');

    expect(outbox.take('user-2', editId)).toBeNull();
    expect(outbox.take('user-1', editId)).toBe('{"operations":[]}');
    expect(outbox.take('user-1', editId)).toBeNull();
  });
});
