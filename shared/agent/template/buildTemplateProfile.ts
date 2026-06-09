import { buildTemplateStyleProfile } from '../../theme-layout/styleProfile';
import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import {
  CONTAINER_ALIASES,
  EDITABLE_PROPS_BY_ALIAS,
  type SemanticThemeLayoutNode,
  type TemplateDevice,
  type TemplatePageKind,
  type TemplateProfile,
  type TemplateProfileBuildOptions,
  type TemplateProfileNavigation,
  type TemplateProfilePattern,
  type TemplateProfileRegion,
  type TemplateProfileSlot,
} from './templateProfile';
import { sanitizeSemanticInput } from './templateSecurity';

function slug(value: string, fallback = 'item'): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safe = normalized || fallback;
  return /^[a-z]/.test(safe) ? safe : `k-${safe}`;
}

function inferPageKind(pageName: string, pageId: string, layout?: ThemeLayoutNode): TemplatePageKind {
  // 1. Explicit meta.pageKind annotation (highest priority)
  const metaKind = layout?.meta?.pageKind;
  if (metaKind) {
    return metaKind;
  }

  // 2. Name/id regex matching (existing logic)
  const text = `${pageName} ${pageId}`.toLowerCase();
  if (/home|首页|main/.test(text)) {
    return 'home';
  }
  if (/order|订单|待收货|配送/.test(text)) {
    return 'order';
  }
  if (/profile|user|account|我的|个人|会员/.test(text)) {
    return 'profile';
  }
  if (/product|商品|goods/.test(text)) {
    return 'product';
  }
  if (/category|分类/.test(text)) {
    return 'category';
  }
  if (/form|表单/.test(text)) {
    return 'form';
  }
  if (/detail|详情/.test(text)) {
    return 'detail';
  }
  if (/dashboard|工作台|后台/.test(text)) {
    return 'dashboard';
  }
  if (/list|列表/.test(text)) {
    return 'list';
  }

  // 3. Structural signal matching (fallback for generic names like "页面1")
  if (layout) {
    const structural = inferPageKindFromStructure(layout);
    if (structural) {
      return structural;
    }
  }

  return 'unknown';
}

function inferPageKindFromStructure(layout: ThemeLayoutNode): TemplatePageKind | null {
  const signals = {
    form: 0,
    input: 0,
    search: 0,
    avatar: 0,
    statistic: 0,
    image: 0,
    price: 0,
    buyButton: 0,
    submitButton: 0,
    orderTag: 0,
    memberText: 0,
  };

  walkNodes(layout, (node) => {
    const alias = node.alias;
    const props = node.props ?? {};

    if (alias === 'core.form') {
      signals.form += 1;
    }
    if (alias === 'core.input') {
      signals.input += 1;
    }
    if (alias === 'core.search') {
      signals.search += 1;
    }
    if (alias === 'core.avatar') {
      signals.avatar += 1;
    }
    if (alias === 'core.statistic') {
      signals.statistic += 1;
    }
    if (alias === 'core.image') {
      signals.image += 1;
    }

    // Price patterns
    if (alias === 'core.text' && typeof props.text === 'string') {
      if (/[¥$€]\s*\d/.test(props.text)) {
        signals.price += 1;
      }
    }

    // Buy/submit buttons
    if (alias === 'core.button' && typeof props.label === 'string') {
      if (/购买|加购|下单|立即抢|加入购物/.test(props.label)) {
        signals.buyButton += 1;
      }
      if (/提交|保存|确认|注册|登录/.test(props.label)) {
        signals.submitButton += 1;
      }
    }

    // Order/status tags
    if (alias === 'core.tag' && typeof props.label === 'string') {
      if (/待付款|待发货|待收货|已完成|已取消/.test(props.label)) {
        signals.orderTag += 1;
      }
    }

    // Member/profile patterns
    if (alias === 'core.text' && typeof props.text === 'string') {
      if (/会员|积分|余额|等级|优惠券/.test(props.text)) {
        signals.memberText += 1;
      }
    }
  });

  // Score each pageKind
  const scores: Record<string, number> = {
    product: Math.min(1, signals.price * 0.35 + signals.buyButton * 0.35 + Math.min(1, signals.image / 2) * 0.15),
    form: Math.min(1, signals.form * 0.4 + Math.min(1, signals.input / 2) * 0.3 + signals.submitButton * 0.3),
    profile: Math.min(1, signals.avatar * 0.4 + signals.memberText * 0.3),
    order: Math.min(1, signals.orderTag * 0.5 + Math.min(1, signals.image / 3) * 0.2),
    dashboard: Math.min(1, signals.statistic * 0.5),
    category: Math.min(1, signals.search * 0.3 + Math.min(1, signals.image / 3) * 0.3),
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 0.6 ? best[0] : null;
}

function inferDevice(document: ThemeLayoutDocument): TemplateDevice[] {
  const text = `${document.themeName} ${document.description}`.toLowerCase();
  if (/miniapp|小程序/.test(text)) {
    return ['miniapp', 'mobile'];
  }
  if (/tablet|pad|平板/.test(text)) {
    return ['tablet'];
  }
  if (/desktop|dashboard|后台|管理/.test(text)) {
    return ['desktop'];
  }
  return ['mobile'];
}

function walkNodes(
  node: ThemeLayoutNode,
  visitor: (node: SemanticThemeLayoutNode, parent?: SemanticThemeLayoutNode) => void,
  parent?: SemanticThemeLayoutNode,
): void {
  const semanticNode = node as SemanticThemeLayoutNode;
  visitor(semanticNode, parent);
  semanticNode.children?.forEach((child) => walkNodes(child, visitor, semanticNode));
}

function nodeContains(root: ThemeLayoutNode, nodeId: string): boolean {
  if (root.id === nodeId) {
    return true;
  }
  return (root.children ?? []).some((child) => nodeContains(child, nodeId));
}

function firstText(node: ThemeLayoutNode): string | undefined {
  const props = node.props ?? {};
  const own = [props.title, props.text, props.label, props.placeholder].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  if (own) {
    return own;
  }
  for (const child of node.children ?? []) {
    const found = firstText(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function makeUniqueKey(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildNavigation(document: ThemeLayoutDocument): TemplateProfileNavigation | undefined {
  const pages = document.pages;
  if (pages.length <= 1) {
    return undefined;
  }

  const items = pages.map((page) => ({
    key: slug(page.name, page.id),
    label: page.name,
    pageKey: slug(page.name, page.id),
    pageId: page.id,
  }));

  // Infer navigation type from component structure
  const devices = inferDevice(document);
  const isMobile = devices.includes('mobile') || devices.includes('miniapp');
  let hasTabbar = false;
  let hasSidebar = false;

  for (const page of pages) {
    walkNodes(page.layout, (node) => {
      if (node.alias === 'core.tabbar' && node.slot === 'footer') {
        hasTabbar = true;
      }
      if (node.alias === 'core.sidebar') {
        hasSidebar = true;
      }
    });
  }

  let type: TemplateProfileNavigation['type'] = 'bottom_tabs';
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasSidebar is mutated in walkNodes callback
  if (hasSidebar) {
    type = 'side_nav';
  } else if (!isMobile && pages.length > 5) {
    type = 'side_nav';
  } else if (!isMobile) {
    type = 'top_tabs';
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasTabbar is mutated in walkNodes callback
  } else if (hasTabbar) {
    type = 'bottom_tabs';
  }

  return { type, items };
}

function inferPatternFields(
  pageKey: string,
  _regionKey: string | undefined,
  sourceRoot: ThemeLayoutNode,
): TemplateProfilePattern['fields'] {
  const fields: TemplateProfilePattern['fields'] = [];
  walkNodes(sourceRoot, (node) => {
    const props = EDITABLE_PROPS_BY_ALIAS[node.alias] ?? [];
    const preferred = props.find((prop) => node.props?.[prop] !== undefined) ?? props[0];
    if (!preferred) {
      return;
    }
    if (['core.text', 'core.button', 'core.image', 'core.tag', 'core.notice'].includes(node.alias)) {
      const componentKey = node.alias.replace('core.', '');
      fields.push({
        fieldKey: slug(preferred === 'text' ? node.id : preferred),
        slotKey: `${pageKey}.${slug(node.id)}.${componentKey}`,
        prop: preferred,
      });
    }
  });
  return fields.slice(0, 8);
}

export function buildTemplateProfile(
  document: ThemeLayoutDocument,
  options: TemplateProfileBuildOptions = {},
): TemplateProfile {
  const inferredDevices = inferDevice(document);
  const pageKeySet = new Set<string>();
  const regionKeySet = new Set<string>();
  const slotKeySet = new Set<string>();
  const patternKeySet = new Set<string>();
  const pages = document.pages.map((page) => {
    const baseKey = slug((page.layout as SemanticThemeLayoutNode).meta?.pageKey ?? page.name, page.id);
    const pageKey = makeUniqueKey(baseKey, pageKeySet);
    return {
      pageKey,
      pageId: page.id,
      pageKind: inferPageKind(page.name, page.id, page.layout),
      name: sanitizeSemanticInput(page.name, 80),
      description: page.description,
      rootNodeId: page.layout.id,
      isDefault: page.id === document.defaultPageId,
    };
  });

  const pageKeyById = new Map(pages.map((page) => [page.pageId, page.pageKey]));
  const regions: TemplateProfileRegion[] = [];
  const slots: TemplateProfileSlot[] = [];
  const patterns: TemplateProfilePattern[] = [];

  for (const page of document.pages) {
    const pageKey = pageKeyById.get(page.id) ?? slug(page.name, page.id);
    const rootChildren = page.layout.children ?? [];

    rootChildren.forEach((node) => {
      if (node.alias === 'core.tabs') {
        return;
      }
      const semanticNode = node as SemanticThemeLayoutNode;
      const regionBase = semanticNode.meta?.regionKey ?? `${pageKey}.${slug(firstText(node) ?? node.id)}`;
      const regionKey = makeUniqueKey(regionBase, regionKeySet);
      const replaceable = CONTAINER_ALIASES.has(node.alias);
      regions.push({
        regionKey,
        pageKey,
        nodeId: node.id,
        name: sanitizeSemanticInput(firstText(node) ?? node.id, 80),
        sectionKind: node.alias === 'core.panel' ? 'panel' : node.alias.replace('core.', ''),
        replaceable,
      });

      if (CONTAINER_ALIASES.has(node.alias) && (node.children?.length ?? 0) >= 1) {
        const sourceRoot =
          node.children?.find((child) => CONTAINER_ALIASES.has(child.alias)) ?? node.children?.[0] ?? node;
        const patternBase = semanticNode.meta?.patternKey ?? `${pageKey}.${slug(firstText(node) ?? node.id)}.pattern`;
        const patternKey = makeUniqueKey(patternBase, patternKeySet);
        patterns.push({
          patternKey,
          pageKey,
          regionKey,
          sourceRootNodeId: sourceRoot.id,
          parentNodeId: sourceRoot.id === node.id ? undefined : node.id,
          itemAlias: sourceRoot.alias,
          fields: inferPatternFields(pageKey, regionKey, sourceRoot),
          minItems: 0,
          maxItems: 50,
        });
      }
    });

    walkNodes(page.layout, (node) => {
      const editableProps = EDITABLE_PROPS_BY_ALIAS[node.alias] ?? [];
      if (!editableProps.length) {
        return;
      }
      const semanticNode = node;
      const role = semanticNode.meta?.aiRole;
      const slotBase =
        semanticNode.meta?.slotKey ??
        `${pageKey}.${role ? slug(role) : slug(node.id)}.${node.alias.replace('core.', '')}`;
      const slotKey = makeUniqueKey(slotBase, slotKeySet);
      const matchingRegion = regions.find((region) => {
        if (region.pageKey !== pageKey) {
          return false;
        }
        if (region.nodeId === node.id) {
          return true;
        }
        const regionRoot = rootChildren.find((child) => child.id === region.nodeId);
        return regionRoot ? nodeContains(regionRoot, node.id) : false;
      });
      slots.push({
        slotKey,
        pageKey,
        regionKey: semanticNode.meta?.regionKey ?? matchingRegion?.regionKey,
        nodeId: node.id,
        component: node.alias,
        editableProps,
        aiRole: role,
        label: sanitizeSemanticInput(firstText(node) ?? node.id, 80),
      });
    });
  }

  return {
    templateId: document.themeId,
    templateVersion: options.templateVersion ?? String(document.version),
    profileVersion: options.profileVersion ?? '1.0.0',
    devices: options.devices ?? inferredDevices,
    pages,
    regions,
    slots,
    patterns,
    navigation: buildNavigation(document),
    constraints: { devices: options.devices ?? inferredDevices },
    styleProfile: buildTemplateStyleProfile(document, {
      commonLayoutPatterns: regions.map((region) => region.sectionKind ?? 'section'),
    }),
  };
}
