import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import { useCanvasNodeShellRenderer } from './useCanvasNodeShellRenderer';
import { useCanvasPointerInteractions } from './useCanvasPointerInteractions';
import { useCanvasReorder } from './useCanvasReorder';

interface UseCanvasDragAndDropArgs {
  currentDocument: ThemeLayoutDocument;
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  updateNode: (
    nodeId: string,
    updater: (node: ThemeLayoutNode) => void,
  ) => void;
  handleDeleteNode: (nodeId: string) => void;
  addNodeFromAlias: (alias: string, parentId?: string) => void;
  insertNodeFromAliasRelative: (
    alias: string,
    parentId: string,
    targetId: string,
    position: 'before' | 'after',
    axis: 'horizontal' | 'vertical',
  ) => void;
  moveNodeWithinParent: (
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void;
  moveNodeToParentEnd: (nodeId: string, parentId: string) => void;
  moveRootNodeToRowBoundary: (
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void;
}

export function useCanvasDragAndDrop({
  currentDocument,
  selectedNodeId,
  setSelectedNodeId,
  updateNode,
  handleDeleteNode,
  addNodeFromAlias,
  insertNodeFromAliasRelative,
  moveNodeWithinParent,
  moveNodeToParentEnd,
  moveRootNodeToRowBoundary,
}: UseCanvasDragAndDropArgs) {
  const pointerInteractions = useCanvasPointerInteractions({
    updateNode,
    setSelectedNodeId,
  });

  const reorder = useCanvasReorder({
    currentDocument,
    setSelectedNodeId,
    addNodeFromAlias,
    insertNodeFromAliasRelative,
    moveNodeWithinParent,
    moveNodeToParentEnd,
    moveRootNodeToRowBoundary,
    builderNodeRefs: pointerInteractions.builderNodeRefs,
  });

  const shellRenderer = useCanvasNodeShellRenderer({
    currentDocument,
    selectedNodeId,
    setSelectedNodeId,
    handleDeleteNode,
    setBuilderNodeRef: pointerInteractions.setBuilderNodeRef,
    builderNodeRefs: pointerInteractions.builderNodeRefs,
    startAbsoluteDrag: pointerInteractions.startAbsoluteDrag,
    startResize: pointerInteractions.startResize,
    draggingAlias: reorder.draggingAlias,
    draggingNodeId: reorder.draggingNodeId,
    draggingNodeSnapshot: reorder.draggingNodeSnapshot,
    relativePointerDrag: reorder.relativePointerDrag,
    dropIndicator: reorder.dropIndicator,
    containerDropTargetId: reorder.containerDropTargetId,
    setIsCanvasActive: reorder.setIsCanvasActive,
    setContainerDropTargetId: reorder.setContainerDropTargetId,
    setDraggingAlias: reorder.setDraggingAlias,
    addNodeFromAlias,
    startRelativePointerDrag: reorder.startRelativePointerDrag,
    handleRelativeDragStart: reorder.handleRelativeDragStart,
    handleRelativeDragOver: reorder.handleRelativeDragOver,
    handleRelativeDrop: reorder.handleRelativeDrop,
    clearNodeDragState: reorder.clearNodeDragState,
  });

  return {
    draggingAlias: reorder.draggingAlias,
    isCanvasActive: reorder.isCanvasActive,
    previewDocument: reorder.previewDocument,
    handleLibraryDragStart: reorder.handleLibraryDragStart,
    handleLibraryDragEnd: reorder.handleLibraryDragEnd,
    handleCanvasDragOver: reorder.handleCanvasDragOver,
    handleCanvasDragLeave: reorder.handleCanvasDragLeave,
    handleCanvasDrop: reorder.handleCanvasDrop,
    renderBuilderNodeShell: shellRenderer.renderBuilderNodeShell,
  };
}
