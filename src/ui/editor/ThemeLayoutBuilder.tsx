'use client';

import type { DynamicThemeScreenPreset } from '../renderer';
import {
  DynamicThemeRenderer,
  useDynamicThemeRendererController,
} from '../renderer';
import { BuilderLibraryPanel } from './components/BuilderLibraryPanel';
import { EditorAiPanel } from './components/EditorAiPanel';
import {
  InteractionModeToggle,
} from './components/InteractionModeToggle';
import { NodeEditDialog } from './components/NodeEditDialog';
import { PreviewModeSwitch } from './components/PreviewModeSwitch';
import {
  SelectedNodeInspector,
} from './components/SelectedNodeInspector';
import {
  useCanvasEditorController,
} from './controllers/useCanvasEditorController';
import {
  themeLayoutBuilderContent,
} from './ThemeLayoutBuilder.content';
import styles from './ThemeLayoutBuilder.module.css';
import type { LayoutBuilderTheme } from './types';
import { cx } from 'base/classname';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'ui';
import { ExportDialog } from 'ui/export_dialog/ExportDialog';

interface ThemeLayoutBuilderProps {
  themes: LayoutBuilderTheme[];
  initialThemeId?: string;
}

const PHONE_CANVAS_WIDTH = 352;
const PHONE_CANVAS_HEIGHT = 672;
const DESKTOP_CANVAS_WIDTH = 1120;
const DESKTOP_CANVAS_HEIGHT = 896;

function getElementContentSize(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element);
  const horizontalPadding =
    Number.parseFloat(computedStyle.paddingLeft) +
    Number.parseFloat(computedStyle.paddingRight);
  const verticalPadding =
    Number.parseFloat(computedStyle.paddingTop) +
    Number.parseFloat(computedStyle.paddingBottom);

  return {
    width: element.clientWidth - horizontalPadding,
    height: element.clientHeight - verticalPadding,
  };
}

function canvasSizeForPreset(screenPreset: DynamicThemeScreenPreset) {
  return screenPreset === 'desktop'
    ? { width: DESKTOP_CANVAS_WIDTH, height: DESKTOP_CANVAS_HEIGHT }
    : { width: PHONE_CANVAS_WIDTH, height: PHONE_CANVAS_HEIGHT };
}

export function ThemeLayoutBuilder(
  { themes, initialThemeId }: ThemeLayoutBuilderProps,
) {
  const [sidebarTab, setSidebarTab] = useState<
    'components' | 'templates'
  >('templates');
  const [interactionMode, setInteractionMode] = useState<
    'edit' | 'preview'
  >('edit');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
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

  const { width: canvasWidth, height: canvasHeight } =
    canvasSizeForPreset(screenPreset);
  const activeCanvasIndex = canvases.findIndex(
    (canvas) => canvas.id === activeCanvasId,
  );
  const defaultPageName =
    activeCanvas.defaultName ||
    themeLayoutBuilderContent.preview.defaultPageName(
      activeCanvasIndex >= 0 ? activeCanvasIndex + 1 : 1,
    );
  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- pageName/name may be undefined at runtime despite the type */
  const currentPageName =
    activeCanvas.document.pageName ?? activeCanvas.name ?? defaultPageName;
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  const isPreviewMode = interactionMode === 'preview';
  const documentForRender = previewDocument ?? currentDocument;
  const rendererController = useDynamicThemeRendererController({
    layoutDocument: documentForRender,
    runtime: activeTheme.runtime,
    renderNodeShell: isPreviewMode ? undefined : renderBuilderNodeShell,
    screenPreset,
    onNavigateToPage: isPreviewMode
      ? (pageId) => {
          const targetCanvas = canvases.find(
            (canvas) => canvas.document.defaultPageId === pageId,
          );
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
  }, [canvasHeight, canvasWidth]);

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

  function handleChangeInteractionMode(mode: 'edit' | 'preview') {
    closeDialog();
    setSelectedNodeId(null);
    setInteractionMode(mode);
  }

  return (
    <main className={styles.page}>
      <section className={styles.workspace}>
        <BuilderLibraryPanel
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          activeTheme={activeTheme}
          templates={themes}
          activeTemplateId={activeTheme.id}
          layoutDescriptors={layoutDescriptors}
          componentDescriptors={componentDescriptors}
          createLibraryPreviewDocument={createLibraryPreviewDocument}
          onApplyTemplate={handleApplyTemplate}
          onLibraryDragStart={handleLibraryDragStart}
          onLibraryDragEnd={handleLibraryDragEnd}
        />

        <section
          className={styles.previewPanel}
          style={{ ['--preview-accent' as string]: activeTheme.accent }}
        >
          <div className={styles.canvasToolbar}>
            <div className={styles.canvasToolbarLeft}>
              <button
                type="button"
                className={styles.canvasClearButton}
                onClick={handleClearCanvas}
                aria-label={
                  themeLayoutBuilderContent.preview.clearCanvasAriaLabel
                }
                title={
                  themeLayoutBuilderContent.preview.clearCanvasAriaLabel
                }
                disabled={isPreviewMode}
              >
                {themeLayoutBuilderContent.preview.clearCanvas}
              </button>

              <Tooltip
                as="div"
                content={themeLayoutBuilderContent.preview.exportTooltip}
              >
                <button
                  type="button"
                  className={styles.canvasExportButton}
                  onClick={() => setIsExportDialogOpen(true)}
                  aria-label={
                    themeLayoutBuilderContent.preview.exportAriaLabel
                  }
                >
                  {themeLayoutBuilderContent.preview.export}
                </button>
              </Tooltip>
            </div>

            <label className={styles.pageNameField}>
              <input
                type="text"
                className={styles.pageNameInput}
                value={currentPageName}
                aria-label={
                  themeLayoutBuilderContent.preview.pageNameAriaLabel
                }
                onChange={(event) =>
                  updateActiveCanvasName(event.target.value)
                }
                onBlur={handlePageNameBlur}
                readOnly={isPreviewMode}
              />
            </label>

            <div className={styles.canvasToolbarRight}>
              <Tooltip
                as="div"
                content={
                  themeLayoutBuilderContent.preview.screenPresetTooltip
                }
              >
                <PreviewModeSwitch
                  screenPreset={screenPreset}
                  onChange={setScreenPreset}
                />
              </Tooltip>
              <Tooltip
                as="div"
                content={
                  themeLayoutBuilderContent.preview.interactionModeTooltip
                }
              >
                <InteractionModeToggle
                  mode={interactionMode}
                  onChange={handleChangeInteractionMode}
                />
              </Tooltip>
            </div>
          </div>

          <div ref={previewStageRef} className={styles.previewStage}>
            <div
              ref={canvasDropRef}
              className={cx(
                styles.canvasDrop,
                isCanvasActive && styles.canvasDropActive,
              )}
              onClick={
                isPreviewMode ? undefined : () => setSelectedNodeId(null)
              }
              onDragOver={
                isPreviewMode ? undefined : handleCanvasDragOver
              }
              onDragLeave={
                isPreviewMode ? undefined : handleCanvasDragLeave
              }
              onDrop={isPreviewMode ? undefined : handleCanvasDrop}
            >
              <div
                className={styles.canvasViewport}
                style={{
                  width: `${canvasWidth * canvasScale}px`,
                  height: `${canvasHeight * canvasScale}px`,
                }}
              >
                <div
                  className={styles.canvasScaleShell}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    transform: `scale(${canvasScale})`,
                  }}
                >
                  <DynamicThemeRenderer controller={rendererController} />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.canvasPager}>
            <span
              className={styles.canvasPagerLead}
              aria-hidden="true"
            />
            {canvases.length > 1 ? (
              <div className={styles.canvasDots}>
                {canvases.map((canvas, index) => (
                  <button
                    key={canvas.id}
                    type="button"
                    className={cx(
                      styles.canvasDot,
                      canvas.id === activeCanvasId && styles.canvasDotActive,
                    )}
                    aria-label={
                      themeLayoutBuilderContent.preview.canvasLabel(index)
                    }
                    onClick={() => handleSelectCanvas(canvas.id)}
                  />
                ))}
              </div>
            ) : (
              <span className={styles.canvasPagerSpacer} />
            )}

            <Tooltip
              as="div"
              className={styles.canvasPagerAction}
              content={
                themeLayoutBuilderContent.preview.addCanvasTooltip
              }
            >
              <button
                type="button"
                className={styles.canvasAddButton}
                onClick={handleCreateCanvas}
                aria-label={
                  themeLayoutBuilderContent.preview.addCanvas
                }
                disabled={isPreviewMode}
              >
                +
              </button>
            </Tooltip>
          </div>
        </section>

        <aside className={styles.treePanel}>
          {!isPreviewMode && selectedNode ? (
            <SelectedNodeInspector
              selectedNode={selectedNode}
              selectedDescriptor={selectedDescriptor}
              onPropChange={updateSelectedNodeProp}
              onEdit={() => openEditDialog(selectedNode.id)}
              onDelete={() => handleDeleteNode(selectedNode.id)}
              canDelete={
                selectedNode.id !== currentDocument.layout.id
              }
            />
          ) : null}

          <div className={styles.editorAiDock}>
            <EditorAiPanel
              currentDocument={currentDocument}
              selectedNode={isPreviewMode ? null : selectedNode}
              selectedDescriptor={isPreviewMode ? null : selectedDescriptor}
              disabled={isPreviewMode}
              onApplyInstructions={applyAiEditInstructions}
            />
          </div>
        </aside>
      </section>

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
          onClose={() => setIsExportDialogOpen(false)}
        />
      )}
    </main>
  );
}
