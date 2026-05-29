import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import { applyClonePatternItems } from './aiEditInstructions.clonePattern';
import { aiEditInstructionsContent as c } from './aiEditInstructions.content';
import {
  coerceProps,
  sanitizeFramePatch,
  sanitizeInteractionsPatch,
  sanitizeLayoutPatch,
} from './aiEditInstructions.sanitize';
import type { ApplyOneResult, EditorAiEditInstruction } from './aiEditInstructions.types';
import {
  buildNodeFromDraft,
  cloneDocument,
  CONTAINER_ALIASES,
  createDraft,
  createLibrarySampleChildren,
  descriptorForAlias,
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
} from 'domain/template';

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

export function applyOneInstruction(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
): ApplyOneResult {
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
