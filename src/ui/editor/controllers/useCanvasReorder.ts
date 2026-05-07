import type {
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../../layout/types';
import type {
  DropIndicator,
  DropIndicatorAxis,
  DropIndicatorPosition,
} from '../services/layoutBuilderService';
import {
  findNode,
  findParentId,
  moveNodeToParentEndInDocument,
  moveNodeWithinParentInDocument,
  moveRootNodeToRowBoundaryInDocument,
} from '../services/layoutBuilderService';
import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

const SCREEN_ROW_TOLERANCE = 40;
const SCREEN_ROW_INSERT_EDGE_RATIO = 0.24;
const SCREEN_ROW_INSERT_EDGE_MIN = 16;
const SCREEN_ROW_INSERT_EDGE_MAX = 28;
const SCREEN_ROW_OUTER_TOLERANCE = 18;
const SIBLING_SEAM_TOLERANCE = 28;

interface RectSnapshot {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

interface ScreenRowSnapshot {
  top: number;
  bottom: number;
  children: { nodeId: string; rect: RectSnapshot }[];
}

interface NodeRectSnapshot {
  nodeId: string;
  rect: RectSnapshot;
}

interface UseCanvasReorderArgs {
  currentDocument: ThemeLayoutDocument;
  setSelectedNodeId: (nodeId: string | null) => void;
  addNodeFromAlias: (alias: string, parentId?: string) => void;
  insertNodeFromAliasRelative: (
    alias: string,
    parentId: string,
    targetId: string,
    position: DropIndicatorPosition,
    axis: DropIndicatorAxis,
  ) => void;
  moveNodeWithinParent: (
    nodeId: string,
    targetId: string,
    position: DropIndicatorPosition,
  ) => void;
  moveNodeToParentEnd: (nodeId: string, parentId: string) => void;
  moveRootNodeToRowBoundary: (
    nodeId: string,
    targetId: string,
    position: DropIndicatorPosition,
  ) => void;
  builderNodeRefs: RefObject<Record<string, HTMLDivElement | null>>;
}

export interface DraggingNodeSnapshot {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

interface RelativePointerDragState {
  nodeId: string;
  parentId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  started: boolean;
}

export function useCanvasReorder({
  currentDocument,
  setSelectedNodeId,
  addNodeFromAlias,
  insertNodeFromAliasRelative,
  moveNodeWithinParent,
  moveNodeToParentEnd,
  moveRootNodeToRowBoundary,
  builderNodeRefs,
}: UseCanvasReorderArgs) {
  const [draggingAlias, setDraggingAlias] = useState('');
  const [isCanvasActive, setIsCanvasActive] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState('');
  const [dropIndicator, setDropIndicator] =
    useState<DropIndicator | null>(null);
  const [containerDropTargetId, setContainerDropTargetId] = useState('');
  const [previewDocument, setPreviewDocument] =
    useState<ThemeLayoutDocument | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const [draggingNodeSnapshot, setDraggingNodeSnapshot] =
    useState<DraggingNodeSnapshot | null>(null);
  const [relativePointerDrag, setRelativePointerDrag] =
    useState<RelativePointerDragState | null>(null);
  const dragRectSnapshotsRef =
    useRef<Record<string, RectSnapshot>>({});
  const relativePointerDragRef =
    useRef<RelativePointerDragState | null>(null);

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function toRectSnapshot(
    rect: DOMRect | RectSnapshot,
  ): RectSnapshot {
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }

  function captureDragSnapshots() {
    dragRectSnapshotsRef.current = Object.fromEntries(
      Object.entries(builderNodeRefs.current)
        .filter((entry): entry is [string, HTMLDivElement] => entry[1] !== null)
        .map(([nodeId, element]) => [
          nodeId,
          toRectSnapshot(element.getBoundingClientRect()),
        ]),
    );
  }

  function getNodeRectSnapshot(
    nodeId: string,
    fallbackElement?: HTMLDivElement | null,
  ) {
    const snapshot = dragRectSnapshotsRef.current[nodeId];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- map value may be undefined at runtime
    if (snapshot) {
      return snapshot;
    }

    if (!fallbackElement) {
      return null;
    }

    return toRectSnapshot(fallbackElement.getBoundingClientRect());
  }

  function getCurrentDropPosition(
    nextAxis: DropIndicatorAxis,
    nextNodeId: string,
    nextPosition: DropIndicatorPosition,
  ) {
    if (
      dropIndicator?.axis !== nextAxis ||
      dropIndicator.nodeId !== nextNodeId
    ) {
      return nextPosition;
    }

    return dropIndicator.position;
  }

  function getAxisMetrics(
    rect: RectSnapshot,
    axis: DropIndicatorAxis,
  ) {
    return axis === 'horizontal'
      ? { start: rect.left, end: rect.right, size: rect.width }
      : { start: rect.top, end: rect.bottom, size: rect.height };
  }

  function resolveSiblingDropTarget(
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
        ? (
          getAxisMetrics(previousChild.rect, axis).end +
          currentMetrics.start
        ) / 2
        : null;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- array[length] is undefined at runtime
      const nextSeam = nextChild
        ? (
          currentMetrics.end +
          getAxisMetrics(nextChild.rect, axis).start
        ) / 2
        : null;

      if (
        pointer >= currentMetrics.start &&
        pointer <= currentMetrics.end
      ) {
        if (
          previousSeam !== null &&
          pointer <= previousSeam + SIBLING_SEAM_TOLERANCE
        ) {
          return {
            nodeId: currentChild.nodeId,
            position: getCurrentDropPosition(
              axis,
              currentChild.nodeId,
              'before',
            ),
            axis,
          };
        }

        if (
          nextSeam !== null &&
          pointer >= nextSeam - SIBLING_SEAM_TOLERANCE
        ) {
          return {
            nodeId: currentChild.nodeId,
            position: getCurrentDropPosition(
              axis,
              currentChild.nodeId,
              'after',
            ),
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
      if (
        pointer > currentMetrics.end &&
        pointer < nextMetrics.start
      ) {
        const gapMidpoint =
          currentMetrics.end +
          (nextMetrics.start - currentMetrics.end) / 2;
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

  function getScreenRowSnapshots(
    parent: ThemeLayoutNode,
    excludedNodeId?: string,
  ) {
    const rows: ScreenRowSnapshot[] = [];
    const bodyChildren = (parent.children ?? [])
      .filter(
        (child) =>
          child.slot !== 'footer' && child.id !== excludedNodeId,
      )
      .map((child) => ({
        nodeId: child.id,
        rect: getNodeRectSnapshot(
          child.id,
          builderNodeRefs.current[child.id],
        ),
      }))
      .filter(
        (child): child is { nodeId: string; rect: RectSnapshot } =>
          Boolean(child.rect),
      )
      .sort(
        (left, right) =>
          left.rect.top - right.rect.top ||
          left.rect.left - right.rect.left,
      );

    bodyChildren.forEach((child) => {
      const currentRow = rows.find(
        (row) =>
          Math.abs(row.top - child.rect.top) <= SCREEN_ROW_TOLERANCE,
      );
      if (currentRow) {
        currentRow.children.push(child);
        currentRow.top = Math.min(currentRow.top, child.rect.top);
        currentRow.bottom = Math.max(
          currentRow.bottom,
          child.rect.bottom,
        );
        currentRow.children.sort(
          (left, right) => left.rect.left - right.rect.left,
        );
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

  function resolveScreenRowDropTarget(
    parent: ThemeLayoutNode,
    pointerX: number,
    pointerY: number,
    excludedNodeId?: string,
    preferredNodeId?: string,
  ) {
    const rows = getScreenRowSnapshots(parent, excludedNodeId);
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
        if (
          pointerY > currentRow.bottom &&
          pointerY < nextRow.top
        ) {
          const gapMidpoint =
            currentRow.bottom +
            (nextRow.top - currentRow.bottom) / 2;
          return pointerY <= gapMidpoint
            ? {
                nodeId:
                  currentRow.children[
                    currentRow.children.length - 1
                  ].nodeId,
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
      if (
        pointerY >= lastRow.bottom - SCREEN_ROW_OUTER_TOLERANCE
      ) {
        return {
          nodeId:
            lastRow.children[lastRow.children.length - 1].nodeId,
          position: 'after' as const,
          axis: 'vertical' as const,
        };
      }
    }

    const row = preferredNodeId
      ? rows.find((candidate) =>
          candidate.children.some(
            (child) => child.nodeId === preferredNodeId,
          ),
        )
      : rows.find(
          (candidate) =>
            pointerY >= candidate.top &&
            pointerY <= candidate.bottom,
        ) ?? null;
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

    return resolveSiblingDropTarget(
      row.children,
      'horizontal',
      pointerX,
    );
  }

  function resolveGridDropTarget(
    parent: ThemeLayoutNode,
    pointerX: number,
    pointerY: number,
    excludedNodeId?: string,
    preferredNodeId?: string,
  ) {
    const rows = getScreenRowSnapshots(parent, excludedNodeId);
    if (!rows.length) {
      return null;
    }

    function resolveGridRowHorizontalDropTarget(
      children: { nodeId: string; rect: RectSnapshot }[],
    ) {
      const orderedChildren = [...children].sort(
        (left, right) => left.rect.left - right.rect.left,
      );
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
        if (
          pointerY > currentRow.bottom &&
          pointerY < nextRow.top
        ) {
          const gapMidpoint =
            currentRow.bottom +
            (nextRow.top - currentRow.bottom) / 2;
          return pointerY <= gapMidpoint
            ? {
                nodeId:
                  currentRow.children[
                    currentRow.children.length - 1
                  ].nodeId,
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
      if (
        pointerY >= lastRow.bottom - SCREEN_ROW_OUTER_TOLERANCE
      ) {
        return {
          nodeId:
            lastRow.children[lastRow.children.length - 1].nodeId,
          position: 'after' as const,
          axis: 'vertical' as const,
        };
      }
    }

    const row = preferredNodeId
      ? rows.find((candidate) =>
          candidate.children.some(
            (child) => child.nodeId === preferredNodeId,
          ),
        )
      : rows.find(
          (candidate) =>
            pointerY >= candidate.top &&
            pointerY <= candidate.bottom,
        ) ??
        rows.reduce<ScreenRowSnapshot | null>((closest, candidate) => {
          if (!closest) {
            return candidate;
          }

          const closestCenter = (closest.top + closest.bottom) / 2;
          const candidateCenter =
            (candidate.top + candidate.bottom) / 2;
          return Math.abs(pointerY - candidateCenter) <
            Math.abs(pointerY - closestCenter)
            ? candidate
            : closest;
        }, null);
    if (!row) {
      return null;
    }

    return resolveGridRowHorizontalDropTarget(row.children);
  }

  function clearNodeDragState() {
    setDraggingNodeId('');
    setDropIndicator(null);
    setContainerDropTargetId('');
    setPreviewDocument(null);
    setPreviewSignature('');
    setDraggingNodeSnapshot(null);
    relativePointerDragRef.current = null;
    setRelativePointerDrag(null);
    dragRectSnapshotsRef.current = {};
  }

  function updateRelativePointerDrag(
    updater:
      | RelativePointerDragState
      | null
      | ((
          current: RelativePointerDragState | null,
        ) => RelativePointerDragState | null),
  ) {
    const nextValue =
      typeof updater === 'function'
        ? updater(relativePointerDragRef.current)
        : updater;
    relativePointerDragRef.current = nextValue;
    setRelativePointerDrag(nextValue);
    return nextValue;
  }

  function updatePreviewDocument(
    signature: string,
    nextPreviewDocument: ThemeLayoutDocument | null,
  ) {
    if (!nextPreviewDocument) {
      if (previewDocument || previewSignature) {
        setPreviewDocument(null);
        setPreviewSignature('');
      }
      return;
    }

    if (previewSignature !== signature) {
      setPreviewDocument(nextPreviewDocument);
      setPreviewSignature(signature);
    }
  }

  function previewRelativeMove(
    sourceNodeId: string,
    targetNodeId: string,
    position: DropIndicatorPosition,
    axis: DropIndicatorAxis,
    parentId: string,
  ) {
    const nextIndicator = {
      nodeId: targetNodeId,
      position,
      axis,
    } satisfies DropIndicator;
    const hasChanged =
      dropIndicator?.nodeId !== nextIndicator.nodeId ||
      dropIndicator.position !== nextIndicator.position ||
      dropIndicator.axis !== nextIndicator.axis;
    if (!hasChanged) {
      return;
    }

    setDropIndicator(nextIndicator);
    updatePreviewDocument(
      `${sourceNodeId}:${targetNodeId}:${position}:${axis}`,
      parentId === currentDocument.layout.id && axis === 'vertical'
        ? moveRootNodeToRowBoundaryInDocument(
            currentDocument,
            sourceNodeId,
            targetNodeId,
            position,
          )
        : moveNodeWithinParentInDocument(
            currentDocument,
            sourceNodeId,
            targetNodeId,
            position,
          ),
    );
  }

  function commitRelativeMove(
    sourceNodeId: string,
    targetNodeId: string,
    position: DropIndicatorPosition,
    axis: DropIndicatorAxis,
    parentId: string,
  ) {
    if (
      parentId === currentDocument.layout.id &&
      axis === 'vertical'
    ) {
      moveRootNodeToRowBoundary(sourceNodeId, targetNodeId, position);
    } else {
      moveNodeWithinParent(sourceNodeId, targetNodeId, position);
    }

    clearNodeDragState();
  }

  function handleRelativeDragStart(
    nodeId: string,
    event: DragEvent<HTMLDivElement>,
  ) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    captureDragSnapshots();
    setDraggingNodeId(nodeId);
    setDraggingNodeSnapshot(
      getNodeRectSnapshot(nodeId, builderNodeRefs.current[nodeId]),
    );
    setSelectedNodeId(nodeId);
    setPreviewDocument(null);
    setPreviewSignature('');
  }

  function startRelativePointerDrag(
    node: ThemeLayoutNode,
    parent: ThemeLayoutNode | null,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !parent ||
      draggingAlias ||
      node.layout.mode === 'absolute'
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setDropIndicator(null);
    setPreviewDocument(null);
    setPreviewSignature('');
    updateRelativePointerDrag({
      nodeId: node.id,
      parentId: parent.id,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      started: false,
    });
  }

  function handleRelativeDragOver(
    event: DragEvent<HTMLDivElement>,
    node: ThemeLayoutNode,
    parent: ThemeLayoutNode | null,
  ) {
    if (
      !draggingNodeId ||
      draggingNodeId === node.id ||
      !parent
    ) {
      return;
    }

    const draggingParentId = findParentId(
      currentDocument.layout,
      draggingNodeId,
    );
    if (!draggingParentId || draggingParentId !== parent.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    if (parent.alias === 'core.screen') {
      const nextDropTarget = resolveScreenRowDropTarget(
        parent,
        event.clientX,
        event.clientY,
        draggingNodeId,
        node.id,
      );
      if (!nextDropTarget) {
        return;
      }

      previewRelativeMove(
        draggingNodeId,
        nextDropTarget.nodeId,
        nextDropTarget.position,
        nextDropTarget.axis,
        parent.id,
      );
      return;
    }

    if (parent.alias === 'core.grid') {
      const nextDropTarget = resolveGridDropTarget(
        parent,
        event.clientX,
        event.clientY,
        draggingNodeId,
        node.id,
      );
      if (!nextDropTarget) {
        return;
      }

      previewRelativeMove(
        draggingNodeId,
        nextDropTarget.nodeId,
        nextDropTarget.position,
        nextDropTarget.axis,
        parent.id,
      );
      return;
    }

    let axis: DropIndicatorAxis = 'vertical';
    if (parent.alias === 'core.row') {
      axis = 'horizontal';
    }

    const siblingSnapshots = (parent.children ?? [])
      .filter((child) => child.id !== draggingNodeId)
      .map((child) => ({
        nodeId: child.id,
        rect: getNodeRectSnapshot(
          child.id,
          builderNodeRefs.current[child.id],
        ),
      }))
      .filter(
        (child): child is NodeRectSnapshot => Boolean(child.rect),
      );
    const nextDropTarget = resolveSiblingDropTarget(
      siblingSnapshots,
      axis,
      axis === 'horizontal' ? event.clientX : event.clientY,
    );
    if (!nextDropTarget) {
      return;
    }

    const hasChanged =
      dropIndicator?.nodeId !== nextDropTarget.nodeId ||
      dropIndicator.position !== nextDropTarget.position ||
      dropIndicator.axis !== nextDropTarget.axis;
    if (hasChanged) {
      previewRelativeMove(
        draggingNodeId,
        nextDropTarget.nodeId,
        nextDropTarget.position,
        nextDropTarget.axis,
        parent.id,
      );
    }
  }

  function handleRelativeDrop(
    event: DragEvent<HTMLDivElement>,
    nodeId: string,
  ) {
    if (
      !draggingNodeId ||
      draggingNodeId === nodeId ||
      !dropIndicator
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const parentId = findParentId(currentDocument.layout, nodeId);
    if (
      parentId === currentDocument.layout.id &&
      dropIndicator.axis === 'vertical'
    ) {
      moveRootNodeToRowBoundary(
        draggingNodeId,
        nodeId,
        dropIndicator.position,
      );
    } else {
      moveNodeWithinParent(
        draggingNodeId,
        nodeId,
        dropIndicator.position,
      );
    }
    clearNodeDragState();
  }

  function handleLibraryDragStart(
    alias: string,
    event: DragEvent<HTMLElement>,
  ) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', alias);
    setDraggingAlias(alias);
  }

  function handleLibraryDragEnd() {
    setDraggingAlias('');
    setIsCanvasActive(false);
    setContainerDropTargetId('');
    setDropIndicator(null);
    setPreviewDocument(null);
    setPreviewSignature('');
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggingAlias && !draggingNodeId) {
      return;
    }

    event.preventDefault();
    setIsCanvasActive(true);
    if (draggingAlias) {
      setContainerDropTargetId('');
      const rootDropTarget = resolveScreenRowDropTarget(
        currentDocument.layout,
        event.clientX,
        event.clientY,
      );
      const hasChanged =
        dropIndicator?.nodeId !== rootDropTarget?.nodeId ||
        dropIndicator?.position !== rootDropTarget?.position ||
        dropIndicator?.axis !== rootDropTarget?.axis;
      if (hasChanged) {
        setDropIndicator(rootDropTarget);
      }
      return;
    }
    if (draggingNodeId) {
      const draggingParentId = findParentId(
        currentDocument.layout,
        draggingNodeId,
      );
      if (draggingParentId !== currentDocument.layout.id) {
        return;
      }

      const rootDropTarget = resolveScreenRowDropTarget(
        currentDocument.layout,
        event.clientX,
        event.clientY,
        draggingNodeId,
      );
      if (rootDropTarget) {
        const hasChanged =
          dropIndicator?.nodeId !== rootDropTarget.nodeId ||
          dropIndicator.position !== rootDropTarget.position ||
          dropIndicator.axis !== rootDropTarget.axis;
        if (hasChanged) {
          setDropIndicator(rootDropTarget);
          updatePreviewDocument(
            `canvas:${draggingNodeId}:${rootDropTarget.nodeId}` +
              `:${rootDropTarget.position}:${rootDropTarget.axis}`,
            rootDropTarget.axis === 'vertical'
              ? moveRootNodeToRowBoundaryInDocument(
                  currentDocument,
                  draggingNodeId,
                  rootDropTarget.nodeId,
                  rootDropTarget.position,
                )
              : moveNodeWithinParentInDocument(
                  currentDocument,
                  draggingNodeId,
                  rootDropTarget.nodeId,
                  rootDropTarget.position,
                ),
          );
        }
        return;
      }

      if (!dropIndicator) {
        updatePreviewDocument(
          `end:${draggingNodeId}:${currentDocument.layout.id}`,
          moveNodeToParentEndInDocument(
            currentDocument,
            draggingNodeId,
            currentDocument.layout.id,
          ),
        );
      }
    }
  }

  function handleCanvasDragLeave() {
    setIsCanvasActive(false);
    setContainerDropTargetId('');
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (draggingAlias) {
      if (dropIndicator) {
        insertNodeFromAliasRelative(
          draggingAlias,
          currentDocument.layout.id,
          dropIndicator.nodeId,
          dropIndicator.position,
          dropIndicator.axis,
        );
      } else {
        addNodeFromAlias(draggingAlias, currentDocument.layout.id);
      }
      setDraggingAlias('');
      setIsCanvasActive(false);
      setDropIndicator(null);
      return;
    }

    if (draggingNodeId) {
      const draggingParentId = findParentId(
        currentDocument.layout,
        draggingNodeId,
      );
      if (
        dropIndicator &&
        draggingParentId === currentDocument.layout.id
      ) {
        if (dropIndicator.axis === 'vertical') {
          moveRootNodeToRowBoundary(
            draggingNodeId,
            dropIndicator.nodeId,
            dropIndicator.position,
          );
        } else {
          moveNodeWithinParent(
            draggingNodeId,
            dropIndicator.nodeId,
            dropIndicator.position,
          );
        }
        clearNodeDragState();
        return;
      }

      moveNodeToParentEnd(
        draggingNodeId,
        currentDocument.layout.id,
      );
      clearNodeDragState();
    }
  }

  useEffect(() => {
    if (!relativePointerDrag) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      const activePointerDrag = relativePointerDragRef.current;
      if (!activePointerDrag) {
        return;
      }

      if (!activePointerDrag.started) {
        const movedEnough =
          Math.abs(event.clientX - activePointerDrag.startX) > 6 ||
          Math.abs(event.clientY - activePointerDrag.startY) > 6;
        if (!movedEnough) {
          return;
        }

        captureDragSnapshots();
        setDraggingNodeId(activePointerDrag.nodeId);
        setDraggingNodeSnapshot(
          getNodeRectSnapshot(
            activePointerDrag.nodeId,
            builderNodeRefs.current[activePointerDrag.nodeId],
          ),
        );
        updateRelativePointerDrag((current) =>
          current
            ? {
                ...current,
                started: true,
                currentX: event.clientX,
                currentY: event.clientY,
              }
            : current,
        );
      }

      updateRelativePointerDrag((current) =>
        current
          ? {
              ...current,
              currentX: event.clientX,
              currentY: event.clientY,
            }
          : current,
      );

      const parentNode = findNode(
        currentDocument.layout,
        activePointerDrag.parentId,
      );
      if (!parentNode) {
        return;
      }

      if (parentNode.alias === 'core.screen') {
        const rootDropTarget = resolveScreenRowDropTarget(
          parentNode,
          event.clientX,
          event.clientY,
          activePointerDrag.nodeId,
        );
        if (
          !rootDropTarget ||
          rootDropTarget.nodeId === activePointerDrag.nodeId
        ) {
          return;
        }

        previewRelativeMove(
          activePointerDrag.nodeId,
          rootDropTarget.nodeId,
          rootDropTarget.position,
          rootDropTarget.axis,
          parentNode.id,
        );
        return;
      }

      if (parentNode.alias === 'core.grid') {
        const gridDropTarget = resolveGridDropTarget(
          parentNode,
          event.clientX,
          event.clientY,
          activePointerDrag.nodeId,
        );
        if (
          !gridDropTarget ||
          gridDropTarget.nodeId === activePointerDrag.nodeId
        ) {
          return;
        }

        previewRelativeMove(
          activePointerDrag.nodeId,
          gridDropTarget.nodeId,
          gridDropTarget.position,
          gridDropTarget.axis,
          parentNode.id,
        );
        return;
      }

      const axis: DropIndicatorAxis =
        parentNode.alias === 'core.row' ? 'horizontal' : 'vertical';
      const siblingSnapshots = (parentNode.children ?? [])
        .filter((child) => child.id !== activePointerDrag.nodeId)
        .map((child) => ({
          nodeId: child.id,
          rect: getNodeRectSnapshot(
            child.id,
            builderNodeRefs.current[child.id],
          ),
        }))
        .filter(
          (child): child is NodeRectSnapshot => Boolean(child.rect),
        );
      const nextDropTarget = resolveSiblingDropTarget(
        siblingSnapshots,
        axis,
        axis === 'horizontal' ? event.clientX : event.clientY,
      );
      if (
        !nextDropTarget ||
        nextDropTarget.nodeId === activePointerDrag.nodeId
      ) {
        return;
      }

      previewRelativeMove(
        activePointerDrag.nodeId,
        nextDropTarget.nodeId,
        nextDropTarget.position,
        nextDropTarget.axis,
        parentNode.id,
      );
    }

    function handlePointerUp() {
      const activePointerDrag = relativePointerDragRef.current;
      if (!activePointerDrag) {
        return;
      }

      if (activePointerDrag.started && dropIndicator) {
        commitRelativeMove(
          activePointerDrag.nodeId,
          dropIndicator.nodeId,
          dropIndicator.position,
          dropIndicator.axis,
          activePointerDrag.parentId,
        );
        return;
      }

      clearNodeDragState();
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable resolver functions intentionally omitted
  }, [
    clearNodeDragState,
    commitRelativeMove,
    dropIndicator,
    previewRelativeMove,
    relativePointerDrag,
  ]);

  return {
    draggingAlias,
    isCanvasActive,
    dropIndicator,
    containerDropTargetId,
    previewDocument,
    draggingNodeId,
    draggingNodeSnapshot,
    relativePointerDrag,
    setIsCanvasActive,
    setContainerDropTargetId,
    setDraggingAlias,
    setDropIndicator,
    startRelativePointerDrag,
    handleRelativeDragStart,
    handleRelativeDragOver,
    handleRelativeDrop,
    clearNodeDragState,
    handleLibraryDragStart,
    handleLibraryDragEnd,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
  };
}
