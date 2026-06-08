/* eslint-disable @typescript-eslint/no-floating-promises */
import { applyCompiledOperationsAtomic } from './atomicApply';
import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import { buildTemplateProfile, createBlankDocument, getSeedDocument } from '@shared/agent/runtime';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ThemeLayoutDocument } from '../types';

function compiledWith(op: unknown): CompiledSemanticInstruction {
  return {
    profile: buildTemplateProfile(createBlankDocument()),
    warnings: [],
    operations: [op as CompiledSemanticInstruction['operations'][number]],
  };
}

describe('applyCompiledOperationsAtomic', () => {
  it('applies a single op successfully and returns snapshot', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));
    const compiled = compiledWith({
      type: 'update_props',
      nodeId: 'home-title',
      props: { text: 'Changed' },
      select: true,
    });

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-1' });

    assert.equal(result.success, true);
    assert.equal(result.data?.applied, true);
    assert.equal(result.data?.appliedOperations.length, 1);
    assert.deepEqual(result.data?.snapshot, before);
    const updatedNode = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    assert.equal(updatedNode?.props?.text, 'Changed');
  });

  it('rolls back when an op in the middle fails (atomicity)', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));

    // Two ops: first succeeds, second fails (invalid nodeId)
    const compiled: CompiledSemanticInstruction = {
      profile: buildTemplateProfile(doc),
      warnings: [],
      operations: [
        { type: 'update_props', nodeId: 'home-title', props: { text: 'OK' }, select: true },
        { type: 'update_props', nodeId: 'NONEXISTENT_NODE', props: { text: 'fail' }, select: true },
      ],
    };

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-2' });

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'apply_failed');
    assert.deepEqual(doc, before); // 整个 doc 回滚到初始状态
  });

  it('returns success and empty operations when no ops provided', async () => {
    const doc = getSeedDocument('commerceMarket') as ThemeLayoutDocument;
    const before = JSON.parse(JSON.stringify(doc));
    const compiled: CompiledSemanticInstruction = {
      profile: buildTemplateProfile(doc),
      warnings: [],
      operations: [],
    };

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-3' });

    assert.equal(result.success, true);
    assert.deepEqual(result.data?.appliedOperations, []);
    assert.deepEqual(doc, before);
  });
});
