import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import { getDefaultPreviewScreenPreset } from '../../renderer';
import {
  applyEditorAiEditInstructions,
  type ApplyEditorAiEditInstructionsOptions,
  type EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import type { LayoutBuilderTheme } from '../types';
import { applyAiEditInstructionsToCanvases } from './useBuilderDocumentState.applyToCanvases';
import {
  createCanvasesFromTheme,
  createCanvasFromTheme,
  needsMultiPageContext,
} from './useBuilderDocumentState.canvasFactory';
import {
  buildNodeFromDraft,
  cloneDocument,
  CONTAINER_ALIASES,
  createBlankDocument,
  createDraft,
  createLibrarySampleChildren,
  descriptorForAlias,
  type DropIndicatorAxis,
  flattenNodes,
  FOOTER_ALIASES,
  insertNodeRelativeToTargetInDocument,
  moveNodeToParentEndInDocument,
  moveNodeWithinParentInDocument,
  moveRootNodeToRowBoundaryInDocument,
  nextRootFlowRow,
  removeNode,
  updateNodeInDocument,
  upsertNode,
} from 'domain/template';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import { editorDocumentStateActions, useEditorDocumentSnapshot } from 'state/editorDocumentState';

export { applyAiEditInstructionsToCanvases } from './useBuilderDocumentState.applyToCanvases';

export function useBuilderDocumentState(themes: LayoutBuilderTheme[], initialThemeId?: string) {
  const initialTheme = (initialThemeId ? themes.find((t) => t.id === initialThemeId) : undefined) ?? themes[0];
  const initialScreenPreset = getDefaultPreviewScreenPreset(initialTheme.platformCategories);
  const documentSessionKey = `${initialThemeId ?? ''}:${themes.map((theme) => theme.id).join('|')}`;
  const { canvases, activeCanvasId, selectedNodeId, screenPreset } = useEditorDocumentSnapshot(
    documentSessionKey,
    () => {
      const initialCanvases = createCanvasesFromTheme(initialTheme);
      return {
        sessionKey: documentSessionKey,
        canvases: initialCanvases,
        activeCanvasId: initialCanvases[0]?.id ?? '',
        selectedNodeId: null,
        screenPreset: initialScreenPreset,
      };
    },
  );
  const {
    setSnapshot: setDocumentSnapshot,
    setCanvases,
    setSelectedNodeId,
    setScreenPreset,
  } = editorDocumentStateActions;
  const canvasesRef = useRef(canvases);
  const activeCanvasIdRef = useRef(activeCanvasId);

  useEffect(() => {
    canvasesRef.current = canvases;
  }, [canvases]);

  useEffect(() => {
    activeCanvasIdRef.current = activeCanvasId;
  }, [activeCanvasId]);

  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const activeTheme = themes.find((theme) => theme.id === activeCanvas.themeId) ?? themes[0];

  const currentDocument = activeCanvas.document;
  const flatNodes = flattenNodes(currentDocument.layout);
  const containerNodes = flatNodes.filter(({ node }) => CONTAINER_ALIASES.has(node.alias));
  const selectedNode = selectedNodeId ? (flatNodes.find(({ node }) => node.id === selectedNodeId)?.node ?? null) : null;
  const selectedDescriptor = selectedNode ? descriptorForAlias(currentDocument, selectedNode.alias) : null;
  const selectedContainerId =
    selectedNode && CONTAINER_ALIASES.has(selectedNode.alias) ? selectedNode.id : currentDocument.layout.id;
  const layoutDescriptors = activeTheme.layoutDocument.components.filter(
    (component) =>
      component.kind === 'layout' &&
      component.alias !== 'core.screen' &&
      component.alias !== 'core.row' &&
      component.alias !== 'core.grid',
  );
  const componentDescriptors = activeTheme.layoutDocument.components.filter(
    (component) => component.kind === 'component',
  );

  function setActiveCanvasId(canvasId: string) {
    activeCanvasIdRef.current = canvasId;
    setDocumentSnapshot((current) => ({
      ...current,
      activeCanvasId: canvasId,
      selectedNodeId: null,
    }));
  }

  const setEditorDocument: Dispatch<SetStateAction<ThemeLayoutDocument | null>> = (value) => {
    setCanvases((current) => {
      const activeId = activeCanvasIdRef.current;
      const nextCanvases = current.map((canvas) => {
        if (canvas.id !== activeId) {
          return canvas;
        }

        const nextDocument = typeof value === 'function' ? value(canvas.document) : value;
        return nextDocument
          ? {
              ...canvas,
              document: nextDocument,
            }
          : canvas;
      });
      canvasesRef.current = nextCanvases;
      return nextCanvases;
    });
  };

  function updateNode(nodeId: string, updater: (node: ThemeLayoutNode) => void) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return updateNodeInDocument(current, nodeId, updater) ?? current;
    });
  }

  function updateSelectedNodeProp(name: string, value: string | boolean) {
    if (!selectedDescriptor || !selectedNode) {
      return;
    }

    const propDescriptor = selectedDescriptor.props.find((prop) => prop.name === name);
    if (!propDescriptor) {
      return;
    }

    updateNode(selectedNode.id, (node) => {
      const nextProps = { ...(node.props ?? {}) };

      if (propDescriptor.type === 'boolean') {
        nextProps[name] = Boolean(value);
        node.props = nextProps;
        return;
      }

      if (typeof value !== 'string') {
        return;
      }

      if (propDescriptor.type === 'number') {
        nextProps[name] = value === '' ? '' : Number(value);
        node.props = nextProps;
        return;
      }

      if (propDescriptor.type === 'string[]') {
        nextProps[name] = value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
        node.props = nextProps;
        return;
      }

      nextProps[name] = value;
      node.props = nextProps;
    });
  }

  function applyAiEditInstructions(
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) {
    const liveCanvases = canvasesRef.current;
    const liveActiveCanvas = liveCanvases.find((canvas) => canvas.id === activeCanvasIdRef.current) ?? liveCanvases[0];
    const liveActiveTheme = themes.find((theme) => theme.id === liveActiveCanvas.themeId) ?? activeTheme;

    if (instructions.some(needsMultiPageContext)) {
      const result = applyAiEditInstructionsToCanvases({
        canvases: liveCanvases,
        activeCanvasId: liveActiveCanvas.id,
        activeTheme: liveActiveTheme,
        instructions,
        options,
      });
      canvasesRef.current = result.canvases;
      activeCanvasIdRef.current = result.activeCanvasId;
      setDocumentSnapshot((current) => ({
        ...current,
        canvases: result.canvases,
        activeCanvasId: result.activeCanvasId,
        selectedNodeId: result.selectedNodeId === undefined ? current.selectedNodeId : result.selectedNodeId,
      }));
      return result;
    }

    const result = applyEditorAiEditInstructions(liveActiveCanvas.document, instructions, options);
    const nextCanvases = liveCanvases.map((canvas) =>
      canvas.id === liveActiveCanvas.id ? { ...canvas, document: result.document } : canvas,
    );
    canvasesRef.current = nextCanvases;
    setDocumentSnapshot((current) => ({
      ...current,
      canvases: nextCanvases,
      selectedNodeId: result.selectedNodeId === undefined ? current.selectedNodeId : result.selectedNodeId,
    }));
    return result;
  }

  function moveNodeWithinParent(nodeId: string, targetId: string, position: 'before' | 'after') {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return moveNodeWithinParentInDocument(current, nodeId, targetId, position) ?? current;
    });
  }

  function moveNodeToParentEnd(nodeId: string, parentId: string) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return moveNodeToParentEndInDocument(current, nodeId, parentId) ?? current;
    });
  }

  function moveRootNodeToRowBoundary(nodeId: string, targetId: string, position: 'before' | 'after') {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return moveRootNodeToRowBoundaryInDocument(current, nodeId, targetId, position) ?? current;
    });
  }

  function handleDeleteNode(nodeId: string) {
    if (nodeId === currentDocument.layout.id) {
      return;
    }

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      const nextDocument = cloneDocument(current);
      removeNode(nextDocument.layout, nodeId);
      return nextDocument;
    });

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }

  function addNodeFromAlias(alias: string, parentId = currentDocument.layout.id) {
    const descriptor = descriptorForAlias(currentDocument, alias);
    if (!descriptor) {
      return;
    }

    const slot = parentId === currentDocument.layout.id && FOOTER_ALIASES.has(descriptor.alias) ? 'footer' : 'body';
    const sampleChildren =
      descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack'
        ? createLibrarySampleChildren(currentDocument, descriptor.alias)
        : undefined;
    const nextNode = buildNodeFromDraft(
      descriptor,
      createDraft(
        currentDocument.themeId,
        descriptor,
        parentId,
        slot,
        undefined,
        parentId === currentDocument.layout.id && slot === 'body' ? nextRootFlowRow(currentDocument.layout) : 0,
      ),
      sampleChildren,
    );

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return upsertNode(current, parentId, nextNode) ?? current;
    });
    setSelectedNodeId(nextNode.id);
  }

  function insertNodeFromAliasRelative(
    alias: string,
    parentId: string,
    targetId: string,
    position: 'before' | 'after',
    axis: DropIndicatorAxis,
  ) {
    const descriptor = descriptorForAlias(currentDocument, alias);
    if (!descriptor) {
      return;
    }

    const slot = parentId === currentDocument.layout.id && FOOTER_ALIASES.has(descriptor.alias) ? 'footer' : 'body';
    if (slot === 'footer') {
      addNodeFromAlias(alias, parentId);
      return;
    }

    const sampleChildren =
      descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack'
        ? createLibrarySampleChildren(currentDocument, descriptor.alias)
        : undefined;
    const nextNode = buildNodeFromDraft(
      descriptor,
      createDraft(
        currentDocument.themeId,
        descriptor,
        parentId,
        slot,
        undefined,
        parentId === currentDocument.layout.id ? nextRootFlowRow(currentDocument.layout) : 0,
      ),
      sampleChildren,
    );

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return insertNodeRelativeToTargetInDocument(current, parentId, nextNode, targetId, position, axis) ?? current;
    });
    setSelectedNodeId(nextNode.id);
  }

  function applyTemplateToActiveCanvas(themeId: string) {
    const nextTheme = themes.find((theme) => theme.id === themeId) ?? themes[0];
    const nextCanvases = createCanvasesFromTheme(nextTheme);
    const defaultPageId = nextTheme.layoutDocument.defaultPageId;
    const defaultCanvas =
      nextCanvases.find((canvas) => canvas.document.defaultPageId === defaultPageId) ?? nextCanvases[0];

    const nextActiveCanvasId = defaultCanvas.id;
    canvasesRef.current = nextCanvases;
    activeCanvasIdRef.current = nextActiveCanvasId;
    setDocumentSnapshot((current) => ({
      ...current,
      canvases: nextCanvases,
      activeCanvasId: nextActiveCanvasId,
      selectedNodeId: null,
      screenPreset: getDefaultPreviewScreenPreset(nextTheme.platformCategories),
    }));
  }

  function createCanvas() {
    const nextCanvas = createCanvasFromTheme(activeTheme, canvases.length, true);
    activeCanvasIdRef.current = nextCanvas.id;
    setDocumentSnapshot((current) => {
      const nextCanvases = [...current.canvases, nextCanvas];
      canvasesRef.current = nextCanvases;
      return {
        ...current,
        canvases: nextCanvases,
        activeCanvasId: nextCanvas.id,
        selectedNodeId: null,
      };
    });
  }

  function clearActiveCanvas() {
    setCanvases((current) => {
      const nextCanvases = current.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              document: {
                ...createBlankDocument(canvas.document),
                pageName: canvas.name,
              },
            }
          : canvas,
      );
      canvasesRef.current = nextCanvases;
      return nextCanvases;
    });
    setSelectedNodeId(null);
  }

  function updateActiveCanvasName(name: string) {
    setCanvases((current) => {
      const nextCanvases = current.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              name,
              document: {
                ...canvas.document,
                pageName: name,
              },
            }
          : canvas,
      );
      canvasesRef.current = nextCanvases;
      return nextCanvases;
    });
  }

  return {
    canvases,
    activeCanvas,
    activeCanvasId,
    setActiveCanvasId,
    activeTheme,
    currentDocument,
    setEditorDocument,
    containerNodes,
    selectedNode,
    selectedDescriptor,
    selectedNodeId,
    setSelectedNodeId,
    selectedContainerId,
    layoutDescriptors,
    componentDescriptors,
    screenPreset,
    setScreenPreset,
    updateNode,
    updateSelectedNodeProp,
    applyAiEditInstructions,
    moveNodeWithinParent,
    moveNodeToParentEnd,
    moveRootNodeToRowBoundary,
    insertNodeFromAliasRelative,
    handleDeleteNode,
    addNodeFromAlias,
    applyTemplateToActiveCanvas,
    createCanvas,
    clearActiveCanvas,
    updateActiveCanvasName,
  };
}
