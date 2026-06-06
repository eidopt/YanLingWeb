export const AI_SEMANTIC_TARGET_ROLE_VALUES = [
  'page_footer_nav',
  'page_header',
  'page_title',
  'primary_cta',
  'search_box',
  'main_content',
  'section_header',
  'selected_node',
] as const;

export type AiSemanticTargetRole = (typeof AI_SEMANTIC_TARGET_ROLE_VALUES)[number];

export interface AiSemanticTargetConfig {
  role: AiSemanticTargetRole;
  label: string;
  keywords: string[];
  description: string;
}

export const AI_SEMANTIC_TARGETS: AiSemanticTargetConfig[] = [
  {
    role: 'page_footer_nav',
    label: '页面底栏 / 底部导航',
    keywords: [
      '页面底栏',
      '底栏',
      '底部栏',
      '底部导航',
      '底部标签栏',
      '底部 tab',
      '底部tab',
      '页脚导航',
      'footer',
      'footer tabs',
      'bottom tabs',
      'bottom nav',
      'tabbar',
      'tab bar',
    ],
    description: '页面底部的 tabs/tabbar/navigation/footer 组件。',
  },
  {
    role: 'page_header',
    label: '页面顶部栏 / 标题栏',
    keywords: [
      '页面顶部',
      '顶部栏',
      '顶栏',
      '标题栏',
      '导航栏',
      '页面头部',
      '头部',
      'header',
      'top bar',
      'navbar',
      'navigation bar',
    ],
    description: '页面顶部状态栏、标题栏或根 screen 的头部属性。',
  },
  {
    role: 'page_title',
    label: '页面标题',
    keywords: ['页面标题', '标题', '主标题', '大标题', 'title', 'page title', 'screen title'],
    description: '当前页面的 screen.title 或最主要标题节点。',
  },
  {
    role: 'primary_cta',
    label: '主按钮 / CTA',
    keywords: [
      '主按钮',
      '主要按钮',
      '行动按钮',
      'cta',
      'primary cta',
      'primary button',
      '立即按钮',
      '预约按钮',
      '提交按钮',
    ],
    description: '页面中最主要的按钮或行动入口。',
  },
  {
    role: 'search_box',
    label: '搜索框',
    keywords: ['搜索框', '搜索栏', '搜索', '搜索入口', 'search', 'search box', 'search bar'],
    description: '页面中的搜索输入或搜索栏组件。',
  },
  {
    role: 'main_content',
    label: '主内容区',
    keywords: [
      '主内容',
      '内容区',
      '主体内容',
      '页面主体',
      '中间内容',
      'main content',
      'body',
      'content area',
    ],
    description: '页面主体区域，通常是根 screen 或主要 body 容器。',
  },
  {
    role: 'section_header',
    label: '区块标题',
    keywords: ['区块标题', '模块标题', '分区标题', '栏目标题', 'section header', 'section title'],
    description: '列表、卡片区或内容分区的标题组件。',
  },
  {
    role: 'selected_node',
    label: '当前选中组件',
    keywords: [
      '当前组件',
      '选中组件',
      '当前选中',
      '这个组件',
      '这个',
      '这里',
      'selected',
      'selected node',
      'current node',
    ],
    description: '编辑器里当前选中的节点。',
  },
];
