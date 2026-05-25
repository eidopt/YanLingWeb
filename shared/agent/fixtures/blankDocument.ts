import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from '../types';

export const CORE_COMPONENTS: ThemeComponentDescriptor[] = [
  {
    alias: 'core.screen',
    name: 'Screen',
    kind: 'layout',
    description: 'Page root',
    props: [
      { name: 'title', type: 'string' },
      { name: 'statusTime', type: 'string' },
      { name: 'headerActionLabel', type: 'string' },
    ],
  },
  {
    alias: 'core.panel',
    name: 'Panel',
    kind: 'layout',
    description: 'Card-like container',
    props: [
      { name: 'tone', type: 'string', enum: ['default', 'accent', 'promo', 'warm', 'soft', 'member', 'highlight'] },
      { name: 'gap', type: 'string' },
      { name: 'title', type: 'string' },
    ],
  },
  {
    alias: 'core.stack',
    name: 'Stack',
    kind: 'layout',
    description: 'Vertical container',
    props: [
      { name: 'gap', type: 'string' },
      { name: 'alignItems', type: 'string' },
    ],
  },
  {
    alias: 'core.row',
    name: 'Row',
    kind: 'layout',
    description: 'Horizontal container',
    props: [
      { name: 'gap', type: 'string' },
      { name: 'wrap', type: 'boolean' },
      { name: 'justify', type: 'string' },
      { name: 'align', type: 'string' },
      { name: 'tone', type: 'string' },
    ],
  },
  {
    alias: 'core.grid',
    name: 'Grid',
    kind: 'layout',
    description: 'Grid container',
    props: [
      { name: 'gap', type: 'string' },
      { name: 'columns', type: 'number' },
    ],
  },
  {
    alias: 'core.text',
    name: 'Text',
    kind: 'component',
    description: 'Text node',
    props: [
      { name: 'text', type: 'string' },
      {
        name: 'variant',
        type: 'string',
        enum: [
          'display',
          'heading',
          'subheading',
          'body',
          'caption',
          'price',
          'overline',
          'eyebrow',
          'title',
          'subtitle',
        ],
      },
      { name: 'as', type: 'string' },
    ],
  },
  {
    alias: 'core.button',
    name: 'Button',
    kind: 'component',
    description: 'Action button',
    props: [
      { name: 'label', type: 'string' },
      { name: 'variant', type: 'string', enum: ['primary', 'secondary', 'link'] },
      { name: 'disabled', type: 'boolean' },
    ],
  },
  {
    alias: 'core.search',
    name: 'Search',
    kind: 'component',
    description: 'Search input',
    props: [
      { name: 'placeholder', type: 'string' },
      { name: 'value', type: 'string' },
    ],
  },
  {
    alias: 'core.tabs',
    name: 'Tabs',
    kind: 'component',
    description: 'Tab navigation',
    props: [
      { name: 'tabs', type: 'string[]' },
      { name: 'activeTab', type: 'string' },
    ],
  },
  {
    alias: 'core.tag',
    name: 'Tag',
    kind: 'component',
    description: 'Status badge',
    props: [
      { name: 'label', type: 'string' },
      { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'hot', 'new', 'deal', 'member'] },
    ],
  },
  {
    alias: 'core.progress',
    name: 'Progress',
    kind: 'component',
    description: 'Progress bar',
    props: [
      { name: 'value', type: 'number' },
      { name: 'max', type: 'number' },
      { name: 'tone', type: 'string', enum: ['neutral', 'accent', 'success', 'warning', 'info'] },
    ],
  },
  {
    alias: 'core.notice',
    name: 'Notice',
    kind: 'component',
    description: 'Notice banner',
    props: [
      { name: 'text', type: 'string' },
      { name: 'tone', type: 'string' },
    ],
  },
  {
    alias: 'core.image',
    name: 'Image',
    kind: 'component',
    description: 'Image placeholder',
    props: [
      { name: 'alt', type: 'string' },
      { name: 'title', type: 'string' },
    ],
  },
  {
    alias: 'core.html',
    name: 'HTML',
    kind: 'component',
    description: 'Raw HTML wrapper',
    props: [
      { name: 'tag', type: 'string' },
      { name: 'style', type: 'object' },
    ],
  },
  {
    alias: 'core.widget',
    name: 'Widget',
    kind: 'component',
    description: 'Safe third-party ESM widget',
    props: [
      { name: 'library', type: 'string' },
      { name: 'renderer', type: 'string', enum: ['echarts', 'chartjs', 'lottie', 'mermaid'] },
      { name: 'data', type: 'object' },
    ],
  },
  {
    alias: 'core.divider',
    name: 'Divider',
    kind: 'component',
    description: 'Divider',
    props: [],
  },
  {
    alias: 'core.spacer',
    name: 'Spacer',
    kind: 'component',
    description: 'Spacer',
    props: [{ name: 'size', type: 'string' }],
  },
  {
    alias: 'core.input',
    name: 'Input',
    kind: 'component',
    description: 'Input',
    props: [
      { name: 'placeholder', type: 'string' },
      { name: 'label', type: 'string' },
    ],
  },
];

export function createScreenNode(id: string, title: string, children: ThemeLayoutNode[] = []): ThemeLayoutNode {
  return {
    id,
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title },
    children,
  };
}

export function createBlankDocument(themeId = 'blank-agent-document'): ThemeLayoutDocument {
  const layout = createScreenNode('home-screen', '首页');
  return {
    version: 1,
    themeId,
    themeName: '空白测试模板',
    pageName: '首页',
    description: 'Agent evaluation blank document',
    components: CORE_COMPONENTS,
    defaultPageId: 'home',
    pages: [{ id: 'home', name: '首页', layout }],
    layout,
  };
}
