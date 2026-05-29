'use client';

import type { DialogState } from 'domain/template';
import { useSyncExternalStore } from 'react';
import { createPersistentStore } from 'state/createPersistentStore';

export interface EditorNodeDialogSnapshot {
  dialogState: DialogState | null;
  dialogError: string;
}

type DialogStateUpdater = DialogState | null | ((current: DialogState | null) => DialogState | null);

const STORE_NAME = 'editorNodeDialog';

const INITIAL_SNAPSHOT: EditorNodeDialogSnapshot = {
  dialogState: null,
  dialogError: '',
};

function resolveDialogStateUpdater(current: DialogState | null, updater: DialogStateUpdater): DialogState | null {
  return typeof updater === 'function' ? updater(current) : updater;
}

const store = createPersistentStore<EditorNodeDialogSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  areEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

export const editorNodeDialogStateActions = {
  setDialogState: (updater: DialogStateUpdater) =>
    store.update((current) => ({
      ...current,
      dialogState: resolveDialogStateUpdater(current.dialogState, updater),
    })),
  setDialogError: (dialogError: string) => store.update((current) => ({ ...current, dialogError })),
  resetDialog: () => store.update(INITIAL_SNAPSHOT),
};

export function useEditorNodeDialogSnapshot(): EditorNodeDialogSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
