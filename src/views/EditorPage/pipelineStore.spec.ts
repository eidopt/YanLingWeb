/* eslint-disable @typescript-eslint/no-floating-promises -- node:test's `it()` returns a Promise that the test runner consumes */
import { parsePipelineEvent, PipelineStore } from './pipelineStore';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Helper: build a PipelineStageEvent from type + data object. */
function makeEvent(data: Record<string, unknown>): { type: string; data: string } {
  return { type: 'pipeline_stage', data: JSON.stringify(data) };
}

describe('parsePipelineEvent', () => {
  it('parses a valid start event', () => {
    const result = parsePipelineEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    assert.ok(result !== null);
    assert.equal(result.phase, 'start');
    assert.equal(result.stage, 'designer');
    assert.equal(result.attempt, 1);
    assert.equal(result.status, undefined);
  });

  it('parses a valid end event with ok status', () => {
    const result = parsePipelineEvent(
      makeEvent({ phase: 'end', stage: 'critic', attempt: 2, status: 'ok', durationMs: 1500 }),
    );
    assert.ok(result !== null);
    assert.equal(result.phase, 'end');
    assert.equal(result.stage, 'critic');
    assert.equal(result.status, 'ok');
    assert.equal(result.durationMs, 1500);
  });

  it('parses a valid end event with failed status', () => {
    const result = parsePipelineEvent(
      makeEvent({ phase: 'end', stage: 'schema', attempt: 1, status: 'failed', error: 'validation error' }),
    );
    assert.ok(result !== null);
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'validation error');
  });

  it('returns null for invalid phase', () => {
    const result = parsePipelineEvent(makeEvent({ phase: 'middle', stage: 'designer', attempt: 1 }));
    assert.equal(result, null);
  });

  it('returns null for unknown stage', () => {
    const result = parsePipelineEvent(makeEvent({ phase: 'start', stage: 'unknown', attempt: 1 }));
    assert.equal(result, null);
  });

  it('returns null for non-JSON data', () => {
    const result = parsePipelineEvent({ type: 'pipeline_stage', data: 'not json {' });
    assert.equal(result, null);
  });

  it('defaults attempt to 0 when missing', () => {
    const result = parsePipelineEvent(makeEvent({ phase: 'start', stage: 'verifier' }));
    assert.ok(result !== null);
    assert.equal(result.attempt, 0);
  });
});

describe('PipelineStore', () => {
  it('starts with empty state', () => {
    const store = new PipelineStore();
    const state = store.getSnapshot();
    assert.deepEqual(state.stages, []);
    assert.equal(state.currentAttempt, undefined);
  });

  it('applyEvent updates stage status to running on start', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    const state = store.getSnapshot();
    assert.equal(state.stages.length, 1);
    assert.equal(state.stages[0].stage, 'designer');
    assert.equal(state.stages[0].status, 'running');
    assert.equal(state.currentAttempt, 1);
  });

  it('applyEvent updates stage status to ok on end', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    store.applyEvent(makeEvent({ phase: 'end', stage: 'designer', attempt: 1, status: 'ok', durationMs: 500 }));
    const state = store.getSnapshot();
    assert.equal(state.stages.length, 1);
    assert.equal(state.stages[0].status, 'ok');
    assert.equal(state.stages[0].durationMs, 500);
  });

  it('applyEvent updates stage status to failed on end', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'schema', attempt: 1 }));
    store.applyEvent(makeEvent({ phase: 'end', stage: 'schema', attempt: 1, status: 'failed', error: 'bad schema' }));
    const state = store.getSnapshot();
    assert.equal(state.stages[0].status, 'failed');
    assert.equal(state.stages[0].error, 'bad schema');
  });

  it('multiple stages accumulate independently', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    store.applyEvent(makeEvent({ phase: 'start', stage: 'critic', attempt: 1 }));
    const state = store.getSnapshot();
    assert.equal(state.stages.length, 2);
    assert.equal(state.stages[0].stage, 'designer');
    assert.equal(state.stages[0].status, 'running');
    assert.equal(state.stages[1].stage, 'critic');
    assert.equal(state.stages[1].status, 'running');
  });

  it('same stage event replaces previous entry', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    store.applyEvent(makeEvent({ phase: 'end', stage: 'designer', attempt: 1, status: 'ok' }));
    const state = store.getSnapshot();
    assert.equal(state.stages.length, 1);
    assert.equal(state.stages[0].status, 'ok');
  });

  it('notifies listeners on applyEvent', () => {
    const store = new PipelineStore();
    let callCount = 0;
    const unsub = store.subscribe(() => {
      callCount++;
    });
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    assert.equal(callCount, 1);
    unsub();
  });

  it('reset clears state to empty', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    store.applyEvent(makeEvent({ phase: 'start', stage: 'critic', attempt: 1 }));
    store.reset();
    const state = store.getSnapshot();
    assert.deepEqual(state.stages, []);
    assert.equal(state.currentAttempt, undefined);
  });

  it('reset notifies listeners', () => {
    const store = new PipelineStore();
    store.applyEvent(makeEvent({ phase: 'start', stage: 'designer', attempt: 1 }));
    let resetNotified = false;
    const unsub = store.subscribe(() => {
      resetNotified = true;
    });
    store.reset();
    assert.ok(resetNotified);
    unsub();
  });

  it('reset is no-op when already empty', () => {
    const store = new PipelineStore();
    let notified = false;
    const unsub = store.subscribe(() => {
      notified = true;
    });
    store.reset();
    assert.ok(!notified);
    unsub();
  });
});
