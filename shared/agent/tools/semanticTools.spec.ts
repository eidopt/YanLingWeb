import { assertSemanticToolName, isSemanticTool, parseSemanticArgs, type SemanticToolName } from './semanticTools';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('isSemanticTool', () => {
  void it('returns true for the 5 semantic tool names', () => {
    const names: SemanticToolName[] = [
      'editor_update_slot',
      'editor_fill_pattern',
      'editor_create_page_from_page_kind',
      'editor_replace_section',
      'editor_submit_page_spec',
    ];
    for (const name of names) {
      assert.equal(isSemanticTool(name), true);
    }
  });

  void it('returns false for low-level tool names', () => {
    assert.equal(isSemanticTool('editor_update_props'), false);
    assert.equal(isSemanticTool('editor_insert_node'), false);
    assert.equal(isSemanticTool('editor_create_page'), false);
  });

  void it('returns false for unknown names', () => {
    assert.equal(isSemanticTool('foo_bar'), false);
    assert.equal(isSemanticTool(''), false);
  });
});

void describe('parseSemanticArgs', () => {
  void it('passes through update_slot args', () => {
    const result = parseSemanticArgs('editor_update_slot', {
      slotKey: 'home.hero.title',
      props: { text: 'New title' },
    });
    assert.deepEqual(result, {
      slotKey: 'home.hero.title',
      props: { text: 'New title' },
    });
  });

  void it('passes through fill_pattern args with items array', () => {
    const result = parseSemanticArgs('editor_fill_pattern', {
      patternKey: 'product.card',
      items: [{ title: 'Apple' }],
      replaceExisting: true,
    });
    assert.equal(result.patternKey, 'product.card');
    assert.deepEqual(result.items, [{ title: 'Apple' }]);
    assert.equal(result.replaceExisting, true);
  });

  void it('returns cleaned object when input is empty (undefined fields are stripped)', () => {
    const result = parseSemanticArgs('editor_create_page_from_page_kind', {});
    assert.deepEqual(result, {});
  });

  void it('throws for unknown tool name', () => {
    assert.throws(() => parseSemanticArgs('foo_bar' as SemanticToolName, {}), /Unknown semantic tool: foo_bar/);
  });
});

void describe('assertSemanticToolName', () => {
  void it('passes for known semantic tool names', () => {
    assert.doesNotThrow(() => assertSemanticToolName('editor_update_slot'));
    assert.doesNotThrow(() => assertSemanticToolName('editor_submit_page_spec'));
  });

  void it('throws for unknown names', () => {
    assert.throws(() => assertSemanticToolName('foo_bar'), /Unknown semantic tool: foo_bar/);
    assert.throws(() => assertSemanticToolName(''), /Unknown semantic tool: /);
  });
});
