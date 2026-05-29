'use client';

import {
  DynamicThemeRenderer,
  type DynamicThemeScreenPreset,
  getDefaultPreviewScreenPreset,
  getPreviewScreenPresetOptions,
  isPreviewScreenPresetAllowed,
  useDynamicThemeRendererController,
} from '../renderer';
import { BuilderLibraryPanel } from './components/BuilderLibraryPanel';
import { EditorAiPanel } from './components/EditorAiPanel';
import { InteractionModeToggle } from './components/InteractionModeToggle';
import { NodeEditDialog } from './components/NodeEditDialog';
import { PreviewModeSwitch } from './components/PreviewModeSwitch';
import { SelectedNodeInspector } from './components/SelectedNodeInspector';
import { useCanvasEditorController } from './controllers/useCanvasEditorController';
import { useEditorKeyboardShortcuts } from './controllers/useEditorKeyboardShortcuts';
import { flattenNodes } from './services/layoutBuilderService';
import { themeLayoutBuilderContent } from './ThemeLayoutBuilder.content';
import styles from './ThemeLayoutBuilder.module.css';
import type { LayoutBuilderTheme } from './types';
import type { BuilderCanvas } from './types';
import { cx } from 'base/classname';
import { useCallback, useEffect, useRef } from 'react';
import {
  type EditorBuilderInteractionMode,
  editorBuilderUiStateActions,
  useEditorBuilderUiSnapshot,
} from 'state/editorBuilderUiState';
import { Tooltip } from 'ui';
import { Box, Button, Input } from 'ui/base';
import { ExportDialog } from 'ui/export_dialog/ExportDialog';

interface ThemeLayoutBuilderProps {
  themes: LayoutBuilderTheme[];
  libraryThemes?: LayoutBuilderTheme[];
  initialThemeId?: string;
  onCanvasesChange?: (canvases: BuilderCanvas[], activeCanvasId: string, activeTheme: LayoutBuilderTheme) => void;
}

const PHONE_CANVAS_WIDTH = 352;
const PHONE_CANVAS_HEIGHT = 672;
const TABLET_CANVAS_WIDTH = 768;
const TABLET_CANVAS_HEIGHT = 1024;
const DESKTOP_CANVAS_WIDTH = 1120;
const DESKTOP_CANVAS_HEIGHT = 896;

function getElementContentSize(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element);
  const horizontalPadding =
    Number.parseFloat(computedStyle.paddingLeft) + Number.parseFloat(computedStyle.paddingRight);
  const verticalPadding = Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);

  return {
    width: element.clientWidth - horizontalPadding,
    height: element.clientHeight - verticalPadding,
  };
}

function canvasSizeForPreset(screenPreset: DynamicThemeScreenPreset) {
  if (screenPreset === 'desktop') {
    return { width: DESKTOP_CANVAS_WIDTH, height: DESKTOP_CANVAS_HEIGHT };
  }
  if (screenPreset === 'tablet') {
    return { width: TABLET_CANVAS_WIDTH, height: TABLET_CANVAS_HEIGHT };
  }
  return { width: PHONE_CANVAS_WIDTH, height: PHONE_CANVAS_HEIGHT };
}

function getCanvasPageStats(canvas: BuilderCanvas) {
  const nodes = flattenNodes(canvas.document.layout);
  const bodyNodeCount = nodes.filter(({ depth, node }) => depth > 0 && node.slot !== 'footer').length;
  const footerNodeCount = nodes.filter(({ node }) => node.slot === 'footer').length;

  return {
    nodeCount: nodes.length,
    bodyNodeCount,
    footerNodeCount,
    isBlank: bodyNodeCount === 0,
  };
}

export function ThemeLayoutBuilder({
  themes,
  libraryThemes,
  initialThemeId,
  onCanvasesChange,
}: ThemeLayoutBuilderProps) {
  const { sidebarTab, interactionMode, isExportDialogOpen, canvasScale } = useEditorBuilderUiSnapshot();
  const { setSidebarTab, setInteractionMode, setExportDialogOpen, setCanvasScale } = editorBuilderUiStateActions;
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const canvasDropRef = useRef<HTMLDivElement | null>(null);
  const controller = useCanvasEditorController(themes, initialThemeId);

  const {
    canvases,
    activeCanvas,
    activeCanvasId,
    setActiveCanvasId,
    activeTheme,
    currentDocument,
    selectedNode,
    selectedDescriptor,
    layoutDescriptors,
    componentDescriptors,
    dialogState,
    dialogError,
    isCanvasActive,
    previewDocument,
    screenPreset,
    setScreenPreset,
    setSelectedNodeId,
    updateSelectedNodeProp,
    applyAiEditInstructions,
    openEditDialog,
    handleDeleteNode,
    closeDialog,
    updateDraft,
    updateDraftProp,
    handleSaveDraft,
    handleLibraryDragStart,
    handleLibraryDragEnd,
    createLibraryPreviewDocument,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
    renderBuilderNodeShell,
    applyTemplateToActiveCanvas,
    createCanvas,
    clearActiveCanvas,
    updateActiveCanvasName,
    containerNodes,
  } = controller;
  const screenPresetOptions = getPreviewScreenPresetOptions(activeTheme.platformCategories);

  const { width: canvasWidth, height: canvasHeight } = canvasSizeForPreset(screenPreset);
  const activeCanvasIndex = canvases.findIndex((canvas) => canvas.id === activeCanvasId);
  const defaultPageName =
    activeCanvas.defaultName ||
    themeLayoutBuilderContent.preview.defaultPageName(activeCanvasIndex >= 0 ? activeCanvasIndex + 1 : 1);
  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- pageName/name may be undefined at runtime despite the type */
  const currentPageName = activeCanvas.document.pageName ?? activeCanvas.name ?? defaultPageName;
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  const isPreviewMode = interactionMode === 'preview';
  const documentForRender = previewDocument ?? currentDocument;

  useEffect(() => {
    if (!isPreviewScreenPresetAllowed(screenPreset, activeTheme.platformCategories)) {
      setScreenPreset(getDefaultPreviewScreenPreset(activeTheme.platformCategories));
    }
  }, [activeTheme.platformCategories, screenPreset, setScreenPreset]);

  const rendererController = useDynamicThemeRendererController({
    layoutDocument: documentForRender,
    runtime: activeTheme.runtime,
    renderNodeShell: isPreviewMode ? undefined : renderBuilderNodeShell,
    screenPreset,
    onNavigateToPage: isPreviewMode
      ? (pageId) => {
          const targetCanvas = canvases.find((canvas) => canvas.document.defaultPageId === pageId);
          if (!targetCanvas || targetCanvas.id === activeCanvasId) {
            return Boolean(targetCanvas);
          }

          closeDialog();
          setActiveCanvasId(targetCanvas.id);
          return true;
        }
      : undefined,
  });

  useEffect(() => {
    const stageElement = previewStageRef.current;
    const dropElement = canvasDropRef.current;
    const observedElement = dropElement ?? stageElement;
    if (!observedElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasScale();
    });

    resizeObserver.observe(observedElement);

    function updateCanvasScale() {
      const activeDropElement = canvasDropRef.current;
      const activeStageElement = previewStageRef.current;
      const targetElement = activeDropElement ?? activeStageElement;
      if (!targetElement) {
        return;
      }

      const availableSize = getElementContentSize(targetElement);
      if (availableSize.width <= 0 || availableSize.height <= 0) {
        setCanvasScale(1);
        return;
      }

      const widthScale = availableSize.width / canvasWidth;
      const heightScale = availableSize.height / canvasHeight;
      const nextScale = Math.min(widthScale, heightScale);
      setCanvasScale(nextScale > 0 ? nextScale : 1);
    }

    updateCanvasScale();

    return () => resizeObserver.disconnect();
  }, [canvasHeight, canvasWidth, setCanvasScale]);

  useEffect(() => {
    onCanvasesChange?.(canvases, activeCanvasId, activeTheme);
  }, [activeCanvasId, activeTheme, canvases, onCanvasesChange]);

  function handleApplyTemplate(themeId: string) {
    closeDialog();
    applyTemplateToActiveCanvas(themeId);
    setSidebarTab('components');
  }

  function handleCreateCanvas() {
    closeDialog();
    createCanvas();
    setSidebarTab('templates');
  }

  function handleClearCanvas() {
    closeDialog();
    clearActiveCanvas();
  }

  function handlePageNameBlur() {
    if (currentPageName.trim()) {
      return;
    }

    updateActiveCanvasName(defaultPageName);
  }

  function handleSelectCanvas(canvasId: string) {
    closeDialog();
    setActiveCanvasId(canvasId);
  }

  function handleChangeInteractionMode(mode: EditorBuilderInteractionMode) {
    closeDialog();
    setSelectedNodeId(null);
    setInteractionMode(mode);
  }

  // ── Keyboard shortcuts ──
  useEditorKeyboardShortcuts({
    enabled: !isPreviewMode,
    onDelete: useCallback(() => {
      if (selectedNode && selectedNode.id !== currentDocument.layout.id) {
        handleDeleteNode(selectedNode.id);
      }
    }, [selectedNode, currentDocument.layout.id, handleDeleteNode]),
    onDeselect: useCallback(() => {
      setSelectedNodeId(null);
    }, [setSelectedNodeId]),
    onCloseDialog: useCallback(() => {
      closeDialog();
    }, [closeDialog]),
  });

  return (
    <Box as="main" className={styles.page}>
      <Box as="section" className={styles.workspace}>
        <BuilderLibraryPanel
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          activeTheme={activeTheme}
          templates={libraryThemes ?? themes}
          activeTemplateId={activeTheme.id}
          layoutDescriptors={layoutDescriptors}
          componentDescriptors={componentDescriptors}
          createLibraryPreviewDocument={createLibraryPreviewDocument}
          onApplyTemplate={handleApplyTemplate}
          onLibraryDragStart={handleLibraryDragStart}
          onLibraryDragEnd={handleLibraryDragEnd}
        />

        <Box
          as="section"
          className={styles.previewPanel}
          style={{ ['--preview-accent' as string]: activeTheme.accent }}
        >
          <Box className={styles.canvasToolbar}>
            <Box className={styles.canvasToolbarLeft}>
              <Button
                type="button"
                onClick={handleClearCanvas}
                aria-label={themeLayoutBuilderContent.preview.clearCanvasAriaLabel}
                title={themeLayoutBuilderContent.preview.clearCanvasAriaLabel}
                disabled={isPreviewMode}
                size="sm"
                variant="secondary"
              >
                {themeLayoutBuilderContent.preview.clearCanvas}
              </Button>

              <Tooltip as="div" content={themeLayoutBuilderContent.preview.exportTooltip}>
                <Button
                  type="button"
                  onClick={() => setExportDialogOpen(true)}
                  aria-label={themeLayoutBuilderContent.preview.exportAriaLabel}
                  size="sm"
                  variant="primary"
                >
                  {themeLayoutBuilderContent.preview.export}
                </Button>
              </Tooltip>
            </Box>

            <Box className={styles.pageNameField}>
              <Input
                type="text"
                value={currentPageName}
                aria-label={themeLayoutBuilderContent.preview.pageNameAriaLabel}
                onChange={(event) => updateActiveCanvasName(event.target.value)}
                onBlur={handlePageNameBlur}
                readOnly={isPreviewMode}
                size="sm"
                variant="quiet"
              />
            </Box>

            <Box className={styles.canvasToolbarRight}>
              <Tooltip as="div" content={themeLayoutBuilderContent.preview.screenPresetTooltip}>
                <PreviewModeSwitch
                  screenPreset={screenPreset}
                  options={screenPresetOptions}
                  onChange={setScreenPreset}
                />
              </Tooltip>
              <Tooltip as="div" content={themeLayoutBuilderContent.preview.interactionModeTooltip}>
                <InteractionModeToggle mode={interactionMode} onChange={handleChangeInteractionMode} />
              </Tooltip>
            </Box>
          </Box>

          <Box ref={previewStageRef} className={styles.previewStage}>
            <Box
              ref={canvasDropRef}
              className={cx(styles.canvasDrop, isCanvasActive && styles.canvasDropActive)}
              onClick={isPreviewMode ? undefined : () => setSelectedNodeId(null)}
              onDragOver={isPreviewMode ? undefined : handleCanvasDragOver}
              onDragLeave={isPreviewMode ? undefined : handleCanvasDragLeave}
              onDrop={isPreviewMode ? undefined : handleCanvasDrop}
            >
              <Box
                className={styles.canvasViewport}
                style={{
                  width: `${canvasWidth * canvasScale}px`,
                  height: `${canvasHeight * canvasScale}px`,
                }}
              >
                <Box
                  className={styles.canvasScaleShell}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    transform: `scale(${canvasScale})`,
                  }}
                >
                  <DynamicThemeRenderer controller={rendererController} />
                </Box>
              </Box>
            </Box>
          </Box>

          <Box className={styles.canvasPager}>
            <Box as="span" className={styles.canvasPagerLead} aria-hidden="true" />
            {canvases.length > 1 ? (
              <Box className={styles.canvasDots}>
                {canvases.map((canvas, index) => (
                  <button
                    key={canvas.id}
                    type="button"
                    className={cx(styles.canvasDot, canvas.id === activeCanvasId && styles.canvasDotActive)}
                    aria-label={themeLayoutBuilderContent.preview.canvasLabel(index)}
                    onClick={() => handleSelectCanvas(canvas.id)}
                  />
                ))}
              </Box>
            ) : (
              <Box as="span" className={styles.canvasPagerSpacer} />
            )}

            <Tooltip
              as="div"
              className={styles.canvasPagerAction}
              content={themeLayoutBuilderContent.preview.addCanvasTooltip}
            >
              <Button
                type="button"
                onClick={handleCreateCanvas}
                aria-label={themeLayoutBuilderContent.preview.addCanvas}
                disabled={isPreviewMode}
                size="icon-md"
                variant="primary"
              >
                +
              </Button>
            </Tooltip>
          </Box>
        </Box>

        <Box
          as="aside"
          className={cx(styles.treePanel, selectedNode && !isPreviewMode && styles.treePanelWithInspector)}
        >
          {!isPreviewMode && selectedNode ? (
            <Box className={styles.inspectorDock}>
              <SelectedNodeInspector
                selectedNode={selectedNode}
                selectedDescriptor={selectedDescriptor}
                onPropChange={updateSelectedNodeProp}
                onEdit={() => openEditDialog(selectedNode.id)}
                onDelete={() => handleDeleteNode(selectedNode.id)}
                canDelete={selectedNode.id !== currentDocument.layout.id}
              />
            </Box>
          ) : null}

          <Box className={styles.editorAiDock}>
            <EditorAiPanel
              templateId={activeTheme.id}
              currentDocument={currentDocument}
              pages={canvases.map((canvas) => ({
                pageId: canvas.document.defaultPageId,
                name: canvas.document.pageName ?? canvas.name,
                rootNodeId: canvas.document.layout.id,
                isActive: canvas.id === activeCanvasId,
                ...getCanvasPageStats(canvas),
              }))}
              selectedNode={isPreviewMode ? null : selectedNode}
              selectedDescriptor={isPreviewMode ? null : selectedDescriptor}
              disabled={isPreviewMode}
              onApplyInstructions={applyAiEditInstructions}
            />
          </Box>
        </Box>
      </Box>

      <NodeEditDialog
        dialogState={dialogState}
        dialogError={dialogError}
        containerNodes={containerNodes}
        rootId={currentDocument.layout.id}
        onClose={closeDialog}
        onUpdateDraft={updateDraft}
        onUpdateDraftProp={updateDraftProp}
        onSave={handleSaveDraft}
      />

      {isExportDialogOpen && (
        <ExportDialog
          canvases={canvases}
          activeTheme={activeTheme}
          defaultProjectName={currentPageName}
          onClose={() => setExportDialogOpen(false)}
        />
      )}
    </Box>
  );
}
