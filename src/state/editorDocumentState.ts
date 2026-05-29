'use client';

import { useSyncExternalStore } from 'react';
import { createPersistentStore, type SnapshotUpdater } from 'state/createPersistentStore';
import type { BuilderCanvas } from 'ui/editor/types';
import type { DynamicThemeScreenPreset } from 'ui/renderer';

export interface EditorDocumentSnapshot {
  sessionKey: string;
  canvases: BuilderCanvas[];
  activeCanvasId: string;
  selectedNodeId: string | null;
  screenPreset: DynamicThemeScreenPreset;
}

type CanvasesUpdater = BuilderCanvas[] | ((current: BuilderCanvas[]) => BuilderCanvas[]);
type EditorDocumentUpdater = SnapshotUpdater<EditorDocumentSnapshot>;

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

const store = createPersistentStore<EditorDocumentSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  areEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

function setSnapshot(updater: EditorDocumentUpdater): void {
  store.update(updater);
}

export const editorDocumentStateActions = {
  setSnapshot,
  setCanvases: (updater: CanvasesUpdater) =>
    setSnapshot((current) => ({
      ...current,
      canvases: resolveCanvasesUpdater(current.canvases, updater),
    })),
  setActiveCanvasId: (activeCanvasId: string) => setSnapshot((current) => ({ ...current, activeCanvasId })),
  setSelectedNodeId: (selectedNodeId: string | null) => setSnapshot((current) => ({ ...current, selectedNodeId })),
  setScreenPreset: (screenPreset: DynamicThemeScreenPreset) => setSnapshot((current) => ({ ...current, screenPreset })),
};

export function useEditorDocumentSnapshot(
  sessionKey: string,
  createInitialSnapshot: () => EditorDocumentSnapshot,
): EditorDocumentSnapshot {
  if (store.peek().sessionKey !== sessionKey) {
    store.commitSilently(createInitialSnapshot());
  }

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
