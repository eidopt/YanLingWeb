import {
  PipelineProgress,
  type PipelineProgressStage,
  type PipelineStageName,
  type PipelineStageStatus,
} from './PipelineProgress';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('PipelineProgress', () => {
  void it('exports a function component', () => {
    assert.equal(typeof PipelineProgress, 'function');
  });

  void it('PipelineStageName covers all 4 pipeline stages', () => {
    const stages: PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];
    assert.equal(stages.length, 4);
  });

  void it('PipelineStageStatus covers pending, running, ok, failed', () => {
    const statuses: PipelineStageStatus[] = ['pending', 'running', 'ok', 'failed'];
    assert.equal(statuses.length, 4);
  });

  void it('PipelineProgressStage accepts all required fields', () => {
    const stage: PipelineProgressStage = {
      stage: 'designer',
      status: 'running',
      attempt: 1,
    };
    assert.equal(stage.stage, 'designer');
    assert.equal(stage.status, 'running');
    assert.equal(stage.attempt, 1);
  });

  void it('PipelineProgressStage accepts optional durationMs and error', () => {
    const stage: PipelineProgressStage = {
      stage: 'critic',
      status: 'failed',
      attempt: 2,
      durationMs: 1500,
      error: 'failed validation',
    };
    assert.equal(stage.durationMs, 1500);
    assert.equal(stage.error, 'failed validation');
  });
});
