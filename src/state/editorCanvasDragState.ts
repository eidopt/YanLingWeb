'use client';

import type { DropIndicator, PointerInteraction } from 'domain/template';
import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import type { ThemeLayoutDocument } from 'ui/layout/types';

export interface DraggingNodeSnapshot {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface RelativePointerDragState {
  nodeId: string;
  parentId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  started: boolean;
}

export interface DragVisualOffset {
  x: number;
  y: number;
}

export interface EditorCanvasDragSnapshot {
  draggingAlias: string;
  isCanvasActive: boolean;
  draggingNodeId: string;
  dropIndicator: DropIndicator | null;
  containerDropTargetId: string;
  previewDocument: ThemeLayoutDocument | null;
  previewSignature: string;
  draggingNodeSnapshot: DraggingNodeSnapshot | null;
  relativePointerDrag: RelativePointerDragState | null;
  dragVisualOffset: DragVisualOffset;
  pointerInteraction: PointerInteraction | null;
}

type EditorCanvasDragListener = () => void;
type RelativePointerDragUpdater =
  | RelativePointerDragState
  | null
  | ((current: RelativePointerDragState | null) => RelativePointerDragState | null);
type DragVisualOffsetUpdater = DragVisualOffset | ((current: DragVisualOffset) => DragVisualOffset);

const STORE_NAME = 'editorCanvasDrag';

const INITIAL_SNAPSHOT: EditorCanvasDragSnapshot = {
  draggingAlias: '',
  isCanvasActive: false,
  draggingNodeId: '',
  dropIndicator: null,
  containerDropTargetId: '',
  previewDocument: null,
  previewSignature: '',
  draggingNodeSnapshot: null,
  relativePointerDrag: null,
  dragVisualOffset: { x: 0, y: 0 },
  pointerInteraction: null,
};

function areDropIndicatorsEqual(left: DropIndicator | null, right: DropIndicator | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.nodeId === right.nodeId && left.position === right.position && left.axis === right.axis;
}

function areRelativePointerDragsEqual(
  left: RelativePointerDragState | null,
  right: RelativePointerDragState | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.nodeId === right.nodeId &&
    left.parentId === right.parentId &&
    left.startX === right.startX &&
    left.startY === right.startY &&
    left.currentX === right.currentX &&
    left.currentY === right.currentY &&
    left.started === right.started
  );
}

function resolveRelativePointerDragUpdater(
  current: RelativePointerDragState | null,
  updater: RelativePointerDragUpdater,
): RelativePointerDragState | null {
  return typeof updater === 'function' ? updater(current) : updater;
}

function resolveDragVisualOffsetUpdater(current: DragVisualOffset, updater: DragVisualOffsetUpdater): DragVisualOffset {
  return typeof updater === 'function' ? updater(current) : updater;
}

class EditorCanvasDragStateStore {
  private readonly listeners = new Set<EditorCanvasDragListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorCanvasDragSnapshot => this.snapshot;

  getServerSnapshot = (): EditorCanvasDragSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorCanvasDragListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  setDraggingAlias(draggingAlias: string): void {
    this.updateField('draggingAlias', draggingAlias);
  }

  setIsCanvasActive(isCanvasActive: boolean): void {
    this.updateField('isCanvasActive', isCanvasActive);
  }

  setDraggingNodeId(draggingNodeId: string): void {
    this.updateField('draggingNodeId', draggingNodeId);
  }

  setDropIndicator(dropIndicator: DropIndicator | null): void {
    if (areDropIndicatorsEqual(this.snapshot.dropIndicator, dropIndicator)) {
      return;
    }

    this.commit({ ...this.snapshot, dropIndicator });
  }

  setContainerDropTargetId(containerDropTargetId: string): void {
    this.updateField('containerDropTargetId', containerDropTargetId);
  }

  setPreviewDocument(previewDocument: ThemeLayoutDocument | null): void {
    this.updateField('previewDocument', previewDocument);
  }

  setPreviewSignature(previewSignature: string): void {
    this.updateField('previewSignature', previewSignature);
  }

  setDraggingNodeSnapshot(draggingNodeSnapshot: DraggingNodeSnapshot | null): void {
    this.updateField('draggingNodeSnapshot', draggingNodeSnapshot);
  }

  setRelativePointerDrag(updater: RelativePointerDragUpdater): RelativePointerDragState | null {
    const relativePointerDrag = resolveRelativePointerDragUpdater(this.snapshot.relativePointerDrag, updater);
    if (areRelativePointerDragsEqual(this.snapshot.relativePointerDrag, relativePointerDrag)) {
      return this.snapshot.relativePointerDrag;
    }

    this.commit({ ...this.snapshot, relativePointerDrag });
    return relativePointerDrag;
  }

  setDragVisualOffset(updater: DragVisualOffsetUpdater): void {
    const dragVisualOffset = resolveDragVisualOffsetUpdater(this.snapshot.dragVisualOffset, updater);
    if (
      this.snapshot.dragVisualOffset.x === dragVisualOffset.x &&
      this.snapshot.dragVisualOffset.y === dragVisualOffset.y
    ) {
      return;
    }

    this.commit({ ...this.snapshot, dragVisualOffset });
  }

  setPointerInteraction(pointerInteraction: PointerInteraction | null): void {
    this.updateField('pointerInteraction', pointerInteraction);
  }

  clearNodeDragState(): void {
    this.commit({
      ...this.snapshot,
      draggingNodeId: '',
      dropIndicator: null,
      containerDropTargetId: '',
      previewDocument: null,
      previewSignature: '',
      draggingNodeSnapshot: null,
      relativePointerDrag: null,
      dragVisualOffset: { x: 0, y: 0 },
      pointerInteraction: null,
    });
  }

  clearLibraryDragState(): void {
    this.commit({
      ...this.snapshot,
      draggingAlias: '',
      isCanvasActive: false,
      containerDropTargetId: '',
      dropIndicator: null,
      previewDocument: null,
      previewSignature: '',
    });
  }

  private updateField<Key extends keyof EditorCanvasDragSnapshot>(
    field: Key,
    value: EditorCanvasDragSnapshot[Key],
  ): void {
    if (this.snapshot[field] === value) {
      return;
    }

    this.commit({ ...this.snapshot, [field]: value });
  }

  private commit(next: EditorCanvasDragSnapshot): void {
    this.snapshot = next;
    recordStateDebugTransition(STORE_NAME, this.snapshot);
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private registerDebugStore(): void {
    if (this.registered) {
      return;
    }

    registerStateDebugStore(STORE_NAME, this.getSnapshot);
    this.registered = true;
  }
}

const editorCanvasDragStateStore = new EditorCanvasDragStateStore();

export const editorCanvasDragStateActions = {
  setDraggingAlias: (draggingAlias: string) => editorCanvasDragStateStore.setDraggingAlias(draggingAlias),
  setIsCanvasActive: (isCanvasActive: boolean) => editorCanvasDragStateStore.setIsCanvasActive(isCanvasActive),
  setDraggingNodeId: (draggingNodeId: string) => editorCanvasDragStateStore.setDraggingNodeId(draggingNodeId),
  setDropIndicator: (dropIndicator: DropIndicator | null) => editorCanvasDragStateStore.setDropIndicator(dropIndicator),
  setContainerDropTargetId: (containerDropTargetId: string) =>
    editorCanvasDragStateStore.setContainerDropTargetId(containerDropTargetId),
  setPreviewDocument: (previewDocument: ThemeLayoutDocument | null) =>
    editorCanvasDragStateStore.setPreviewDocument(previewDocument),
  setPreviewSignature: (previewSignature: string) => editorCanvasDragStateStore.setPreviewSignature(previewSignature),
  setDraggingNodeSnapshot: (draggingNodeSnapshot: DraggingNodeSnapshot | null) =>
    editorCanvasDragStateStore.setDraggingNodeSnapshot(draggingNodeSnapshot),
  setRelativePointerDrag: (updater: RelativePointerDragUpdater) =>
    editorCanvasDragStateStore.setRelativePointerDrag(updater),
  setDragVisualOffset: (updater: DragVisualOffsetUpdater) => editorCanvasDragStateStore.setDragVisualOffset(updater),
  setPointerInteraction: (pointerInteraction: PointerInteraction | null) =>
    editorCanvasDragStateStore.setPointerInteraction(pointerInteraction),
  clearNodeDragState: () => editorCanvasDragStateStore.clearNodeDragState(),
  clearLibraryDragState: () => editorCanvasDragStateStore.clearLibraryDragState(),
};

export function useEditorCanvasDragSnapshot(): EditorCanvasDragSnapshot {
  return useSyncExternalStore(
    editorCanvasDragStateStore.subscribe,
    editorCanvasDragStateStore.getSnapshot,
    editorCanvasDragStateStore.getServerSnapshot,
  );
}
