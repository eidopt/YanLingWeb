import { createBlankDocument } from '../fixtures/blankDocument';
import type { ThemeLayoutNode } from '../types';
import { commitEditorDocumentSnapshot, findNodeInDocument, firstMissingExistingNode } from './existingNodeGate';
import { searchEditorNodes } from './searchEditorNodes';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function textNode(id: string, text: string): ThemeLayoutNode {
  return {
    id,
    alias: 'core.text',
    layout: { mode: 'flow' },
    props: { text },
  };
}

void describe('existing node identity gate', () => {
  void it('rejects an invented node id and returns candidates', () => {
    const document = createBlankDocument();
    document.layout.children = [textNode('price-label', '价格 128')];
    const missing = firstMissingExistingNode(document, [
      { type: 'update_props', nodeId: 'price-made-up', props: { text: '99' } },
    ]);
    if (!missing) {
      assert.fail('expected a missing-node error');
    }
    assert.equal(missing.failedId, 'price-made-up');
    assert.ok(missing.candidates.some((candidate) => candidate.nodeId === 'price-label'));
    assert.match(missing.error, /Node not found/);
  });

  void it('accepts an exact existing node id and a new insert id', () => {
    const document = createBlankDocument();
    assert.equal(
      firstMissingExistingNode(document, [
        { type: 'update_props', nodeId: document.layout.id, props: { title: '首页' } },
      ]),
      null,
    );
    assert.equal(
      firstMissingExistingNode(document, [
        {
          type: 'insert_node',
          parentId: document.layout.id,
          alias: 'core.text',
          nodeId: 'price-1',
          props: { text: '价格 128' },
        },
      ]),
      null,
    );
  });

  void it('rejects an insert whose parent id is not in the document', () => {
    const document = createBlankDocument();
    const missing = firstMissingExistingNode(document, [
      { type: 'insert_node', parentId: 'missing-panel', alias: 'core.text', nodeId: 'price-1' },
    ]);
    assert.equal(missing?.failedId, 'missing-panel');
  });

  void it('updates the working snapshot after an accepted insert', () => {
    const document = createBlankDocument();
    const next = commitEditorDocumentSnapshot(document, [
      {
        type: 'insert_node',
        parentId: document.layout.id,
        alias: 'core.text',
        nodeId: 'price-1',
        props: { text: '价格 128' },
      },
    ]);
    if (!next.document) {
      assert.fail(next.error ?? 'snapshot commit failed');
    }
    assert.equal(findNodeInDocument(document, 'price-1'), null);
    assert.equal(findNodeInDocument(next.document, 'price-1')?.alias, 'core.text');
    const hits = searchEditorNodes(next.document, { text: '把价格改成 99' });
    assert.equal(hits[0]?.id, 'price-1');
  });

  void it('finds a node by alias without dumping unrelated nodes first', () => {
    const document = createBlankDocument();
    document.layout.children = [textNode('title-1', '欢迎'), textNode('price-1', '价格 128')];
    const hits = searchEditorNodes(document, { alias: 'core.button' });
    assert.deepEqual(hits, []);
    const texts = searchEditorNodes(document, { alias: 'text' });
    assert.deepEqual(texts.map((hit) => hit.id).sort(), ['price-1', 'title-1']);
  });

  void it('scopes existing-node lookup to the requested pageId when provided', () => {
    const document = createBlankDocument();
    document.layout.children = [textNode('home-title', '首页')];
    document.pages = [
      { id: 'home', name: '首页', layout: document.layout },
      {
        id: 'orders',
        name: '订单',
        layout: {
          id: 'orders-screen',
          alias: 'core.screen',
          layout: { mode: 'flow' },
          props: { title: '订单' },
          children: [textNode('orders-title', '我的订单')],
        },
      },
    ];
    document.defaultPageId = 'home';

    const missing = firstMissingExistingNode(document, [
      { type: 'update_props', pageId: 'orders', nodeId: 'home-title', props: { text: '改名' } },
    ]);
    if (!missing) {
      assert.fail('expected a missing-node error');
    }
    assert.equal(missing.failedId, 'home-title');
    assert.ok(missing.candidates.some((candidate) => candidate.nodeId === 'orders-title'));
    assert.equal(
      firstMissingExistingNode(document, [
        { type: 'update_props', pageId: 'orders', nodeId: 'orders-title', props: { text: '改名' } },
      ]),
      null,
    );
  });
});
