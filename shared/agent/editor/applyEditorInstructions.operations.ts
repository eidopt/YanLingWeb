import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import type { EditorAiEditInstruction } from './applyEditorInstructions';
import {
  type ApplyOneResult,
  clonePatternNode,
  cloneReferenceNode,
  coerceProps,
  collectDocumentNodeIds,
  CONTAINER_ALIASES,
  descriptorForAlias,
  findNode,
  findParentNode,
  normalizeChildOrder,
  resolveTargetPage,
  sanitizeLayoutPatch,
  slugNodeIdForPattern,
  stringifyPrimitive,
  syncPageNavigation,
  syncRootLayout,
} from './applyEditorInstructions.helpers';

export function applyCreatePage(
  document: ThemeLayoutDocument,
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page' }>,
): ApplyOneResult {
  if (document.pages.some((page) => page.id === instruction.pageId)) {
    return { document, error: `Page id already exists: ${instruction.pageId}` };
  }
  const requestedName = instruction.name?.trim();
  const name = requestedName === undefined || requestedName.length === 0 ? instruction.pageId : requestedName;
  const requestedRootNodeId = instruction.rootNodeId?.trim();
  const titleValue = stringifyPrimitive(instruction.props?.title) || name;
  const root: ThemeLayoutNode = {
    id:
      requestedRootNodeId === undefined || requestedRootNodeId.length === 0
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

export function applyCreatePageFromReference(
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
  if (instruction.referenceNodeUpdates !== undefined && !Array.isArray(instruction.referenceNodeUpdates)) {
    return { document, error: 'referenceNodeUpdates must be an array' };
  }
  if (instruction.omitReferenceNodeIds !== undefined && !Array.isArray(instruction.omitReferenceNodeIds)) {
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

export function applyClonePatternItems(
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
  const parent = instruction.parentId
    ? findNode(page.layout, instruction.parentId)
    : findParentNode(page.layout, source.id);
  if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
    return { document, error: `Pattern parent node is invalid: ${instruction.parentId ?? ''}` };
  }
  parent.children ??= [];
  const sourceIndex = parent.children.findIndex((child) => child.id === source.id);
  if (sourceIndex < 0) {
    return { document, error: `Pattern source ${source.id} is not a direct child of parent ${parent.id}` };
  }

  if (instruction.replaceExisting !== false) {
    parent.children = parent.children.filter(
      (child) => child.id === source.id || !child.id.startsWith(`${slugNodeIdForPattern(source.id)}-item-`),
    );
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
    selectedNodeId: instruction.select === false ? undefined : (clones[0]?.id ?? source.id),
  };
}

export function applyDeletePage(
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
