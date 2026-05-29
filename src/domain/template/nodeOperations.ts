import {
  CONTAINER_ALIASES,
  type FlatNode,
  HEIGHT_LOCKED_ALIASES,
  WIDTH_LOCKED_ALIASES,
} from './types';
import type {
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';

export function cloneDocument(document: ThemeLayoutDocument) {
  return normalizeThemeLayoutDocument(structuredClone(document));
}

export function createBlankDocument(document: ThemeLayoutDocument) {
  const next = cloneDocument(document);
  const blankLayout = structuredClone(next.layout);
  blankLayout.children = [];
  next.layout = blankLayout;
  next.pages = [
    {
      id: next.defaultPageId,
      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing --
       * empty string should fall through to next option */
      name:
        next.pageName?.trim() ||
        next.pages.find((page) => page.id === next.defaultPageId)?.name ||
        next.defaultPageId,
      /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
      layout: blankLayout,
    },
  ];
  return next;
}

export function flattenNodes(
  node: ThemeLayoutNode,
  depth = 0,
  parentId?: string,
): FlatNode[] {
  return [
    { node, depth, parentId },
    ...(node.children?.flatMap(
      (child) => flattenNodes(child, depth + 1, node.id),
    ) ?? []),
  ];
}

export function findNode(
  node: ThemeLayoutNode,
  targetId: string,
): ThemeLayoutNode | null {
  if (node.id === targetId) {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = findNode(child, targetId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findParentId(
  node: ThemeLayoutNode,
  targetId: string,
  parentId?: string,
): string | undefined {
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

export function removeNode(
  node: ThemeLayoutNode,
  targetId: string,
): boolean {
  if (!node.children?.length) {
    return false;
  }

  const index = node.children.findIndex((child) => child.id === targetId);
  if (index >= 0) {
    node.children.splice(index, 1);
    return true;
  }

  return node.children.some((child) => removeNode(child, targetId));
}

export function descriptorForAlias(
  document: ThemeLayoutDocument,
  alias: string,
): ThemeComponentDescriptor | null {
  // 1. Look up in the component catalog
  const catalog = document.components.find((c) => c.alias === alias);
  if (catalog) { return catalog; }

  // 2. Fall back to componentTemplates — build a synthetic descriptor
  const componentTemplates = (document as ThemeLayoutDocument & {
    componentTemplates?: Record<string, unknown>;
  }).componentTemplates;
  const template = componentTemplates?.[alias];
  if (template && typeof template === 'object' && 'root' in template) {
    const root = (template as { root: { alias: string } }).root;
    return {
      alias,
      name: (template as { displayName?: string }).displayName ?? alias,
      kind: CONTAINER_ALIASES.has(root.alias) ? 'layout' : 'component',
      description: `Custom component defined in componentTemplates`,
      props: [],
    };
  }

  return null;
}

export function toFieldString(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return '';
}

export function createNodeId(alias: string) {
  return `${alias.replace(/\./g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
}

export function canAcceptNestedDrop(
  node: ThemeLayoutNode,
  componentTemplates?: Record<string, unknown>,
): boolean {
  // 1. Known core containers
  if (CONTAINER_ALIASES.has(node.alias)) { return true; }

  // 2. Custom templates whose root alias is a known container
  if (componentTemplates) {
    const template = componentTemplates[node.alias];
    if (template && typeof template === 'object' && 'root' in template) {
      const rootAlias = (template as { root: { alias: string } }).root.alias;
      if (rootAlias && CONTAINER_ALIASES.has(rootAlias)) {
        return true;
      }
    }
  }

  // 3. If the node already has children in the document, it's a container
  if (Array.isArray(node.children) && node.children.length > 0) {
    return true;
  }

  return false;
}

export function getNodeCapabilities(
  node: ThemeLayoutNode,
  descriptor: ThemeComponentDescriptor | null,
  rootId: string,
) {
  const isRoot = node.id === rootId;
  const canDragAbsolute = !isRoot && node.layout.mode === 'absolute';
  const canReorderRelative =
    !isRoot && node.layout.mode !== 'absolute';
  const canResizeWidth =
    !isRoot && !WIDTH_LOCKED_ALIASES.has(node.alias);
  const isCardLike = node.alias.includes('card');
  const canResizeHeight =
    !isRoot &&
    !HEIGHT_LOCKED_ALIASES.has(node.alias) &&
    (node.layout.mode === 'absolute' ||
      descriptor?.kind === 'layout' ||
      isCardLike);

  return {
    canDragAbsolute,
    canReorderRelative,
    canResizeWidth,
    canResizeHeight,
  };
}
