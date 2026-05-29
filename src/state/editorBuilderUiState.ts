'use client';

import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
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

type EditorBuilderUiListener = () => void;

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

export function restoreEditorBuilderUiSnapshot(
  storage: StateStorage | null,
  fallback: EditorBuilderUiSnapshot = INITIAL_SNAPSHOT,
): EditorBuilderUiSnapshot {
  const persisted = readPersistedObject(storage, EDITOR_BUILDER_UI_STATE_STORAGE_KEY);
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

export function persistEditorBuilderUiSnapshot(storage: StateStorage | null, snapshot: EditorBuilderUiSnapshot): void {
  writePersistedObject(storage, EDITOR_BUILDER_UI_STATE_STORAGE_KEY, {
    sidebarTab: snapshot.sidebarTab,
    interactionMode: snapshot.interactionMode,
  });
}

class EditorBuilderUiStateStore {
  private readonly listeners = new Set<EditorBuilderUiListener>();
  private hydrated = false;
  private listening = false;
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorBuilderUiSnapshot => this.snapshot;

  getServerSnapshot = (): EditorBuilderUiSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorBuilderUiListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    this.startListening();
    this.restoreFromStorage();
    return () => {
      this.listeners.delete(listener);
      this.stopListeningIfIdle();
    };
  };

  setSidebarTab(sidebarTab: EditorBuilderSidebarTab): void {
    this.update((current) => ({ ...current, sidebarTab }));
  }

  setInteractionMode(interactionMode: EditorBuilderInteractionMode): void {
    this.update((current) => ({ ...current, interactionMode }));
  }

  setExportDialogOpen(isExportDialogOpen: boolean): void {
    this.update((current) => ({ ...current, isExportDialogOpen }));
  }

  setCanvasScale(canvasScale: number): void {
    this.update((current) => ({ ...current, canvasScale }));
  }

  private update(updater: (current: EditorBuilderUiSnapshot) => EditorBuilderUiSnapshot): void {
    const next = updater(this.snapshot);
    if (this.createSnapshotKey(next) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

    this.snapshot = next;
    persistEditorBuilderUiSnapshot(getBrowserStateStorage(), this.snapshot);
    recordStateDebugTransition(STORE_NAME, this.snapshot);
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private startListening(): void {
    if (this.listening || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('storage', this.handleStorage);
    this.listening = true;
  }

  private stopListeningIfIdle(): void {
    if (!this.listening || this.listeners.size > 0 || typeof window === 'undefined') {
      return;
    }

    window.removeEventListener('storage', this.handleStorage);
    this.listening = false;
  }

  private restoreFromStorage(): void {
    if (this.hydrated) {
      return;
    }

    this.hydrated = true;
    this.applyRestoredSnapshot(restoreEditorBuilderUiSnapshot(getBrowserStateStorage(), this.snapshot));
  }

  private handleStorage = (event: StorageEvent): void => {
    if (event.key !== EDITOR_BUILDER_UI_STATE_STORAGE_KEY) {
      return;
    }

    this.applyRestoredSnapshot(restoreEditorBuilderUiSnapshot(getBrowserStateStorage(), this.snapshot));
  };

  private applyRestoredSnapshot(snapshot: EditorBuilderUiSnapshot): void {
    if (this.createSnapshotKey(snapshot) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

    this.snapshot = snapshot;
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

  private createSnapshotKey(snapshot: EditorBuilderUiSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const editorBuilderUiStateStore = new EditorBuilderUiStateStore();

export const editorBuilderUiStateActions = {
  setSidebarTab: (sidebarTab: EditorBuilderSidebarTab) => editorBuilderUiStateStore.setSidebarTab(sidebarTab),
  setInteractionMode: (interactionMode: EditorBuilderInteractionMode) =>
    editorBuilderUiStateStore.setInteractionMode(interactionMode),
  setExportDialogOpen: (isExportDialogOpen: boolean) =>
    editorBuilderUiStateStore.setExportDialogOpen(isExportDialogOpen),
  setCanvasScale: (canvasScale: number) => editorBuilderUiStateStore.setCanvasScale(canvasScale),
};

export function useEditorBuilderUiSnapshot(): EditorBuilderUiSnapshot {
  return useSyncExternalStore(
    editorBuilderUiStateStore.subscribe,
    editorBuilderUiStateStore.getSnapshot,
    editorBuilderUiStateStore.getServerSnapshot,
  );
}
