'use client';

import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import type { BuilderCanvas } from 'ui/editor/types';
import type { DynamicThemeScreenPreset } from 'ui/renderer';

export interface EditorDocumentSnapshot {
  sessionKey: string;
  canvases: BuilderCanvas[];
  activeCanvasId: string;
  selectedNodeId: string | null;
  screenPreset: DynamicThemeScreenPreset;
}

type EditorDocumentListener = () => void;
type CanvasesUpdater = BuilderCanvas[] | ((current: BuilderCanvas[]) => BuilderCanvas[]);
type SnapshotUpdater = EditorDocumentSnapshot | ((current: EditorDocumentSnapshot) => EditorDocumentSnapshot);

const STORE_NAME = 'editorDocument';

const INITIAL_SNAPSHOT: EditorDocumentSnapshot = {
  sessionKey: '',
  canvases: [],
  activeCanvasId: '',
  selectedNodeId: null,
  screenPreset: 'mobile',
};

function resolveCanvasesUpdater(current: BuilderCanvas[], updater: CanvasesUpdater): BuilderCanvas[] {
  return typeof updater === 'function' ? updater(current) : updater;
}

function resolveSnapshotUpdater(current: EditorDocumentSnapshot, updater: SnapshotUpdater): EditorDocumentSnapshot {
  return typeof updater === 'function' ? updater(current) : updater;
}

class EditorDocumentStateStore {
  private readonly listeners = new Set<EditorDocumentListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorDocumentSnapshot => this.snapshot;

  getServerSnapshot = (): EditorDocumentSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorDocumentListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  ensureSession(sessionKey: string, createSnapshot: () => EditorDocumentSnapshot): void {
    if (this.snapshot.sessionKey === sessionKey) {
      return;
    }

    this.commitSnapshot(createSnapshot(), false);
  }

  setSnapshot(updater: SnapshotUpdater): void {
    this.commitSnapshot(resolveSnapshotUpdater(this.snapshot, updater), true);
  }

  setCanvases(updater: CanvasesUpdater): void {
    this.setSnapshot((current) => ({
      ...current,
      canvases: resolveCanvasesUpdater(current.canvases, updater),
    }));
  }

  setActiveCanvasId(activeCanvasId: string): void {
    this.setSnapshot((current) => ({ ...current, activeCanvasId }));
  }

  setSelectedNodeId(selectedNodeId: string | null): void {
    this.setSnapshot((current) => ({ ...current, selectedNodeId }));
  }

  setScreenPreset(screenPreset: DynamicThemeScreenPreset): void {
    this.setSnapshot((current) => ({ ...current, screenPreset }));
  }

  private commitSnapshot(next: EditorDocumentSnapshot, notify: boolean): void {
    if (this.createSnapshotKey(next) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

    this.snapshot = next;
    if (!notify) {
      return;
    }

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

  private createSnapshotKey(snapshot: EditorDocumentSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const editorDocumentStateStore = new EditorDocumentStateStore();

export const editorDocumentStateActions = {
  setSnapshot: (updater: SnapshotUpdater) => editorDocumentStateStore.setSnapshot(updater),
  setCanvases: (updater: CanvasesUpdater) => editorDocumentStateStore.setCanvases(updater),
  setActiveCanvasId: (activeCanvasId: string) => editorDocumentStateStore.setActiveCanvasId(activeCanvasId),
  setSelectedNodeId: (selectedNodeId: string | null) => editorDocumentStateStore.setSelectedNodeId(selectedNodeId),
  setScreenPreset: (screenPreset: DynamicThemeScreenPreset) => editorDocumentStateStore.setScreenPreset(screenPreset),
};

export function useEditorDocumentSnapshot(
  sessionKey: string,
  createInitialSnapshot: () => EditorDocumentSnapshot,
): EditorDocumentSnapshot {
  editorDocumentStateStore.ensureSession(sessionKey, createInitialSnapshot);

  return useSyncExternalStore(
    editorDocumentStateStore.subscribe,
    editorDocumentStateStore.getSnapshot,
    editorDocumentStateStore.getServerSnapshot,
  );
}
