import { decideConversationHistoryLoad } from './conversationHistory';
import { SseOutputController } from './sseOutputController';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('sse output controller', () => {
  void it('releases a burst in capped frames and keeps the rest buffered', () => {
    const controller = new SseOutputController();
    controller.start('run-1');
    const burst = '字'.repeat(200);
    assert.deepEqual(controller.enqueue('run-1', { kind: 'text', messageId: 'a', text: burst }), []);

    const first = controller.tick('run-1');
    assert.equal(first.length, 1);
    assert.equal(first[0]?.kind, 'text');
    assert.ok((first[0]?.text?.length ?? 0) <= 64);
    assert.ok(controller.pendingChars > 0);

    const rest = controller.flush('run-1');
    assert.equal(`${first[0]?.text ?? ''}${rest[0]?.text ?? ''}`, burst);
    assert.equal(controller.pendingChars, 0);
  });

  void it('flushes paced text before a control event', () => {
    const controller = new SseOutputController();
    controller.start('run-1');
    controller.enqueue('run-1', { kind: 'text', messageId: 'a', text: '先看到这句话' });
    const frames = controller.enqueue('run-1', { kind: 'control', name: 'done', data: '' });
    assert.deepEqual(
      frames.map((frame) => frame.kind),
      ['text', 'control'],
    );
    assert.equal(frames[1]?.name, 'done');
    assert.equal(controller.pendingChars, 0);
  });

  void it('drops events from a replaced session', () => {
    const controller = new SseOutputController();
    controller.start('run-1');
    controller.enqueue('run-1', { kind: 'text', messageId: 'a', text: '旧流' });
    controller.start('run-2');
    assert.deepEqual(controller.tick('run-1'), []);
    assert.equal(controller.pendingChars, 0);
    controller.enqueue('run-2', { kind: 'reasoning', messageId: 'b', text: '新流' });
    const frames = controller.flush('run-2');
    assert.equal(frames[0]?.kind, 'reasoning');
    assert.equal(frames[0]?.text, '新流');
  });
});

void describe('conversation history load', () => {
  void it('ignores a late payload once a live run has started', () => {
    assert.equal(
      decideConversationHistoryLoad({
        requestEpoch: 1,
        currentEpoch: 2,
        live: true,
        localCompletedCount: 1,
        remoteCount: 4,
      }),
      'ignore',
    );
  });

  void it('keeps a longer local transcript and replaces a shorter one', () => {
    assert.equal(
      decideConversationHistoryLoad({
        requestEpoch: 3,
        currentEpoch: 3,
        live: false,
        localCompletedCount: 4,
        remoteCount: 2,
      }),
      'keep',
    );
    assert.equal(
      decideConversationHistoryLoad({
        requestEpoch: 3,
        currentEpoch: 3,
        live: false,
        localCompletedCount: 1,
        remoteCount: 3,
      }),
      'replace',
    );
  });

  void it('does not wipe the panel when the server has no history', () => {
    assert.equal(
      decideConversationHistoryLoad({
        requestEpoch: 1,
        currentEpoch: 1,
        live: false,
        localCompletedCount: 2,
        remoteCount: 0,
      }),
      'keep',
    );
  });
});
