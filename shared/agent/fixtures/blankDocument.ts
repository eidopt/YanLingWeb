import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from '../types';

export const CORE_COMPONENTS: ThemeComponentDescriptor[] = [
  {
    alias: 'core.screen',
    name: 'Screen',
    kind: 'layout',
    description: 'Page root',
    props: [
      { name: 'title', type: 'string', label: '页面标题' },
      { name: 'statusTime', type: 'string', label: '状态栏时间' },
      { name: 'headerActionLabel', type: 'string', label: '顶栏操作文案' },
      { name: 'surface', type: 'string', enum: ['mini-program', 'mobile-app', 'web'], label: '平台形态' },
      { name: 'chrome', type: 'string', enum: ['wechat', 'app', 'none'], label: '外壳样式' },
    ],
  },
  {
    alias: 'core.panel',
    name: 'Panel',
    kind: 'layout',
    description: 'Card-like container',
    props: [
      {
        name: 'tone',
        type: 'string',
        enum: ['default', 'accent', 'promo', 'warm', 'soft', 'member', 'highlight'],
        label: '色调',
      },
      { name: 'gap', type: 'string', label: '间距' },
      { name: 'title', type: 'string', label: '标题' },
    ],
  },
  {
    alias: 'core.stack',
    name: 'Stack',
    kind: 'layout',
    description: 'Vertical container',
    props: [
      { name: 'gap', type: 'string', label: '间距' },
      { name: 'alignItems', type: 'string', label: '纵向对齐' },
    ],
  },
  {
    alias: 'core.row',
    name: 'Row',
    kind: 'layout',
    description: 'Horizontal container',
    props: [
      { name: 'gap', type: 'string', label: '间距' },
      { name: 'wrap', type: 'boolean', label: '自动换行' },
      { name: 'justify', type: 'string', label: '主轴对齐' },
      { name: 'align', type: 'string', label: '交叉轴对齐' },
      { name: 'tone', type: 'string', label: '色调' },
    ],
  },
  {
    alias: 'core.grid',
    name: 'Grid',
    kind: 'layout',
    description: 'Grid container',
    props: [
      { name: 'gap', type: 'string', label: '间距' },
      { name: 'columns', type: 'number', label: '列数' },
    ],
  },
  {
    alias: 'core.text',
    name: 'Text',
    kind: 'component',
    description: 'Text node',
    props: [
      { name: 'text', type: 'string', label: '文本内容' },
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
        label: '文字样式',
      },
      { name: 'as', type: 'string', label: '渲染标签' },
    ],
  },
  {
    alias: 'core.button',
    name: 'Button',
    kind: 'component',
    description: 'Action button',
    props: [
      { name: 'label', type: 'string', label: '按钮文案' },
      { name: 'variant', type: 'string', enum: ['primary', 'secondary', 'link', 'pill'], label: '按钮样式' },
      { name: 'active', type: 'boolean', label: '选中状态' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
      { name: 'icon', type: 'string', label: '图标' },
    ],
  },
  {
    alias: 'core.search',
    name: 'Search',
    kind: 'component',
    description: 'Search input',
    props: [
      { name: 'placeholder', type: 'string', label: '占位提示' },
      { name: 'value', type: 'string', label: '输入值' },
    ],
  },
  {
    alias: 'core.tabs',
    name: 'Tabs',
    kind: 'component',
    description: 'Tab navigation',
    props: [
      { name: 'tabs', type: 'string[]', label: '标签项' },
      { name: 'activeTab', type: 'string', label: '当前标签' },
    ],
  },
  {
    alias: 'core.tag',
    name: 'Tag',
    kind: 'component',
    description: 'Status badge',
    props: [
      { name: 'label', type: 'string', label: '标签文案' },
      {
        name: 'tone',
        type: 'string',
        enum: ['neutral', 'success', 'warning', 'info', 'hot', 'new', 'deal', 'member'],
        label: '色调',
      },
    ],
  },
  {
    alias: 'core.progress',
    name: 'Progress',
    kind: 'component',
    description: 'Progress bar',
    props: [
      { name: 'value', type: 'number', label: '当前值' },
      { name: 'max', type: 'number', label: '最大值' },
      { name: 'tone', type: 'string', enum: ['neutral', 'accent', 'success', 'warning', 'info'], label: '色调' },
    ],
  },
  {
    alias: 'core.notice',
    name: 'Notice',
    kind: 'component',
    description: 'Notice banner',
    props: [
      { name: 'text', type: 'string', label: '提示文本' },
      { name: 'tone', type: 'string', enum: ['info', 'warning', 'error', 'success', 'neutral'], label: '色调' },
    ],
  },
  {
    alias: 'core.image',
    name: 'Image',
    kind: 'component',
    description: 'Image placeholder',
    props: [
      { name: 'src', type: 'string', label: '图片地址' },
      { name: 'alt', type: 'string', label: '替代文本' },
      { name: 'title', type: 'string', label: '标题' },
      { name: 'iconColor', type: 'string', label: '占位底色' },
      { name: 'objectFit', type: 'string', enum: ['cover', 'contain', 'fill'], label: '填充方式' },
    ],
  },
  {
    alias: 'core.html',
    name: 'HTML',
    kind: 'component',
    description: 'Raw HTML wrapper',
    props: [
      { name: 'tag', type: 'string', label: 'HTML 标签' },
      { name: 'style', type: 'object', label: '内联样式' },
    ],
  },
  {
    alias: 'core.widget',
    name: 'Widget',
    kind: 'component',
    description: 'Safe third-party ESM widget',
    props: [
      { name: 'library', type: 'string', label: '组件库' },
      { name: 'renderer', type: 'string', enum: ['echarts', 'chartjs', 'lottie', 'mermaid'], label: '渲染器' },
      { name: 'data', type: 'object', label: '数据' },
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
    props: [{ name: 'size', type: 'string', label: '间距大小' }],
  },
  {
    alias: 'core.input',
    name: 'Input',
    kind: 'component',
    description: 'Input',
    props: [
      { name: 'placeholder', type: 'string', label: '占位提示' },
      { name: 'label', type: 'string', label: '字段标签' },
      { name: 'type', type: 'string', label: '输入类型' },
      { name: 'value', type: 'string', label: '输入值' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
    ],
  },
  // Navigation
  {
    alias: 'core.navbar',
    name: 'NavBar',
    kind: 'layout',
    description: 'Top navigation bar with title and actions',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'subtitle', type: 'string', label: '副标题' },
      { name: 'leftArrow', type: 'boolean', label: '返回箭头' },
      { name: 'fixed', type: 'boolean', label: '固定顶部' },
      { name: 'transparent', type: 'boolean', label: '透明背景' },
    ],
  },
  {
    alias: 'core.tabbar',
    name: 'TabBar',
    kind: 'component',
    description: 'Bottom tab bar for mobile navigation',
    props: [
      { name: 'items', type: 'string[]', label: '标签项' },
      { name: 'active', type: 'string', label: '当前项' },
      { name: 'icons', type: 'string[]', label: '图标' },
    ],
  },
  {
    alias: 'core.breadcrumb',
    name: 'Breadcrumb',
    kind: 'component',
    description: 'Breadcrumb navigation trail',
    props: [
      { name: 'items', type: 'string[]', label: '面包屑项' },
      { name: 'separator', type: 'string', label: '分隔符' },
    ],
  },
  {
    alias: 'core.pagination',
    name: 'Pagination',
    kind: 'component',
    description: 'Page navigation control',
    props: [
      { name: 'current', type: 'number', label: '当前页' },
      { name: 'total', type: 'number', label: '总条数' },
      { name: 'pageSize', type: 'number', label: '每页条数' },
    ],
  },
  // Data display
  {
    alias: 'core.avatar',
    name: 'Avatar',
    kind: 'component',
    description: 'User avatar with image or text fallback',
    props: [
      { name: 'src', type: 'string', label: '头像地址' },
      { name: 'text', type: 'string', label: '文字头像' },
      { name: 'size', type: 'string', enum: ['small', 'medium', 'large'], label: '尺寸' },
      { name: 'shape', type: 'string', enum: ['circle', 'square'], label: '形状' },
    ],
  },
  {
    alias: 'core.badge',
    name: 'Badge',
    kind: 'component',
    description: 'Notification badge with count or dot',
    props: [
      { name: 'count', type: 'number', label: '数量' },
      { name: 'dot', type: 'boolean', label: '小红点' },
      { name: 'max', type: 'number', label: '封顶数值' },
      { name: 'text', type: 'string', label: '文本' },
      { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'error'], label: '色调' },
      { name: 'placement', type: 'string', enum: ['inline', 'corner'], label: '位置' },
    ],
  },
  {
    alias: 'core.list',
    name: 'List',
    kind: 'layout',
    description: 'List container for list items',
    props: [
      { name: 'bordered', type: 'boolean', label: '显示边框' },
      { name: 'split', type: 'boolean', label: '显示分隔线' },
    ],
  },
  {
    alias: 'core.list-item',
    name: 'ListItem',
    kind: 'layout',
    description: 'Individual list item with title and optional details',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'description', type: 'string', label: '描述' },
      { name: 'note', type: 'string', label: '备注' },
      { name: 'arrow', type: 'boolean', label: '箭头' },
      { name: 'thumb', type: 'string', label: '缩略图' },
    ],
  },
  {
    alias: 'core.statistic',
    name: 'Statistic',
    kind: 'component',
    description: 'Numerical statistic display with label',
    props: [
      { name: 'title', type: 'string', label: '指标名称' },
      { name: 'value', type: 'string', label: '数值' },
      { name: 'suffix', type: 'string', label: '后缀' },
      { name: 'prefix', type: 'string', label: '前缀' },
      { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'error'], label: '色调' },
      { name: 'trend', type: 'string', enum: ['up', 'down', 'neutral'], label: '趋势' },
    ],
  },
  {
    alias: 'core.collapse',
    name: 'Collapse',
    kind: 'layout',
    description: 'Collapsible accordion panel',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'expanded', type: 'boolean', label: '展开状态' },
    ],
  },
  {
    alias: 'core.carousel',
    name: 'Carousel',
    kind: 'component',
    description: 'Image carousel / swiper',
    props: [
      { name: 'images', type: 'string[]', label: '图片列表' },
      { name: 'autoplay', type: 'boolean', label: '自动播放' },
      { name: 'interval', type: 'number', label: '切换间隔' },
    ],
  },
  {
    alias: 'core.empty',
    name: 'Empty',
    kind: 'component',
    description: 'Empty state placeholder with optional action',
    props: [
      { name: 'text', type: 'string', label: '空状态文案' },
      { name: 'image', type: 'string', label: '插图' },
      { name: 'actionLabel', type: 'string', label: '操作按钮文案' },
    ],
  },
  {
    alias: 'core.skeleton',
    name: 'Skeleton',
    kind: 'component',
    description: 'Loading skeleton placeholder',
    props: [
      { name: 'rows', type: 'number', label: '行数' },
      { name: 'animated', type: 'boolean', label: '动画' },
    ],
  },
  // Data input
  {
    alias: 'core.select',
    name: 'Select',
    kind: 'component',
    description: 'Dropdown select input',
    props: [
      { name: 'label', type: 'string', label: '字段标签' },
      { name: 'placeholder', type: 'string', label: '占位提示' },
      { name: 'options', type: 'string[]', label: '选项' },
      { name: 'value', type: 'string', label: '选中值' },
      { name: 'multiple', type: 'boolean', label: '多选' },
    ],
  },
  {
    alias: 'core.checkbox',
    name: 'Checkbox',
    kind: 'component',
    description: 'Checkbox input',
    props: [
      { name: 'label', type: 'string', label: '选项文案' },
      { name: 'checked', type: 'boolean', label: '选中' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
    ],
  },
  {
    alias: 'core.radio',
    name: 'Radio',
    kind: 'component',
    description: 'Radio button input',
    props: [
      { name: 'label', type: 'string', label: '选项文案' },
      { name: 'checked', type: 'boolean', label: '选中' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
      { name: 'group', type: 'string', label: '分组名' },
    ],
  },
  {
    alias: 'core.switch',
    name: 'Switch',
    kind: 'component',
    description: 'Toggle switch',
    props: [
      { name: 'checked', type: 'boolean', label: '开启' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
      { name: 'label', type: 'string', label: '标签文案' },
    ],
  },
  {
    alias: 'core.rate',
    name: 'Rate',
    kind: 'component',
    description: 'Star rating input',
    props: [
      { name: 'value', type: 'number', label: '评分值' },
      { name: 'count', type: 'number', label: '星数' },
      { name: 'size', type: 'string', label: '尺寸' },
      { name: 'disabled', type: 'boolean', label: '禁用' },
    ],
  },
  {
    alias: 'core.slider',
    name: 'Slider',
    kind: 'component',
    description: 'Range slider input',
    props: [
      { name: 'value', type: 'number', label: '当前值' },
      { name: 'startValue', type: 'number', label: '起始值' },
      { name: 'endValue', type: 'number', label: '结束值' },
      { name: 'min', type: 'number', label: '最小值' },
      { name: 'max', type: 'number', label: '最大值' },
      { name: 'step', type: 'number', label: '步长' },
      { name: 'range', type: 'boolean', label: '区间选择' },
    ],
  },
  {
    alias: 'core.datepicker',
    name: 'DatePicker',
    kind: 'component',
    description: 'Date picker input',
    props: [
      { name: 'value', type: 'string', label: '日期值' },
      { name: 'format', type: 'string', label: '日期格式' },
      { name: 'placeholder', type: 'string', label: '占位提示' },
    ],
  },
  {
    alias: 'core.timepicker',
    name: 'TimePicker',
    kind: 'component',
    description: 'Time picker input',
    props: [
      { name: 'value', type: 'string', label: '时间值' },
      { name: 'format', type: 'string', label: '时间格式' },
      { name: 'placeholder', type: 'string', label: '占位提示' },
    ],
  },
  {
    alias: 'core.form',
    name: 'Form',
    kind: 'layout',
    description: 'Form container for input fields',
    props: [
      { name: 'labelWidth', type: 'string', label: '标签宽度' },
      { name: 'labelAlign', type: 'string', enum: ['left', 'right', 'top'], label: '标签对齐' },
    ],
  },
  {
    alias: 'core.upload',
    name: 'Upload',
    kind: 'component',
    description: 'File upload control',
    props: [
      { name: 'accept', type: 'string', label: '接受类型' },
      { name: 'multiple', type: 'boolean', label: '多文件' },
      { name: 'maxCount', type: 'number', label: '最大数量' },
      { name: 'actionLabel', type: 'string', label: '上传按钮文案' },
    ],
  },
  // Feedback
  {
    alias: 'core.dialog',
    name: 'Dialog',
    kind: 'layout',
    description: 'Modal dialog overlay',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'visible', type: 'boolean', label: '显示' },
      { name: 'confirmText', type: 'string', label: '确认文案' },
      { name: 'cancelText', type: 'string', label: '取消文案' },
    ],
  },
  {
    alias: 'core.toast',
    name: 'Toast',
    kind: 'component',
    description: 'Toast notification message',
    props: [
      { name: 'message', type: 'string', label: '提示消息' },
      { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'], label: '类型' },
      { name: 'duration', type: 'number', label: '持续时长' },
    ],
  },
  {
    alias: 'core.alert',
    name: 'Alert',
    kind: 'component',
    description: 'Inline alert banner',
    props: [
      { name: 'text', type: 'string', label: '提示文本' },
      { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'], label: '类型' },
      { name: 'closable', type: 'boolean', label: '可关闭' },
    ],
  },
  {
    alias: 'core.loading',
    name: 'Loading',
    kind: 'component',
    description: 'Loading indicator',
    props: [
      { name: 'size', type: 'string', enum: ['small', 'medium', 'large'], label: '尺寸' },
      { name: 'text', type: 'string', label: '提示文本' },
      { name: 'type', type: 'string', enum: ['spinner', 'skeleton'], label: '样式' },
    ],
  },
  {
    alias: 'core.drawer',
    name: 'Drawer',
    kind: 'layout',
    description: 'Slide-out drawer panel',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'visible', type: 'boolean', label: '显示' },
      { name: 'placement', type: 'string', enum: ['left', 'right', 'top', 'bottom'], label: '弹出方向' },
    ],
  },
  // Media
  {
    alias: 'core.video',
    name: 'Video',
    kind: 'component',
    description: 'Video player',
    props: [
      { name: 'src', type: 'string', label: '视频地址' },
      { name: 'poster', type: 'string', label: '封面图' },
      { name: 'autoplay', type: 'boolean', label: '自动播放' },
      { name: 'controls', type: 'boolean', label: '播放控件' },
    ],
  },
  {
    alias: 'core.audio',
    name: 'Audio',
    kind: 'component',
    description: 'Audio player',
    props: [
      { name: 'src', type: 'string', label: '音频地址' },
      { name: 'autoplay', type: 'boolean', label: '自动播放' },
      { name: 'controls', type: 'boolean', label: '播放控件' },
    ],
  },
  // Layout & Navigation
  {
    alias: 'core.sidebar',
    name: 'Sidebar',
    kind: 'layout',
    description: 'Side navigation panel',
    props: [
      { name: 'collapsed', type: 'boolean', label: '折叠状态' },
      { name: 'width', type: 'string', label: '宽度' },
    ],
  },
  {
    alias: 'core.toolbar',
    name: 'Toolbar',
    kind: 'layout',
    description: 'Action toolbar bar',
    props: [
      { name: 'title', type: 'string', label: '标题' },
      { name: 'fixed', type: 'boolean', label: '固定' },
    ],
  },
  {
    alias: 'core.splitter',
    name: 'Splitter',
    kind: 'layout',
    description: 'Resizable split pane container',
    props: [
      { name: 'direction', type: 'string', enum: ['horizontal', 'vertical'], label: '分割方向' },
      { name: 'min', type: 'string', label: '最小尺寸' },
      { name: 'max', type: 'string', label: '最大尺寸' },
    ],
  },
  // Professional
  {
    alias: 'core.timeline',
    name: 'Timeline',
    kind: 'layout',
    description: 'Timeline display for sequential events',
    props: [
      { name: 'direction', type: 'string', enum: ['vertical', 'horizontal'], label: '排列方向' },
    ],
  },
  {
    alias: 'core.tooltip',
    name: 'Tooltip',
    kind: 'component',
    description: 'Tooltip text hint on hover',
    props: [
      { name: 'text', type: 'string', label: '提示文本' },
      { name: 'placement', type: 'string', enum: ['top', 'bottom', 'left', 'right'], label: '弹出位置' },
    ],
  },
  {
    alias: 'core.tree',
    name: 'Tree',
    kind: 'layout',
    description: 'Hierarchical tree view',
    props: [
      { name: 'data', type: 'object', label: '树数据' },
      { name: 'expandAll', type: 'boolean', label: '全部展开' },
    ],
  },
  {
    alias: 'core.table',
    name: 'Table',
    kind: 'component',
    description: 'Data table with columns and rows',
    props: [
      { name: 'columns', type: 'array', label: '列定义' },
      { name: 'data', type: 'array', label: '表格数据' },
      { name: 'bordered', type: 'boolean', label: '显示边框' },
      { name: 'stripe', type: 'boolean', label: '斑马纹' },
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
