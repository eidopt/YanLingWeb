import {
  inferUiDesignSkillContext,
  type UiRenderSurface,
  type UiTargetPlatform,
} from '@shared/agent/skills/uiDesignSkillRegistry';

export type UiIntentCategory =
  | 'marketing_site'
  | 'web_app'
  | 'mobile_app'
  | 'mini_program'
  | 'commerce'
  | 'service_booking'
  | 'presentation'
  | 'dashboard'
  | 'editor_workflow'
  | 'unknown';

export type UiCapabilityId =
  | 'responsive_layout'
  | 'multi_page_navigation'
  | 'single_page_sections'
  | 'template_gallery'
  | 'manual_editing'
  | 'ai_assisted_generation'
  | 'publish_web'
  | 'publish_mini_program'
  | 'commerce_catalog'
  | 'service_booking_flow'
  | 'dashboard_metrics'
  | 'form_collection'
  | 'presentation_deck'
  | 'drag_drop_interaction'
  | 'chart_visualization'
  | 'rich_animation'
  | 'custom_widget_code'
  | 'backend_data';

export type UiCapabilitySupportLevel =
  | 'native'
  | 'composed'
  | 'fallback'
  | 'unsupported';

export type UiGenerationStrategy =
  | 'standard_layout_document'
  | 'compose_existing_components'
  | 'requires_dynamic_module'
  | 'clarify_before_generation';

export interface UiIntentCategoryDefinition {
  id: UiIntentCategory;
  label: string;
  keywords: string[];
}

export interface UiCapabilityDefinition {
  id: UiCapabilityId;
  label: string;
  description: string;
  supportLevel: UiCapabilitySupportLevel;
  rendererPath: string;
  keywords: string[];
  generationHint: string;
  gapHint?: string;
}

export interface UiCapabilityMatch {
  id: UiCapabilityId;
  label: string;
  supportLevel: UiCapabilitySupportLevel;
  matchedKeywords: string[];
  rendererPath: string;
  generationHint: string;
  gapHint?: string;
}

export interface UiIntentPlan {
  primaryCategory: UiIntentCategory;
  matchedCategories: UiIntentCategory[];
  confidence: number;
  generationStrategy: UiGenerationStrategy;
  targetPlatforms: UiTargetPlatform[];
  renderSurface: UiRenderSurface;
  selectedSkillIds: string[];
  supportedCapabilities: UiCapabilityMatch[];
  missingCapabilities: UiCapabilityMatch[];
  promptHints: string[];
}

const CATEGORY_DEFINITIONS: UiIntentCategoryDefinition[] = [
  {
    id: 'marketing_site',
    label: 'Marketing site',
    keywords: [
      '官网',
      'landing',
      '首页',
      '品牌站',
      '公司网站',
      '产品介绍',
      '宣传页',
      'website',
      'site',
    ],
  },
  {
    id: 'web_app',
    label: 'Web app',
    keywords: [
      'web app',
      '网页应用',
      '后台',
      '控制台',
      '管理系统',
      'saas',
      'portal',
    ],
  },
  {
    id: 'mobile_app',
    label: 'Mobile app',
    keywords: ['app', '移动端', '手机端', '应用', 'ios', 'android'],
  },
  {
    id: 'mini_program',
    label: 'Mini program',
    keywords: ['小程序', '微信小程序', 'weixin', 'wechat'],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    keywords: ['电商', '商城', '商品', '购物', '订单', '支付', '门店', '外卖'],
  },
  {
    id: 'service_booking',
    label: 'Service booking',
    keywords: ['预约', '预订', '排班', '服务', '咨询', '到店', '报名'],
  },
  {
    id: 'presentation',
    label: 'Presentation',
    keywords: ['ppt', '演示', '幻灯片', '翻页', 'slide', 'presentation', 'deck'],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    keywords: ['数据看板', 'dashboard', '报表', '指标', '统计', '图表', 'analytics'],
  },
  {
    id: 'editor_workflow',
    label: 'Editor workflow',
    keywords: ['编辑器', '拖拽', '手动编辑', '保存', '排版', '自由创建'],
  },
];

const CAPABILITY_DEFINITIONS: UiCapabilityDefinition[] = [
  {
    id: 'responsive_layout',
    label: 'Responsive layout',
    description: 'Fluid layouts using core screen, stack, row, grid, and panel nodes.',
    supportLevel: 'native',
    rendererPath: 'layoutDocument.layout + core.screen/core.stack/core.row/core.grid',
    keywords: ['响应式', '自适应', '手机', '桌面', 'web', '网页', '网站', 'app'],
    generationHint: 'Use flow/grid/absolute layout modes with width constraints.',
  },
  {
    id: 'multi_page_navigation',
    label: 'Multi-page navigation',
    description: 'Multiple pages with navigate interactions.',
    supportLevel: 'native',
    rendererPath: 'layoutDocument.pages + interactions.onClick.navigate',
    keywords: ['多页', '多个页面', '跳转', '导航', 'tab', 'tabs', '页面'],
    generationHint: 'Create pages and wire navigation through interactions.',
  },
  {
    id: 'single_page_sections',
    label: 'Single-page sections',
    description: 'A single long page with content sections.',
    supportLevel: 'native',
    rendererPath: 'layoutDocument.layout.children',
    keywords: ['单页', '首页', '落地页', 'one page', 'single page', 'section'],
    generationHint: 'Use one core.screen and section-like panels or stacks.',
  },
  {
    id: 'template_gallery',
    label: 'Template gallery',
    description: 'Browsable template or example cards.',
    supportLevel: 'composed',
    rendererPath: 'core.grid + core.panel + core.tag + core.image',
    keywords: ['模板', '模板广场', '案例', 'gallery', '广场'],
    generationHint: 'Compose a gallery from grid and panel cards.',
  },
  {
    id: 'manual_editing',
    label: 'Manual editing',
    description: 'Editor-facing controls or editing workflow concepts.',
    supportLevel: 'composed',
    rendererPath: 'core.panel + core.button + editor edit instruction tools',
    keywords: ['手动编辑', '拖动', '拖拽编辑', '保存', '排版', '编辑'],
    generationHint:
      'Represent editing affordances visually; real editor actions are handled separately.',
  },
  {
    id: 'ai_assisted_generation',
    label: 'AI-assisted generation',
    description: 'AI prompt, generation, and refinement workflow.',
    supportLevel: 'composed',
    rendererPath: 'core.input/core.search + core.button + core.notice',
    keywords: ['ai', '人工智能', '生成', '一句话', '输入需求', '对话'],
    generationHint: 'Use input/search, notices, and buttons to model the AI flow.',
  },
  {
    id: 'publish_web',
    label: 'Publish website',
    description: 'Website publication flow.',
    supportLevel: 'composed',
    rendererPath: 'core.panel + core.button + core.tag',
    keywords: ['发布网页', '上线网站', '网站发布', '部署', '域名'],
    generationHint: 'Show publication state with tags, buttons, and checklist panels.',
  },
  {
    id: 'publish_mini_program',
    label: 'Publish mini program',
    description: 'WeChat mini program submission or publication flow.',
    supportLevel: 'composed',
    rendererPath: 'core.panel + core.button + core.tag',
    keywords: ['发布小程序', '微信小程序', '小程序发布', '提交审核'],
    generationHint: 'Show mini program submission state with checklist panels.',
  },
  {
    id: 'commerce_catalog',
    label: 'Commerce catalog',
    description: 'Product cards, price labels, and promotions.',
    supportLevel: 'composed',
    rendererPath: 'core.grid + core.panel + core.text.price + core.tag',
    keywords: ['商品', '价格', '购物车', '电商', '商城', '订单', '优惠'],
    generationHint: 'Use product-card component templates and price text variants.',
  },
  {
    id: 'service_booking_flow',
    label: 'Service booking flow',
    description: 'Booking cards and appointment CTAs.',
    supportLevel: 'composed',
    rendererPath: 'core.panel + core.input + core.button + interactions.navigate',
    keywords: ['预约', '预订', '报名', '排期', '排班', '到店'],
    generationHint: 'Represent booking steps with panels, inputs, and CTA buttons.',
  },
  {
    id: 'dashboard_metrics',
    label: 'Dashboard metrics',
    description: 'Metric cards, summary numbers, and simple status indicators.',
    supportLevel: 'composed',
    rendererPath: 'core.grid + core.panel + core.text + core.tag',
    keywords: ['指标', '统计', '数据看板', 'dashboard', 'kpi', '报表'],
    generationHint: 'Use metric-card component templates and summary grids.',
  },
  {
    id: 'form_collection',
    label: 'Form collection',
    description: 'Static form fields and submission CTA.',
    supportLevel: 'composed',
    rendererPath: 'core.input + core.button + core.panel',
    keywords: ['表单', '收集', '提交', '输入框', '问卷', '注册'],
    generationHint: 'Use input nodes and a submit CTA; do not imply real backend persistence.',
  },
  {
    id: 'presentation_deck',
    label: 'Presentation deck',
    description: 'Slide-like content and pagination.',
    supportLevel: 'composed',
    rendererPath: 'pages/tabs approximation; core.widget only for supported esm.sh adapters',
    keywords: ['ppt', '幻灯片', '演示文稿', '翻页', 'slide', 'deck', 'presentation'],
    generationHint: 'Prefer pages or tabs. Do not use custom widget scripts for presentation behavior.',
    gapHint: 'Full keyboard navigation and presenter mode may require additional widget code.',
  },
  {
    id: 'drag_drop_interaction',
    label: 'Drag and drop interaction',
    description: 'End-user drag-and-drop inside the generated UI.',
    supportLevel: 'composed',
    rendererPath: 'static reorder UI; no custom widget scripts',
    keywords: ['拖拽', '拖动', 'drag', 'drop', '拖放'],
    generationHint: 'Represent reorderable content visually; do not generate custom drag-and-drop scripts.',
    gapHint: 'Complex multi-container drag requires additional widget wiring.',
  },
  {
    id: 'chart_visualization',
    label: 'Chart visualization',
    description: 'Interactive charts — ECharts, D3, etc.',
    supportLevel: 'composed',
    rendererPath: 'core.widget + approved esm.sh chart libraries when an interactive chart is needed',
    keywords: ['图表', '折线图', '柱状图', '饼图', 'chart', 'echarts', 'd3', '图形'],
    generationHint:
      'Use core.widget with approved esm.sh chart dependencies for real charts; otherwise use static panels.',
    gapHint: 'Complex real-time data or streaming charts may need additional setup.',
  },
  {
    id: 'rich_animation',
    label: 'Rich animation',
    description: 'Motion-heavy interactions and animated product experiences.',
    supportLevel: 'composed',
    rendererPath: 'cssAnimations; no custom widget scripts',
    keywords: ['动画', '动效', '过渡', 'motion', 'animation', '互动效果', 'framer'],
    generationHint: 'Use cssAnimations for simple transitions; do not generate custom animation scripts.',
    gapHint: 'Physics-based or 3D-heavy animations require a sandboxed widget path.',
  },
  {
    id: 'custom_widget_code',
    label: 'Custom widget code',
    description: 'Custom runtime widgets behind an explicit safety gate.',
    supportLevel: 'unsupported',
    rendererPath: 'unsupported; safe widgets require built-in esm.sh adapters',
    keywords: ['自定义组件', '任意组件', '代码组件', 'three.js', 'canvas', '游戏'],
    generationHint: 'Do not generate arbitrary widget code. Use only supported esm.sh widget adapters.',
    gapHint: 'Needs a sandboxed execution model before it should be treated as generally supported.',
  },
  {
    id: 'backend_data',
    label: 'Backend data',
    description: 'Persistence, authentication, realtime data, or external APIs.',
    supportLevel: 'unsupported',
    rendererPath: 'outside layoutDocument',
    keywords: ['登录', '数据库', '接口', '后端', '实时', '上传', '支付', '权限'],
    generationHint: 'Represent the UI state only; do not promise working backend behavior.',
    gapHint: 'Needs product/backend capability outside the UI layout document.',
  },
];

const DEFAULT_CAPABILITY_IDS: UiCapabilityId[] = [
  'responsive_layout',
  'single_page_sections',
  'ai_assisted_generation',
];

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function findMatchedKeywords(prompt: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => prompt.includes(keyword.toLowerCase()));
}

function getCapabilityDefinition(id: UiCapabilityId): UiCapabilityDefinition {
  const definition = CAPABILITY_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown UI capability: ${id}`);
  }
  return definition;
}

function toCapabilityMatch(
  definition: UiCapabilityDefinition,
  matchedKeywords: string[],
): UiCapabilityMatch {
  return {
    id: definition.id,
    label: definition.label,
    supportLevel: definition.supportLevel,
    matchedKeywords,
    rendererPath: definition.rendererPath,
    generationHint: definition.generationHint,
    gapHint: definition.gapHint,
  };
}

function resolveCategoryMatches(prompt: string): {
  matches: UiIntentCategory[];
  confidence: number;
} {
  const scored = CATEGORY_DEFINITIONS
    .map((definition) => ({
      definition,
      matchedKeywords: findMatchedKeywords(prompt, definition.keywords),
    }))
    .filter((item) => item.matchedKeywords.length > 0)
    .sort((a, b) => b.matchedKeywords.length - a.matchedKeywords.length);

  if (!scored.length) {
    return { matches: ['unknown'], confidence: 0.2 };
  }

  const highestScore = scored[0].matchedKeywords.length;
  const matches = scored.map((item) => item.definition.id);
  const confidence = Math.min(0.95, 0.45 + highestScore * 0.15 + matches.length * 0.05);

  return { matches, confidence };
}

function resolveCapabilityMatches(prompt: string): UiCapabilityMatch[] {
  const matches = CAPABILITY_DEFINITIONS
    .map((definition) => ({
      definition,
      matchedKeywords: findMatchedKeywords(prompt, definition.keywords),
    }))
    .filter((item) => item.matchedKeywords.length > 0)
    .map((item) => toCapabilityMatch(item.definition, item.matchedKeywords));

  const existingIds = new Set(matches.map((match) => match.id));
  const defaults = DEFAULT_CAPABILITY_IDS
    .filter((id) => !existingIds.has(id))
    .map((id) => toCapabilityMatch(getCapabilityDefinition(id), []));

  return [...matches, ...defaults];
}

function isSupported(match: UiCapabilityMatch): boolean {
  return match.supportLevel === 'native' || match.supportLevel === 'composed';
}

function chooseGenerationStrategy(
  categoryMatches: UiIntentCategory[],
  supportedCapabilities: UiCapabilityMatch[],
  missingCapabilities: UiCapabilityMatch[],
): UiGenerationStrategy {
  if (
    categoryMatches.length === 1
    && categoryMatches[0] === 'unknown'
    && supportedCapabilities.length <= DEFAULT_CAPABILITY_IDS.length
  ) {
    return 'clarify_before_generation';
  }

  if (missingCapabilities.some((match) => match.supportLevel === 'unsupported')) {
    return 'requires_dynamic_module';
  }

  if (missingCapabilities.length > 0) {
    return 'compose_existing_components';
  }

  return 'standard_layout_document';
}

function buildPromptHints(
  planSeed: Pick<
    UiIntentPlan,
    | 'primaryCategory'
    | 'generationStrategy'
    | 'targetPlatforms'
    | 'supportedCapabilities'
    | 'missingCapabilities'
  >,
): string[] {
  const hints = [
    `Primary UI category: ${planSeed.primaryCategory}.`,
    'Generate only aliases that are either core.* or declared in componentTemplates.',
    'Keep the output editable by preserving clear node ids, layout metadata, '
      + 'and reusable templates.',
  ];

  hints.push(`Target platforms: ${planSeed.targetPlatforms.join(', ')}.`);

  planSeed.supportedCapabilities.forEach((capability) => {
    hints.push(`Supported: ${capability.label}. ${capability.generationHint}`);
  });

  planSeed.missingCapabilities.forEach((capability) => {
    hints.push(
      `Gap: ${capability.label}. ${capability.gapHint ?? capability.generationHint}`,
    );
  });

  if (planSeed.generationStrategy === 'compose_existing_components') {
    hints.push(
      'Use the closest static or page-based approximation and make limitations '
        + 'clear in the final explanation.',
    );
  }

  if (planSeed.generationStrategy === 'requires_dynamic_module') {
    hints.push(
      'Do not fabricate runtime behavior. Generate the best editable UI shell '
        + 'and explain which dynamic module would be needed.',
    );
  }

  if (planSeed.generationStrategy === 'clarify_before_generation') {
    hints.push(
      'The request is broad. Still create a practical starter template, '
        + 'but avoid over-specific unsupported behavior.',
    );
  }

  return hints;
}

export function planUiIntent(prompt: string): UiIntentPlan {
  const normalizedPrompt = normalizePrompt(prompt);
  const { matches, confidence } = resolveCategoryMatches(normalizedPrompt);
  const skillContext = inferUiDesignSkillContext(normalizedPrompt, matches);
  const capabilities = resolveCapabilityMatches(normalizedPrompt);
  const supportedCapabilities = capabilities.filter(isSupported);
  const missingCapabilities = capabilities.filter((match) => !isSupported(match));
  const generationStrategy = chooseGenerationStrategy(
    matches,
    supportedCapabilities,
    missingCapabilities,
  );
  const planSeed = {
    primaryCategory: matches[0],
    generationStrategy,
    targetPlatforms: skillContext.targetPlatforms,
    supportedCapabilities,
    missingCapabilities,
  };

  return {
    ...planSeed,
    matchedCategories: matches,
    confidence,
    targetPlatforms: planSeed.targetPlatforms,
    renderSurface: skillContext.renderSurface,
    selectedSkillIds: skillContext.selectedSkillIds,
    promptHints: buildPromptHints(planSeed),
  };
}

export function formatUiIntentPlanForPrompt(plan: UiIntentPlan): string {
  const supported = plan.supportedCapabilities
    .map((capability) => `${capability.id}:${capability.supportLevel}`)
    .join(', ');
  const missing = plan.missingCapabilities
    .map((capability) => `${capability.id}:${capability.supportLevel}`)
    .join(', ') || 'none';

  return [
    'UI intent plan:',
    `- primaryCategory: ${plan.primaryCategory}`,
    `- matchedCategories: ${plan.matchedCategories.join(', ')}`,
    `- confidence: ${plan.confidence.toFixed(2)}`,
    `- generationStrategy: ${plan.generationStrategy}`,
    `- targetPlatforms: ${plan.targetPlatforms.join(', ')}`,
    `- renderSurface: ${plan.renderSurface}`,
    `- selectedSkillIds: ${plan.selectedSkillIds.join(', ') || 'none'}`,
    `- supportedCapabilities: ${supported}`,
    `- missingCapabilities: ${missing}`,
    '- generationHints:',
    ...plan.promptHints.map((hint) => `  - ${hint}`),
  ].join('\n');
}

export {
  CAPABILITY_DEFINITIONS as UI_CAPABILITY_DEFINITIONS,
  CATEGORY_DEFINITIONS as UI_INTENT_CATEGORY_DEFINITIONS,
};
