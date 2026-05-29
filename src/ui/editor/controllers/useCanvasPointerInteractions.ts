import type { ThemeLayoutNode } from '../../layout/types';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { editorCanvasDragStateActions, useEditorCanvasDragSnapshot } from 'state/editorCanvasDragState';

interface UseCanvasPointerInteractionsArgs {
  updateNode: (nodeId: string, updater: (node: ThemeLayoutNode) => void) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
}

export function useCanvasPointerInteractions({ updateNode, setSelectedNodeId }: UseCanvasPointerInteractionsArgs) {
  const { pointerInteraction } = useEditorCanvasDragSnapshot();
  const { setPointerInteraction } = editorCanvasDragStateActions;
  const builderNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!pointerInteraction) {
      return undefined;
    }

    const activeInteraction = pointerInteraction;

    function handlePointerMove(event: PointerEvent) {
      if (activeInteraction.type === 'move-absolute') {
        const deltaX = event.clientX - activeInteraction.startX;
        const deltaY = event.clientY - activeInteraction.startY;
        updateNode(activeInteraction.nodeId, (node) => {
          node.layout.mode = 'absolute';
          node.frame = {
            position: 'absolute',
            ...(node.frame ?? {}),
            x: Math.max(0, Math.round(activeInteraction.originX + deltaX)),
            y: Math.max(0, Math.round(activeInteraction.originY + deltaY)),
            unit: node.frame?.unit ?? 'px',
          };
        });
        return;
      }

      const nextWidth = Math.max(
        72,
        Math.round(
          activeInteraction.originWidth +
            (activeInteraction.axis === 'y' ? 0 : event.clientX - activeInteraction.startX),
        ),
      );
      const nextHeight = Math.max(
        44,
        Math.round(
          activeInteraction.originHeight +
            (activeInteraction.axis === 'x' ? 0 : event.clientY - activeInteraction.startY),
        ),
      );

      updateNode(activeInteraction.nodeId, (node) => {
        if (activeInteraction.mode === 'absolute') {
          node.frame = {
            position: 'absolute',
            ...(node.frame ?? {}),
            width: activeInteraction.axis === 'y' ? node.frame?.width : nextWidth,
            height: activeInteraction.axis === 'x' ? node.frame?.height : nextHeight,
            unit: node.frame?.unit ?? 'px',
          };
          return;
        }

        node.layout.width = activeInteraction.axis === 'y' ? node.layout.width : nextWidth;
        node.layout.height = activeInteraction.axis === 'x' ? node.layout.height : nextHeight;
      });
    }

    function handlePointerUp() {
      setPointerInteraction(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pointerInteraction, setPointerInteraction, updateNode]);

  function setBuilderNodeRef(nodeId: string, element: HTMLDivElement | null) {
    builderNodeRefs.current[nodeId] = element;
  }

  function startAbsoluteDrag(node: ThemeLayoutNode, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setPointerInteraction({
      type: 'move-absolute',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: typeof node.frame?.x === 'number' ? node.frame.x : 0,
      originY: typeof node.frame?.y === 'number' ? node.frame.y : 0,
    });
  }

  function startResize(node: ThemeLayoutNode, axis: 'x' | 'y' | 'xy', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const element = builderNodeRefs.current[node.id];
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setSelectedNodeId(node.id);
    setPointerInteraction({
      type: 'resize',
      nodeId: node.id,
      axis,
      mode: node.layout.mode,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: Math.round(rect.width),
      originHeight: Math.round(rect.height),
    });
  }

  return {
    builderNodeRefs,
    setBuilderNodeRef,
    startAbsoluteDrag,
    startResize,
  };
}
