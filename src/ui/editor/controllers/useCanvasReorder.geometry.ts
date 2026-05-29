import type { ThemeLayoutNode } from '../../layout/types';
import type { DropIndicator, DropIndicatorAxis } from 'domain/template';

export const SCREEN_ROW_TOLERANCE = 40;
export const SCREEN_ROW_INSERT_EDGE_RATIO = 0.24;
export const SCREEN_ROW_INSERT_EDGE_MIN = 16;
export const SCREEN_ROW_INSERT_EDGE_MAX = 28;
export const SCREEN_ROW_OUTER_TOLERANCE = 18;
export const SIBLING_SEAM_TOLERANCE = 28;

export interface RectSnapshot {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface ScreenRowSnapshot {
  top: number;
  bottom: number;
  children: { nodeId: string; rect: RectSnapshot }[];
}

export interface NodeRectSnapshot {
  nodeId: string;
  rect: RectSnapshot;
}

export type NodeRectResolver = (nodeId: string) => RectSnapshot | null;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toRectSnapshot(rect: DOMRect | RectSnapshot): RectSnapshot {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getCurrentDropPosition(
  dropIndicator: DropIndicator | null,
  nextAxis: DropIndicatorAxis,
  nextNodeId: string,
  nextPosition: DropIndicator['position'],
) {
  if (dropIndicator?.axis !== nextAxis || dropIndicator.nodeId !== nextNodeId) {
    return nextPosition;
  }

  return dropIndicator.position;
}

function getAxisMetrics(rect: RectSnapshot, axis: DropIndicatorAxis) {
  return axis === 'horizontal'
    ? { start: rect.left, end: rect.right, size: rect.width }
    : { start: rect.top, end: rect.bottom, size: rect.height };
}

export function resolveSiblingDropTarget(
  dropIndicator: DropIndicator | null,
  children: NodeRectSnapshot[],
  axis: DropIndicatorAxis,
  pointer: number,
) {
  if (!children.length) {
    return null;
  }

  const orderedChildren = [...children].sort((left, right) => {
    const leftMetrics = getAxisMetrics(left.rect, axis);
    const rightMetrics = getAxisMetrics(right.rect, axis);
    return leftMetrics.start - rightMetrics.start;
  });

  const firstChild = orderedChildren[0];
  const firstMetrics = getAxisMetrics(firstChild.rect, axis);
  if (pointer <= firstMetrics.start + SIBLING_SEAM_TOLERANCE) {
    return {
      nodeId: firstChild.nodeId,
      position: 'before' as const,
      axis,
    };
  }

  for (let index = 0; index < orderedChildren.length; index += 1) {
    const currentChild = orderedChildren[index];
    const currentMetrics = getAxisMetrics(currentChild.rect, axis);
    const previousChild = orderedChildren[index - 1];
    const nextChild = orderedChildren[index + 1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[-1] is undefined at runtime; TypeScript doesn't model this without noUncheckedIndexedAccess
    const previousSeam = previousChild
      ? (getAxisMetrics(previousChild.rect, axis).end + currentMetrics.start) / 2
      : null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[length] is undefined at runtime
    const nextSeam = nextChild ? (currentMetrics.end + getAxisMetrics(nextChild.rect, axis).start) / 2 : null;

    if (pointer >= currentMetrics.start && pointer <= currentMetrics.end) {
      if (previousSeam !== null && pointer <= previousSeam + SIBLING_SEAM_TOLERANCE) {
        return {
          nodeId: currentChild.nodeId,
          position: getCurrentDropPosition(dropIndicator, axis, currentChild.nodeId, 'before'),
          axis,
        };
      }

      if (nextSeam !== null && pointer >= nextSeam - SIBLING_SEAM_TOLERANCE) {
        return {
          nodeId: currentChild.nodeId,
          position: getCurrentDropPosition(dropIndicator, axis, currentChild.nodeId, 'after'),
          axis,
        };
      }

      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[-1] is undefined at runtime
        !previousChild &&
        pointer <= currentMetrics.start + SIBLING_SEAM_TOLERANCE
      ) {
        return {
          nodeId: currentChild.nodeId,
          position: 'before' as const,
          axis,
        };
      }

      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[length] is undefined at runtime
        !nextChild &&
        pointer >= currentMetrics.end - SIBLING_SEAM_TOLERANCE
      ) {
        return {
          nodeId: currentChild.nodeId,
          position: 'after' as const,
          axis,
        };
      }

      return dropIndicator?.axis === axis ? dropIndicator : null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[length] is undefined at runtime
    if (!nextChild) {
      continue;
    }

    const nextMetrics = getAxisMetrics(nextChild.rect, axis);
    if (pointer > currentMetrics.end && pointer < nextMetrics.start) {
      const gapMidpoint = currentMetrics.end + (nextMetrics.start - currentMetrics.end) / 2;
      return pointer <= gapMidpoint
        ? {
            nodeId: currentChild.nodeId,
            position: 'after' as const,
            axis,
          }
        : {
            nodeId: nextChild.nodeId,
            position: 'before' as const,
            axis,
          };
    }
  }

  const lastChild = orderedChildren[orderedChildren.length - 1];
  const lastMetrics = getAxisMetrics(lastChild.rect, axis);
  if (pointer >= lastMetrics.end - SIBLING_SEAM_TOLERANCE) {
    return {
      nodeId: lastChild.nodeId,
      position: 'after' as const,
      axis,
    };
  }

  return null;
}

export function getScreenRowSnapshots(getNodeRect: NodeRectResolver, parent: ThemeLayoutNode, excludedNodeId?: string) {
  const rows: ScreenRowSnapshot[] = [];
  const bodyChildren = (parent.children ?? [])
    .filter((child) => child.slot !== 'footer' && child.id !== excludedNodeId)
    .map((child) => ({
      nodeId: child.id,
      rect: getNodeRect(child.id),
    }))
    .filter((child): child is { nodeId: string; rect: RectSnapshot } => Boolean(child.rect))
    .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);

  bodyChildren.forEach((child) => {
    const currentRow = rows.find((row) => Math.abs(row.top - child.rect.top) <= SCREEN_ROW_TOLERANCE);
    if (currentRow) {
      currentRow.children.push(child);
      currentRow.top = Math.min(currentRow.top, child.rect.top);
      currentRow.bottom = Math.max(currentRow.bottom, child.rect.bottom);
      currentRow.children.sort((left, right) => left.rect.left - right.rect.left);
      return;
    }

    rows.push({
      top: child.rect.top,
      bottom: child.rect.bottom,
      children: [child],
    });
  });

  return rows.sort((left, right) => left.top - right.top);
}

export function resolveScreenRowDropTarget(
  getNodeRect: NodeRectResolver,
  dropIndicator: DropIndicator | null,
  parent: ThemeLayoutNode,
  pointerX: number,
  pointerY: number,
  excludedNodeId?: string,
  preferredNodeId?: string,
) {
  const rows = getScreenRowSnapshots(getNodeRect, parent, excludedNodeId);
  if (!rows.length) {
    return null;
  }

  if (!preferredNodeId) {
    const firstRow = rows[0];
    if (pointerY <= firstRow.top + SCREEN_ROW_OUTER_TOLERANCE) {
      return {
        nodeId: firstRow.children[0].nodeId,
        position: 'before' as const,
        axis: 'vertical' as const,
      };
    }

    for (let index = 0; index < rows.length - 1; index += 1) {
      const currentRow = rows[index];
      const nextRow = rows[index + 1];
      if (pointerY > currentRow.bottom && pointerY < nextRow.top) {
        const gapMidpoint = currentRow.bottom + (nextRow.top - currentRow.bottom) / 2;
        return pointerY <= gapMidpoint
          ? {
              nodeId: currentRow.children[currentRow.children.length - 1].nodeId,
              position: 'after' as const,
              axis: 'vertical' as const,
            }
          : {
              nodeId: nextRow.children[0].nodeId,
              position: 'before' as const,
              axis: 'vertical' as const,
            };
      }
    }

    const lastRow = rows[rows.length - 1];
    if (pointerY >= lastRow.bottom - SCREEN_ROW_OUTER_TOLERANCE) {
      return {
        nodeId: lastRow.children[lastRow.children.length - 1].nodeId,
        position: 'after' as const,
        axis: 'vertical' as const,
      };
    }
  }

  const row = preferredNodeId
    ? rows.find((candidate) => candidate.children.some((child) => child.nodeId === preferredNodeId))
    : (rows.find((candidate) => pointerY >= candidate.top && pointerY <= candidate.bottom) ?? null);
  if (!row) {
    return null;
  }

  const rowHeight = row.bottom - row.top;
  const edgeThreshold = clamp(
    rowHeight * SCREEN_ROW_INSERT_EDGE_RATIO,
    SCREEN_ROW_INSERT_EDGE_MIN,
    SCREEN_ROW_INSERT_EDGE_MAX,
  );
  if (pointerY <= row.top + edgeThreshold) {
    return {
      nodeId: row.children[0].nodeId,
      position: 'before' as const,
      axis: 'vertical' as const,
    };
  }

  if (pointerY >= row.bottom - edgeThreshold) {
    return {
      nodeId: row.children[row.children.length - 1].nodeId,
      position: 'after' as const,
      axis: 'vertical' as const,
    };
  }

  return resolveSiblingDropTarget(dropIndicator, row.children, 'horizontal', pointerX);
}

export function resolveParentDropTarget(
  getNodeRect: NodeRectResolver,
  dropIndicator: DropIndicator | null,
  parent: ThemeLayoutNode,
  excludedNodeId: string,
  pointerX: number,
  pointerY: number,
  preferredNodeId?: string,
) {
  if (parent.alias === 'core.screen') {
    return resolveScreenRowDropTarget(
      getNodeRect,
      dropIndicator,
      parent,
      pointerX,
      pointerY,
      excludedNodeId,
      preferredNodeId,
    );
  }

  if (parent.alias === 'core.grid') {
    return resolveGridDropTarget(getNodeRect, parent, pointerX, pointerY, excludedNodeId, preferredNodeId);
  }

  const axis: DropIndicatorAxis = parent.alias === 'core.row' ? 'horizontal' : 'vertical';
  const siblingSnapshots = (parent.children ?? [])
    .filter((child) => child.id !== excludedNodeId)
    .map((child) => ({
      nodeId: child.id,
      rect: getNodeRect(child.id),
    }))
    .filter((child): child is NodeRectSnapshot => Boolean(child.rect));
  return resolveSiblingDropTarget(dropIndicator, siblingSnapshots, axis, axis === 'horizontal' ? pointerX : pointerY);
}

export function resolveGridDropTarget(
  getNodeRect: NodeRectResolver,
  parent: ThemeLayoutNode,
  pointerX: number,
  pointerY: number,
  excludedNodeId?: string,
  preferredNodeId?: string,
) {
  const rows = getScreenRowSnapshots(getNodeRect, parent, excludedNodeId);
  if (!rows.length) {
    return null;
  }

  function resolveGridRowHorizontalDropTarget(children: { nodeId: string; rect: RectSnapshot }[]) {
    const orderedChildren = [...children].sort((left, right) => left.rect.left - right.rect.left);
    if (!orderedChildren.length) {
      return null;
    }

    for (const child of orderedChildren) {
      const centerX = child.rect.left + child.rect.width / 2;
      if (pointerX < centerX) {
        return {
          nodeId: child.nodeId,
          position: 'before' as const,
          axis: 'horizontal' as const,
        };
      }
    }

    const lastChild = orderedChildren[orderedChildren.length - 1];
    return {
      nodeId: lastChild.nodeId,
      position: 'after' as const,
      axis: 'horizontal' as const,
    };
  }

  if (!preferredNodeId) {
    const firstRow = rows[0];
    if (pointerY <= firstRow.top + SCREEN_ROW_OUTER_TOLERANCE) {
      return {
        nodeId: firstRow.children[0].nodeId,
        position: 'before' as const,
        axis: 'vertical' as const,
      };
    }

    for (let index = 0; index < rows.length - 1; index += 1) {
      const currentRow = rows[index];
      const nextRow = rows[index + 1];
      if (pointerY > currentRow.bottom && pointerY < nextRow.top) {
        const gapMidpoint = currentRow.bottom + (nextRow.top - currentRow.bottom) / 2;
        return pointerY <= gapMidpoint
          ? {
              nodeId: currentRow.children[currentRow.children.length - 1].nodeId,
              position: 'after' as const,
              axis: 'vertical' as const,
            }
          : {
              nodeId: nextRow.children[0].nodeId,
              position: 'before' as const,
              axis: 'vertical' as const,
            };
      }
    }

    const lastRow = rows[rows.length - 1];
    if (pointerY >= lastRow.bottom - SCREEN_ROW_OUTER_TOLERANCE) {
      return {
        nodeId: lastRow.children[lastRow.children.length - 1].nodeId,
        position: 'after' as const,
        axis: 'vertical' as const,
      };
    }
  }

  const row = preferredNodeId
    ? rows.find((candidate) => candidate.children.some((child) => child.nodeId === preferredNodeId))
    : (rows.find((candidate) => pointerY >= candidate.top && pointerY <= candidate.bottom) ??
      rows.reduce<ScreenRowSnapshot | null>((closest, candidate) => {
        if (!closest) {
          return candidate;
        }

        const closestCenter = (closest.top + closest.bottom) / 2;
        const candidateCenter = (candidate.top + candidate.bottom) / 2;
        return Math.abs(pointerY - candidateCenter) < Math.abs(pointerY - closestCenter) ? candidate : closest;
      }, null));
  if (!row) {
    return null;
  }

  return resolveGridRowHorizontalDropTarget(row.children);
}
