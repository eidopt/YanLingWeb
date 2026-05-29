import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ThemeLayoutNodeInteractions,
  ThemeLayoutTabInteraction,
} from '../../layout/types';
import { aiEditInstructionsContent as c } from './aiEditInstructions.content';
import {
  buildNodeFromDraft,
  cloneDocument,
  CONTAINER_ALIASES,
  createDraft,
  createLibrarySampleChildren,
  descriptorForAlias,
  type DropIndicatorAxis,
  findNode,
  findParentId,
  FOOTER_ALIASES,
  insertNodeRelativeToTargetInDocument,
  moveNodeWithinParentInDocument,
  nextRootFlowRow,
  normalizeChildOrder,
  normalizeGridChildren,
  normalizeRootRows,
  removeNode,
  updateNodeInDocument,
  upsertNode,
} from './layoutBuilderService';
import { resolveSemanticTargetNodeId } from './semanticTargets';

interface EditorAiInstructionTarget {
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

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
  | ({
      type: 'sync_page_navigation';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'sync_footer_tabs';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'insert_node';
      alias: string;
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: DropIndicatorAxis;
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
      axis?: DropIndicatorAxis;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'delete_node';
      nodeId: string;
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_interactions';
      nodeId: string;
      interactions: Partial<ThemeLayoutNodeInteractions>;
      select?: boolean;
    } & EditorAiInstructionTarget);

export interface ApplyEditorAiEditInstructionsResult {
  applied: string[];
  document: ThemeLayoutDocument;
  errors: string[];
  selectedNodeId?: string | null;
}

export interface ApplyEditorAiEditInstructionsOptions {
  userPrompt?: string;
  reason?: string;
  selectedNodeId?: string | null;
}

interface ApplyOneResult {
  document: ThemeLayoutDocument;
  error?: string;
  message?: string;
  selectedNodeId?: string | null;
}

type NodeIdAliases = Map<string, string>;

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

const SIZE_LAYOUT_KEYS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;

const GRID_LAYOUT_KEYS = ['gridColumn', 'gridRow'] as const;
const ALIGN_VALUES = new Set(['auto', 'start', 'center', 'end', 'stretch']);

function stringifyPropValue(value: unknown) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSizeValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
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

  GRID_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (typeof value === 'string') {
      next[key] = value;
    }
  });

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
  if (typeof frame.x === 'number') {
    next.x = frame.x;
  }
  if (typeof frame.y === 'number') {
    next.y = frame.y;
  }
  if (isSizeValue(frame.left)) {
    next.left = frame.left;
  }
  if (isSizeValue(frame.top)) {
    next.top = frame.top;
  }
  if (isSizeValue(frame.right)) {
    next.right = frame.right;
  }
  if (isSizeValue(frame.bottom)) {
    next.bottom = frame.bottom;
  }
  if (isSizeValue(frame.width)) {
    next.width = frame.width;
  }
  if (isSizeValue(frame.height)) {
    next.height = frame.height;
  }
  if (isSizeValue(frame.minWidth)) {
    next.minWidth = frame.minWidth;
  }
  if (isSizeValue(frame.minHeight)) {
    next.minHeight = frame.minHeight;
  }
  if (isSizeValue(frame.maxWidth)) {
    next.maxWidth = frame.maxWidth;
  }
  if (isSizeValue(frame.maxHeight)) {
    next.maxHeight = frame.maxHeight;
  }
  if (typeof frame.zIndex === 'number') {
    next.zIndex = frame.zIndex;
  }
  if (frame.unit === 'px' || frame.unit === '%') {
    next.unit = frame.unit;
  }
  return next;
}

function coercePropValue(
  descriptor: ThemeComponentDescriptor,
  name: string,
  value: unknown,
): { error?: string; value?: unknown } {
  const fallbackType = descriptor.alias === 'core.image' ? CORE_IMAGE_PROP_FALLBACKS.get(name) : undefined;
  const prop =
    descriptor.props.find((item) => item.name === name) ?? (fallbackType ? { name, type: fallbackType } : undefined);
  if (!prop) {
    return { error: c.propNotInComponent(name, descriptor.alias) };
  }

  if (prop.type === 'boolean') {
    return { value: Boolean(value) };
  }

  if (prop.type === 'number') {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return { error: c.propNeedsNumber(name) };
    }
    return { value: numericValue };
  }

  if (prop.type === 'string[]') {
    if (Array.isArray(value)) {
      return {
        value: value.map((item) => String(item).trim()).filter(Boolean),
      };
    }

    if (typeof value === 'string') {
      return {
        value: value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    return { error: c.propNeedsStringArray(name) };
  }

  if (prop.type === 'object') {
    if (isPlainObject(value)) {
      return { value };
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (isPlainObject(parsed)) {
          return { value: parsed };
        }
      } catch {
        return { error: c.propNeedsObject(name) };
      }
    }

    return { error: c.propNeedsObject(name) };
  }

  const stringValue = stringifyPropValue(value);
  if (prop.enum?.length && !prop.enum.includes(stringValue)) {
    return {
      error: c.propEnumRequired(name, prop.enum),
    };
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

function sanitizeNavigateAction(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return { type: 'navigate' as const, targetPageId: value.trim() };
  }

  if (!isPlainObject(value)) {
    return null;
  }

  return (value.type === 'navigate' || !value.type) && typeof value.targetPageId === 'string'
    ? { type: 'navigate' as const, targetPageId: value.targetPageId }
    : null;
}

function sanitizeTabInteraction(value: unknown): ThemeLayoutTabInteraction | null {
  const directAction = sanitizeNavigateAction(value);
  if (directAction) {
    return directAction;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .map(([label, action]) => [label, sanitizeNavigateAction(action)] as const)
    .filter((entry): entry is readonly [string, { type: 'navigate'; targetPageId: string }] => Boolean(entry[1]));

  return entries.length ? Object.fromEntries(entries) : null;
}

function sanitizeInteractionsPatch(interactions: Partial<ThemeLayoutNodeInteractions> | undefined) {
  const next: Partial<ThemeLayoutNodeInteractions> = {};
  if (!interactions) {
    return next;
  }

  const onClick = sanitizeNavigateAction(interactions.onClick);
  if (onClick) {
    next.onClick = onClick;
  }

  const onActionClick = sanitizeNavigateAction(interactions.onActionClick);
  if (onActionClick) {
    next.onActionClick = onActionClick;
  }

  const onStatusClick = sanitizeNavigateAction(interactions.onStatusClick);
  if (onStatusClick) {
    next.onStatusClick = onStatusClick;
  }

  const onTabClick = sanitizeTabInteraction(interactions.onTabClick);
  if (onTabClick) {
    next.onTabClick = onTabClick;
  }

  if (Object.keys(next).length === 0) {
    const implicitTabClick = sanitizeTabInteraction(interactions);
    if (implicitTabClick) {
      next.onTabClick = implicitTabClick;
    }
  }

  return next;
}

function findFooterTabsNode(node: ThemeLayoutNode): ThemeLayoutNode | null {
  if (node.alias === 'core.tabs' && node.slot === 'footer') {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = findFooterTabsNode(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function normalizeParentAfterChange(document: ThemeLayoutDocument, parentId: string) {
  const parent = findNode(document.layout, parentId);
  if (!parent) {
    return;
  }

  if (parent.id === document.layout.id) {
    normalizeRootRows(document.layout);
    return;
  }

  if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
    return;
  }

  normalizeChildOrder(parent);
}

function canInsertIntoParent(document: ThemeLayoutDocument, parentId: string) {
  const parent = findNode(document.layout, parentId);
  return Boolean(parent && CONTAINER_ALIASES.has(parent.alias));
}

function resolveAliasId(nodeId: string | undefined, aliases: NodeIdAliases) {
  if (!nodeId) {
    return nodeId;
  }

  return aliases.get(nodeId) ?? nodeId;
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

function collectNodeIds(node: ThemeLayoutNode, output: string[] = []) {
  output.push(node.id);
  node.children?.forEach((child) => collectNodeIds(child, output));
  return output;
}

function normalizeNodeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function nodeIdTokens(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_NODE_ID_TOKENS.has(token));
}

function commonPrefixRatio(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return max > 0 ? index / max : 0;
}

function scoreNodeIdMatch(requestedId: string, existingId: string) {
  const requested = normalizeNodeId(requestedId);
  const existing = normalizeNodeId(existingId);
  if (!requested || !existing) {
    return 0;
  }
  if (requested === existing) {
    return 1;
  }
  if (requested.length >= 4 && existing.length >= 4 && (requested.includes(existing) || existing.includes(requested))) {
    return 0.92;
  }

  const requestedTokens = nodeIdTokens(requestedId);
  const existingTokens = nodeIdTokens(existingId);
  if (!requestedTokens.length || !existingTokens.length) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const existingTokenSet = new Set(existingTokens);
  const overlap = requestedTokens.filter((token) => existingTokenSet.has(token)).length;
  if (overlap === 0) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const union = new Set([...requestedTokens, ...existingTokens]).size;
  const containment = overlap / requestedTokens.length;
  const jaccard = overlap / union;
  return Math.max(jaccard, containment * 0.9);
}

function resolveNodeIdFromExistingIds(document: ThemeLayoutDocument, requestedId: string) {
  const candidates = collectNodeIds(document.layout)
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
  if (candidates.length > 1 && best.score - second.score < MIN_NODE_ID_MATCH_GAP) {
    return null;
  }
  return best.nodeId;
}

function resolveInstructionIds(instruction: EditorAiEditInstruction, aliases: NodeIdAliases): EditorAiEditInstruction {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
    case 'delete_page':
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return instruction;
    case 'insert_node':
      return {
        ...instruction,
        parentId: resolveAliasId(instruction.parentId, aliases),
        targetId: resolveAliasId(instruction.targetId, aliases),
      };
    case 'clone_pattern_items':
      return {
        ...instruction,
        sourceRootNodeId: resolveAliasId(instruction.sourceRootNodeId, aliases) ?? instruction.sourceRootNodeId,
        parentId: resolveAliasId(instruction.parentId, aliases),
      };
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
      };
    case 'move_node':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
        parentId: resolveAliasId(instruction.parentId, aliases),
        targetId: resolveAliasId(instruction.targetId, aliases),
      };
    case 'update_interactions':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
      };
  }
}

function getInstructionSemanticTarget(instruction: EditorAiEditInstruction) {
  return typeof instruction.semanticTarget === 'string' && instruction.semanticTarget.trim()
    ? instruction.semanticTarget
    : typeof instruction.target === 'string' && instruction.target.trim()
      ? instruction.target
      : undefined;
}

function stringifyInstructionForSemanticTarget(instruction: EditorAiEditInstruction) {
  try {
    return JSON.stringify(instruction);
  } catch {
    return instruction.type;
  }
}

function resolveSemanticNodeId(
  document: ThemeLayoutDocument,
  currentNodeId: string | undefined,
  instruction: EditorAiEditInstruction,
  options: ApplyEditorAiEditInstructionsOptions | undefined,
  fieldName: string,
) {
  if (currentNodeId) {
    return findNode(document.layout, currentNodeId)
      ? currentNodeId
      : (resolveNodeIdFromExistingIds(document, currentNodeId) ?? currentNodeId);
  }

  const semanticTarget = getInstructionSemanticTarget(instruction);
  if (!semanticTarget) {
    return currentNodeId;
  }

  const text = [
    options?.userPrompt,
    options?.reason,
    semanticTarget,
    currentNodeId,
    fieldName,
    stringifyInstructionForSemanticTarget(instruction),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    resolveSemanticTargetNodeId(document, {
      target: semanticTarget,
      text,
      selectedNodeId: options?.selectedNodeId,
    })?.nodeId ?? currentNodeId
  );
}

function resolveInstructionSemanticTargets(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
  options?: ApplyEditorAiEditInstructionsOptions,
): EditorAiEditInstruction {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
    case 'delete_page':
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return instruction;
    case 'insert_node':
      return {
        ...instruction,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
        targetId: resolveSemanticNodeId(document, instruction.targetId, instruction, options, 'targetId'),
      };
    case 'clone_pattern_items':
      return {
        ...instruction,
        sourceRootNodeId:
          resolveSemanticNodeId(document, instruction.sourceRootNodeId, instruction, options, 'sourceRootNodeId') ??
          instruction.sourceRootNodeId,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
      };
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
    case 'update_interactions':
      return {
        ...instruction,
        nodeId:
          resolveSemanticNodeId(document, instruction.nodeId, instruction, options, 'nodeId') ?? instruction.nodeId,
      };
    case 'move_node':
      return {
        ...instruction,
        nodeId:
          resolveSemanticNodeId(document, instruction.nodeId, instruction, options, 'nodeId') ?? instruction.nodeId,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
        targetId: resolveSemanticNodeId(document, instruction.targetId, instruction, options, 'targetId'),
      };
  }
}

function resolveInsertionParentId(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'insert_node' }>,
) {
  if (
    instruction.position === 'inside_end' &&
    instruction.targetId &&
    canInsertIntoParent(document, instruction.targetId)
  ) {
    return instruction.targetId;
  }

  if (instruction.parentId) {
    return instruction.parentId;
  }

  if (instruction.targetId && instruction.position && instruction.position !== 'inside_end') {
    const targetParentId = findParentId(document.layout, instruction.targetId);
    if (targetParentId && canInsertIntoParent(document, targetParentId)) {
      return targetParentId;
    }
  }

  const requestedParentId = instruction.parentId ?? document.layout.id;
  if (canInsertIntoParent(document, requestedParentId)) {
    return requestedParentId;
  }

  return requestedParentId;
}

function buildInsertedNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'insert_node' }>,
) {
  const descriptor = descriptorForAlias(document, instruction.alias);
  if (!descriptor) {
    return { error: c.missingComponentAlias(instruction.alias) };
  }

  if (instruction.nodeId && findNode(document.layout, instruction.nodeId)) {
    return { error: c.duplicateNodeId(instruction.nodeId) };
  }

  if (instruction.parentId && !findNode(document.layout, instruction.parentId)) {
    return {
      error: c.missingParentId(instruction.parentId),
    };
  }

  if (instruction.targetId && !findNode(document.layout, instruction.targetId)) {
    return {
      error: c.missingTargetId(instruction.targetId),
    };
  }

  const parentId = resolveInsertionParentId(document, instruction);
  if (!canInsertIntoParent(document, parentId)) {
    return { error: c.parentCannotReceiveChildren(parentId) };
  }

  const slot = parentId === document.layout.id && FOOTER_ALIASES.has(descriptor.alias) ? 'footer' : 'body';
  const draft = createDraft(
    document.themeId,
    descriptor,
    parentId,
    slot,
    undefined,
    parentId === document.layout.id && slot === 'body' ? nextRootFlowRow(document.layout) : 0,
  );
  draft.nodeId = instruction.nodeId;

  const sampleChildren =
    descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack'
      ? createLibrarySampleChildren(document, descriptor.alias)
      : undefined;
  const nextNode = buildNodeFromDraft(descriptor, draft, sampleChildren);
  const coerced = coerceProps(descriptor, instruction.props);
  if (coerced.errors.length) {
    return { error: coerced.errors.join(c.errorDelimiter) };
  }

  nextNode.props = { ...(nextNode.props ?? {}), ...coerced.props };
  nextNode.layout = {
    ...nextNode.layout,
    ...sanitizeLayoutPatch(instruction.layout),
  };
  const framePatch = sanitizeFramePatch(instruction.frame);
  if (Object.keys(framePatch).length > 0) {
    nextNode.layout.mode = 'absolute';
    nextNode.frame = {
      position: 'absolute',
      ...nextNode.frame,
      ...framePatch,
    };
  }

  return { node: nextNode, parentId };
}

function applyRootScreenInsert(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'insert_node' }>,
): ApplyOneResult {
  const descriptor = descriptorForAlias(document, 'core.screen');
  if (!descriptor) {
    return { document, error: c.missingComponentDescriptor('core.screen') };
  }

  const coerced = coerceProps(descriptor, instruction.props);
  if (coerced.errors.length) {
    return { document, error: coerced.errors.join(c.errorDelimiter) };
  }

  const nextDocument = cloneDocument(document);
  nextDocument.layout.props = {
    ...(nextDocument.layout.props ?? {}),
    ...coerced.props,
  };
  nextDocument.layout.layout = {
    ...nextDocument.layout.layout,
    ...sanitizeLayoutPatch(instruction.layout),
  };

  const framePatch = sanitizeFramePatch(instruction.frame);
  if (Object.keys(framePatch).length > 0) {
    nextDocument.layout.layout.mode = 'absolute';
    nextDocument.layout.frame = {
      position: 'absolute',
      ...nextDocument.layout.frame,
      ...framePatch,
    };
  }

  nextDocument.layout.children = [];
  normalizeRootRows(nextDocument.layout);

  return {
    document: nextDocument,
    message: c.updateCurrentCanvasWithNewPage,
    selectedNodeId: instruction.select === false ? undefined : nextDocument.layout.id,
  };
}

function applyInsertNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'insert_node' }>,
): ApplyOneResult {
  if (instruction.alias === 'core.screen') {
    return applyRootScreenInsert(document, instruction);
  }

  const built = buildInsertedNode(document, instruction);
  if ('error' in built) {
    return { document, error: built.error };
  }

  const { node, parentId } = built;
  const nextDocument =
    instruction.targetId && instruction.position && instruction.position !== 'inside_end'
      ? insertNodeRelativeToTargetInDocument(
          document,
          parentId,
          node,
          instruction.targetId,
          instruction.position,
          instruction.axis ?? 'vertical',
        )
      : upsertNode(document, parentId, node);

  if (!nextDocument) {
    return { document, error: c.cannotInsertNode(instruction.alias) };
  }

  return {
    document: nextDocument,
    message: c.insertedNode(instruction.alias),
    selectedNodeId: instruction.select === false ? undefined : node.id,
  };
}

function applyUpdateProps(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'update_props' }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: c.missingNode(instruction.nodeId) };
  }

  const descriptor = descriptorForAlias(document, node.alias);
  if (!descriptor) {
    return { document, error: c.missingComponentDescriptor(node.alias) };
  }

  const coerced = coerceProps(descriptor, instruction.props);
  if (coerced.errors.length) {
    return { document, error: coerced.errors.join(c.errorDelimiter) };
  }

  const nextDocument = updateNodeInDocument(document, instruction.nodeId, (draft) => {
    draft.props = { ...(draft.props ?? {}), ...coerced.props };
  });
  if (!nextDocument) {
    return { document, error: c.cannotUpdateNode(instruction.nodeId) };
  }

  return {
    document: nextDocument,
    message: c.updatedProps(instruction.nodeId),
    selectedNodeId: instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applySetLayout(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'set_layout' }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: c.missingNode(instruction.nodeId) };
  }

  const patch = sanitizeLayoutPatch(instruction.layout);
  const nextDocument = updateNodeInDocument(document, instruction.nodeId, (draft) => {
    draft.layout = { ...draft.layout, ...patch };
  });
  if (!nextDocument) {
    return { document, error: c.cannotUpdateLayout(instruction.nodeId) };
  }

  return {
    document: nextDocument,
    message: c.updatedLayout(instruction.nodeId),
    selectedNodeId: instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applySetFrame(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'set_frame' }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: c.missingNode(instruction.nodeId) };
  }

  const patch = sanitizeFramePatch(instruction.frame);
  const nextDocument = updateNodeInDocument(document, instruction.nodeId, (draft) => {
    draft.layout = { ...draft.layout, mode: 'absolute' };
    draft.frame = {
      position: 'absolute',
      ...draft.frame,
      ...patch,
    };
  });
  if (!nextDocument) {
    return { document, error: c.cannotUpdateFrame(instruction.nodeId) };
  }

  return {
    document: nextDocument,
    message: c.updatedFrame(instruction.nodeId),
    selectedNodeId: instruction.select === false ? undefined : instruction.nodeId,
  };
}

function moveNodeToParentEnd(document: ThemeLayoutDocument, nodeId: string, parentId: string) {
  const nextDocument = cloneDocument(document);
  const currentParentId = findParentId(nextDocument.layout, nodeId);
  const movingNode = findNode(nextDocument.layout, nodeId);
  const targetParent = findNode(nextDocument.layout, parentId);
  if (!currentParentId || !movingNode || !targetParent) {
    return null;
  }
  if (!CONTAINER_ALIASES.has(targetParent.alias)) {
    return null;
  }

  const previousParentId = currentParentId;
  const movingClone: ThemeLayoutNode = structuredClone(movingNode);
  removeNode(nextDocument.layout, nodeId);
  targetParent.children ??= [];
  targetParent.children.push(movingClone);

  if (targetParent.id === nextDocument.layout.id) {
    movingClone.layout.flowRow = nextRootFlowRow(nextDocument.layout);
  }

  normalizeParentAfterChange(nextDocument, previousParentId);
  normalizeParentAfterChange(nextDocument, parentId);
  return nextDocument;
}

function applyMoveNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'move_node' }>,
): ApplyOneResult {
  if (instruction.nodeId === document.layout.id) {
    return { document, error: c.cannotMoveRoot };
  }

  const nextDocument =
    instruction.targetId && instruction.position !== 'inside_end'
      ? moveNodeWithinParentInDocument(
          document,
          instruction.nodeId,
          instruction.targetId,
          instruction.position ?? 'after',
        )
      : instruction.parentId
        ? moveNodeToParentEnd(document, instruction.nodeId, instruction.parentId)
        : null;

  if (!nextDocument) {
    return { document, error: c.cannotMoveNode(instruction.nodeId) };
  }

  return {
    document: nextDocument,
    message: c.movedNode(instruction.nodeId),
    selectedNodeId: instruction.select === false ? undefined : instruction.nodeId,
  };
}

function applyDeleteNode(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'delete_node' }>,
): ApplyOneResult {
  if (instruction.nodeId === document.layout.id) {
    return { document, error: c.cannotDeleteRoot };
  }

  const nextDocument = cloneDocument(document);
  const parentId = findParentId(nextDocument.layout, instruction.nodeId);
  if (!parentId || !removeNode(nextDocument.layout, instruction.nodeId)) {
    return { document, error: c.missingNode(instruction.nodeId) };
  }
  normalizeParentAfterChange(nextDocument, parentId);

  return {
    document: nextDocument,
    message: c.deletedNode(instruction.nodeId),
    selectedNodeId: null,
  };
}

function applyUpdateInteractions(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'update_interactions' }>,
): ApplyOneResult {
  const node = findNode(document.layout, instruction.nodeId);
  if (!node) {
    return { document, error: c.missingNode(instruction.nodeId) };
  }

  const patch = sanitizeInteractionsPatch(instruction.interactions);
  if (Object.keys(patch).length === 0) {
    return { document, error: c.cannotUpdateInteraction(instruction.nodeId) };
  }

  const targetNode = node.alias === 'core.screen' && patch.onTabClick ? (findFooterTabsNode(node) ?? node) : node;

  const nextDocument = updateNodeInDocument(document, targetNode.id, (draft) => {
    draft.interactions = {
      ...(draft.interactions ?? {}),
      ...patch,
    };
  });
  if (!nextDocument) {
    return { document, error: c.cannotUpdateInteraction(instruction.nodeId) };
  }

  return {
    document: nextDocument,
    message: c.updatedInteraction(targetNode.id),
    selectedNodeId: instruction.select === false ? undefined : targetNode.id,
  };
}

function slugNodeId(value: string) {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'node';
}

function collectDocumentNodeIds(document: ThemeLayoutDocument) {
  const ids = new Set<string>();
  const walk = (node: ThemeLayoutNode) => {
    ids.add(node.id);
    node.children?.forEach(walk);
  };
  walk(document.layout);
  document.pages.forEach((page) => walk(page.layout));
  return ids;
}

function uniqueNodeId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${String(suffix)}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function remapPatternNodeId(referenceNodeId: string, sourceRootNodeId: string, itemIndex: number) {
  const prefix = `${slugNodeId(sourceRootNodeId)}-item-${String(itemIndex + 1)}`;
  if (referenceNodeId === sourceRootNodeId) {
    return prefix;
  }
  if (referenceNodeId.startsWith(`${sourceRootNodeId}-`)) {
    return `${prefix}-${slugNodeId(referenceNodeId.slice(sourceRootNodeId.length + 1))}`;
  }
  return `${prefix}-${slugNodeId(referenceNodeId)}`;
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
  if (
    instruction.pageId &&
    instruction.pageId !== document.defaultPageId &&
    !document.pages.some((page) => page.id === instruction.pageId)
  ) {
    return { document, error: `Page not found: ${instruction.pageId}` };
  }

  const nextDocument = cloneDocument(document);
  const source = findNode(nextDocument.layout, instruction.sourceRootNodeId);
  if (!source) {
    return { document, error: `Pattern source node not found: ${instruction.sourceRootNodeId}` };
  }

  const parent = instruction.parentId
    ? findNode(nextDocument.layout, instruction.parentId)
    : findParentNode(nextDocument.layout, source.id);
  if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
    return { document, error: `Pattern parent node is invalid: ${instruction.parentId ?? ''}` };
  }
  parent.children ??= [];

  if (instruction.replaceExisting !== false) {
    parent.children = parent.children.filter(
      (child) => child.id === source.id || !child.id.startsWith(`${slugNodeId(source.id)}-item-`),
    );
  }

  const sourceIndex = parent.children.findIndex((child) => child.id === source.id);
  if (sourceIndex < 0) {
    return {
      document,
      error: `Pattern source ${source.id} is not a direct child of parent ${parent.id}`,
    };
  }

  const usedIds = collectDocumentNodeIds(nextDocument);
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
          return {
            document,
            error: `Pattern item ${String(itemIndex + 1)} missing required field: ${field.fieldKey}`,
          };
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
      const descriptor = descriptorForAlias(nextDocument, target.alias);
      if (!descriptor) {
        return { document, error: `Unknown component alias: ${target.alias}` };
      }
      const coerced = coerceProps(descriptor, { [field.prop]: value });
      if (coerced.errors.length) {
        return { document, error: coerced.errors.join('; ') };
      }
      target.props = { ...(target.props ?? {}), ...coerced.props };
    }
    clones.push(clone);
  }

  parent.children.splice(sourceIndex, 1, ...clones);
  normalizeChildOrder(parent);
  if (nextDocument.pages[0]) {
    nextDocument.pages[0].layout = nextDocument.layout;
  }

  return {
    document: nextDocument,
    message: `Cloned pattern ${instruction.sourceRootNodeId} with ${String(clones.length)} item(s)`,
    selectedNodeId: instruction.select === false ? undefined : (clones[0]?.id ?? null),
  };
}

function applyOneInstruction(document: ThemeLayoutDocument, instruction: EditorAiEditInstruction): ApplyOneResult {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
      return { document, error: c.createPageNeedsPageContext };
    case 'delete_page':
      return { document, error: c.deletePageNeedsPageContext };
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return { document, error: c.syncNavigationNeedsPageContext };
    case 'insert_node':
      return applyInsertNode(document, instruction);
    case 'clone_pattern_items':
      return applyClonePatternItems(document, instruction);
    case 'update_props':
      return applyUpdateProps(document, instruction);
    case 'set_layout':
      return applySetLayout(document, instruction);
    case 'set_frame':
      return applySetFrame(document, instruction);
    case 'move_node':
      return applyMoveNode(document, instruction);
    case 'delete_node':
      return applyDeleteNode(document, instruction);
    case 'update_interactions':
      return applyUpdateInteractions(document, instruction);
    default:
      return { document, error: c.unknownInstruction };
  }
}

export function applyEditorAiEditInstructions(
  document: ThemeLayoutDocument,
  instructions: readonly EditorAiEditInstruction[],
  options?: ApplyEditorAiEditInstructionsOptions,
): ApplyEditorAiEditInstructionsResult {
  let currentDocument = cloneDocument(document);
  const nodeIdAliases: NodeIdAliases = new Map();
  const applied: string[] = [];
  const errors: string[] = [];
  let selectedNodeId: string | null | undefined;
  let aborted = false;

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    if (instruction.type === 'insert_node' && instruction.alias === 'core.screen' && instruction.nodeId) {
      nodeIdAliases.set(instruction.nodeId, currentDocument.layout.id);
    }

    const resolvedInstruction = resolveInstructionIds(instruction, nodeIdAliases);
    const semanticResolvedInstruction = resolveInstructionSemanticTargets(
      currentDocument,
      resolvedInstruction,
      options,
    );
    const result = applyOneInstruction(currentDocument, semanticResolvedInstruction);
    currentDocument = result.document;
    if (result.error) {
      errors.push(c.instructionFailed(index, result.error));
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

  return {
    applied,
    document: currentDocument,
    errors,
    selectedNodeId,
  };
}
