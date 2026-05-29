import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import { coerceProps } from './aiEditInstructions.sanitize';
import type { ApplyOneResult, EditorAiEditInstruction } from './aiEditInstructions.types';
import { cloneDocument, CONTAINER_ALIASES, descriptorForAlias, findNode, normalizeChildOrder } from 'domain/template';

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

export function applyClonePatternItems(
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
