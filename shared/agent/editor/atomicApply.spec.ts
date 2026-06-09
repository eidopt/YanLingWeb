import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import type { ThemeLayoutDocument } from '../types';
import { applyCompiledOperationsAtomic } from './atomicApply';
import { buildTemplateProfile, createBlankDocument, getSeedDocument } from '@shared/agent/runtime';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function compiledWith(op: unknown): CompiledSemanticInstruction {
  return {
    profile: buildTemplateProfile(createBlankDocument()),
    warnings: [],
    operations: [op as CompiledSemanticInstruction['operations'][number]],
  };
}

void describe('applyCompiledOperationsAtomic', () => {
  void it('applies a single op successfully and returns snapshot', async () => {
    const doc = getSeedDocument('commerceMarket');
    const before = JSON.parse(JSON.stringify(doc)) as ThemeLayoutDocument;
    const compiled = compiledWith({
      type: 'update_props',
      nodeId: 'home-title',
      props: { text: 'Changed' },
      select: true,
    });

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-1' });

    assert.equal(result.success, true);
    assert.equal(result.data?.applied, true);
    assert.equal(result.data?.appliedOperations.length, 1); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    assert.deepEqual(result.data?.snapshot, before); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    const updatedNode = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    assert.equal(updatedNode?.props?.text, 'Changed');
  });

  void it('rolls back when an op in the middle fails (atomicity)', async () => {
    const doc = getSeedDocument('commerceMarket');
    const before = JSON.parse(JSON.stringify(doc)) as ThemeLayoutDocument;

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

  void it('returns success and empty operations when no ops provided', async () => {
    const doc = getSeedDocument('commerceMarket');
    const before = JSON.parse(JSON.stringify(doc)) as ThemeLayoutDocument;
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

  void it('propagates nested props mutation to caller doc via Object.assign', async () => {
    const doc = getSeedDocument('commerceMarket');
    // Snapshot the original props for the target node so we can confirm a new
    // prop key is added rather than overwriting a pre-existing one.
    const beforeNode = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    const beforeProps = beforeNode?.props ? { ...beforeNode.props } : {};
    const compiled = compiledWith({
      type: 'update_props',
      nodeId: 'home-title',
      props: { as: 'h1' },
      select: true,
    });

    const result = await applyCompiledOperationsAtomic(compiled, doc, { sessionId: 'test-4' });

    assert.equal(result.success, true);
    const updatedNode = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    // The new prop must be visible on the caller's document reference, which
    // confirms Object.assign correctly propagates inner-object mutations.
    assert.equal(updatedNode?.props?.as, 'h1');
    // The inner props object on the caller's doc must be the same reference
    // shared by the mutated tree (no copy happened), preserving the mutation.
    assert.strictEqual(updatedNode?.props, doc.pages[0].layout.children?.find((c) => c.id === 'home-title')?.props); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    // Pre-existing props should not be wiped out.
    for (const [key, value] of Object.entries(beforeProps)) {
      assert.deepEqual(updatedNode?.props?.[key], value, `existing prop ${key} should be preserved`); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    }
  });
});
