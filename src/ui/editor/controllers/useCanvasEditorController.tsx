import type { ThemeComponentDescriptor } from '../../layout/types';
import type { LayoutBuilderTheme } from '../types';
import { useBuilderDocumentState } from './useBuilderDocumentState';
import { useCanvasDragAndDrop } from './useCanvasDragAndDrop';
import { useNodeEditDialogController } from './useNodeEditDialogController';
import { createLibraryPreviewDocument } from 'domain/template';

export function useCanvasEditorController(themes: LayoutBuilderTheme[], initialThemeId?: string) {
  const documentState = useBuilderDocumentState(themes, initialThemeId);
  const dialogController = useNodeEditDialogController({
    currentDocument: documentState.currentDocument,
    setEditorDocument: documentState.setEditorDocument,
    setSelectedNodeId: documentState.setSelectedNodeId,
  });
  const dragAndDrop = useCanvasDragAndDrop({
    currentDocument: documentState.currentDocument,
    selectedNodeId: documentState.selectedNodeId,
    setSelectedNodeId: documentState.setSelectedNodeId,
    updateNode: documentState.updateNode,
    handleDeleteNode: documentState.handleDeleteNode,
    addNodeFromAlias: documentState.addNodeFromAlias,
    insertNodeFromAliasRelative: documentState.insertNodeFromAliasRelative,
    moveNodeWithinParent: documentState.moveNodeWithinParent,
    moveNodeToParentEnd: documentState.moveNodeToParentEnd,
    moveRootNodeToRowBoundary: documentState.moveRootNodeToRowBoundary,
  });

  function getLibraryPreviewDocument(descriptor: ThemeComponentDescriptor) {
    return createLibraryPreviewDocument(documentState.activeTheme.layoutDocument, descriptor);
  }

  return {
    canvases: documentState.canvases,
    activeCanvas: documentState.activeCanvas,
    activeCanvasId: documentState.activeCanvasId,
    setActiveCanvasId: documentState.setActiveCanvasId,
    activeTheme: documentState.activeTheme,
    currentDocument: documentState.currentDocument,
    containerNodes: documentState.containerNodes,
    selectedNode: documentState.selectedNode,
    selectedDescriptor: documentState.selectedDescriptor,
    selectedContainerId: documentState.selectedContainerId,
    layoutDescriptors: documentState.layoutDescriptors,
    componentDescriptors: documentState.componentDescriptors,
    screenPreset: documentState.screenPreset,
    setScreenPreset: documentState.setScreenPreset,
    setSelectedNodeId: documentState.setSelectedNodeId,
    updateSelectedNodeProp: documentState.updateSelectedNodeProp,
    applyAiEditInstructions: documentState.applyAiEditInstructions,
    handleDeleteNode: documentState.handleDeleteNode,
    dialogState: dialogController.dialogState,
    dialogError: dialogController.dialogError,
    openEditDialog: dialogController.openEditDialog,
    closeDialog: dialogController.closeDialog,
    updateDraft: dialogController.updateDraft,
    updateDraftProp: dialogController.updateDraftProp,
    handleSaveDraft: dialogController.handleSaveDraft,
    draggingAlias: dragAndDrop.draggingAlias,
    isCanvasActive: dragAndDrop.isCanvasActive,
    previewDocument: dragAndDrop.previewDocument,
    handleLibraryDragStart: dragAndDrop.handleLibraryDragStart,
    handleLibraryDragEnd: dragAndDrop.handleLibraryDragEnd,
    handleCanvasDragOver: dragAndDrop.handleCanvasDragOver,
    handleCanvasDragLeave: dragAndDrop.handleCanvasDragLeave,
    handleCanvasDrop: dragAndDrop.handleCanvasDrop,
    renderBuilderNodeShell: dragAndDrop.renderBuilderNodeShell,
    createLibraryPreviewDocument: getLibraryPreviewDocument,
    applyTemplateToActiveCanvas: documentState.applyTemplateToActiveCanvas,
    createCanvas: documentState.createCanvas,
    clearActiveCanvas: documentState.clearActiveCanvas,
    updateActiveCanvasName: documentState.updateActiveCanvasName,
  };
}
