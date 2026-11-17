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
    const document = documentWith([textNode('price-a', '价格 128'), textNode('price-b', '价格 256')]);
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
});
