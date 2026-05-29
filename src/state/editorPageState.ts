'use client';

import { useSyncExternalStore } from 'react';
import { createPersistentStore } from 'state/createPersistentStore';
import type { ThemeSpec } from 'types/theme.types';

export interface EditorPageSnapshot {
  loadKey: string;
  loading: boolean;
  marketTemplates: ThemeSpec[];
  ownedTemplate: ThemeSpec | null;
  generationKey: string;
  generating: boolean;
  generateError: string | null;
}

const STORE_NAME = 'editorPage';

const INITIAL_SNAPSHOT: EditorPageSnapshot = {
  loadKey: '',
  loading: true,
  marketTemplates: [],
  ownedTemplate: null,
  generationKey: '',
  generating: false,
  generateError: null,
};

const store = createPersistentStore<EditorPageSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  areEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

export const editorPageStateActions = {
  startLoading: (loadKey: string) =>
    store.update((current) => ({
      ...current,
      loadKey,
      loading: true,
      marketTemplates: [],
      ownedTemplate: null,
    })),
  finishLoading: (loadKey: string, marketTemplates: ThemeSpec[], ownedTemplate: ThemeSpec | null) =>
    store.update((current) =>
      current.loadKey !== loadKey
        ? current
        : {
            ...current,
            loading: false,
            marketTemplates,
            ownedTemplate,
          },
    ),
  failLoading: (loadKey: string) =>
    store.update((current) =>
      current.loadKey !== loadKey
        ? current
        : {
            ...current,
            loading: false,
            marketTemplates: [],
            ownedTemplate: null,
          },
    ),
  syncGenerationIntent: (generationKey: string, shouldGenerate: boolean) =>
    store.update((current) =>
      current.generationKey === generationKey
        ? current
        : {
            ...current,
            generationKey,
            generating: shouldGenerate,
            generateError: null,
          },
    ),
  finishGeneration: (generationKey: string) =>
    store.update((current) =>
      current.generationKey !== generationKey
        ? current
        : {
            ...current,
            generating: false,
          },
    ),
  setGenerationError: (generationKey: string, generateError: string) =>
    store.update((current) =>
      current.generationKey !== generationKey
        ? current
        : {
            ...current,
            generating: false,
            generateError,
          },
    ),
};

export function useEditorPageSnapshot(): EditorPageSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
