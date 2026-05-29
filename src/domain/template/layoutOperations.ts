import { cloneDocument, findNode, findParentId, removeNode } from './nodeOperations';
import type { DropIndicatorAxis } from './types';
import type { ThemeLayoutDocument, ThemeLayoutNode } from 'ui/layout/types';

export function nextRootFlowRow(root: ThemeLayoutNode) {
  return (root.children ?? []).reduce((maxRow, child, index) => {
    if (child.slot === 'footer') {
      return maxRow;
    }

    return Math.max(maxRow, child.layout.flowRow ?? index + 1);
  }, 0) + 1;
}

export function moveNodeWithinParentInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  const nextDocument = cloneDocument(document);
  const parentId = findParentId(nextDocument.layout, nodeId);
  const targetParentId = findParentId(nextDocument.layout, targetId);
  if (!parentId || parentId !== targetParentId) {
    return null;
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent?.children) {
    return null;
  }

  const fromIndex = parent.children.findIndex(
    (child) => child.id === nodeId,
  );
  const targetIndex = parent.children.findIndex(
    (child) => child.id === targetId,
  );
  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }

  const [movingNode] = parent.children.splice(fromIndex, 1);
  let insertIndex = targetIndex + (position === 'after' ? 1 : 0);
  if (fromIndex < insertIndex) {
    insertIndex -= 1;
  }

  parent.children.splice(insertIndex, 0, movingNode);
  if (parent.id === nextDocument.layout.id) {
    const targetNode = parent.children.find(
      (child) => child.id === targetId,
    );
    if (targetNode) {
      movingNode.layout.flowRow = targetNode.layout.flowRow;
    }
    normalizeRootRows(nextDocument.layout);
  } else if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }

  return nextDocument;
}

export function moveNodeToParentEndInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  parentId: string,
) {
  const nextDocument = cloneDocument(document);
  const currentParentId = findParentId(nextDocument.layout, nodeId);
  if (!currentParentId || currentParentId !== parentId) {
    return null;
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent?.children) {
    return null;
  }

  const fromIndex = parent.children.findIndex(
    (child) => child.id === nodeId,
  );
  if (fromIndex < 0 || fromIndex === parent.children.length - 1) {
    return null;
  }

  const [movingNode] = parent.children.splice(fromIndex, 1);
  parent.children.push(movingNode);
  if (parent.id === nextDocument.layout.id) {
    movingNode.layout.flowRow = nextRootFlowRow(nextDocument.layout);
    normalizeRootRows(nextDocument.layout);
  } else if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }

  return nextDocument;
}

export function moveRootNodeToRowBoundaryInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  const nextDocument = cloneDocument(document);
  const root = nextDocument.layout;
  const rootChildren =
    root.children?.filter((child) => child.slot !== 'footer') ?? [];
  const fromIndex = rootChildren.findIndex((child) => child.id === nodeId);
  const targetIndex = rootChildren.findIndex(
    (child) => child.id === targetId,
  );
  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }

  const movingNode = rootChildren[fromIndex];
  const targetNode = rootChildren[targetIndex];
  const targetRow = targetNode.layout.flowRow ?? targetIndex + 1;
  const temporaryRow =
    position === 'before' ? targetRow - 0.5 : targetRow + 0.5;

  movingNode.layout.flowRow = temporaryRow;
  root.children = [
    ...rootChildren,
    ...(root.children?.filter((child) => child.slot === 'footer') ?? []),
  ];
  normalizeRootRows(root);
  return nextDocument;
}

export function insertNodeRelativeToTargetInDocument(
  document: ThemeLayoutDocument,
  parentId: string,
  nextNode: ThemeLayoutNode,
  targetId: string,
  position: 'before' | 'after',
  axis: DropIndicatorAxis,
) {
  const nextDocument = cloneDocument(document);
  const parent = findNode(nextDocument.layout, parentId);
  if (!parent) {
    return null;
  }

  parent.children ??= [];

  const targetIndex = parent.children.findIndex(
    (child) => child.id === targetId,
  );
  if (targetIndex < 0) {
    return null;
  }

  const targetNode = parent.children[targetIndex];
  if (parent.id === nextDocument.layout.id) {
    const targetRow = targetNode.layout.flowRow ?? targetIndex + 1;
    if (axis === 'vertical') {
      nextNode.layout.flowRow =
        position === 'before' ? targetRow - 0.5 : targetRow + 0.5;
      nextNode.layout.order = 1;
    } else {
      const targetOrder = targetNode.layout.order ?? targetIndex + 1;
      nextNode.layout.flowRow = targetRow;
      nextNode.layout.order =
        position === 'before'
          ? targetOrder - 0.5
          : targetOrder + 0.5;
    }

    parent.children.push(nextNode);
    normalizeRootRows(nextDocument.layout);
    return nextDocument;
  }

  const insertIndex = targetIndex + (position === 'after' ? 1 : 0);
  parent.children.splice(insertIndex, 0, nextNode);
  if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }
  return nextDocument;
}

export function normalizeChildOrder(parent: ThemeLayoutNode) {
  parent.children?.forEach((child, index) => {
    if (child.layout.mode !== 'absolute') {
      child.layout.order = index + 1;
    }
  });
}

function parseGridTrack(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return { start: null, span: 1 };
  }

  const startMatch = /\d+/.exec(value);
  const spanMatch = /span\s+(\d+)/i.exec(value);
  return {
    start: startMatch ? Number.parseInt(startMatch[0], 10) : null,
    span: spanMatch
      ? Math.max(1, Number.parseInt(spanMatch[1], 10))
      : 1,
  };
}

function resolveGridColumnCount(parent: ThemeLayoutNode) {
  const rawColumns = parent.props?.columns;
  if (typeof rawColumns === 'number' && Number.isFinite(rawColumns)) {
    return Math.max(1, Math.round(rawColumns));
  }

  if (typeof rawColumns === 'string') {
    const parsed = Number.parseInt(rawColumns, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }

  return 2;
}

export function normalizeGridChildren(parent: ThemeLayoutNode) {
  const children = parent.children ?? [];
  const columns = resolveGridColumnCount(parent);
  const occupancy: boolean[][] = [];

  function ensureCell(row: number, column: number) {
    while (occupancy.length < row) {
      occupancy.push(Array.from({ length: columns }, () => false));
    }

    while (occupancy[row - 1].length < column) {
      occupancy[row - 1].push(false);
    }
  }

  function canPlace(
    row: number,
    column: number,
    columnSpan: number,
    rowSpan: number,
  ) {
    if (column + columnSpan - 1 > columns) {
      return false;
    }

    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (
        let columnOffset = 0;
        columnOffset < columnSpan;
        columnOffset += 1
      ) {
        ensureCell(row + rowOffset, column + columnOffset);
        if (occupancy[row + rowOffset - 1][column + columnOffset - 1]) {
          return false;
        }
      }
    }

    return true;
  }

  function place(
    row: number,
    column: number,
    columnSpan: number,
    rowSpan: number,
  ) {
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (
        let columnOffset = 0;
        columnOffset < columnSpan;
        columnOffset += 1
      ) {
        ensureCell(row + rowOffset, column + columnOffset);
        occupancy[row + rowOffset - 1][column + columnOffset - 1] = true;
      }
    }
  }

  let flowOrder = 0;
  children.forEach((child) => {
    if (child.layout.mode === 'absolute') {
      return;
    }

    flowOrder += 1;
    const columnTrack = parseGridTrack(child.layout.gridColumn);
    const rowTrack = parseGridTrack(child.layout.gridRow);
    const columnSpan = Math.min(columns, Math.max(1, columnTrack.span));
    const rowSpan = Math.max(1, rowTrack.span);

    let placedRow = 1;
    let placedColumn = 1;
    let found = false;

    for (let row = 1; !found; row += 1) {
      for (let column = 1; column <= columns - columnSpan + 1; column += 1) {
        if (!canPlace(row, column, columnSpan, rowSpan)) {
          continue;
        }

        place(row, column, columnSpan, rowSpan);
        placedRow = row;
        placedColumn = column;
        found = true;
        break;
      }
    }

    child.layout.order = flowOrder;
    child.layout.gridColumn =
      columnSpan > 1
        ? `${placedColumn} / span ${columnSpan}`
        : String(placedColumn);
    child.layout.gridRow =
      rowSpan > 1
        ? `${placedRow} / span ${rowSpan}`
        : String(placedRow);
  });
}

export function normalizeRootRows(root: ThemeLayoutNode) {
  const children = root.children ?? [];
  const bodyChildren = children.filter((child) => child.slot !== 'footer');
  const footerChildren = children.filter(
    (child) => child.slot === 'footer',
  );
  const rankedBodyChildren = bodyChildren
    .map((child, index) => ({
      child,
      index,
      sourceRow: child.layout.flowRow ?? index + 1,
      sourceOrder: child.layout.order ?? index + 1,
    }))
    .sort((left, right) => {
      if (left.sourceRow !== right.sourceRow) {
        return left.sourceRow - right.sourceRow;
      }

      if (left.sourceOrder !== right.sourceOrder) {
        return left.sourceOrder - right.sourceOrder;
      }

      return left.index - right.index;
    });
  const rowMapping = new Map<number, number>();
  let nextRow = 1;

  rankedBodyChildren.forEach(({ child, sourceRow }) => {
    if (!rowMapping.has(sourceRow)) {
      rowMapping.set(sourceRow, nextRow);
      nextRow += 1;
    }

    child.layout.flowRow = rowMapping.get(sourceRow);
  });

  bodyChildren.sort((left, right) => {
    const leftRow = left.layout.flowRow ?? 0;
    const rightRow = right.layout.flowRow ?? 0;
    if (leftRow !== rightRow) {
      return leftRow - rightRow;
    }

    return (left.layout.order ?? 0) - (right.layout.order ?? 0);
  });

  let currentRow = -1;
  let rowOrder = 0;
  bodyChildren.forEach((child) => {
    const childRow = child.layout.flowRow ?? 0;
    if (childRow !== currentRow) {
      currentRow = childRow;
      rowOrder = 1;
    } else {
      rowOrder += 1;
    }

    if (child.layout.mode !== 'absolute') {
      child.layout.order = rowOrder;
    }
  });

  root.children = [...bodyChildren, ...footerChildren];
}

export function upsertNode(
  document: ThemeLayoutDocument,
  parentId: string,
  nextNode: ThemeLayoutNode,
  targetNodeId?: string,
) {
  const nextDocument = cloneDocument(document);

  if (targetNodeId === nextDocument.layout.id) {
    nextDocument.layout = {
      ...nextNode,
      id: nextDocument.layout.id,
      children: nextDocument.layout.children,
    };
    return nextDocument;
  }

  if (targetNodeId) {
    removeNode(nextDocument.layout, targetNodeId);
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent) {
    return null;
  }

  parent.children ??= [];

  parent.children.push(nextNode);
  if (parent.id === nextDocument.layout.id) {
    normalizeRootRows(nextDocument.layout);
  } else {
    normalizeChildOrder(parent);
  }
  return nextDocument;
}

export function updateNodeInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  updater: (node: ThemeLayoutNode) => void,
) {
  const nextDocument = cloneDocument(document);
  const node = findNode(nextDocument.layout, nodeId);
  if (!node) {
    return null;
  }

  updater(node);
  return nextDocument;
}
