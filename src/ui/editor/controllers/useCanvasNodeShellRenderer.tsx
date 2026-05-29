import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import type { DynamicThemeNodeShellContext } from '../../renderer';
import { themeLayoutBuilderContent } from '../ThemeLayoutBuilder.content';
import styles from '../ThemeLayoutBuilder.module.css';
import type { DraggingNodeSnapshot } from './useCanvasReorder';
import { cx } from 'base/classname';
import { canAcceptNestedDrop, descriptorForAlias, type DropIndicator, getNodeCapabilities } from 'domain/template';
import {
  type CSSProperties,
  type DragEvent,
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
} from 'react';
import { editorCanvasDragStateActions, useEditorCanvasDragSnapshot } from 'state/editorCanvasDragState';

interface UseCanvasNodeShellRendererArgs {
  currentDocument: ThemeLayoutDocument;
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  handleDeleteNode: (nodeId: string) => void;
  setBuilderNodeRef: (nodeId: string, element: HTMLDivElement | null) => void;
  builderNodeRefs: RefObject<Record<string, HTMLDivElement | null>>;
  startAbsoluteDrag: (node: ThemeLayoutNode, event: ReactPointerEvent<HTMLDivElement>) => void;
  startResize: (node: ThemeLayoutNode, axis: 'x' | 'y' | 'xy', event: ReactPointerEvent<HTMLButtonElement>) => void;
  startRelativePointerDrag: (
    node: ThemeLayoutNode,
    parent: ThemeLayoutNode | null,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  draggingAlias: string;
  draggingNodeId: string;
  draggingNodeSnapshot: DraggingNodeSnapshot | null;
  relativePointerDrag: {
    nodeId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    started: boolean;
  } | null;
  dropIndicator: DropIndicator | null;
  containerDropTargetId: string;
  setIsCanvasActive: (active: boolean) => void;
  setContainerDropTargetId: (nodeId: string) => void;
  setDraggingAlias: (alias: string) => void;
  addNodeFromAlias: (alias: string, parentId?: string) => void;
  handleRelativeDragStart: (nodeId: string, event: DragEvent<HTMLDivElement>) => void;
  handleRelativeDragOver: (
    event: DragEvent<HTMLDivElement>,
    node: ThemeLayoutNode,
    parent: ThemeLayoutNode | null,
  ) => void;
  handleRelativeDrop: (event: DragEvent<HTMLDivElement>, nodeId: string) => void;
  clearNodeDragState: () => void;
}

export function useCanvasNodeShellRenderer({
  currentDocument,
  selectedNodeId,
  setSelectedNodeId,
  handleDeleteNode,
  setBuilderNodeRef,
  builderNodeRefs,
  startAbsoluteDrag,
  startResize,
  startRelativePointerDrag,
  draggingAlias,
  draggingNodeId,
  draggingNodeSnapshot,
  relativePointerDrag,
  dropIndicator,
  containerDropTargetId,
  setIsCanvasActive,
  setContainerDropTargetId,
  setDraggingAlias,
  addNodeFromAlias,
  handleRelativeDragStart,
  handleRelativeDragOver,
  handleRelativeDrop,
  clearNodeDragState,
}: UseCanvasNodeShellRendererArgs) {
  const { dragVisualOffset } = useEditorCanvasDragSnapshot();
  const { setDragVisualOffset } = editorCanvasDragStateActions;

  useLayoutEffect(() => {
    if (!relativePointerDrag?.started || !draggingNodeId || !draggingNodeSnapshot) {
      // Intentional reset after layout effect fires (cascading render is
      // acceptable here as it only triggers on drag start/end transitions).

      setDragVisualOffset((current) => (current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 }));
      return;
    }

    const draggingElement = builderNodeRefs.current[draggingNodeId];
    if (!draggingElement) {
      return;
    }

    const pointerTranslateX = relativePointerDrag.currentX - relativePointerDrag.startX;
    const pointerTranslateY = relativePointerDrag.currentY - relativePointerDrag.startY;
    const appliedTranslateX = pointerTranslateX + dragVisualOffset.x;
    const appliedTranslateY = pointerTranslateY + dragVisualOffset.y;
    const currentRect = draggingElement.getBoundingClientRect();
    const baseLeft = currentRect.left - appliedTranslateX;
    const baseTop = currentRect.top - appliedTranslateY;
    const nextOffset = {
      x: draggingNodeSnapshot.left - baseLeft,
      y: draggingNodeSnapshot.top - baseTop,
    };

    setDragVisualOffset((current) => (current.x === nextOffset.x && current.y === nextOffset.y ? current : nextOffset));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dragVisualOffset.x/y intentionally omitted to avoid loop; relativePointerDrag.startX/Y intentionally capture start position only
  }, [
    builderNodeRefs,
    draggingNodeId,
    draggingNodeSnapshot,
    relativePointerDrag?.started,
    relativePointerDrag?.currentX,
    relativePointerDrag?.currentY,
    dropIndicator?.nodeId,
    dropIndicator?.position,
    dropIndicator?.axis,
  ]);

  function getRenderableSiblings(parent: ThemeLayoutNode | null) {
    if (!parent) {
      return [];
    }

    if (parent.alias === 'core.screen') {
      return (parent.children ?? []).filter((child) => child.slot !== 'footer');
    }

    return parent.children ?? [];
  }

  function renderBuilderNodeShell({
    node,
    parent,
    index,
    nodeStyle,
    rendered,
  }: DynamicThemeNodeShellContext): ReactNode {
    const descriptor = descriptorForAlias(currentDocument, node.alias);
    const capabilities = getNodeCapabilities(node, descriptor, currentDocument.layout.id);
    const isSelected = selectedNodeId === node.id;
    const showHorizontalDrop = dropIndicator?.nodeId === node.id && dropIndicator.axis === 'horizontal';
    const showDropBefore = dropIndicator?.nodeId === node.id && dropIndicator.position === 'before';
    const showDropAfter = dropIndicator?.nodeId === node.id && dropIndicator.position === 'after';
    const isContainerDropTarget = containerDropTargetId === node.id;
    const isPointerDraggingNode = relativePointerDrag?.started === true && relativePointerDrag.nodeId === node.id;
    const canShowDropSlots =
      relativePointerDrag?.started === true &&
      Boolean(draggingNodeId) &&
      draggingNodeId !== node.id &&
      capabilities.canReorderRelative;
    const shouldShowSlot = (axis: 'horizontal' | 'vertical', position: 'before' | 'after') =>
      canShowDropSlots &&
      dropIndicator?.nodeId === node.id &&
      dropIndicator.axis === axis &&
      dropIndicator.position === position;
    const siblings = getRenderableSiblings(parent);
    const siblingIndex = siblings.findIndex((child) => child.id === node.id);
    const previousSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
    const nextSibling = siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;
    const currentRow = node.layout.flowRow ?? index + 1;
    const previousRow = previousSibling?.layout.flowRow ?? (siblingIndex > 0 ? siblingIndex : undefined);
    const nextRow = nextSibling?.layout.flowRow ?? (siblingIndex >= 0 ? siblingIndex + 2 : undefined);
    const isFirstInRow = parent?.alias === 'core.screen' ? previousRow !== currentRow : true;
    const isLastInRow = parent?.alias === 'core.screen' ? nextRow !== currentRow : siblingIndex === siblings.length - 1;
    const isLastSibling = siblingIndex === siblings.length - 1;
    const dropSlots = canShowDropSlots
      ? (() => {
          if (!parent) {
            return [];
          }

          if (parent.alias === 'core.screen') {
            return [
              ...(isFirstInRow && shouldShowSlot('vertical', 'before')
                ? [
                    {
                      key: 'row-before',
                      position: 'before' as const,
                      axis: 'vertical' as const,
                      className: cx(styles.dropSlot, styles.dropSlotBlock),
                    },
                  ]
                : []),
              ...(shouldShowSlot('horizontal', 'before')
                ? [
                    {
                      key: 'item-before',
                      position: 'before' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
              ...(isLastInRow && shouldShowSlot('horizontal', 'after')
                ? [
                    {
                      key: 'item-after',
                      position: 'after' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
              ...(isLastSibling && shouldShowSlot('vertical', 'after')
                ? [
                    {
                      key: 'row-after',
                      position: 'after' as const,
                      axis: 'vertical' as const,
                      className: cx(styles.dropSlot, styles.dropSlotBlock),
                    },
                  ]
                : []),
            ];
          }

          if (parent.alias === 'core.row') {
            return [
              ...(shouldShowSlot('horizontal', 'before')
                ? [
                    {
                      key: 'item-before',
                      position: 'before' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
              ...(isLastSibling && shouldShowSlot('horizontal', 'after')
                ? [
                    {
                      key: 'item-after',
                      position: 'after' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
            ];
          }

          if (parent.alias === 'core.grid') {
            return [
              ...(shouldShowSlot('horizontal', 'before')
                ? [
                    {
                      key: 'item-before',
                      position: 'before' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
              ...(isLastSibling && shouldShowSlot('horizontal', 'after')
                ? [
                    {
                      key: 'item-after',
                      position: 'after' as const,
                      axis: 'horizontal' as const,
                      className: cx(styles.dropSlot, styles.dropSlotInline),
                    },
                  ]
                : []),
              ...(shouldShowSlot('vertical', 'before')
                ? [
                    {
                      key: 'row-before',
                      position: 'before' as const,
                      axis: 'vertical' as const,
                      className: cx(styles.dropSlot, styles.dropSlotBlock),
                    },
                  ]
                : []),
              ...(isLastSibling && shouldShowSlot('vertical', 'after')
                ? [
                    {
                      key: 'row-after',
                      position: 'after' as const,
                      axis: 'vertical' as const,
                      className: cx(styles.dropSlot, styles.dropSlotBlock),
                    },
                  ]
                : []),
            ];
          }

          return [
            ...(shouldShowSlot('vertical', 'before')
              ? [
                  {
                    key: 'item-before',
                    position: 'before' as const,
                    axis: 'vertical' as const,
                    className: `${styles.dropSlot} ${styles.dropSlotBlock}`,
                  },
                ]
              : []),
            ...(isLastSibling && shouldShowSlot('vertical', 'after')
              ? [
                  {
                    key: 'item-after',
                    position: 'after' as const,
                    axis: 'vertical' as const,
                    className: `${styles.dropSlot} ${styles.dropSlotBlock}`,
                  },
                ]
              : []),
          ];
        })()
      : [];
    const shellStyle: CSSProperties = {
      ...nodeStyle,
      zIndex: isPointerDraggingNode ? 30 : isSelected ? 12 : node.layout.mode === 'absolute' ? 1 : undefined,
      cursor: capabilities.canDragAbsolute ? 'grab' : capabilities.canReorderRelative ? 'move' : undefined,
      transform: isPointerDraggingNode
        ? `translate(${relativePointerDrag.currentX - relativePointerDrag.startX + dragVisualOffset.x}px, ${
            relativePointerDrag.currentY - relativePointerDrag.startY + dragVisualOffset.y
          }px)`
        : nodeStyle.transform,
    };

    return (
      <Fragment key={node.id}>
        {dropSlots
          .filter((slot) => slot.position === 'before')
          .map((slot) => (
            <div
              key={`${node.id}-${slot.key}`}
              className={slot.className}
              data-drop-slot="true"
              data-node-id={node.id}
              data-parent-id={parent?.id ?? ''}
              data-axis={slot.axis}
              data-position={slot.position}
            />
          ))}
        <div
          ref={(element) => setBuilderNodeRef(node.id, element)}
          data-builder-node-id={node.id}
          data-parent-alias={parent?.alias ?? ''}
          draggable={false}
          className={cx(
            styles.canvasNode,
            isSelected && styles.canvasNodeSelected,
            node.layout.mode === 'absolute' && styles.canvasNodeAbsolute,
            isPointerDraggingNode && styles.canvasNodeDragging,
            (dropIndicator?.nodeId === node.id || isContainerDropTarget) && styles.canvasNodeDropTarget,
          )}
          style={shellStyle}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedNodeId(node.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation();
              setSelectedNodeId(node.id);
            }
          }}
          onPointerDown={(event) => {
            if (capabilities.canDragAbsolute) {
              startAbsoluteDrag(node, event);
              return;
            }

            if (capabilities.canReorderRelative) {
              startRelativePointerDrag(node, parent, event);
            }
          }}
          onDragStart={(event) => {
            if (capabilities.canReorderRelative) {
              handleRelativeDragStart(node.id, event);
            }
          }}
          onDragEnd={clearNodeDragState}
          onDragOver={(event) => {
            if (draggingAlias && canAcceptNestedDrop(node)) {
              event.preventDefault();
              event.stopPropagation();
              setIsCanvasActive(false);
              if (containerDropTargetId !== node.id) {
                setContainerDropTargetId(node.id);
              }
              return;
            }

            if (containerDropTargetId === node.id) {
              setContainerDropTargetId('');
            }

            if (draggingNodeId) {
              return;
            }

            handleRelativeDragOver(event, node, parent);
          }}
          onDrop={(event) => {
            if (draggingAlias && canAcceptNestedDrop(node)) {
              event.preventDefault();
              event.stopPropagation();
              addNodeFromAlias(draggingAlias, node.id);
              setDraggingAlias('');
              setIsCanvasActive(false);
              setContainerDropTargetId('');
              return;
            }

            if (draggingNodeId) {
              return;
            }

            handleRelativeDrop(event, node.id);
          }}
          onDragLeave={() => {
            if (draggingAlias && containerDropTargetId === node.id) {
              return;
            }
          }}
        >
          {showDropBefore ? (
            <span
              className={cx(
                styles.dropIndicator,
                showHorizontalDrop ? styles.dropIndicatorLeft : styles.dropIndicatorBefore,
              )}
            />
          ) : null}
          {node.id !== currentDocument.layout.id ? (
            <button
              type="button"
              className={styles.canvasDeleteButton}
              aria-label={themeLayoutBuilderContent.nodeActions.deleteAriaLabel}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteNode(node.id);
              }}
            >
              ×
            </button>
          ) : null}
          <div className={styles.canvasNodeContent}>{rendered}</div>

          {isSelected && capabilities.canResizeWidth ? (
            <button
              type="button"
              className={cx(styles.resizeHandle, styles.resizeHandleX)}
              onPointerDown={(event) => startResize(node, 'x', event)}
              aria-label={themeLayoutBuilderContent.nodeActions.resizeWidthAriaLabel}
            />
          ) : null}

          {isSelected && capabilities.canResizeHeight ? (
            <button
              type="button"
              className={cx(styles.resizeHandle, styles.resizeHandleY)}
              onPointerDown={(event) => startResize(node, 'y', event)}
              aria-label={themeLayoutBuilderContent.nodeActions.resizeHeightAriaLabel}
            />
          ) : null}

          {isSelected && capabilities.canResizeWidth && capabilities.canResizeHeight ? (
            <button
              type="button"
              className={cx(styles.resizeHandle, styles.resizeHandleCorner)}
              onPointerDown={(event) => startResize(node, 'xy', event)}
              aria-label={themeLayoutBuilderContent.nodeActions.resizeBothAriaLabel}
            />
          ) : null}

          {showDropAfter ? (
            <span
              className={cx(
                styles.dropIndicator,
                showHorizontalDrop ? styles.dropIndicatorRight : styles.dropIndicatorAfter,
              )}
            />
          ) : null}
        </div>
        {dropSlots
          .filter((slot) => slot.position === 'after')
          .map((slot) => (
            <div
              key={`${node.id}-${slot.key}`}
              className={slot.className}
              data-drop-slot="true"
              data-node-id={node.id}
              data-parent-id={parent?.id ?? ''}
              data-axis={slot.axis}
              data-position={slot.position}
            />
          ))}
      </Fragment>
    );
  }

  return { renderBuilderNodeShell };
}
