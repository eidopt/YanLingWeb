'use client';

import { useSyncExternalStore } from 'react';
import { createPersistentStore } from 'state/createPersistentStore';
import {
  getBrowserStateStorage,
  readPersistedObject,
  type StateStorage,
  writePersistedObject,
} from 'state/statePersistence';

export type EditorBuilderSidebarTab = 'components' | 'templates';
export type EditorBuilderInteractionMode = 'edit' | 'preview';

export interface EditorBuilderUiSnapshot {
  sidebarTab: EditorBuilderSidebarTab;
  interactionMode: EditorBuilderInteractionMode;
  isExportDialogOpen: boolean;
  canvasScale: number;
}

const STORE_NAME = 'editorBuilderUi';
export const EDITOR_BUILDER_UI_STATE_STORAGE_KEY = 'yanling:editor-builder-ui:v1';

const INITIAL_SNAPSHOT: EditorBuilderUiSnapshot = {
  sidebarTab: 'templates',
  interactionMode: 'edit',
  isExportDialogOpen: false,
  canvasScale: 1,
};

const SIDEBAR_TABS = new Set<EditorBuilderSidebarTab>(['components', 'templates']);
const INTERACTION_MODES = new Set<EditorBuilderInteractionMode>(['edit', 'preview']);

function readSidebarTab(value: unknown, fallback: EditorBuilderSidebarTab): EditorBuilderSidebarTab {
  return typeof value === 'string' && SIDEBAR_TABS.has(value as EditorBuilderSidebarTab)
    ? (value as EditorBuilderSidebarTab)
    : fallback;
}

function readInteractionMode(value: unknown, fallback: EditorBuilderInteractionMode): EditorBuilderInteractionMode {
  return typeof value === 'string' && INTERACTION_MODES.has(value as EditorBuilderInteractionMode)
    ? (value as EditorBuilderInteractionMode)
    : fallback;
}

function restoreFromRaw(
  persisted: Record<string, unknown> | null,
  fallback: EditorBuilderUiSnapshot,
): EditorBuilderUiSnapshot {
  if (!persisted) {
    return fallback;
  }

  return {
    ...fallback,
    sidebarTab: readSidebarTab(persisted.sidebarTab, fallback.sidebarTab),
    interactionMode: readInteractionMode(persisted.interactionMode, fallback.interactionMode),
    isExportDialogOpen: fallback.isExportDialogOpen,
  };
}

export function restoreEditorBuilderUiSnapshot(
  storage: StateStorage | null,
  fallback: EditorBuilderUiSnapshot = INITIAL_SNAPSHOT,
): EditorBuilderUiSnapshot {
  return restoreFromRaw(readPersistedObject(storage, EDITOR_BUILDER_UI_STATE_STORAGE_KEY), fallback);
}

export function persistEditorBuilderUiSnapshot(storage: StateStorage | null, snapshot: EditorBuilderUiSnapshot): void {
  writePersistedObject(storage, EDITOR_BUILDER_UI_STATE_STORAGE_KEY, {
    sidebarTab: snapshot.sidebarTab,
    interactionMode: snapshot.interactionMode,
  });
}

const store = createPersistentStore<EditorBuilderUiSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  storageKey: EDITOR_BUILDER_UI_STATE_STORAGE_KEY,
  restore: restoreFromRaw,
  persist: (snapshot) => persistEditorBuilderUiSnapshot(getBrowserStateStorage(), snapshot),
});

export const editorBuilderUiStateActions = {
  setSidebarTab: (sidebarTab: EditorBuilderSidebarTab) => store.update((current) => ({ ...current, sidebarTab })),
  setInteractionMode: (interactionMode: EditorBuilderInteractionMode) =>
    store.update((current) => ({ ...current, interactionMode })),
  setExportDialogOpen: (isExportDialogOpen: boolean) => store.update((current) => ({ ...current, isExportDialogOpen })),
  setCanvasScale: (canvasScale: number) => store.update((current) => ({ ...current, canvasScale })),
};

export function useEditorBuilderUiSnapshot(): EditorBuilderUiSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
