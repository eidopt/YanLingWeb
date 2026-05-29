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

function inferPageKind(pageName: string, pageId: string): TemplatePageKind {
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
  return 'unknown';
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
  const items = document.pages.map((page) => ({
    key: slug(page.name, page.id),
    label: page.name,
    pageKey: slug(page.name, page.id),
    pageId: page.id,
  }));
  if (!items.length) {
    return undefined;
  }
  return { type: 'bottom_tabs', items };
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
      pageKind: inferPageKind(page.name, page.id),
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
