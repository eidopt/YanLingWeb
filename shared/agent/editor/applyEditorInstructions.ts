/* eslint-disable max-len */
import { compileSemanticEditorInstruction, isSemanticEditorInstruction, type SemanticEditorInstruction } from '../compiler/semanticInstructionCompiler';
import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeInteractions,
  ThemeLayoutPage,
  ThemeLayoutTabInteraction,
} from '../types';
import { validateThemeLayoutDocument } from '../validation/themeLayoutValidator';

export type EditorAiEditInstruction =
  | SemanticEditorInstruction
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
      type: 'create_page_from_reference';
      pageId: string;
      name: string;
      referencePageId: string;
      rootNodeId?: string;
      rootProps?: Record<string, unknown>;
      referenceNodeUpdates?: {
        referenceNodeId: string;
        props: Record<string, unknown>;
      }[];
      omitReferenceNodeIds?: string[];
      select?: boolean;
      activate?: boolean;
      syncNavigation?: boolean;
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
      type: 'clone_pattern_items';
      sourceRootNodeId: string;
      parentId?: string;
      replaceExisting?: boolean;
      select?: boolean;
      items: Record<string, unknown>[];
      fields: {
        fieldKey: string;
        referenceNodeId: string;
        prop: string;
        required?: boolean;
      }[];
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_props';
      nodeId?: string;
      props: Record<string, unknown>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_layout';
      nodeId?: string;
      layout: Partial<LayoutNodeLayout>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_frame';
      nodeId?: string;
      frame: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'move_node';
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: 'horizontal' | 'vertical';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({ type: 'delete_node'; nodeId?: string } & EditorAiInstructionTarget)
  | ({
      type: 'update_interactions';
      nodeId?: string;
      interactions: Partial<ThemeLayoutNodeInteractions>;
      select?: boolean;
    } & EditorAiInstructionTarget);

export interface EditorAiInstructionTarget {
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

export interface NodeResolutionCandidate {
  nodeId: string;
  alias: string;
  summary: string;
  score: number;
  matchReason: string;
}

export interface NodeResolutionErrorInfo {
  error: string;
  failedId: string;
  candidates: NodeResolutionCandidate[];
  siblingIds: string[];
  parentAlias: string | null;
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

function summarizeNodeForError(node: ThemeLayoutNode): string {
  const entries = Object.entries(node.props ?? {})
    .filter(([_, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .slice(0, 3);
  return entries.length > 0 ? entries.join(', ') : 'no text props';
}

function buildNodeResolutionError(
  root: ThemeLayoutNode,
  requestedId: string,
): NodeResolutionErrorInfo {
  const allIds = collectNodeIds(root);

  const scoredCandidates = allIds
    .map((nodeId) => {
      const node = findNode(root, nodeId);
      return {
        nodeId,
        alias: node?.alias ?? 'unknown',
        summary: node ? summarizeNodeForError(node) : '',
        score: scoreNodeIdMatch(requestedId, nodeId),
        matchReason: '',
      };
    })
    .sort((a, b) => b.score - a.score);

  const candidates: NodeResolutionCandidate[] = [];
  for (const item of scoredCandidates) {
    if (item.score <= 0) {
      break;
    }
    let matchReason = 'no match';
    if (item.score >= 0.92) {
      matchReason = 'substring match';
    } else if (item.score >= 0.65) {
      matchReason = 'token overlap';
    } else if (item.score > 0) {
      matchReason = 'partial prefix match';
    }
    candidates.push({ ...item, matchReason });
    if (candidates.length >= 5) {
      break;
    }
  }

  const parentInfo = findParentAndSiblings(root, requestedId);

  return {
    error: `Node not found: ${requestedId}. See candidates below for possible matches.`,
    failedId: requestedId,
    candidates,
    siblingIds: parentInfo.siblingIds,
    parentAlias: parentInfo.parentAlias,
  };
}

function findParentAndSiblings(
  root: ThemeLayoutNode,
  targetId: string,
): { siblingIds: string[]; parentAlias: string | null } {
  const parentId = findParentId(root, targetId);
  if (!parentId) {
    return { siblingIds: [], parentAlias: null };
  }
  const parent = findNode(root, parentId);
  if (!parent?.children?.length) {
    return { siblingIds: [], parentAlias: parent?.alias ?? null };
  }
  const siblingIds = parent.children
    .filter((child) => child.id !== targetId)
    .map((child) => child.id)
    .slice(0, 10);
  return { siblingIds, parentAlias: parent.alias };
}

function searchNodeByProps(root: ThemeLayoutNode, query: string): string | null {
  const queryNorm = normalizeNodeId(query);
  if (!queryNorm || queryNorm.length < 2) {
    return null;
  }

  let bestMatchNodeId: string | null = null;
  let bestMatchScore = 0;

  const walk = (node: ThemeLayoutNode) => {
    const propText = [
      node.props?.text,
      node.props?.label,
      node.props?.title,
      node.props?.placeholder,
      node.props?.name,
      node.props?.activeTab,
      node.alias,
    ]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');

    const normPropText = normalizeNodeId(propText);
    if (!normPropText) {
      node.children?.forEach(walk);
      return;
    }

    let score = 0;
    if (normPropText.includes(queryNorm)) {
      score = 0.85;
    } else if (queryNorm.includes(normPropText) && normPropText.length >= 3) {
      score = 0.7;
    }

    if (score > bestMatchScore) {
      bestMatchNodeId = node.id;
      bestMatchScore = score;
    }

    node.children?.forEach(walk);
  };

  walk(root);
  return bestMatchNodeId;
}

interface ResolveNodeIdMultiStrategyInput {
  root: ThemeLayoutNode;
  document: ThemeLayoutDocument;
  instruction: EditorAiEditInstruction;
  requestedId?: string;
  selectedNodeId?: string | null;
  alias?: string;
  parentId?: string;
  resolveSemanticTarget?: ApplyEditorAiEditInstructionsOptions['resolveSemanticTarget'];
}

interface ResolveNodeIdMultiStrategyResult {
  resolvedId: string | null;
  strategy: 'exact' | 'fuzzy_token' | 'prop_search' | 'semantic_role' | 'structural' | 'failed';
  node?: ThemeLayoutNode;
  error?: NodeResolutionErrorInfo;
}

function multiStrategyResolveNodeId(
  input: ResolveNodeIdMultiStrategyInput,
): ResolveNodeIdMultiStrategyResult {
  const { root, document, instruction, requestedId, selectedNodeId, alias, parentId, resolveSemanticTarget } = input;

  // semanticTarget first when no explicit nodeId — true one-of semantics
  if (!requestedId && instruction.semanticTarget && resolveSemanticTarget) {
    const semanticResult = resolveSemanticTarget(document, instruction.semanticTarget, selectedNodeId);
    if (semanticResult) {
      const semNode = findNode(root, semanticResult.nodeId);
      if (semNode) {
        return { resolvedId: semanticResult.nodeId, strategy: 'semantic_role', node: semNode };
      }
    }
  }

  // requestedId-based strategies (exact → fuzzy → prop_search)
  if (requestedId) {
    const exact = findNode(root, requestedId);
    if (exact) {
      return { resolvedId: requestedId, strategy: 'exact', node: exact };
    }

    const fuzzy = resolveNodeIdFromExistingIds(root, requestedId);
    if (fuzzy) {
      return { resolvedId: fuzzy, strategy: 'fuzzy_token', node: findNode(root, fuzzy) ?? undefined };
    }

    const propMatch = searchNodeByProps(root, requestedId);
    if (propMatch) {
      return { resolvedId: propMatch, strategy: 'prop_search', node: findNode(root, propMatch) ?? undefined };
    }

    // Also try semanticTarget as fallback when requestedId failed all strategies
    if (instruction.semanticTarget && resolveSemanticTarget) {
      const semanticResult = resolveSemanticTarget(document, instruction.semanticTarget, selectedNodeId);
      if (semanticResult) {
        const semNode = findNode(root, semanticResult.nodeId);
        if (semNode) {
          return { resolvedId: semanticResult.nodeId, strategy: 'semantic_role', node: semNode };
        }
      }
    }
  }

  if (parentId && alias) {
    const parent = findNode(root, parentId);
    if (parent?.children) {
      const child = parent.children.find((c) => c.alias === alias);
      if (child) {
        return { resolvedId: child.id, strategy: 'structural', node: child };
      }
    }
  }

  const fallbackId = requestedId ?? instruction.semanticTarget ?? instruction.target ?? '';
  const error = buildNodeResolutionError(root, fallbackId);
  return { resolvedId: null, strategy: 'failed', error };
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
  const fallbackType =
    descriptor.alias === 'core.image'
      ? CORE_IMAGE_PROP_FALLBACKS.get(name)
      : undefined;
  const prop = descriptor.props.find((item) => item.name === name) ?? (
    fallbackType ? { name, type: fallbackType } : undefined
  );
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
  const fallbackPage = document.pages[0] as ThemeLayoutPage | undefined;
  return pageId
    ? document.pages.find((page) => page.id === pageId) ?? null
    : document.pages.find((page) => page.id === document.defaultPageId) ?? fallbackPage ?? null;
}

function slugNodeId(value: string): string {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'node';
}

function collectDocumentNodeIds(document: ThemeLayoutDocument): Set<string> {
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

function remapReferenceNodeId(
  referenceNodeId: string,
  referencePageId: string,
  pageId: string,
): string {
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
  return action.targetPageId === referencePageId
    ? { ...action, targetPageId: pageId }
    : action;
}

function isNavigateAction(
  interaction: ThemeLayoutTabInteraction,
): interaction is ThemeLayoutNavigateAction {
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
    onClick: rewriteNavigateActionTarget(interactions.onClick, referencePageId, pageId),
    onActionClick: rewriteNavigateActionTarget(interactions.onActionClick, referencePageId, pageId),
    onStatusClick: rewriteNavigateActionTarget(interactions.onStatusClick, referencePageId, pageId),
    onTabClick: rewriteTabInteractionTargets(interactions.onTabClick, referencePageId, pageId),
  };
}

function cloneReferenceNode(
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
    options.isRoot
      ? options.rootNodeId
      : remapReferenceNodeId(node.id, options.referencePageId, options.pageId),
    options.usedIds,
  );
  options.idMap.set(node.id, nextId);
  const cloned: ThemeLayoutNode = {
    ...structuredClone(node),
    id: nextId,
    interactions: rewriteInteractionTargets(
      node.interactions,
      options.referencePageId,
      options.pageId,
    ),
  };
  cloned.children = (node.children ?? [])
    .map((child) => cloneReferenceNode(child, { ...options, isRoot: false }))
    .filter((child): child is ThemeLayoutNode => Boolean(child));
  if (!cloned.children.length && !CONTAINER_ALIASES.has(cloned.alias)) {
    delete cloned.children;
  }
  return cloned;
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

function applyCreatePageFromReference(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
): ApplyOneResult {
  if (document.pages.some((page) => page.id === instruction.pageId)) {
    return { document, error: `Page id already exists: ${instruction.pageId}` };
  }
  const referencePage = document.pages.find((page) => page.id === instruction.referencePageId);
  if (!referencePage) {
    return { document, error: `Reference page not found: ${instruction.referencePageId}` };
  }

  const name = instruction.name.trim() || instruction.pageId;
  const requestedRootNodeId = instruction.rootNodeId?.trim();
  const rootNodeId =
    requestedRootNodeId === undefined || requestedRootNodeId.length === 0
      ? `${instruction.pageId}-screen`
      : requestedRootNodeId;
  if (
    instruction.referenceNodeUpdates !== undefined &&
    !Array.isArray(instruction.referenceNodeUpdates)
  ) {
    return { document, error: 'referenceNodeUpdates must be an array' };
  }
  if (
    instruction.omitReferenceNodeIds !== undefined &&
    !Array.isArray(instruction.omitReferenceNodeIds)
  ) {
    return { document, error: 'omitReferenceNodeIds must be an array' };
  }
  const idMap = new Map<string, string>();
  const usedIds = collectDocumentNodeIds(document);
  const omitIds = new Set(
    (instruction.omitReferenceNodeIds ?? [])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim()),
  );
  const root = cloneReferenceNode(referencePage.layout, {
    idMap,
    omitIds,
    pageId: instruction.pageId,
    referencePageId: referencePage.id,
    rootNodeId,
    usedIds,
    isRoot: true,
  });
  if (!root) {
    return { document, error: `Failed to clone reference page: ${referencePage.id}` };
  }

  const rootDescriptor = descriptorForAlias(document, root.alias);
  if (!rootDescriptor) {
    return { document, error: `Unknown component alias: ${root.alias}` };
  }
  const rootProps = coerceProps(rootDescriptor, {
    ...(instruction.rootProps ?? {}),
    title: stringifyPrimitive(instruction.rootProps?.title) || name,
  });
  if (rootProps.errors.length > 0) {
    return { document, error: rootProps.errors.join('; ') };
  }
  root.props = { ...(root.props ?? {}), ...rootProps.props };

  for (const update of instruction.referenceNodeUpdates ?? []) {
    const targetNodeId = idMap.get(update.referenceNodeId);
    if (!targetNodeId) {
      return { document, error: `Reference node was not cloned: ${update.referenceNodeId}` };
    }
    const target = findNode(root, targetNodeId);
    if (!target) {
      return { document, error: `Cloned node not found: ${targetNodeId}` };
    }
    const descriptor = descriptorForAlias(document, target.alias);
    if (!descriptor) {
      return { document, error: `Unknown component alias: ${target.alias}` };
    }
    const coerced = coerceProps(descriptor, update.props);
    if (coerced.errors.length > 0) {
      return { document, error: coerced.errors.join('; ') };
    }
    target.props = { ...(target.props ?? {}), ...coerced.props };
  }

  normalizeChildOrder(root);
  document.pages.push({ id: instruction.pageId, name, layout: root });
  if (instruction.activate !== false) {
    document.defaultPageId = instruction.pageId;
  }
  if (instruction.syncNavigation !== false) {
    syncPageNavigation(document);
  }
  syncRootLayout(document);
  return {
    document,
    message: `Created page ${name} from ${referencePage.name || referencePage.id}`,
    selectedNodeId: instruction.select === false ? undefined : root.id,
  };
}

function clonePatternNode(
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

function findParentNode(root: ThemeLayoutNode, targetId: string): ThemeLayoutNode | null {
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

function applyClonePatternItems(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'clone_pattern_items' }>,
): ApplyOneResult {
  const page = resolveTargetPage(document, instruction.pageId);
  if (!page) {
    return { document, error: `Page not found: ${instruction.pageId ?? document.defaultPageId}` };
  }
  const source = findNode(page.layout, instruction.sourceRootNodeId);
  if (!source) {
    return { document, error: `Pattern source node not found: ${instruction.sourceRootNodeId}` };
  }
  const parent = instruction.parentId ? findNode(page.layout, instruction.parentId) : findParentNode(page.layout, source.id);
  if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
    return { document, error: `Pattern parent node is invalid: ${instruction.parentId ?? ''}` };
  }
  parent.children ??= [];
  const sourceIndex = parent.children.findIndex((child) => child.id === source.id);
  if (sourceIndex < 0) {
    return { document, error: `Pattern source ${source.id} is not a direct child of parent ${parent.id}` };
  }

  if (instruction.replaceExisting !== false) {
    parent.children = parent.children.filter((child) => child.id === source.id || !child.id.startsWith(`${slugNodeId(source.id)}-item-`));
  }

  const usedIds = collectDocumentNodeIds(document);
  const clones: ThemeLayoutNode[] = [];
  for (const [itemIndex, item] of instruction.items.entries()) {
    const idMap = new Map<string, string>();
    const clone = clonePatternNode(source, {
      idMap,
      itemIndex,
      sourceRootNodeId: source.id,
      usedIds,
    });
    for (const field of instruction.fields) {
      const value = item[field.fieldKey] ?? item[field.prop];
      if (value === undefined) {
        if (field.required) {
          return { document, error: `Pattern item ${itemIndex + 1} missing required field: ${field.fieldKey}` };
        }
        continue;
      }
      const clonedNodeId = idMap.get(field.referenceNodeId);
      if (!clonedNodeId) {
        return { document, error: `Pattern field node was not cloned: ${field.referenceNodeId}` };
      }
      const target = findNode(clone, clonedNodeId);
      if (!target) {
        return { document, error: `Pattern cloned field node not found: ${clonedNodeId}` };
      }
      const descriptor = descriptorForAlias(document, target.alias);
      if (!descriptor) {
        return { document, error: `Unknown component alias: ${target.alias}` };
      }
      const coerced = coerceProps(descriptor, { [field.prop]: value });
      if (coerced.errors.length > 0) {
        return { document, error: coerced.errors.join('; ') };
      }
      target.props = { ...(target.props ?? {}), ...coerced.props };
    }
    clones.push(clone);
  }

  parent.children.splice(sourceIndex, 1, ...clones);
  normalizeChildOrder(parent);
  syncRootLayout(document);
  return {
    document,
    message: `Cloned pattern ${instruction.sourceRootNodeId} with ${clones.length} item(s)`,
    selectedNodeId: instruction.select === false ? undefined : clones[0]?.id ?? source.id,
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
  options?: ApplyEditorAiEditInstructionsOptions,
): ApplyOneResult {
  if (isSemanticEditorInstruction(instruction)) {
    const compiled = compileSemanticEditorInstruction(document, instruction);
    if (!compiled.success || !compiled.data) {
      return { document, error: JSON.stringify(compiled.error) };
    }
    let nextDocument = document;
    const messages: string[] = [];
    let selectedNodeId: string | null | undefined;
    for (const operation of compiled.data.operations) {
      const result = applyOneInstruction(nextDocument, operation, options);
      if (result.error) {
        return { document, error: result.error };
      }
      nextDocument = result.document;
      if (result.message) {messages.push(result.message);}
      if (result.selectedNodeId !== undefined) {selectedNodeId = result.selectedNodeId;}
    }
    return {
      document: nextDocument,
      message: messages.length ? `Semantic ${instruction.type}: ${messages.join('; ')}` : `Semantic ${instruction.type} compiled`,
      selectedNodeId,
    };
  }

  if (instruction.type === 'create_page') {
    return applyCreatePage(document, instruction);
  }
  if (instruction.type === 'create_page_from_reference') {
    return applyCreatePageFromReference(document, instruction);
  }
  if (instruction.type === 'clone_pattern_items') {
    return applyClonePatternItems(document, instruction);
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
    // semanticTarget as parentId takes priority over root default
    let effectiveParentId = instruction.parentId;
    if (!effectiveParentId && instruction.semanticTarget && options?.resolveSemanticTarget) {
      const semResult = options.resolveSemanticTarget(
        document,
        instruction.semanticTarget,
        options.selectedNodeId,
      );
      if (semResult) {
        effectiveParentId = semResult.nodeId;
      }
    }
    // Fall back to root only if neither parentId nor semanticTarget resolved
    effectiveParentId ??= page.layout.id;

    const parentResolution = multiStrategyResolveNodeId({
      root: page.layout,
      document,
      instruction,
      requestedId: effectiveParentId,
      selectedNodeId: options?.selectedNodeId,
      parentId: undefined,
      alias: undefined,
      resolveSemanticTarget: options?.resolveSemanticTarget,
    });
    if (!parentResolution.resolvedId || !parentResolution.node) {
      if (parentResolution.error) {
        return { document, error: JSON.stringify(parentResolution.error) };
      }
      return { document, error: `AI referenced unknown parentId: ${instruction.parentId ?? page.layout.id}` };
    }
    const parent = parentResolution.node;
    if (!CONTAINER_ALIASES.has(parent.alias)) {
      return { document, error: `Node ${parentResolution.resolvedId} (${parent.alias}) cannot receive children` };
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
      const targetResolution = multiStrategyResolveNodeId({
        root: page.layout,
        document,
        instruction,
        requestedId: instruction.targetId,
        selectedNodeId: options?.selectedNodeId,
        resolveSemanticTarget: options?.resolveSemanticTarget,
      });
      if (!targetResolution.resolvedId) {
        if (targetResolution.error) {
          return { document, error: JSON.stringify(targetResolution.error) };
        }
        return { document, error: `AI referenced unknown targetId: ${instruction.targetId}` };
      }
      const targetId = targetResolution.resolvedId;
      const index = parent.children.findIndex((child) => child.id === targetId);
      if (index >= 0) {
        parent.children.splice(instruction.position === 'before' ? index : index + 1, 0, built.node);
      } else {
        return {
          document,
          error: `Resolved targetId ${targetId} not found among children of ${parentResolution.resolvedId}`,
        };
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

  const nodeResolution = multiStrategyResolveNodeId({
    root: page.layout,
    document,
    instruction,
    requestedId: instruction.nodeId,
    selectedNodeId: options?.selectedNodeId,
    resolveSemanticTarget: options?.resolveSemanticTarget,
  });
  if (!nodeResolution.resolvedId || !nodeResolution.node) {
    if (nodeResolution.error) {
      return { document, error: JSON.stringify(nodeResolution.error) };
    }
    return { document, error: `Node not found: ${instruction.nodeId}` };
  }
  const nodeId = nodeResolution.resolvedId;
  const target = nodeResolution.node;

  if (instruction.type === 'update_props') {
    if (Object.keys(instruction.props).length === 0) {
      return { document, error: 'update_props requires at least one prop to update' };
    }
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
      const parentResolution = multiStrategyResolveNodeId({
        root: page.layout,
        document,
        instruction,
        requestedId: instruction.parentId,
        selectedNodeId: options?.selectedNodeId,
        resolveSemanticTarget: options?.resolveSemanticTarget,
      });
      if (parentResolution.resolvedId) {
        parentId = parentResolution.resolvedId;
      }
    }
    const parent = parentId ? findNode(page.layout, parentId) : null;
    if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
      return { document, error: `Invalid target parent: ${parentId ?? ''}` };
    }
    if (!removeNode(page.layout, nodeId)) {
      return { document, error: `Node not found: ${instruction.nodeId}` };
    }
    parent.children ??= [];
    parent.children.push(target);
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
  options?: ApplyEditorAiEditInstructionsOptions,
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

    const result = applyOneInstruction(currentDocument, instruction, options);
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
      applied,
      document: cloneDocument(document),
      errors: validation.errors.map((error) => (
        `Validation ${error.path}: ${error.message}`
      )),
      selectedNodeId,
      rollbackReason: 'validation',
    };
  }

  return { applied, document: currentDocument, errors, selectedNodeId };
}
