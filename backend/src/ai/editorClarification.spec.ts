import type { ThemeLayoutDocument, ThemeLayoutNode } from '@shared/agent/contracts/agent';

import { bindEditorEditTarget, buildEditorClarification } from './editorClarification';

function textNode(id: string, text: string): ThemeLayoutNode {
  return {
    id,
    alias: 'core.text',
    layout: { mode: 'flow' },
    props: { text },
  };
}

function documentWith(children: ThemeLayoutNode[]): ThemeLayoutDocument {
  const layout: ThemeLayoutNode = {
    id: 'home-screen',
    alias: 'core.screen',
    layout: { mode: 'flow' },
    props: { title: '首页' },
    children,
  };
  return {
    version: 1,
    themeId: 'theme',
    themeName: 'theme',
    description: 'test',
    components: [],
    defaultPageId: 'home',
    pages: [{ id: 'home', name: '首页', layout }],
    layout,
  };
}

describe('editor target binding', () => {
  it('binds one high-scoring node and does not ask', () => {
    const document = documentWith([textNode('title-1', '欢迎'), textNode('price-1', '价格 128')]);
    const input = { prompt: '把价格改成 99', document };
    expect(buildEditorClarification(input)).toBeNull();
    expect(bindEditorEditTarget(input)).toMatchObject({
      nodeId: 'price-1',
      alias: 'core.text',
    });
  });

  it('asks when two nodes match about equally', () => {
    const document = documentWith([
      textNode('price-a', '价格 128'),
      textNode('price-b', '价格 256'),
    ]);
    const input = { prompt: '把价格改成 99', document };
    const clarification = buildEditorClarification(input);
    expect(clarification?.reason).toBe('node_target_unclear');
    expect(clarification?.options.map((option) => option.id).sort()).toEqual([
      'price-a',
      'price-b',
    ]);
    expect(bindEditorEditTarget(input)).toBeNull();
  });

  it('uses the selected node when the user has one selected', () => {
    const selected = textNode('title-1', '欢迎');
    const document = documentWith([selected, textNode('price-1', '价格 128')]);
    const input = { prompt: '改成红色', document, selectedNode: selected };
    expect(buildEditorClarification(input)).toBeNull();
    expect(bindEditorEditTarget(input)?.nodeId).toBe('title-1');
  });

  it('binds nodes from secondary pages in multi-page documents', () => {
    const document = documentWith([textNode('home-title', '首页')]);
    document.pages.push({
      id: 'orders',
      name: '订单页',
      layout: {
        id: 'orders-screen',
        alias: 'core.screen',
        layout: { mode: 'flow' },
        props: { title: '订单' },
        children: [textNode('orders-coupon', '优惠券 20 元')],
      },
    });
    const input = { prompt: '把优惠券改成 50 元', document };
    expect(buildEditorClarification(input)).toBeNull();
    expect(bindEditorEditTarget(input)).toMatchObject({
      nodeId: 'orders-coupon',
      alias: 'core.text',
    });
  });
});
