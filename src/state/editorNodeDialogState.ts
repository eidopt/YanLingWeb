'use client';

import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import type { DialogState } from 'ui/editor/services/layoutBuilderService';

export interface EditorNodeDialogSnapshot {
  dialogState: DialogState | null;
  dialogError: string;
}

type EditorNodeDialogListener = () => void;
type DialogStateUpdater = DialogState | null | ((current: DialogState | null) => DialogState | null);

const STORE_NAME = 'editorNodeDialog';

const INITIAL_SNAPSHOT: EditorNodeDialogSnapshot = {
  dialogState: null,
  dialogError: '',
};

function resolveDialogStateUpdater(current: DialogState | null, updater: DialogStateUpdater): DialogState | null {
  return typeof updater === 'function' ? updater(current) : updater;
}

class EditorNodeDialogStateStore {
  private readonly listeners = new Set<EditorNodeDialogListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorNodeDialogSnapshot => this.snapshot;

  getServerSnapshot = (): EditorNodeDialogSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorNodeDialogListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  setDialogState(updater: DialogStateUpdater): void {
    this.update((current) => ({
      ...current,
      dialogState: resolveDialogStateUpdater(current.dialogState, updater),
    }));
  }

  setDialogError(dialogError: string): void {
    this.update((current) => ({ ...current, dialogError }));
  }

  resetDialog(): void {
    this.update(() => INITIAL_SNAPSHOT);
  }

  private update(updater: (current: EditorNodeDialogSnapshot) => EditorNodeDialogSnapshot): void {
    const next = updater(this.snapshot);
    if (this.createSnapshotKey(next) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

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

  private createSnapshotKey(snapshot: EditorNodeDialogSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const editorNodeDialogStateStore = new EditorNodeDialogStateStore();

export const editorNodeDialogStateActions = {
  setDialogState: (updater: DialogStateUpdater) => editorNodeDialogStateStore.setDialogState(updater),
  setDialogError: (dialogError: string) => editorNodeDialogStateStore.setDialogError(dialogError),
  resetDialog: () => editorNodeDialogStateStore.resetDialog(),
};

export function useEditorNodeDialogSnapshot(): EditorNodeDialogSnapshot {
  return useSyncExternalStore(
    editorNodeDialogStateStore.subscribe,
    editorNodeDialogStateStore.getSnapshot,
    editorNodeDialogStateStore.getServerSnapshot,
  );
}
