/**
 * Generate TemplateProfile config files for all template JSON files.
 * Output: templates_json/configs/<templateId>.generated.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────

interface ThemeLayoutNode {
  id: string;
  alias: string;
  slot?: string;
  layout?: { mode?: string; order?: number; width?: string };
  props?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
  children?: ThemeLayoutNode[];
}

interface ThemeLayoutDocument {
  version: number;
  themeId: string;
  themeName: string;
  description: string;
  pages: { id: string; name: string; layout: ThemeLayoutNode }[];
  defaultPageId: string;
  cssVars?: Record<string, string>;
}

function isThemeLayoutDocument(value: unknown): value is ThemeLayoutDocument {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'themeId' in value &&
    'pages' in value &&
    Array.isArray((value as { pages?: unknown }).pages),
  );
}

interface ProfilePage {
  pageKey: string;
  pageId: string;
  pageKind: string;
  name: string;
  description: string;
  rootNodeId: string;
  isDefault: boolean;
}

interface ProfileRegion {
  regionKey: string;
  pageKey: string;
  nodeId: string;
  name: string;
  sectionKind: string;
  replaceable: boolean;
  allowedPatternKeys?: string[];
}

interface ProfileSlot {
  slotKey: string;
  pageKey: string;
  regionKey?: string;
  nodeId: string;
  component: string;
  editableProps: string[];
  label?: string;
}

interface ProfilePattern {
  patternKey: string;
  pageKey: string;
  regionKey?: string;
  sourceRootNodeId: string;
  parentNodeId?: string;
  itemAlias?: string;
  fields: { fieldKey: string; slotKey: string; prop: string; required?: boolean }[];
  maxItems?: number;
  minItems?: number;
}

interface ProfileNavigation {
  type: 'bottom_tabs' | 'top_tabs' | 'side_nav' | 'none';
  items: { label: string; targetPageId: string; icon?: string }[];
}

interface TemplateProfile {
  templateId: string;
  templateVersion: string;
  profileVersion: string;
  devices: string[];
  pages: ProfilePage[];
  regions: ProfileRegion[];
  slots: ProfileSlot[];
  patterns: ProfilePattern[];
  navigation: ProfileNavigation;
  constraints: Record<string, unknown>;
  styleProfile: {
    colors: string[];
    fontSizes: string[];
    fontWeights: string[];
    spacing: string[];
    radius: string[];
    shadows: string[];
    commonLayoutPatterns: string[];
  };
}

// ─── Editable Props by Alias ──────────────────────────────────────

const EDITABLE_PROPS: Record<string, string[]> = {
  'core.screen': ['title', 'statusTime', 'headerActionLabel', 'surface', 'chrome'],
  'core.text': ['text', 'variant'],
  'core.button': ['label', 'variant', 'active', 'disabled', 'icon'],
  'core.image': ['src', 'alt', 'title', 'objectFit'],
  'core.tag': ['label', 'tone'],
  'core.notice': ['text', 'tone'],
  'core.input': ['placeholder', 'label', 'type', 'value', 'disabled'],
  'core.search': ['placeholder', 'value'],
  'core.tabs': ['tabs', 'activeTab'],
  'core.progress': ['value', 'max', 'tone'],
  'core.panel': ['tone', 'gap', 'title'],
  'core.stack': ['gap', 'alignItems'],
  'core.row': ['gap', 'wrap', 'justify', 'align', 'tone'],
  'core.grid': ['gap', 'columns'],
  'core.spacer': ['size'],
  'core.html': ['tag', 'style'],
  'core.widget': ['library', 'renderer', 'data'],
  'core.navbar': ['title', 'subtitle', 'leftArrow', 'fixed', 'transparent'],
  'core.tabbar': ['items', 'active', 'icons'],
  'core.breadcrumb': ['items', 'separator'],
  'core.pagination': ['current', 'total', 'pageSize'],
  'core.avatar': ['src', 'text', 'size', 'shape'],
  'core.badge': ['count', 'dot', 'max', 'text', 'tone'],
  'core.list': ['bordered', 'split'],
  'core.list-item': ['title', 'description', 'note', 'arrow', 'thumb'],
  'core.statistic': ['title', 'value', 'suffix', 'prefix', 'tone', 'trend'],
  'core.collapse': ['title', 'expanded'],
  'core.carousel': ['images', 'autoplay', 'interval'],
  'core.empty': ['text', 'image', 'actionLabel'],
  'core.skeleton': ['rows', 'animated'],
  'core.select': ['label', 'placeholder', 'options', 'value', 'multiple'],
  'core.checkbox': ['label', 'checked', 'disabled'],
  'core.radio': ['label', 'checked', 'disabled', 'group'],
  'core.switch': ['checked', 'disabled', 'label'],
  'core.rate': ['value', 'count', 'size', 'disabled'],
  'core.slider': ['value', 'min', 'max', 'step', 'range'],
  'core.datepicker': ['value', 'format', 'placeholder'],
  'core.timepicker': ['value', 'format', 'placeholder'],
  'core.form': ['labelWidth', 'labelAlign'],
  'core.upload': ['accept', 'multiple', 'maxCount', 'actionLabel'],
  'core.dialog': ['title', 'visible', 'confirmText', 'cancelText'],
  'core.toast': ['message', 'type', 'duration'],
  'core.alert': ['text', 'type', 'closable'],
  'core.loading': ['size', 'text', 'type'],
  'core.drawer': ['title', 'visible', 'placement'],
  'core.video': ['src', 'poster', 'autoplay', 'controls'],
  'core.audio': ['src', 'autoplay', 'controls'],
  'core.sidebar': ['collapsed', 'width'],
  'core.toolbar': ['title', 'fixed'],
  'core.splitter': ['direction', 'min', 'max'],
  'core.timeline': ['direction'],
  'core.tooltip': ['text', 'placement'],
  'core.tree': ['data', 'expandAll'],
  'core.table': ['columns', 'data', 'bordered', 'stripe'],
};

const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
  'core.navbar',
  'core.list',
  'core.list-item',
  'core.dialog',
  'core.drawer',
  'core.collapse',
  'core.sidebar',
  'core.form',
  'core.toolbar',
  'core.splitter',
  'core.timeline',
  'core.tree',
]);

const COMPONENT_LABELS: Record<string, string> = {
  'core.screen': '页面',
  'core.text': '文本',
  'core.button': '按钮',
  'core.image': '图片',
  'core.tag': '标签',
  'core.notice': '通知',
  'core.input': '输入框',
  'core.search': '搜索',
  'core.tabs': '标签栏',
  'core.progress': '进度条',
  'core.panel': '面板',
  'core.stack': '堆叠',
  'core.row': '行',
  'core.grid': '网格',
  'core.spacer': '间距',
  'core.divider': '分隔线',
  'core.avatar': '头像',
  'core.badge': '徽标',
  'core.statistic': '统计',
  'core.select': '下拉选择',
  'core.checkbox': '复选框',
  'core.radio': '单选框',
  'core.switch': '开关',
  'core.rate': '评分',
  'core.slider': '滑块',
  'core.carousel': '轮播',
  'core.empty': '空状态',
  'core.skeleton': '骨架屏',
  'core.loading': '加载',
  'core.alert': '警告',
  'core.toast': '提示',
  'core.dialog': '对话框',
  'core.drawer': '抽屉',
  'core.upload': '上传',
  'core.breadcrumb': '面包屑',
  'core.pagination': '分页',
  'core.tabbar': '底部栏',
  'core.list': '列表',
  'core.list-item': '列表项',
  'core.collapse': '折叠面板',
  'core.form': '表单',
  'core.sidebar': '侧边栏',
  'core.toolbar': '工具栏',
  'core.splitter': '分割面板',
  'core.timeline': '时间线',
  'core.tooltip': '提示',
  'core.tree': '树',
  'core.table': '表格',
  'core.video': '视频',
  'core.audio': '音频',
  'core.widget': '组件',
};

// ─── Page Kind Detection ──────────────────────────────────────────

function detectPageKind(pageId: string, pageName: string): string {
  const lower = (pageId + ' ' + pageName).toLowerCase();
  if (lower.includes('home') || lower.includes('首页') || lower.includes('主页')) {
    return 'home';
  }
  if (lower.includes('detail') || lower.includes('详情')) {
    return 'detail';
  }
  if (lower.includes('profile') || lower.includes('我的') || lower.includes('个人')) {
    return 'profile';
  }
  if (lower.includes('cart') || lower.includes('购物车')) {
    return 'cart';
  }
  if (lower.includes('order') || lower.includes('订单')) {
    return 'order';
  }
  if (lower.includes('search') || lower.includes('搜索')) {
    return 'search';
  }
  if (lower.includes('list') || lower.includes('分类') || lower.includes('列表')) {
    return 'list';
  }
  if (lower.includes('setting') || lower.includes('设置')) {
    return 'settings';
  }
  if (lower.includes('message') || lower.includes('消息')) {
    return 'message';
  }
  if (lower.includes('login') || lower.includes('登录')) {
    return 'auth';
  }
  return 'content';
}

// ─── Config Generator ─────────────────────────────────────────────

function generateConfig(doc: ThemeLayoutDocument): TemplateProfile {
  const templateId = doc.themeId;
  const pages: ProfilePage[] = [];
  const regions: ProfileRegion[] = [];
  const slots: ProfileSlot[] = [];
  const patterns: ProfilePattern[] = [];
  const navItems: { label: string; targetPageId: string }[] = [];

  // Detect platform from cssVars or first page
  const devices = detectDevices(doc);

  // Process each page
  for (const page of doc.pages) {
    const pageKey = `page-${page.id}`;
    const pageKind = detectPageKind(page.id, page.name);

    pages.push({
      pageKey,
      pageId: page.id,
      pageKind,
      name: page.name,
      description: page.name,
      rootNodeId: page.layout.id,
      isDefault: page.id === doc.defaultPageId,
    });

    // Walk the node tree
    walkNode(page.layout, pageKey, page.layout.id, regions, slots, patterns);

    // Collect navigation items from footer tabs
    const footerTabs = findFooterTabs(page.layout);
    if (footerTabs?.interactions?.onTabClick) {
      const tabClick = footerTabs.interactions.onTabClick;
      const tabs = Array.isArray(footerTabs.props?.tabs) ? (footerTabs.props.tabs as string[]) : [];
      for (const tab of tabs) {
        const action =
          typeof tabClick === 'object' ? (tabClick as Record<string, { targetPageId?: string }>)[tab] : undefined;
        if (action?.targetPageId) {
          navItems.push({ label: tab, targetPageId: action.targetPageId });
        }
      }
    }
  }

  // Deduplicate nav items
  const seenNavTargets = new Set<string>();
  const uniqueNav = navItems.filter((item) => {
    if (seenNavTargets.has(item.targetPageId)) {
      return false;
    }
    seenNavTargets.add(item.targetPageId);
    return true;
  });

  // Extract style from cssVars
  const cssVars = doc.cssVars ?? {};
  const styleProfile = {
    colors: Object.values(cssVars).filter((v) => v.startsWith('#')),
    fontSizes: ['12', '14', '16', '18', '20', '24', '28', '32'],
    fontWeights: ['400', '500', '600', '700'],
    spacing: ['4', '8', '12', '16', '20', '24', '32'],
    radius: ['4', '8', '12', '16', '999'],
    shadows: ['0 2 8 rgba(0,0,0,0.08)', '0 4 16 rgba(0,0,0,0.12)'],
    commonLayoutPatterns: ['flow-vertical', 'flow-horizontal', 'grid-2col', 'grid-3col'],
  };

  return {
    templateId,
    templateVersion: '1.0.0',
    profileVersion: '1.0.0',
    devices,
    pages,
    regions,
    slots,
    patterns,
    navigation: uniqueNav.length > 0 ? { type: 'bottom_tabs', items: uniqueNav } : { type: 'none', items: [] },
    constraints: { maxWidth: '100%' },
    styleProfile,
  };
}

function detectDevices(doc: ThemeLayoutDocument): string[] {
  const devices = new Set<string>();
  for (const page of doc.pages) {
    const surface = page.layout.props?.surface as string | undefined;
    if (surface === 'mini-program') {
      devices.add('miniapp');
    } else if (surface === 'mobile-app') {
      devices.add('mobile');
    } else if (surface === 'web') {
      devices.add('desktop');
    }
  }
  if (devices.size === 0) {
    devices.add('miniapp');
    devices.add('mobile');
  }
  return [...devices];
}

function walkNode(
  node: ThemeLayoutNode,
  pageKey: string,
  parentRegionKey: string,
  regions: ProfileRegion[],
  slots: ProfileSlot[],
  patterns: ProfilePattern[],
): void {
  const isContainer = CONTAINER_ALIASES.has(node.alias);
  const editableProps = EDITABLE_PROPS[node.alias] ?? [];

  // Create region for container nodes (except screen root)
  if (isContainer && node.alias !== 'core.screen') {
    const regionKey = `${pageKey}.${node.id}`;
    regions.push({
      regionKey,
      pageKey,
      nodeId: node.id,
      name: node.alias,
      sectionKind: node.alias.replace('core.', ''),
      replaceable: true,
    });

    // Create slots for editable props
    if (editableProps.length > 0) {
      slots.push({
        slotKey: `${regionKey}.props`,
        pageKey,
        regionKey,
        nodeId: node.id,
        component: node.alias,
        editableProps,
        label: COMPONENT_LABELS[node.alias] ?? node.alias,
      });
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        walkNode(child, pageKey, regionKey, regions, slots, patterns);
      }
    }

    // Detect grid/list patterns
    if (node.alias === 'core.grid' && node.children && node.children.length > 1) {
      patterns.push({
        patternKey: `${regionKey}.item`,
        pageKey,
        regionKey,
        sourceRootNodeId: node.children[0].id,
        parentNodeId: node.id,
        itemAlias: node.children[0].alias,
        fields: [],
        minItems: 1,
        maxItems: 20,
      });
    }
  } else if (!isContainer) {
    // Leaf node: create slot directly under parent region
    if (editableProps.length > 0) {
      slots.push({
        slotKey: `${pageKey}.${node.id}`,
        pageKey,
        regionKey: parentRegionKey,
        nodeId: node.id,
        component: node.alias,
        editableProps,
        label: COMPONENT_LABELS[node.alias] ?? node.alias,
      });
    }
  } else {
    // Container but no region (e.g. core.screen) - just recurse
    if (node.children) {
      for (const child of node.children) {
        walkNode(child, pageKey, parentRegionKey, regions, slots, patterns);
      }
    }
  }
}

function findFooterTabs(node: ThemeLayoutNode): ThemeLayoutNode | null {
  if (node.slot === 'footer' && node.alias === 'core.tabs') {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findFooterTabs(child);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────

function main() {
  const templateDir = join(process.cwd(), 'templates_json');
  const configDir = join(templateDir, 'configs');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const jsonFiles = readdirSync(templateDir)
    .filter((f) => f.endsWith('.json') && !f.includes('.generated.') && !f.includes('.override.'))
    .sort();

  console.warn(`Generating configs for ${jsonFiles.length} templates...`);

  let generated = 0;
  let errors = 0;

  for (const file of jsonFiles) {
    try {
      const filePath = join(templateDir, file);
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

      if (!isThemeLayoutDocument(parsed) || !parsed.themeId || !parsed.pages.length) {
        console.warn(`  SKIP ${file}: missing themeId or pages`);
        continue;
      }

      const doc = parsed;
      const config = generateConfig(doc);
      const configPath = join(configDir, `${doc.themeId}.generated.json`);
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      generated++;
    } catch (err) {
      console.error(`  ERROR ${file}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.warn(`\nDone! Generated ${generated} configs (${errors} errors) in ${configDir}`);
}

main();
