import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeAction,
  ThemeLayoutNodeInteractions,
  ThemeLayoutPage,
  ThemeLayoutTabInteraction,
} from '../types';

export interface EditorAiInstructionTarget {
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

export interface ApplyEditorAiEditInstructionsOptions {
  userPrompt?: string;
  reason?: string;
  selectedNodeId?: string | null;
  resolveSemanticTarget?: (
    document: ThemeLayoutDocument,
    target: string,
    selectedNodeId?: string | null,
  ) => { nodeId: string } | null;
}

export interface ApplyEditorAiEditInstructionsResult {
  applied: string[];
  document: ThemeLayoutDocument;
  errors: string[];
  selectedNodeId?: string | null;
  rollbackReason?: 'validation';
}

export interface ApplyOneResult {
  document: ThemeLayoutDocument;
  error?: string;
  message?: string;
  selectedNodeId?: string | null;
}

export const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
]);
export const FOOTER_ALIASES = new Set(['core.tabs']);
const SIZE_LAYOUT_KEYS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;
const ALIGN_VALUES = new Set(['auto', 'start', 'center', 'end', 'stretch']);

export function cloneDocument(document: ThemeLayoutDocument): ThemeLayoutDocument {
  return structuredClone(document);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSizeValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

export function findNode(node: ThemeLayoutNode, nodeId: string): ThemeLayoutNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function findParentId(node: ThemeLayoutNode, targetId: string, parentId?: string): string | undefined {
  if (node.id === targetId) {
    return parentId;
  }
  for (const child of node.children ?? []) {
    const found = findParentId(child, targetId, node.id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export {
  multiStrategyResolveNodeId,
  type NodeResolutionCandidate,
  type NodeResolutionErrorInfo,
  type ResolveNodeIdMultiStrategyInput,
  type ResolveNodeIdMultiStrategyResult,
} from './applyEditorInstructions.resolution';

export function removeNode(node: ThemeLayoutNode, targetId: string): boolean {
  const children = node.children;
  if (!children?.length) {
    return false;
  }
  const index = children.findIndex((child) => child.id === targetId);
  if (index >= 0) {
    children.splice(index, 1);
    return true;
  }
  return children.some((child) => removeNode(child, targetId));
}

export function descriptorForAlias(document: ThemeLayoutDocument, alias: string): ThemeComponentDescriptor | null {
  return document.components.find((component) => component.alias === alias) ?? null;
}

export function normalizeChildOrder(parent: ThemeLayoutNode): void {
  parent.children?.forEach((child, index) => {
    if (child.layout.mode !== 'absolute') {
      child.layout.order = index + 1;
    }
  });
}

export function syncRootLayout(document: ThemeLayoutDocument): void {
  const active = document.pages.find((page) => page.id === document.defaultPageId) ?? document.pages[0];
  document.defaultPageId = active.id;
  document.layout = active.layout;
  document.pageName = active.name;
}

export function sanitizeLayoutPatch(layout: Partial<LayoutNodeLayout> | undefined): Partial<LayoutNodeLayout> {
  const next: Partial<LayoutNodeLayout> = {};
  if (!layout) {
    return next;
  }
  if (layout.mode === 'flow' || layout.mode === 'grid' || layout.mode === 'absolute') {
    next.mode = layout.mode;
  }
  if (typeof layout.flowRow === 'number') {
    next.flowRow = layout.flowRow;
  }
  if (typeof layout.order === 'number') {
    next.order = layout.order;
  }
  SIZE_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (isSizeValue(value)) {
      next[key] = value;
    }
  });
  if (typeof layout.gridColumn === 'string') {
    next.gridColumn = layout.gridColumn;
  }
  if (typeof layout.gridRow === 'string') {
    next.gridRow = layout.gridRow;
  }
  if (typeof layout.alignSelf === 'string' && ALIGN_VALUES.has(layout.alignSelf)) {
    next.alignSelf = layout.alignSelf;
  }
  if (typeof layout.justifySelf === 'string' && ALIGN_VALUES.has(layout.justifySelf)) {
    next.justifySelf = layout.justifySelf;
  }
  return next;
}

export function sanitizeFramePatch(frame: Partial<LayoutNodeFrame> | undefined): Partial<LayoutNodeFrame> {
  const next: Partial<LayoutNodeFrame> = {};
  if (!frame) {
    return next;
  }
  next.position = 'absolute';
  (['x', 'y', 'zIndex'] as const).forEach((key) => {
    if (typeof frame[key] === 'number') {
      next[key] = frame[key];
    }
  });
  (
    ['left', 'top', 'right', 'bottom', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const
  ).forEach((key) => {
    if (isSizeValue(frame[key])) {
      next[key] = frame[key];
    }
  });
  if (frame.unit === 'px' || frame.unit === '%') {
    next.unit = frame.unit;
  }
  return next;
}

export function stringifyPrimitive(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

const CORE_IMAGE_PROP_FALLBACKS = new Map([
  ['src', 'string'],
  ['alt', 'string'],
  ['title', 'string'],
  ['iconColor', 'string'],
  ['objectFit', 'string'],
]);
const CORE_PROP_ALIASES = new Map([
  ['core.button:text', 'label'],
  ['core.notice:variant', 'tone'],
]);

function coercePropValue(
  descriptor: ThemeComponentDescriptor,
  name: string,
  value: unknown,
): { error?: string; value?: unknown } {
  const fallbackType = descriptor.alias === 'core.image' ? CORE_IMAGE_PROP_FALLBACKS.get(name) : undefined;
  const prop =
    descriptor.props.find((item) => item.name === name) ?? (fallbackType ? { name, type: fallbackType } : undefined);
  if (!prop) {
    return { error: `Property "${name}" is not valid for ${descriptor.alias}` };
  }
  if (prop.type === 'boolean') {
    return { value: Boolean(value) };
  }
  if (prop.type === 'number') {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue) ? { value: numericValue } : { error: `Property "${name}" must be a number` };
  }
  if (prop.type === 'string[]') {
    if (Array.isArray(value)) {
      return { value: value.map((item) => String(item).trim()).filter(Boolean) };
    }
    if (typeof value === 'string') {
      return {
        value: value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }
    return { error: `Property "${name}" must be a string array` };
  }
  if (prop.type === 'object') {
    if (isPlainObject(value)) {
      return { value };
    }
    return { error: `Property "${name}" must be an object` };
  }
  if (prop.type === 'array') {
    if (Array.isArray(value)) {
      return { value };
    }
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? { value: parsed } : { error: `Property "${name}" must be an array` };
      } catch {
        return { error: `Property "${name}" must be a valid JSON array` };
      }
    }
    return { error: `Property "${name}" must be an array` };
  }
  const stringValue = stringifyPrimitive(value);
  if (prop.enum?.length && !prop.enum.includes(stringValue)) {
    return { error: `Property "${name}" must be one of: ${prop.enum.join(', ')}` };
  }
  return { value: stringValue };
}

export function coerceProps(
  descriptor: ThemeComponentDescriptor,
  props: Record<string, unknown> | undefined,
): { errors: string[]; props: Record<string, unknown> } {
  const nextProps: Record<string, unknown> = {};
  const errors: string[] = [];
  Object.entries(props ?? {}).forEach(([name, value]) => {
    const effectiveName = CORE_PROP_ALIASES.get(`${descriptor.alias}:${name}`) ?? name;
    if (effectiveName !== name && nextProps[effectiveName] !== undefined) {
      return;
    }
    const result = coercePropValue(descriptor, effectiveName, value);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    nextProps[effectiveName] = result.value;
  });
  return { errors, props: nextProps };
}

function defaultPropsForAlias(alias: string): Record<string, unknown> {
  switch (alias) {
    case 'core.screen':
      return { title: '新页面' };
    case 'core.text':
      return { text: '说明文字', variant: 'body' };
    case 'core.button':
      return { label: '立即查看', variant: 'primary' };
    case 'core.search':
      return { placeholder: '搜索' };
    case 'core.tabs':
      return { tabs: ['首页'], activeTab: '首页' };
    case 'core.notice':
      return { text: '公告提示', tone: 'info' };
    case 'core.tag':
      return { label: '标签', tone: 'neutral' };
    case 'core.panel':
      return { tone: 'default', gap: '12' };
    default:
      return {};
  }
}

export function buildNode(
  document: ThemeLayoutDocument,
  alias: string,
  nodeId: string | undefined,
  props: Record<string, unknown> | undefined,
  layout: Partial<LayoutNodeLayout> | undefined,
): { node?: ThemeLayoutNode; error?: string } {
  const descriptor = descriptorForAlias(document, alias);
  if (!descriptor) {
    return { error: `Unknown component alias: ${alias}` };
  }
  const coerced = coerceProps(descriptor, { ...defaultPropsForAlias(alias), ...(props ?? {}) });
  if (coerced.errors.length > 0) {
    return { error: coerced.errors.join('; ') };
  }
  return {
    node: {
      id: nodeId ?? `${alias.replace(/\./g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
      alias,
      layout: { mode: 'flow', width: '100%', ...sanitizeLayoutPatch(layout) },
      props: coerced.props,
      children: CONTAINER_ALIASES.has(alias) ? [] : undefined,
    },
  };
}

export function resolveTargetPage(document: ThemeLayoutDocument, pageId?: string): ThemeLayoutPage | null {
  const fallbackPage = document.pages[0] as ThemeLayoutPage | undefined;
  return pageId
    ? (document.pages.find((page) => page.id === pageId) ?? null)
    : (document.pages.find((page) => page.id === document.defaultPageId) ?? fallbackPage ?? null);
}

function slugNodeId(value: string): string {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'node';
}

export function collectDocumentNodeIds(document: ThemeLayoutDocument): Set<string> {
  const ids = new Set<string>();
  const walk = (node: ThemeLayoutNode) => {
    ids.add(node.id);
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => walk(page.layout));
  return ids;
}

function uniqueNodeId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${String(suffix)}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function remapReferenceNodeId(referenceNodeId: string, referencePageId: string, pageId: string): string {
  if (referenceNodeId === `${referencePageId}-screen`) {
    return `${pageId}-screen`;
  }
  if (referenceNodeId.startsWith(`${referencePageId}-`)) {
    return `${pageId}-${referenceNodeId.slice(referencePageId.length + 1)}`;
  }
  return `${pageId}-${slugNodeId(referenceNodeId)}`;
}

function remapPatternNodeId(referenceNodeId: string, sourceRootNodeId: string, itemIndex: number): string {
  const prefix = `${slugNodeId(sourceRootNodeId)}-item-${itemIndex + 1}`;
  if (referenceNodeId === sourceRootNodeId) {
    return prefix;
  }
  if (referenceNodeId.startsWith(`${sourceRootNodeId}-`)) {
    return `${prefix}-${slugNodeId(referenceNodeId.slice(sourceRootNodeId.length + 1))}`;
  }
  return `${prefix}-${slugNodeId(referenceNodeId)}`;
}

function rewriteNavigateActionTarget(
  action: ThemeLayoutNavigateAction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutNavigateAction | undefined {
  if (!action) {
    return undefined;
  }
  return action.targetPageId === referencePageId ? { ...action, targetPageId: pageId } : action;
}

function rewriteNodeActionTarget(
  action: ThemeLayoutNodeAction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutNodeAction | undefined {
  if (!action) {
    return undefined;
  }
  if (action.type === 'navigate') {
    return rewriteNavigateActionTarget(action, referencePageId, pageId);
  }
  return {
    ...action,
    targetNodeId: remapReferenceNodeId(action.targetNodeId, referencePageId, pageId),
  };
}

function isNavigateAction(interaction: ThemeLayoutTabInteraction): interaction is ThemeLayoutNavigateAction {
  return 'type' in interaction && interaction.type === 'navigate';
}

function rewriteTabInteractionTargets(
  interaction: ThemeLayoutTabInteraction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutTabInteraction | undefined {
  if (!interaction) {
    return undefined;
  }
  if (isNavigateAction(interaction)) {
    return rewriteNavigateActionTarget(interaction, referencePageId, pageId);
  }
  return Object.fromEntries(
    Object.entries(interaction).map(([label, action]) => [
      label,
      rewriteNavigateActionTarget(action, referencePageId, pageId) ?? action,
    ]),
  );
}

function rewriteInteractionTargets(
  interactions: ThemeLayoutNodeInteractions | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutNodeInteractions | undefined {
  if (!interactions) {
    return undefined;
  }
  return {
    ...interactions,
    onClick: rewriteNodeActionTarget(interactions.onClick, referencePageId, pageId),
    onActionClick: rewriteNodeActionTarget(interactions.onActionClick, referencePageId, pageId),
    onStatusClick: rewriteNodeActionTarget(interactions.onStatusClick, referencePageId, pageId),
    onTabClick: rewriteTabInteractionTargets(interactions.onTabClick, referencePageId, pageId),
  };
}

export function cloneReferenceNode(
  node: ThemeLayoutNode,
  options: {
    idMap: Map<string, string>;
    omitIds: Set<string>;
    pageId: string;
    referencePageId: string;
    rootNodeId: string;
    usedIds: Set<string>;
    isRoot?: boolean;
  },
): ThemeLayoutNode | null {
  if (!options.isRoot && options.omitIds.has(node.id)) {
    return null;
  }
  const nextId = uniqueNodeId(
    options.isRoot ? options.rootNodeId : remapReferenceNodeId(node.id, options.referencePageId, options.pageId),
    options.usedIds,
  );
  options.idMap.set(node.id, nextId);
  const cloned: ThemeLayoutNode = {
    ...structuredClone(node),
    id: nextId,
    interactions: rewriteInteractionTargets(node.interactions, options.referencePageId, options.pageId),
  };
  cloned.children = (node.children ?? [])
    .map((child) => cloneReferenceNode(child, { ...options, isRoot: false }))
    .filter((child): child is ThemeLayoutNode => Boolean(child));
  if (!cloned.children.length && !CONTAINER_ALIASES.has(cloned.alias)) {
    delete cloned.children;
  }
  return cloned;
}

export function clonePatternNode(
  node: ThemeLayoutNode,
  options: {
    idMap: Map<string, string>;
    itemIndex: number;
    sourceRootNodeId: string;
    usedIds: Set<string>;
  },
): ThemeLayoutNode {
  const nextId = uniqueNodeId(
    remapPatternNodeId(node.id, options.sourceRootNodeId, options.itemIndex),
    options.usedIds,
  );
  options.idMap.set(node.id, nextId);
  const cloned: ThemeLayoutNode = {
    ...structuredClone(node),
    id: nextId,
  };
  cloned.meta = {
    ...(cloned.meta ?? {}),
    patternKey: cloned.meta?.patternKey,
  };
  cloned.children = (node.children ?? []).map((child) => clonePatternNode(child, options));
  if (!cloned.children.length && !CONTAINER_ALIASES.has(cloned.alias)) {
    delete cloned.children;
  }
  return cloned;
}

export function findParentNode(root: ThemeLayoutNode, targetId: string): ThemeLayoutNode | null {
  for (const child of root.children ?? []) {
    if (child.id === targetId) {
      return root;
    }
    const found = findParentNode(child, targetId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function slugNodeIdForPattern(value: string): string {
  return slugNodeId(value);
}

function findFooterTabs(root: ThemeLayoutNode): ThemeLayoutNode[] {
  const found: ThemeLayoutNode[] = [];
  const walk = (node: ThemeLayoutNode) => {
    if (node.alias === 'core.tabs' && (node.slot === 'footer' || FOOTER_ALIASES.has(node.alias))) {
      found.push(node);
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return found;
}

export function syncPageNavigation(document: ThemeLayoutDocument): void {
  const tabs = document.pages.map((page) => (page.name.length > 0 ? page.name : page.id));
  const onTabClick = Object.fromEntries(
    document.pages.map((page, index) => [tabs[index], { type: 'navigate' as const, targetPageId: page.id }]),
  );
  document.pages.forEach((page) => {
    const footers = findFooterTabs(page.layout);
    if (footers.length === 0) {
      page.layout.children ??= [];
      page.layout.children.push({
        id: `${page.id}-footer-tabs`,
        alias: 'core.tabs',
        slot: 'footer',
        layout: { mode: 'flow', order: 999, width: '100%' },
        props: { tabs, activeTab: page.name || page.id },
        interactions: { onTabClick },
      });
      return;
    }
    footers.forEach((footer) => {
      footer.props = { ...(footer.props ?? {}), tabs, activeTab: page.name.length > 0 ? page.name : page.id };
      footer.interactions = { ...(footer.interactions ?? {}), onTabClick };
    });
  });
}
