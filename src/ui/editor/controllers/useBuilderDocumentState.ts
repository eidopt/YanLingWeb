import {
  normalizeThemeLayoutDocument,
  type ThemeLayoutDocument,
  type ThemeLayoutNode,
  type ThemeLayoutPage,
} from '../../layout/types';
import type { DynamicThemeScreenPreset } from '../../renderer';
import {
  applyEditorAiEditInstructions,
  type EditorAiEditInstruction,
} from '../services/aiEditInstructions';
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
} from '../services/layoutBuilderService';
import type { BuilderCanvas, LayoutBuilderTheme } from '../types';
import { type Dispatch, type SetStateAction, useState } from 'react';

function createCanvasId() {
  return `canvas-${Math.random().toString(36).slice(2, 8)}`;
}

function createCanvasName(index: number) {
  return `页面${index + 1}`;
}

function createDocumentFromPage(
  themeDocument: ThemeLayoutDocument,
  page: ThemeLayoutPage,
): ThemeLayoutDocument {
  return normalizeThemeLayoutDocument({
    ...themeDocument,
    pageName: page.name,
    defaultPageId: page.id,
    pages: [structuredClone(page)],
    layout: structuredClone(page.layout),
  });
}

function createCanvasesFromTheme(theme: LayoutBuilderTheme): BuilderCanvas[] {
  return theme.layoutDocument.pages.map((page) => {
    const defaultName = page.name.trim() || theme.name;

    return {
      id: createCanvasId(),
      name: defaultName,
      defaultName,
      themeId: theme.id,
      document: createDocumentFromPage(theme.layoutDocument, page),
    };
  });
}

function createCanvasFromTheme(
  theme: LayoutBuilderTheme,
  index: number,
  blank = false,
): BuilderCanvas {
  const defaultName = blank
    ? createCanvasName(index)
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through */
    : theme.layoutDocument.pageName?.trim()
      || theme.layoutDocument.layout.props?.title?.toString().trim()
      || theme.name;
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
  const document = blank
    ? createBlankDocument(theme.layoutDocument)
    : cloneDocument(theme.layoutDocument);
  document.pageName = defaultName;

  return {
    id: createCanvasId(),
    name: defaultName,
    defaultName,
    themeId: theme.id,
    document,
  };
}

export function useBuilderDocumentState(
  themes: LayoutBuilderTheme[],
  initialThemeId?: string,
) {
  const initialTheme = (
    initialThemeId
      ? themes.find((t) => t.id === initialThemeId)
      : undefined
  ) ?? themes[0];
  const [canvases, setCanvases] = useState<BuilderCanvas[]>(() =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themes[0] may be undefined at runtime without noUncheckedIndexedAccess
    initialTheme ? createCanvasesFromTheme(initialTheme) : [],
  );
  const [activeCanvasId, setActiveCanvasIdState] = useState(
    () => canvases[0]?.id ?? '',
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [screenPreset, setScreenPreset] =
    useState<DynamicThemeScreenPreset>('mobile');

  const activeCanvas =
    canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const activeTheme =
    themes.find((theme) => theme.id === activeCanvas.themeId) ?? themes[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard; array elements may be undefined at runtime
  if (!activeTheme || !activeCanvas) {
    throw new Error('Theme layout builder requires at least one theme.');
  }

  const currentDocument = activeCanvas.document;
  const flatNodes = flattenNodes(currentDocument.layout);
  const containerNodes = flatNodes.filter(
    ({ node }) => CONTAINER_ALIASES.has(node.alias),
  );
  const selectedNode = selectedNodeId
    ? flatNodes.find(({ node }) => node.id === selectedNodeId)?.node ?? null
    : null;
  const selectedDescriptor = selectedNode
    ? descriptorForAlias(currentDocument, selectedNode.alias)
    : null;
  const selectedContainerId =
    selectedNode && CONTAINER_ALIASES.has(selectedNode.alias)
      ? selectedNode.id
      : currentDocument.layout.id;
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
    setActiveCanvasIdState(canvasId);
    setSelectedNodeId(null);
  }

  const setEditorDocument: Dispatch<
    SetStateAction<ThemeLayoutDocument | null>
  > = (value) => {
    setCanvases((current) =>
      current.map((canvas) => {
        if (canvas.id !== activeCanvas.id) {
          return canvas;
        }

        const nextDocument =
          typeof value === 'function' ? value(canvas.document) : value;
        return nextDocument
          ? {
              ...canvas,
              document: nextDocument,
            }
          : canvas;
      }),
    );
  };

  function updateNode(
    nodeId: string,
    updater: (node: ThemeLayoutNode) => void,
  ) {
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

    const propDescriptor = selectedDescriptor.props.find(
      (prop) => prop.name === name,
    );
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
  ) {
    const result = applyEditorAiEditInstructions(
      currentDocument,
      instructions,
    );
    setEditorDocument(result.document);
    if (result.selectedNodeId !== undefined) {
      setSelectedNodeId(result.selectedNodeId);
    }
    return result;
  }

  function moveNodeWithinParent(
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveNodeWithinParentInDocument(current, nodeId, targetId, position)
        ?? current
      );
    });
  }

  function moveNodeToParentEnd(nodeId: string, parentId: string) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveNodeToParentEndInDocument(current, nodeId, parentId) ?? current
      );
    });
  }

  function moveRootNodeToRowBoundary(
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveRootNodeToRowBoundaryInDocument(
          current,
          nodeId,
          targetId,
          position,
        ) ?? current
      );
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

  function addNodeFromAlias(
    alias: string,
    parentId = currentDocument.layout.id,
  ) {
    const descriptor = descriptorForAlias(currentDocument, alias);
    if (!descriptor) {
      return;
    }

    const slot =
      parentId === currentDocument.layout.id
      && FOOTER_ALIASES.has(descriptor.alias)
        ? 'footer'
        : 'body';
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
        parentId === currentDocument.layout.id && slot === 'body'
          ? nextRootFlowRow(currentDocument.layout)
          : 0,
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

    const slot =
      parentId === currentDocument.layout.id
      && FOOTER_ALIASES.has(descriptor.alias)
        ? 'footer'
        : 'body';
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
        parentId === currentDocument.layout.id
          ? nextRootFlowRow(currentDocument.layout)
          : 0,
      ),
      sampleChildren,
    );

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        insertNodeRelativeToTargetInDocument(
          current,
          parentId,
          nextNode,
          targetId,
          position,
          axis,
        ) ?? current
      );
    });
    setSelectedNodeId(nextNode.id);
  }

  function applyTemplateToActiveCanvas(themeId: string) {
    const nextTheme = themes.find((theme) => theme.id === themeId) ?? themes[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard
    if (!nextTheme) {
      return;
    }

    const nextCanvases = createCanvasesFromTheme(nextTheme);
    const defaultPageId = nextTheme.layoutDocument.defaultPageId;
    const defaultCanvas =
      nextCanvases.find(
        (canvas) => canvas.document.defaultPageId === defaultPageId,
      ) ?? nextCanvases[0];

    setCanvases(nextCanvases);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- nextCanvases[0] may be undefined at runtime
    setActiveCanvasIdState(defaultCanvas?.id ?? '');
    setSelectedNodeId(null);
  }

  function createCanvas() {
    const nextCanvas = createCanvasFromTheme(
      activeTheme,
      canvases.length,
      true,
    );
    setCanvases((current) => [...current, nextCanvas]);
    setActiveCanvasIdState(nextCanvas.id);
    setSelectedNodeId(null);
  }

  function clearActiveCanvas() {
    setCanvases((current) =>
      current.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              document: {
                ...createBlankDocument(canvas.document),
                pageName: canvas.name,
              },
            }
          : canvas,
      ),
    );
    setSelectedNodeId(null);
  }

  function updateActiveCanvasName(name: string) {
    setCanvases((current) =>
      current.map((canvas) =>
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
      ),
    );
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
