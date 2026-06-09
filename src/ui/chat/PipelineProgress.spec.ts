import { PipelineProgress, type PipelineProgressStage } from './PipelineProgress';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('PipelineProgress', () => {
  void it('exports a function component', () => {
    assert.equal(typeof PipelineProgress, 'function');
  });

  void it('accepts PipelineProgressStage type with required fields', () => {
    const stage: PipelineProgressStage = { stage: 'designer', status: 'running', attempt: 1 };
    assert.equal(stage.stage, 'designer');
  });
});
