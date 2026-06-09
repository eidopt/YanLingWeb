'use client';

import {
  DynamicThemeRenderer,
  type DynamicThemeScreenPreset,
  getDefaultPreviewScreenPreset,
  getPreviewScreenPresetOptions,
  isPreviewScreenPresetAllowed,
  RendererErrorBoundary,
  useDynamicThemeRendererController,
} from '../renderer';
import { BuilderLibraryPanel } from './components/BuilderLibraryPanel';
import { EditorAiPanel } from './components/EditorAiPanel';
import { EditorAiPanelState } from './components/editorAiPanelState';
import { InteractionModeToggle } from './components/InteractionModeToggle';
import { NodeEditDialog } from './components/NodeEditDialog';
import { PreviewModeSwitch } from './components/PreviewModeSwitch';
import { SelectedNodeInspector } from './components/SelectedNodeInspector';
import { useCanvasEditorController } from './controllers/useCanvasEditorController';
import { useEditorKeyboardShortcuts } from './controllers/useEditorKeyboardShortcuts';
import { themeLayoutBuilderContent } from './ThemeLayoutBuilder.content';
import styles from './ThemeLayoutBuilder.module.css';
import type { LayoutBuilderTheme } from './types';
import type { BuilderCanvas } from './types';
import { cx } from 'base/classname';
import { flattenNodes } from 'domain/template';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    setEditorDocument,
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
  const currentPageName = (activeCanvas.document.pageName ?? '') || activeCanvas.name || defaultPageName;
  const isPreviewMode = interactionMode === 'preview';
  const documentForRender = previewDocument ?? currentDocument;

  // B.3: AI 面板的 undo 状态（localStorage 持久化），由父组件托管以实现跨组件触发 undo。
  const [undoState] = useState(() => new EditorAiPanelState());

  const handleUndo = useCallback(() => {
    if (isPreviewMode) {
      return;
    }
    const snapshot = undoState.pop();
    if (!snapshot) {
      return;
    }
    // 撤销：把快照里的 document 写回当前画布。setEditorDocument 内部会触发重渲染。
    setEditorDocument(snapshot.document);
  }, [isPreviewMode, setEditorDocument, undoState]);

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

  // 窄屏（≤1280px）下左侧组件/模板栏收成细条，点击展开为悬浮面板；
  // 点击别处/失去焦点/Esc 自动收起。宽屏不受影响（CSS 媒体查询里此状态无效）。
  const [libraryExpanded, setLibraryExpanded] = useState(false);

  useEffect(() => {
    if (!libraryExpanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLibraryExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [libraryExpanded]);

  // B.3: 全局 Ctrl/Cmd+Z 触发 undo
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleUndo]);

  useEffect(() => {
    if (!libraryExpanded) {
      return;
    }
    // 点击面板外的任意位置自动收起。用 pointerdown 监听而非遮罩拦截，
    // 这样遮罩不会挡住把组件拖到画布的操作（遮罩 pointer-events:none）。
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && !target.closest('[data-library-slot]')) {
        setLibraryExpanded(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [libraryExpanded]);

  return (
    <Box as="main" className={styles.page}>
      <Box as="section" className={styles.workspace}>
        <Box data-library-slot="true" className={cx(styles.librarySlot, libraryExpanded && styles.librarySlotOpen)}>
          <button
            type="button"
            className={styles.libraryRail}
            onClick={() => setLibraryExpanded((open) => !open)}
            aria-label={libraryExpanded ? '收起组件与模板面板' : '展开组件与模板面板'}
            aria-expanded={libraryExpanded}
          >
            <span aria-hidden="true" className={styles.libraryRailIcon}>
              ☰
            </span>
            <span className={styles.libraryRailText}>组件 / 模板</span>
          </button>
          <Box className={styles.libraryPanelWrap}>
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
              onLibraryDragStart={(...args: Parameters<typeof handleLibraryDragStart>) => {
                // 窄屏悬浮态：拖拽开始时收起面板（移除遮罩），让组件能落到画布上。
                setLibraryExpanded(false);
                handleLibraryDragStart(...args);
              }}
              onLibraryDragEnd={handleLibraryDragEnd}
            />
          </Box>
          {libraryExpanded ? <div aria-hidden="true" className={styles.libraryBackdrop} /> : null}
        </Box>

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
                  <RendererErrorBoundary
                    resetKeys={[activeCanvasId, rendererController.state.activePageId, interactionMode]}
                  >
                    <DynamicThemeRenderer controller={rendererController} />
                  </RendererErrorBoundary>
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
              undoState={undoState}
              onUndo={handleUndo}
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
