import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ThemeLayoutNodeInteractions,
} from '../types';
import { validateThemeLayoutDocument } from '../validation/themeLayoutValidator';

export type EditorAiEditInstruction =
  | ({
      type: 'create_page';
      pageId: string;
      name?: string;
      rootNodeId?: string;
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'delete_page';
      name?: string;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({ type: 'sync_page_navigation'; select?: boolean } & EditorAiInstructionTarget)
  | ({ type: 'sync_footer_tabs'; select?: boolean } & EditorAiInstructionTarget)
  | ({
      type: 'insert_node';
      alias: string;
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: 'horizontal' | 'vertical';
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      frame?: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_props';
      nodeId: string;
      props: Record<string, unknown>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_layout';
      nodeId: string;
      layout: Partial<LayoutNodeLayout>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_frame';
      nodeId: string;
      frame: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'move_node';
      nodeId: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: 'horizontal' | 'vertical';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({ type: 'delete_node'; nodeId: string } & EditorAiInstructionTarget)
  | ({
      type: 'update_interactions';
      nodeId: string;
      interactions: Partial<ThemeLayoutNodeInteractions>;
      select?: boolean;
    } & EditorAiInstructionTarget);

export interface EditorAiInstructionTarget {
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

export interface ApplyEditorAiEditInstructionsOptions {
  userPrompt?: string;
  reason?: string;
  selectedNodeId?: string | null;
}

export interface ApplyEditorAiEditInstructionsResult {
  applied: string[];
  document: ThemeLayoutDocument;
  errors: string[];
  selectedNodeId?: string | null;
}

const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
]);
const FOOTER_ALIASES = new Set(['core.tabs']);
const SIZE_LAYOUT_KEYS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;
const ALIGN_VALUES = new Set(['auto', 'start', 'center', 'end', 'stretch']);

function cloneDocument(document: ThemeLayoutDocument): ThemeLayoutDocument {
  return structuredClone(document);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
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

function findParentId(node: ThemeLayoutNode, targetId: string, parentId?: string): string | undefined {
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

const GENERIC_NODE_ID_TOKENS = new Set([
  'body',
  'canvas',
  'component',
  'container',
  'content',
  'core',
  'group',
  'item',
  'layout',
  'main',
  'node',
  'page',
  'root',
  'screen',
  'section',
  'wrapper',
]);
const MIN_NODE_ID_MATCH_SCORE = 0.6;
const MIN_NODE_ID_MATCH_GAP = 0.15;

function collectNodeIds(node: ThemeLayoutNode, output: string[] = []): string[] {
  output.push(node.id);
  node.children?.forEach((child) => collectNodeIds(child, output));
  return output;
}

function normalizeNodeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function nodeIdTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_NODE_ID_TOKENS.has(token));
}

function commonPrefixRatio(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return max > 0 ? index / max : 0;
}

function scoreNodeIdMatch(requestedId: string, existingId: string): number {
  const requested = normalizeNodeId(requestedId);
  const existing = normalizeNodeId(existingId);
  if (!requested || !existing) {
    return 0;
  }
  if (requested === existing) {
    return 1;
  }
  if (
    requested.length >= 4 &&
    existing.length >= 4 &&
    (requested.includes(existing) || existing.includes(requested))
  ) {
    return 0.92;
  }

  const requestedTokens = nodeIdTokens(requestedId);
  const existingTokens = nodeIdTokens(existingId);
  if (!requestedTokens.length || !existingTokens.length) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const existingTokenSet = new Set(existingTokens);
  const overlap = requestedTokens.filter((token) => (
    existingTokenSet.has(token)
  )).length;
  if (overlap === 0) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const union = new Set([...requestedTokens, ...existingTokens]).size;
  const containment = overlap / requestedTokens.length;
  const jaccard = overlap / union;
  return Math.max(jaccard, containment * 0.9);
}

function resolveNodeIdFromExistingIds(
  root: ThemeLayoutNode,
  requestedId: string,
): string | null {
  const candidates = collectNodeIds(root)
    .map((nodeId) => ({
      nodeId,
      score: scoreNodeIdMatch(requestedId, nodeId),
    }))
    .filter((candidate) => candidate.score >= MIN_NODE_ID_MATCH_SCORE)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }
  const [best, second] = candidates;
  if (
    candidates.length > 1 &&
    best.score - second.score < MIN_NODE_ID_MATCH_GAP
  ) {
    return null;
  }
  return best.nodeId;
}

function removeNode(node: ThemeLayoutNode, targetId: string): boolean {
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

function descriptorForAlias(document: ThemeLayoutDocument, alias: string): ThemeComponentDescriptor | null {
  return document.components.find((component) => component.alias === alias) ?? null;
}

function normalizeChildOrder(parent: ThemeLayoutNode): void {
  parent.children?.forEach((child, index) => {
    if (child.layout.mode !== 'absolute') {
      child.layout.order = index + 1;
    }
  });
}

function syncRootLayout(document: ThemeLayoutDocument): void {
  const active = document.pages.find((page) => page.id === document.defaultPageId) ?? document.pages[0];
  document.defaultPageId = active.id;
  document.layout = active.layout;
  document.pageName = active.name;
}

function sanitizeLayoutPatch(layout: Partial<LayoutNodeLayout> | undefined): Partial<LayoutNodeLayout> {
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

function sanitizeFramePatch(frame: Partial<LayoutNodeFrame> | undefined): Partial<LayoutNodeFrame> {
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
  (['left', 'top', 'right', 'bottom', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const)
    .forEach((key) => {
      if (isSizeValue(frame[key])) {
        next[key] = frame[key];
      }
    });
  if (frame.unit === 'px' || frame.unit === '%') {
    next.unit = frame.unit;
  }
  return next;
}

function stringifyPrimitive(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function coercePropValue(
  descriptor: ThemeComponentDescriptor,
  name: string,
  value: unknown,
): { error?: string; value?: unknown } {
  const prop = descriptor.props.find((item) => item.name === name);
  if (!prop) {
    return { error: `Property "${name}" is not valid for ${descriptor.alias}` };
  }
  if (prop.type === 'boolean') {
    return { value: Boolean(value) };
  }
  if (prop.type === 'number') {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue)
      ? { value: numericValue }
      : { error: `Property "${name}" must be a number` };
  }
  if (prop.type === 'string[]') {
    if (Array.isArray(value)) {
      return { value: value.map((item) => String(item).trim()).filter(Boolean) };
    }
    if (typeof value === 'string') {
      return { value: value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) };
    }
    return { error: `Property "${name}" must be a string array` };
  }
  if (prop.type === 'object') {
    if (isPlainObject(value)) {
      return { value };
    }
    return { error: `Property "${name}" must be an object` };
  }
  const stringValue = stringifyPrimitive(value);
  if (prop.enum?.length && !prop.enum.includes(stringValue)) {
    return { error: `Property "${name}" must be one of: ${prop.enum.join(', ')}` };
  }
  return { value: stringValue };
}

function coerceProps(descriptor: ThemeComponentDescriptor, props: Record<string, unknown> | undefined) {
  const nextProps: Record<string, unknown> = {};
  const errors: string[] = [];
  Object.entries(props ?? {}).forEach(([name, value]) => {
    const result = coercePropValue(descriptor, name, value);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    nextProps[name] = result.value;
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

function buildNode(
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

function resolveTargetPage(document: ThemeLayoutDocument, pageId?: string) {
  return pageId
    ? document.pages.find((page) => page.id === pageId) ?? null
    : document.pages.find((page) => page.id === document.defaultPageId) ?? document.pages[0] ?? null;
}

function applyCreatePage(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page' }>,
): ApplyOneResult {
  if (document.pages.some((page) => page.id === instruction.pageId)) {
    return { document, error: `Page id already exists: ${instruction.pageId}` };
  }
  const requestedName = instruction.name?.trim();
  const name = requestedName === undefined || requestedName.length === 0
    ? instruction.pageId
    : requestedName;
  const requestedRootNodeId = instruction.rootNodeId?.trim();
  const titleValue = stringifyPrimitive(instruction.props?.title) || name;
  const root: ThemeLayoutNode = {
    id: requestedRootNodeId === undefined || requestedRootNodeId.length === 0
      ? `${instruction.pageId}-screen`
      : requestedRootNodeId,
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%', ...sanitizeLayoutPatch(instruction.layout) },
    props: { ...(instruction.props ?? {}), title: titleValue },
    children: [],
  };
  document.pages.push({ id: instruction.pageId, name, layout: root });
  if (instruction.activate !== false) {
    document.defaultPageId = instruction.pageId;
  }
  syncRootLayout(document);
  return {
    document,
    message: `Created page ${name}`,
    selectedNodeId: instruction.select === false ? undefined : root.id,
  };
}

function applyDeletePage(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'delete_page' }>,
): ApplyOneResult {
  if (document.pages.length <= 1) {
    return { document, error: 'Cannot delete the only page' };
  }
  const index = document.pages.findIndex((page) => {
    const pageId = instruction.pageId?.trim();
    const name = instruction.name?.trim();
    const matchesPageId = pageId !== undefined && pageId.length > 0 && page.id === pageId;
    const matchesName = name !== undefined && name.length > 0 && page.name === name;
    return matchesPageId || matchesName;
  });
  if (index < 0) {
    return { document, error: `Page not found: ${instruction.pageId ?? instruction.name ?? ''}` };
  }
  const deleted = document.pages[index];
  document.pages.splice(index, 1);
  if (document.defaultPageId === deleted.id) {
    document.defaultPageId = document.pages[0].id;
  }
  syncPageNavigation(document);
  syncRootLayout(document);
  return { document, message: `Deleted page ${deleted.name}`, selectedNodeId: null };
}

function syncPageNavigation(document: ThemeLayoutDocument): void {
  const tabs = document.pages.map((page) => (page.name.length > 0 ? page.name : page.id));
  const onTabClick = Object.fromEntries(
    document.pages.map((page, index) => [
      tabs[index],
      { type: 'navigate' as const, targetPageId: page.id },
    ]),
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

interface ApplyOneResult {
  document: ThemeLayoutDocument;
  error?: string;
  message?: string;
  selectedNodeId?: string | null;
}

function applyOneInstruction(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
): ApplyOneResult {
  if (instruction.type === 'create_page') {
    return applyCreatePage(document, instruction);
  }
  if (instruction.type === 'delete_page') {
    return applyDeletePage(document, instruction);
  }
  if (instruction.type === 'sync_page_navigation' || instruction.type === 'sync_footer_tabs') {
    syncPageNavigation(document);
    syncRootLayout(document);
    return { document, message: 'Synced page navigation' };
  }

  const page = resolveTargetPage(document, instruction.pageId);
  if (!page) {
    return { document, error: `Page not found: ${instruction.pageId ?? document.defaultPageId}` };
  }

  if (instruction.type === 'insert_node') {
    let parentId = instruction.parentId ?? page.layout.id;
    let parent = findNode(page.layout, parentId);
    if (!parent && instruction.parentId) {
      const resolvedParentId = resolveNodeIdFromExistingIds(
        page.layout,
        instruction.parentId,
      );
      if (resolvedParentId) {
        parentId = resolvedParentId;
        parent = findNode(page.layout, parentId);
      }
    }
    if (!parent) {
      return { document, error: `AI referenced unknown parentId: ${parentId}` };
    }
    if (!CONTAINER_ALIASES.has(parent.alias)) {
      return { document, error: `Node ${parentId} cannot receive children` };
    }
    const built = buildNode(document, instruction.alias, instruction.nodeId, instruction.props, instruction.layout);
    if (built.error || !built.node) {
      return { document, error: built.error ?? 'Failed to build inserted node' };
    }
    if (instruction.frame) {
      built.node.layout.mode = 'absolute';
      built.node.frame = { position: 'absolute', ...sanitizeFramePatch(instruction.frame) };
    }
    parent.children ??= [];
    if (instruction.targetId && instruction.position && instruction.position !== 'inside_end') {
      let targetId = instruction.targetId;
      if (!findNode(page.layout, targetId)) {
        targetId = resolveNodeIdFromExistingIds(page.layout, targetId) ?? targetId;
      }
      const index = parent.children.findIndex((child) => child.id === targetId);
      if (index >= 0) {
        parent.children.splice(instruction.position === 'before' ? index : index + 1, 0, built.node);
      } else {
        return { document, error: `AI referenced unknown targetId: ${instruction.targetId}` };
      }
    } else {
      parent.children.push(built.node);
    }
    normalizeChildOrder(parent);
    syncRootLayout(document);
    return {
      document,
      message: `Inserted ${instruction.alias}`,
      selectedNodeId: instruction.select === false ? undefined : built.node.id,
    };
  }

  let nodeId = instruction.nodeId;
  let target = findNode(page.layout, nodeId);
  if (!target) {
    const resolvedNodeId = resolveNodeIdFromExistingIds(page.layout, nodeId);
    if (resolvedNodeId) {
      nodeId = resolvedNodeId;
      target = findNode(page.layout, nodeId);
    }
  }
  if (!target) {
    return { document, error: `Node not found: ${instruction.nodeId}` };
  }

  if (instruction.type === 'update_props') {
    const descriptor = descriptorForAlias(document, target.alias);
    if (!descriptor) {
      return { document, error: `Unknown component alias: ${target.alias}` };
    }
    const coerced = coerceProps(descriptor, instruction.props);
    if (coerced.errors.length > 0) {
      return { document, error: coerced.errors.join('; ') };
    }
    target.props = { ...(target.props ?? {}), ...coerced.props };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} props`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'set_layout') {
    target.layout = { ...target.layout, ...sanitizeLayoutPatch(instruction.layout) };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} layout`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'set_frame') {
    target.layout = { ...target.layout, mode: 'absolute' };
    target.frame = { position: 'absolute', ...target.frame, ...sanitizeFramePatch(instruction.frame) };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} frame`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'delete_node') {
    if (nodeId === page.layout.id) {
      return { document, error: 'Cannot delete the root screen node' };
    }
    if (!removeNode(page.layout, nodeId)) {
      return { document, error: `Node not found: ${instruction.nodeId}` };
    }
    syncRootLayout(document);
    return { document, message: `Deleted ${nodeId}`, selectedNodeId: null };
  }

  if (instruction.type === 'move_node') {
    if (nodeId === page.layout.id) {
      return { document, error: 'Cannot move the root screen node' };
    }
    let parentId = instruction.parentId ?? findParentId(page.layout, nodeId);
    if (instruction.parentId && !findNode(page.layout, instruction.parentId)) {
      parentId = resolveNodeIdFromExistingIds(page.layout, instruction.parentId) ?? parentId;
    }
    const parent = parentId ? findNode(page.layout, parentId) : null;
    if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
      return { document, error: `Invalid target parent: ${parentId ?? ''}` };
    }
    const node = findNode(page.layout, nodeId);
    if (!node || !removeNode(page.layout, nodeId)) {
      return { document, error: `Node not found: ${instruction.nodeId}` };
    }
    parent.children ??= [];
    parent.children.push(node);
    normalizeChildOrder(parent);
    syncRootLayout(document);
    return {
      document,
      message: `Moved ${nodeId}`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  target.interactions = { ...(target.interactions ?? {}), ...instruction.interactions };
  syncRootLayout(document);
  return {
    document,
    message: `Updated ${nodeId} interactions`,
    selectedNodeId: instruction.select === false ? undefined : nodeId,
  };
}

export function applyEditorAiEditInstructions(
  document: ThemeLayoutDocument,
  instructions: readonly EditorAiEditInstruction[],
  _options?: ApplyEditorAiEditInstructionsOptions,
): ApplyEditorAiEditInstructionsResult {
  const currentDocument = cloneDocument(document);
  const applied: string[] = [];
  const errors: string[] = [];
  let selectedNodeId: string | null | undefined;
  let aborted = false;

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    const result = applyOneInstruction(currentDocument, instruction);
    if (result.error) {
      errors.push(`Instruction ${index + 1}: ${result.error}`);
      aborted = true;
      return;
    }
    if (result.message) {
      applied.push(result.message);
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeId = result.selectedNodeId;
    }
  });

  if (errors.length > 0) {
    return {
      applied,
      document: currentDocument,
      errors,
      selectedNodeId,
    };
  }

  const validation = validateThemeLayoutDocument(currentDocument, {
    componentTemplates: currentDocument.componentTemplates,
    failOnUnknownProps: false,
  });

  if (!validation.valid) {
    return {
      applied: [],
      document: cloneDocument(document),
      errors: validation.errors.map((error) => (
        `Validation ${error.path}: ${error.message}`
      )),
      selectedNodeId: undefined,
    };
  }

  return { applied, document: currentDocument, errors, selectedNodeId };
}
