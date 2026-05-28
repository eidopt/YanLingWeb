/**
 * Template Generator V2 - Diverse, Non-homogeneous Templates
 *
 * Each template has unique content, layout patterns, page structures,
 * and design approaches. NOT just color swaps.
 *
 * Usage: npx tsx scripts/generate-templates-v2.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────

interface ThemeLayoutNode {
  id: string;
  alias: string;
  slot?: 'body' | 'footer';
  layout: { mode: 'flow' | 'grid'; order?: number; width?: string; height?: string };
  props?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
  children?: ThemeLayoutNode[];
}

interface ThemeLayoutDocument {
  version: number;
  themeId: string;
  themeName: string;
  pageName: string;
  description: string;
  components: Record<string, unknown>[];
  defaultPageId: string;
  pages: { id: string; name: string; layout: ThemeLayoutNode }[];
  layout: ThemeLayoutNode;
  cssVars: Record<string, string>;
}

export interface TemplatePattern {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  functionalCategory: string;
  tags: string[];
  traits: string[];
  accent: string;
  platform: 'mini-program' | 'mobile-app' | 'web';
  chrome: 'wechat' | 'app' | 'none';
  pages: { name: string; title: string }[];
  cssVars: Record<string, string>;
  content: {
    products?: { name: string; price: string; desc: string; tag: string }[];
    services?: { name: string; price: string; desc: string; duration?: string }[];
    items?: { name: string; desc: string; meta?: string }[];
    categories?: string[];
    features?: { title: string; desc: string }[];
    testimonials?: { name: string; text: string; rating: number }[];
    notices?: string[];
  };
}

// ─── Component Catalog ────────────────────────────────────────────

const COMPONENTS = [
  { alias: 'core.screen', name: 'Screen', kind: 'layout', description: 'Page root', props: [{ name: 'title', type: 'string' }, { name: 'surface', type: 'string', enum: ['mini-program', 'mobile-app', 'web'] }, { name: 'chrome', type: 'string', enum: ['wechat', 'app', 'none'] }] },
  { alias: 'core.panel', name: 'Panel', kind: 'layout', description: 'Card', props: [{ name: 'tone', type: 'string', enum: ['default', 'accent', 'promo', 'warm', 'soft', 'member', 'highlight'] }, { name: 'gap', type: 'string' }, { name: 'title', type: 'string' }] },
  { alias: 'core.stack', name: 'Stack', kind: 'layout', description: 'Vertical', props: [{ name: 'gap', type: 'string' }, { name: 'alignItems', type: 'string' }] },
  { alias: 'core.row', name: 'Row', kind: 'layout', description: 'Horizontal', props: [{ name: 'gap', type: 'string' }, { name: 'wrap', type: 'boolean' }, { name: 'justify', type: 'string' }, { name: 'align', type: 'string' }] },
  { alias: 'core.grid', name: 'Grid', kind: 'layout', description: 'Grid', props: [{ name: 'gap', type: 'string' }, { name: 'columns', type: 'number' }] },
  { alias: 'core.text', name: 'Text', kind: 'component', description: 'Text', props: [{ name: 'text', type: 'string' }, { name: 'variant', type: 'string', enum: ['display', 'heading', 'subheading', 'body', 'caption', 'price', 'title', 'subtitle'] }] },
  { alias: 'core.button', name: 'Button', kind: 'component', description: 'Button', props: [{ name: 'label', type: 'string' }, { name: 'variant', type: 'string', enum: ['primary', 'secondary', 'link', 'pill'] }] },
  { alias: 'core.image', name: 'Image', kind: 'component', description: 'Image', props: [{ name: 'src', type: 'string' }, { name: 'alt', type: 'string' }, { name: 'objectFit', type: 'string', enum: ['cover', 'contain', 'fill'] }] },
  { alias: 'core.search', name: 'Search', kind: 'component', description: 'Search', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.tabs', name: 'Tabs', kind: 'component', description: 'Tabs', props: [{ name: 'tabs', type: 'string[]' }, { name: 'activeTab', type: 'string' }] },
  { alias: 'core.tag', name: 'Tag', kind: 'component', description: 'Tag', props: [{ name: 'label', type: 'string' }, { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'hot', 'new', 'deal', 'member'] }] },
  { alias: 'core.notice', name: 'Notice', kind: 'component', description: 'Notice', props: [{ name: 'text', type: 'string' }, { name: 'tone', type: 'string', enum: ['info', 'warning', 'error', 'success', 'neutral'] }] },
  { alias: 'core.divider', name: 'Divider', kind: 'component', description: 'Divider', props: [] },
  { alias: 'core.spacer', name: 'Spacer', kind: 'component', description: 'Spacer', props: [{ name: 'size', type: 'string' }] },
  { alias: 'core.avatar', name: 'Avatar', kind: 'component', description: 'Avatar', props: [{ name: 'text', type: 'string' }, { name: 'size', type: 'string', enum: ['small', 'medium', 'large'] }, { name: 'shape', type: 'string', enum: ['circle', 'square'] }] },
  { alias: 'core.badge', name: 'Badge', kind: 'component', description: 'Badge', props: [{ name: 'count', type: 'number' }, { name: 'dot', type: 'boolean' }] },
  { alias: 'core.progress', name: 'Progress', kind: 'component', description: 'Progress', props: [{ name: 'value', type: 'number' }, { name: 'max', type: 'number' }, { name: 'tone', type: 'string', enum: ['neutral', 'accent', 'success', 'warning', 'info'] }] },
  { alias: 'core.statistic', name: 'Statistic', kind: 'component', description: 'Statistic', props: [{ name: 'title', type: 'string' }, { name: 'value', type: 'string' }, { name: 'trend', type: 'string', enum: ['up', 'down', 'neutral'] }] },
  { alias: 'core.input', name: 'Input', kind: 'component', description: 'Input', props: [{ name: 'placeholder', type: 'string' }, { name: 'label', type: 'string' }] },
  { alias: 'core.select', name: 'Select', kind: 'component', description: 'Select', props: [{ name: 'label', type: 'string' }, { name: 'placeholder', type: 'string' }, { name: 'options', type: 'string[]' }] },
  { alias: 'core.list', name: 'List', kind: 'layout', description: 'List', props: [{ name: 'bordered', type: 'boolean' }] },
  { alias: 'core.list-item', name: 'ListItem', kind: 'layout', description: 'ListItem', props: [{ name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'arrow', type: 'boolean' }] },
  { alias: 'core.carousel', name: 'Carousel', kind: 'component', description: 'Carousel', props: [{ name: 'images', type: 'string[]' }, { name: 'autoplay', type: 'boolean' }] },
  { alias: 'core.empty', name: 'Empty', kind: 'component', description: 'Empty', props: [{ name: 'text', type: 'string' }, { name: 'actionLabel', type: 'string' }] },
  { alias: 'core.navbar', name: 'NavBar', kind: 'layout', description: 'NavBar', props: [{ name: 'title', type: 'string' }, { name: 'leftArrow', type: 'boolean' }] },
  { alias: 'core.tabbar', name: 'TabBar', kind: 'component', description: 'TabBar', props: [{ name: 'items', type: 'string[]' }, { name: 'active', type: 'string' }] },
  { alias: 'core.form', name: 'Form', kind: 'layout', description: 'Form', props: [{ name: 'labelWidth', type: 'string' }, { name: 'labelAlign', type: 'string', enum: ['left', 'right', 'top'] }] },
  { alias: 'core.collapse', name: 'Collapse', kind: 'layout', description: 'Collapse', props: [{ name: 'title', type: 'string' }, { name: 'expanded', type: 'boolean' }] },
  { alias: 'core.rate', name: 'Rate', kind: 'component', description: 'Rate', props: [{ name: 'value', type: 'number' }, { name: 'count', type: 'number' }] },
  { alias: 'core.dialog', name: 'Dialog', kind: 'layout', description: 'Dialog', props: [{ name: 'title', type: 'string' }, { name: 'visible', type: 'boolean' }] },
  { alias: 'core.toast', name: 'Toast', kind: 'component', description: 'Toast', props: [{ name: 'message', type: 'string' }, { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] }] },
  { alias: 'core.alert', name: 'Alert', kind: 'component', description: 'Alert', props: [{ name: 'text', type: 'string' }, { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] }] },
  { alias: 'core.loading', name: 'Loading', kind: 'component', description: 'Loading', props: [{ name: 'text', type: 'string' }, { name: 'type', type: 'string', enum: ['spinner', 'skeleton'] }] },
  { alias: 'core.skeleton', name: 'Skeleton', kind: 'component', description: 'Skeleton', props: [{ name: 'rows', type: 'number' }, { name: 'animated', type: 'boolean' }] },
  { alias: 'core.breadcrumb', name: 'Breadcrumb', kind: 'component', description: 'Breadcrumb', props: [{ name: 'items', type: 'string[]' }, { name: 'separator', type: 'string' }] },
  { alias: 'core.pagination', name: 'Pagination', kind: 'component', description: 'Pagination', props: [{ name: 'current', type: 'number' }, { name: 'total', type: 'number' }] },
  { alias: 'core.checkbox', name: 'Checkbox', kind: 'component', description: 'Checkbox', props: [{ name: 'label', type: 'string' }, { name: 'checked', type: 'boolean' }] },
  { alias: 'core.radio', name: 'Radio', kind: 'component', description: 'Radio', props: [{ name: 'label', type: 'string' }, { name: 'checked', type: 'boolean' }, { name: 'group', type: 'string' }] },
  { alias: 'core.switch', name: 'Switch', kind: 'component', description: 'Switch', props: [{ name: 'checked', type: 'boolean' }, { name: 'label', type: 'string' }] },
  { alias: 'core.slider', name: 'Slider', kind: 'component', description: 'Slider', props: [{ name: 'value', type: 'number' }, { name: 'min', type: 'number' }, { name: 'max', type: 'number' }] },
  { alias: 'core.datepicker', name: 'DatePicker', kind: 'component', description: 'DatePicker', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.timepicker', name: 'TimePicker', kind: 'component', description: 'TimePicker', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.upload', name: 'Upload', kind: 'component', description: 'Upload', props: [{ name: 'actionLabel', type: 'string' }, { name: 'multiple', type: 'boolean' }] },
  { alias: 'core.video', name: 'Video', kind: 'component', description: 'Video', props: [{ name: 'src', type: 'string' }, { name: 'poster', type: 'string' }] },
  { alias: 'core.audio', name: 'Audio', kind: 'component', description: 'Audio', props: [{ name: 'src', type: 'string' }] },
  { alias: 'core.sidebar', name: 'Sidebar', kind: 'layout', description: 'Sidebar', props: [{ name: 'collapsed', type: 'boolean' }, { name: 'width', type: 'string' }] },
  { alias: 'core.toolbar', name: 'Toolbar', kind: 'layout', description: 'Toolbar', props: [{ name: 'title', type: 'string' }] },
  { alias: 'core.splitter', name: 'Splitter', kind: 'layout', description: 'Splitter', props: [{ name: 'direction', type: 'string', enum: ['horizontal', 'vertical'] }] },
  { alias: 'core.timeline', name: 'Timeline', kind: 'layout', description: 'Timeline', props: [{ name: 'direction', type: 'string', enum: ['vertical', 'horizontal'] }] },
  { alias: 'core.tooltip', name: 'Tooltip', kind: 'component', description: 'Tooltip', props: [{ name: 'text', type: 'string' }, { name: 'placement', type: 'string', enum: ['top', 'bottom', 'left', 'right'] }] },
  { alias: 'core.tree', name: 'Tree', kind: 'layout', description: 'Tree', props: [{ name: 'expandAll', type: 'boolean' }] },
  { alias: 'core.table', name: 'Table', kind: 'component', description: 'Table', props: [{ name: 'columns', type: 'object' }, { name: 'data', type: 'object' }, { name: 'bordered', type: 'boolean' }, { name: 'stripe', type: 'boolean' }] },
  { alias: 'core.widget', name: 'Widget', kind: 'component', description: 'Widget', props: [{ name: 'library', type: 'string' }, { name: 'renderer', type: 'string', enum: ['echarts', 'chartjs', 'lottie', 'mermaid'] }, { name: 'data', type: 'object' }] },
];

// ─── Node Builders ────────────────────────────────────────────────

let nodeCounter = 0;

function nid(prefix: string): string {
  return `${prefix}-${++nodeCounter}`;
}

function textNode(text: string, variant: string, order: number): ThemeLayoutNode {
  return { id: nid('txt'), alias: 'core.text', layout: { mode: 'flow', order, width: '100%' }, props: { text, variant } };
}

function buttonNode(label: string, variant: string, order: number): ThemeLayoutNode {
  return { id: nid('btn'), alias: 'core.button', layout: { mode: 'flow', order }, props: { label, variant } };
}

function panelNode(title: string, children: ThemeLayoutNode[], order: number, tone = 'default'): ThemeLayoutNode {
  return { id: nid('pnl'), alias: 'core.panel', layout: { mode: 'flow', order, width: '100%' }, props: { tone, gap: '12', title }, children };
}

function rowNode(children: ThemeLayoutNode[], order: number, justify = 'space-between'): ThemeLayoutNode {
  return { id: nid('row'), alias: 'core.row', layout: { mode: 'flow', order, width: '100%' }, props: { justify, align: 'center', gap: '12' }, children };
}

function gridNode(columns: number, children: ThemeLayoutNode[], order: number): ThemeLayoutNode {
  return { id: nid('grd'), alias: 'core.grid', layout: { mode: 'flow', order, width: '100%' }, props: { columns, gap: '16' }, children };
}

function searchNode(placeholder: string, order: number): ThemeLayoutNode {
  return { id: nid('sch'), alias: 'core.search', layout: { mode: 'flow', order, width: '100%' }, props: { placeholder } };
}

function noticeNode(text: string, tone: string, order: number): ThemeLayoutNode {
  return { id: nid('ntc'), alias: 'core.notice', layout: { mode: 'flow', order, width: '100%' }, props: { text, tone } };
}

function tagNode(label: string, tone: string, order: number): ThemeLayoutNode {
  return { id: nid('tag'), alias: 'core.tag', layout: { mode: 'flow', order }, props: { label, tone } };
}

function imageNode(order: number, height = '300'): ThemeLayoutNode {
  return { id: nid('img'), alias: 'core.image', layout: { mode: 'flow', order, width: '100%', height }, props: { alt: '图片', objectFit: 'cover' } };
}

function tabsNode(tabs: string[], activeTab: string, order: number): ThemeLayoutNode {
  return { id: nid('tab'), alias: 'core.tabs', layout: { mode: 'flow', order, width: '100%' }, props: { tabs, activeTab } };
}

function statNode(title: string, value: string, order: number, trend: 'up' | 'down' | 'neutral' = 'neutral'): ThemeLayoutNode {
  return { id: nid('sta'), alias: 'core.statistic', layout: { mode: 'flow', order }, props: { title, value, trend } };
}

function footerTabs(tabs: string[], activeTab: string, interactions: Record<string, unknown>): ThemeLayoutNode {
  return { id: nid('ftr'), alias: 'core.tabs', slot: 'footer', layout: { mode: 'flow', order: 999, width: '100%' }, props: { tabs, activeTab }, interactions: { onTabClick: interactions } };
}

// ─── Template Generator ───────────────────────────────────────────

function generateTemplate(pattern: TemplatePattern): ThemeLayoutDocument {
  nodeCounter = 0;
  const pageNames = pattern.pages.map((p) => p.name);
  const tabInteractions: Record<string, unknown> = {};
  pageNames.forEach((name, i) => {
    tabInteractions[name] = { type: 'navigate', targetPageId: i === 0 ? 'home' : `page-${i}` };
  });

  const pages = pattern.pages.map((page, i) => {
    let children: ThemeLayoutNode[];

    if (i === 0) {
      // Home page - use pattern content
      children = buildHomePage(pattern, pageNames, tabInteractions);
    } else if (i === pattern.pages.length - 1 && page.name.includes('我')) {
      // Profile page
      children = buildProfilePage(pattern, pageNames, page.name, tabInteractions);
    } else {
      // List/detail pages
      children = buildListPage(pattern, page.title, pageNames, page.name, tabInteractions);
    }

    return {
      id: i === 0 ? 'home' : `page-${i}`,
      name: page.name,
      layout: {
        id: `screen-${i}`,
        alias: 'core.screen',
        layout: { mode: 'flow' as const, width: '100%' },
        props: { title: page.title, surface: pattern.platform, chrome: pattern.chrome },
        children,
      },
    };
  });

  return {
    version: 1,
    themeId: pattern.id,
    themeName: pattern.name,
    pageName: pattern.pages[0].name,
    description: pattern.description,
    components: COMPONENTS,
    defaultPageId: 'home',
    pages,
    layout: pages[0].layout,
    cssVars: pattern.cssVars,
  };
}

function buildHomePage(pattern: TemplatePattern, pageNames: string[], tabInteractions: Record<string, unknown>): ThemeLayoutNode[] {
  const children: ThemeLayoutNode[] = [];
  let order = 1;

  // Search
  children.push(searchNode(`搜索${pattern.name}...`, order++));

  // Notice
  const notice = pattern.content.notices?.[0] ?? pattern.tagline;
  children.push(noticeNode(notice, 'info', order++));

  // Banner
  children.push(imageNode(order++, '320'));

  // Categories
  if (pattern.content.categories?.length) {
    const catNodes = pattern.content.categories.slice(0, 8).map((cat, j) =>
      textNode(cat, 'caption', j + 1),
    );
    children.push(gridNode(Math.min(catNodes.length, 4), catNodes, order++));
  }

  // Features
  if (pattern.content.features?.length) {
    const featureNodes = pattern.content.features.map((f, j) =>
      panelNode(f.title, [textNode(f.desc, 'body', 1)], j + 1, 'soft'),
    );
    children.push(gridNode(2, featureNodes, order++));
  }

  // Products/Services/Items
  const items = pattern.content.products ?? pattern.content.services ?? pattern.content.items ?? [];
  if (items.length > 0) {
    children.push(textNode(pattern.pages[0].title + '推荐', 'heading', order++));
    for (const item of items.slice(0, 4)) {
      const itemChildren: ThemeLayoutNode[] = [
        textNode(item.name, 'title', 1),
        textNode('desc' in item ? (item as { desc: string }).desc : '', 'body', 2),
      ];
      if ('price' in item) {
        itemChildren.push(textNode((item as { price: string }).price, 'price', 3));
      }
      if ('tag' in item) {
        itemChildren.push(rowNode([tagNode((item as { tag: string }).tag, 'deal', 1)], 4));
      }
      children.push(panelNode('', itemChildren, order++));
    }
  }

  // Footer tabs
  children.push(footerTabs(pageNames, pattern.pages[0].name, tabInteractions));

  return children;
}

function buildListPage(
  pattern: TemplatePattern,
  title: string,
  pageNames: string[],
  activeTab: string,
  tabInteractions: Record<string, unknown>,
): ThemeLayoutNode[] {
  const children: ThemeLayoutNode[] = [];
  let order = 1;

  children.push(searchNode('搜索', order++));
  children.push(tabsNode(['全部', '热门', '最新'], '全部', order++));

  const items = pattern.content.products ?? pattern.content.services ?? pattern.content.items ?? [];
  for (const item of items.slice(0, 4)) {
    const itemChildren: ThemeLayoutNode[] = [
      rowNode([
        textNode(item.name, 'title', 1),
        tagNode(pattern.tags[0] ?? '推荐', 'info', 2),
      ], 1),
      textNode('desc' in item ? (item as { desc: string }).desc : '', 'caption', 2),
    ];
    if ('price' in item) {
      itemChildren.push(rowNode([
        textNode((item as { price: string }).price, 'price', 1),
        buttonNode('了解详情', 'secondary', 2),
      ], 3));
    }
    children.push(panelNode('', itemChildren, order++));
  }

  children.push(footerTabs(pageNames, activeTab, tabInteractions));

  return children;
}

function buildProfilePage(
  pattern: TemplatePattern,
  pageNames: string[],
  activeTab: string,
  tabInteractions: Record<string, unknown>,
): ThemeLayoutNode[] {
  return [
    panelNode('个人中心', [
      rowNode([
        textNode('用户昵称', 'title', 1),
        tagNode('VIP', 'member', 2),
      ], 1),
      textNode(pattern.tagline, 'caption', 2),
    ], 1, 'accent'),
    panelNode('我的服务', [
      textNode('我的订单', 'body', 1),
      textNode('我的收藏', 'body', 2),
      textNode('消息通知', 'body', 3),
      textNode('设置', 'body', 4),
    ], 2),
    footerTabs(pageNames, activeTab, tabInteractions),
  ];
}

// ─── Variant Generator ────────────────────────────────────────────

const STYLE_VARIANTS = [
  { suffix: '暗色', bg: '#1A1A2E', card: '#16213E' },
  { suffix: '清新', bg: '#F0F8FF', card: '#FFFFFF' },
  { suffix: '商务', bg: '#F5F5F5', card: '#FFFFFF' },
  { suffix: '活力', bg: '#FFF8F0', card: '#FFFFFF' },
  { suffix: '简约', bg: '#FAFAFA', card: '#FFFFFF' },
];

const PLATFORM_VARIANTS = [
  { platform: 'web' as const, chrome: 'none' as const, suffix: '网页版' },
  { platform: 'mobile-app' as const, chrome: 'app' as const, suffix: 'App版' },
];

const INCLUDE_STYLE_VARIANTS = process.env.INCLUDE_STYLE_VARIANTS === 'true';

function generateVariants(base: TemplatePattern): TemplatePattern[] {
  const variants = [base];

  // Platform variants
  for (const pv of PLATFORM_VARIANTS) {
    if (pv.platform === base.platform) continue;
    variants.push({
      ...base,
      id: `${base.id}-${pv.platform}`,
      name: `${base.name}${pv.suffix}`,
      platform: pv.platform,
      chrome: pv.chrome,
    });
  }

  // Color-only clones make the template library feel repetitive. Keep them
  // available for palette QA, but do not generate them by default.
  if (INCLUDE_STYLE_VARIANTS) {
    for (const sv of STYLE_VARIANTS) {
      variants.push({
        ...base,
        id: `${base.id}-${sv.suffix}`,
        name: `${base.name}${sv.suffix}`,
        cssVars: { ...base.cssVars, '--color-bg': sv.bg, '--color-card': sv.card },
      });
    }
  }

  return variants;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  // Import template data from category files
  const commerce = await import('./templates-commerce.js').then((m) => m.COMMERCE_TEMPLATES).catch(() => []);
  const service = await import('./templates-service.js').then((m) => m.SERVICE_TEMPLATES).catch(() => []);
  const remaining = await import('./templates-remaining.js').catch(() => ({
    CONTENT_TEMPLATES: [], EDUCATION_TEMPLATES: [], HEALTH_TEMPLATES: [],
    SOCIAL_TEMPLATES: [], FINANCE_TEMPLATES: [], MARKETING_TEMPLATES: [],
    UTILITY_TEMPLATES: [], DASHBOARD_TEMPLATES: [],
  }));

  const allBase: TemplatePattern[] = [
    ...commerce,
    ...service,
    ...remaining.CONTENT_TEMPLATES,
    ...remaining.EDUCATION_TEMPLATES,
    ...remaining.HEALTH_TEMPLATES,
    ...remaining.SOCIAL_TEMPLATES,
    ...remaining.FINANCE_TEMPLATES,
    ...remaining.MARKETING_TEMPLATES,
    ...remaining.UTILITY_TEMPLATES,
    ...remaining.DASHBOARD_TEMPLATES,
  ];

  const allTemplates: TemplatePattern[] = [];
  for (const base of allBase) {
    allTemplates.push(...generateVariants(base));
  }

  const outputDir = join(process.cwd(), 'templates_json');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating ${allTemplates.length} diverse templates from ${allBase.length} base patterns...`);

  for (const pattern of allTemplates) {
    const template = generateTemplate(pattern);
    const filePath = join(outputDir, `${pattern.id}.json`);
    writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf8');
  }

  // Count by category
  const counts: Record<string, number> = {};
  for (const t of allTemplates) {
    counts[t.category] = (counts[t.category] ?? 0) + 1;
  }

  console.log(`\nDone! Generated ${allTemplates.length} templates:`);
  for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch(console.error);
