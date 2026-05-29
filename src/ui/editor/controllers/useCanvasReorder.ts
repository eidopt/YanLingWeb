import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import {
  type RectSnapshot,
  resolveParentDropTarget,
  resolveScreenRowDropTarget,
  toRectSnapshot,
} from './useCanvasReorder.geometry';
import type { DropIndicator, DropIndicatorAxis, DropIndicatorPosition } from 'domain/template';
import {
  findNode,
  findParentId,
  moveNodeToParentEndInDocument,
  moveNodeWithinParentInDocument,
  moveRootNodeToRowBoundaryInDocument,
} from 'domain/template';
import { type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef } from 'react';
import {
  editorCanvasDragStateActions,
  type RelativePointerDragState,
  useEditorCanvasDragSnapshot,
} from 'state/editorCanvasDragState';

export type { DraggingNodeSnapshot } from 'state/editorCanvasDragState';

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
  moveNodeWithinParent: (nodeId: string, targetId: string, position: DropIndicatorPosition) => void;
  moveNodeToParentEnd: (nodeId: string, parentId: string) => void;
  moveRootNodeToRowBoundary: (nodeId: string, targetId: string, position: DropIndicatorPosition) => void;
  builderNodeRefs: RefObject<Record<string, HTMLDivElement | null>>;
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
  const {
    draggingAlias,
    isCanvasActive,
    draggingNodeId,
    dropIndicator,
    containerDropTargetId,
    previewDocument,
    previewSignature,
    draggingNodeSnapshot,
    relativePointerDrag,
  } = useEditorCanvasDragSnapshot();
  const {
    setDraggingAlias,
    setIsCanvasActive,
    setDraggingNodeId,
    setDropIndicator,
    setContainerDropTargetId,
    setPreviewDocument,
    setPreviewSignature,
    setDraggingNodeSnapshot,
    setRelativePointerDrag,
  } = editorCanvasDragStateActions;
  const dragRectSnapshotsRef = useRef<Record<string, RectSnapshot>>({});
  const relativePointerDragRef = useRef<RelativePointerDragState | null>(null);

  function captureDragSnapshots() {
    dragRectSnapshotsRef.current = Object.fromEntries(
      Object.entries(builderNodeRefs.current)
        .filter((entry): entry is [string, HTMLDivElement] => entry[1] !== null)
        .map(([nodeId, element]) => [nodeId, toRectSnapshot(element.getBoundingClientRect())]),
    );
  }

  function getNodeRectSnapshot(nodeId: string, fallbackElement?: HTMLDivElement | null) {
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

  function getNodeRect(nodeId: string): RectSnapshot | null {
    return getNodeRectSnapshot(nodeId, builderNodeRefs.current[nodeId]);
  }

  function clearNodeDragState() {
    editorCanvasDragStateActions.clearNodeDragState();
    relativePointerDragRef.current = null;
    dragRectSnapshotsRef.current = {};
  }

  function updateRelativePointerDrag(
    updater:
      | RelativePointerDragState
      | null
      | ((current: RelativePointerDragState | null) => RelativePointerDragState | null),
  ) {
    const nextValue = typeof updater === 'function' ? updater(relativePointerDragRef.current) : updater;
    relativePointerDragRef.current = nextValue;
    setRelativePointerDrag(nextValue);
    return nextValue;
  }

  function updatePreviewDocument(signature: string, nextPreviewDocument: ThemeLayoutDocument | null) {
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
        ? moveRootNodeToRowBoundaryInDocument(currentDocument, sourceNodeId, targetNodeId, position)
        : moveNodeWithinParentInDocument(currentDocument, sourceNodeId, targetNodeId, position),
    );
  }

  function commitRelativeMove(
    sourceNodeId: string,
    targetNodeId: string,
    position: DropIndicatorPosition,
    axis: DropIndicatorAxis,
    parentId: string,
  ) {
    if (parentId === currentDocument.layout.id && axis === 'vertical') {
      moveRootNodeToRowBoundary(sourceNodeId, targetNodeId, position);
    } else {
      moveNodeWithinParent(sourceNodeId, targetNodeId, position);
    }

    clearNodeDragState();
  }

  function handleRelativeDragStart(nodeId: string, event: DragEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    captureDragSnapshots();
    setDraggingNodeId(nodeId);
    setDraggingNodeSnapshot(getNodeRectSnapshot(nodeId, builderNodeRefs.current[nodeId]));
    setSelectedNodeId(nodeId);
    setPreviewDocument(null);
    setPreviewSignature('');
  }

  function startRelativePointerDrag(
    node: ThemeLayoutNode,
    parent: ThemeLayoutNode | null,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!parent || draggingAlias || node.layout.mode === 'absolute') {
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
    if (!draggingNodeId || draggingNodeId === node.id || !parent) {
      return;
    }

    const draggingParentId = findParentId(currentDocument.layout, draggingNodeId);
    if (!draggingParentId || draggingParentId !== parent.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    const nextDropTarget = resolveParentDropTarget(
      getNodeRect,
      dropIndicator,
      parent,
      draggingNodeId,
      event.clientX,
      event.clientY,
      node.id,
    );
    if (!nextDropTarget) {
      return;
    }

    previewRelativeMove(draggingNodeId, nextDropTarget.nodeId, nextDropTarget.position, nextDropTarget.axis, parent.id);
  }

  function handleRelativeDrop(event: DragEvent<HTMLDivElement>, nodeId: string) {
    if (!draggingNodeId || draggingNodeId === nodeId || !dropIndicator) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const parentId = findParentId(currentDocument.layout, nodeId);
    if (parentId === currentDocument.layout.id && dropIndicator.axis === 'vertical') {
      moveRootNodeToRowBoundary(draggingNodeId, nodeId, dropIndicator.position);
    } else {
      moveNodeWithinParent(draggingNodeId, nodeId, dropIndicator.position);
    }
    clearNodeDragState();
  }

  function handleLibraryDragStart(alias: string, event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', alias);
    setDraggingAlias(alias);
  }

  function handleLibraryDragEnd() {
    editorCanvasDragStateActions.clearLibraryDragState();
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
        getNodeRect,
        dropIndicator,
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
      const draggingParentId = findParentId(currentDocument.layout, draggingNodeId);
      if (draggingParentId !== currentDocument.layout.id) {
        return;
      }

      const rootDropTarget = resolveScreenRowDropTarget(
        getNodeRect,
        dropIndicator,
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
            `canvas:${draggingNodeId}:${rootDropTarget.nodeId}` + `:${rootDropTarget.position}:${rootDropTarget.axis}`,
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
          moveNodeToParentEndInDocument(currentDocument, draggingNodeId, currentDocument.layout.id),
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
      editorCanvasDragStateActions.clearLibraryDragState();
      return;
    }

    if (draggingNodeId) {
      const draggingParentId = findParentId(currentDocument.layout, draggingNodeId);
      if (dropIndicator && draggingParentId === currentDocument.layout.id) {
        if (dropIndicator.axis === 'vertical') {
          moveRootNodeToRowBoundary(draggingNodeId, dropIndicator.nodeId, dropIndicator.position);
        } else {
          moveNodeWithinParent(draggingNodeId, dropIndicator.nodeId, dropIndicator.position);
        }
        clearNodeDragState();
        return;
      }

      moveNodeToParentEnd(draggingNodeId, currentDocument.layout.id);
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
          getNodeRectSnapshot(activePointerDrag.nodeId, builderNodeRefs.current[activePointerDrag.nodeId]),
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

      const parentNode = findNode(currentDocument.layout, activePointerDrag.parentId);
      if (!parentNode) {
        return;
      }

      const nextDropTarget = resolveParentDropTarget(
        getNodeRect,
        dropIndicator,
        parentNode,
        activePointerDrag.nodeId,
        event.clientX,
        event.clientY,
      );
      if (!nextDropTarget || nextDropTarget.nodeId === activePointerDrag.nodeId) {
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
  }, [clearNodeDragState, commitRelativeMove, dropIndicator, previewRelativeMove, relativePointerDrag]);

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
