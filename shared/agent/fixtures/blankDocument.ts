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
      { name: 'surface', type: 'string', enum: ['mini-program', 'mobile-app', 'web'] },
      { name: 'chrome', type: 'string', enum: ['wechat', 'app', 'none'] },
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
      { name: 'variant', type: 'string', enum: ['primary', 'secondary', 'link', 'pill'] },
      { name: 'active', type: 'boolean' },
      { name: 'disabled', type: 'boolean' },
      { name: 'icon', type: 'string' },
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
      { name: 'tone', type: 'string', enum: ['info', 'warning', 'error', 'success', 'neutral'] },
    ],
  },
  {
    alias: 'core.image',
    name: 'Image',
    kind: 'component',
    description: 'Image placeholder',
    props: [
      { name: 'src', type: 'string' },
      { name: 'alt', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'iconColor', type: 'string' },
      { name: 'objectFit', type: 'string', enum: ['cover', 'contain', 'fill'] },
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
      { name: 'type', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'disabled', type: 'boolean' },
    ],
  },
  // Navigation
  {
    alias: 'core.navbar',
    name: 'NavBar',
    kind: 'layout',
    description: 'Top navigation bar with title and actions',
    props: [
      { name: 'title', type: 'string' },
      { name: 'subtitle', type: 'string' },
      { name: 'leftArrow', type: 'boolean' },
      { name: 'fixed', type: 'boolean' },
      { name: 'transparent', type: 'boolean' },
    ],
  },
  {
    alias: 'core.tabbar',
    name: 'TabBar',
    kind: 'component',
    description: 'Bottom tab bar for mobile navigation',
    props: [
      { name: 'items', type: 'string[]' },
      { name: 'active', type: 'string' },
      { name: 'icons', type: 'string[]' },
    ],
  },
  {
    alias: 'core.breadcrumb',
    name: 'Breadcrumb',
    kind: 'component',
    description: 'Breadcrumb navigation trail',
    props: [
      { name: 'items', type: 'string[]' },
      { name: 'separator', type: 'string' },
    ],
  },
  {
    alias: 'core.pagination',
    name: 'Pagination',
    kind: 'component',
    description: 'Page navigation control',
    props: [
      { name: 'current', type: 'number' },
      { name: 'total', type: 'number' },
      { name: 'pageSize', type: 'number' },
    ],
  },
  // Data display
  {
    alias: 'core.avatar',
    name: 'Avatar',
    kind: 'component',
    description: 'User avatar with image or text fallback',
    props: [
      { name: 'src', type: 'string' },
      { name: 'text', type: 'string' },
      { name: 'size', type: 'string', enum: ['small', 'medium', 'large'] },
      { name: 'shape', type: 'string', enum: ['circle', 'square'] },
    ],
  },
  {
    alias: 'core.badge',
    name: 'Badge',
    kind: 'component',
    description: 'Notification badge with count or dot',
    props: [
      { name: 'count', type: 'number' },
      { name: 'dot', type: 'boolean' },
      { name: 'max', type: 'number' },
      { name: 'text', type: 'string' },
      { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'error'] },
      { name: 'placement', type: 'string', enum: ['inline', 'corner'] },
    ],
  },
  {
    alias: 'core.list',
    name: 'List',
    kind: 'layout',
    description: 'List container for list items',
    props: [
      { name: 'bordered', type: 'boolean' },
      { name: 'split', type: 'boolean' },
    ],
  },
  {
    alias: 'core.list-item',
    name: 'ListItem',
    kind: 'layout',
    description: 'Individual list item with title and optional details',
    props: [
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'note', type: 'string' },
      { name: 'arrow', type: 'boolean' },
      { name: 'thumb', type: 'string' },
    ],
  },
  {
    alias: 'core.statistic',
    name: 'Statistic',
    kind: 'component',
    description: 'Numerical statistic display with label',
    props: [
      { name: 'title', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'suffix', type: 'string' },
      { name: 'prefix', type: 'string' },
      { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'error'] },
      { name: 'trend', type: 'string', enum: ['up', 'down', 'neutral'] },
    ],
  },
  {
    alias: 'core.collapse',
    name: 'Collapse',
    kind: 'layout',
    description: 'Collapsible accordion panel',
    props: [
      { name: 'title', type: 'string' },
      { name: 'expanded', type: 'boolean' },
    ],
  },
  {
    alias: 'core.carousel',
    name: 'Carousel',
    kind: 'component',
    description: 'Image carousel / swiper',
    props: [
      { name: 'images', type: 'string[]' },
      { name: 'autoplay', type: 'boolean' },
      { name: 'interval', type: 'number' },
    ],
  },
  {
    alias: 'core.empty',
    name: 'Empty',
    kind: 'component',
    description: 'Empty state placeholder with optional action',
    props: [
      { name: 'text', type: 'string' },
      { name: 'image', type: 'string' },
      { name: 'actionLabel', type: 'string' },
    ],
  },
  {
    alias: 'core.skeleton',
    name: 'Skeleton',
    kind: 'component',
    description: 'Loading skeleton placeholder',
    props: [
      { name: 'rows', type: 'number' },
      { name: 'animated', type: 'boolean' },
    ],
  },
  // Data input
  {
    alias: 'core.select',
    name: 'Select',
    kind: 'component',
    description: 'Dropdown select input',
    props: [
      { name: 'label', type: 'string' },
      { name: 'placeholder', type: 'string' },
      { name: 'options', type: 'string[]' },
      { name: 'value', type: 'string' },
      { name: 'multiple', type: 'boolean' },
    ],
  },
  {
    alias: 'core.checkbox',
    name: 'Checkbox',
    kind: 'component',
    description: 'Checkbox input',
    props: [
      { name: 'label', type: 'string' },
      { name: 'checked', type: 'boolean' },
      { name: 'disabled', type: 'boolean' },
    ],
  },
  {
    alias: 'core.radio',
    name: 'Radio',
    kind: 'component',
    description: 'Radio button input',
    props: [
      { name: 'label', type: 'string' },
      { name: 'checked', type: 'boolean' },
      { name: 'disabled', type: 'boolean' },
      { name: 'group', type: 'string' },
    ],
  },
  {
    alias: 'core.switch',
    name: 'Switch',
    kind: 'component',
    description: 'Toggle switch',
    props: [
      { name: 'checked', type: 'boolean' },
      { name: 'disabled', type: 'boolean' },
      { name: 'label', type: 'string' },
    ],
  },
  {
    alias: 'core.rate',
    name: 'Rate',
    kind: 'component',
    description: 'Star rating input',
    props: [
      { name: 'value', type: 'number' },
      { name: 'count', type: 'number' },
      { name: 'size', type: 'string' },
      { name: 'disabled', type: 'boolean' },
    ],
  },
  {
    alias: 'core.slider',
    name: 'Slider',
    kind: 'component',
    description: 'Range slider input',
    props: [
      { name: 'value', type: 'number' },
      { name: 'startValue', type: 'number' },
      { name: 'endValue', type: 'number' },
      { name: 'min', type: 'number' },
      { name: 'max', type: 'number' },
      { name: 'step', type: 'number' },
      { name: 'range', type: 'boolean' },
    ],
  },
  {
    alias: 'core.datepicker',
    name: 'DatePicker',
    kind: 'component',
    description: 'Date picker input',
    props: [
      { name: 'value', type: 'string' },
      { name: 'format', type: 'string' },
      { name: 'placeholder', type: 'string' },
    ],
  },
  {
    alias: 'core.timepicker',
    name: 'TimePicker',
    kind: 'component',
    description: 'Time picker input',
    props: [
      { name: 'value', type: 'string' },
      { name: 'format', type: 'string' },
      { name: 'placeholder', type: 'string' },
    ],
  },
  {
    alias: 'core.form',
    name: 'Form',
    kind: 'layout',
    description: 'Form container for input fields',
    props: [
      { name: 'labelWidth', type: 'string' },
      { name: 'labelAlign', type: 'string', enum: ['left', 'right', 'top'] },
    ],
  },
  {
    alias: 'core.upload',
    name: 'Upload',
    kind: 'component',
    description: 'File upload control',
    props: [
      { name: 'accept', type: 'string' },
      { name: 'multiple', type: 'boolean' },
      { name: 'maxCount', type: 'number' },
      { name: 'actionLabel', type: 'string' },
    ],
  },
  // Feedback
  {
    alias: 'core.dialog',
    name: 'Dialog',
    kind: 'layout',
    description: 'Modal dialog overlay',
    props: [
      { name: 'title', type: 'string' },
      { name: 'visible', type: 'boolean' },
      { name: 'confirmText', type: 'string' },
      { name: 'cancelText', type: 'string' },
    ],
  },
  {
    alias: 'core.toast',
    name: 'Toast',
    kind: 'component',
    description: 'Toast notification message',
    props: [
      { name: 'message', type: 'string' },
      { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] },
      { name: 'duration', type: 'number' },
    ],
  },
  {
    alias: 'core.alert',
    name: 'Alert',
    kind: 'component',
    description: 'Inline alert banner',
    props: [
      { name: 'text', type: 'string' },
      { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] },
      { name: 'closable', type: 'boolean' },
    ],
  },
  {
    alias: 'core.loading',
    name: 'Loading',
    kind: 'component',
    description: 'Loading indicator',
    props: [
      { name: 'size', type: 'string', enum: ['small', 'medium', 'large'] },
      { name: 'text', type: 'string' },
      { name: 'type', type: 'string', enum: ['spinner', 'skeleton'] },
    ],
  },
  {
    alias: 'core.drawer',
    name: 'Drawer',
    kind: 'layout',
    description: 'Slide-out drawer panel',
    props: [
      { name: 'title', type: 'string' },
      { name: 'visible', type: 'boolean' },
      { name: 'placement', type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
    ],
  },
  // Media
  {
    alias: 'core.video',
    name: 'Video',
    kind: 'component',
    description: 'Video player',
    props: [
      { name: 'src', type: 'string' },
      { name: 'poster', type: 'string' },
      { name: 'autoplay', type: 'boolean' },
      { name: 'controls', type: 'boolean' },
    ],
  },
  {
    alias: 'core.audio',
    name: 'Audio',
    kind: 'component',
    description: 'Audio player',
    props: [
      { name: 'src', type: 'string' },
      { name: 'autoplay', type: 'boolean' },
      { name: 'controls', type: 'boolean' },
    ],
  },
  // Layout & Navigation
  {
    alias: 'core.sidebar',
    name: 'Sidebar',
    kind: 'layout',
    description: 'Side navigation panel',
    props: [
      { name: 'collapsed', type: 'boolean' },
      { name: 'width', type: 'string' },
    ],
  },
  {
    alias: 'core.toolbar',
    name: 'Toolbar',
    kind: 'layout',
    description: 'Action toolbar bar',
    props: [
      { name: 'title', type: 'string' },
      { name: 'fixed', type: 'boolean' },
    ],
  },
  {
    alias: 'core.splitter',
    name: 'Splitter',
    kind: 'layout',
    description: 'Resizable split pane container',
    props: [
      { name: 'direction', type: 'string', enum: ['horizontal', 'vertical'] },
      { name: 'min', type: 'string' },
      { name: 'max', type: 'string' },
    ],
  },
  // Professional
  {
    alias: 'core.timeline',
    name: 'Timeline',
    kind: 'layout',
    description: 'Timeline display for sequential events',
    props: [
      { name: 'direction', type: 'string', enum: ['vertical', 'horizontal'] },
    ],
  },
  {
    alias: 'core.tooltip',
    name: 'Tooltip',
    kind: 'component',
    description: 'Tooltip text hint on hover',
    props: [
      { name: 'text', type: 'string' },
      { name: 'placement', type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
    ],
  },
  {
    alias: 'core.tree',
    name: 'Tree',
    kind: 'layout',
    description: 'Hierarchical tree view',
    props: [
      { name: 'data', type: 'object' },
      { name: 'expandAll', type: 'boolean' },
    ],
  },
  {
    alias: 'core.table',
    name: 'Table',
    kind: 'component',
    description: 'Data table with columns and rows',
    props: [
      { name: 'columns', type: 'array' },
      { name: 'data', type: 'array' },
      { name: 'bordered', type: 'boolean' },
      { name: 'stripe', type: 'boolean' },
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
