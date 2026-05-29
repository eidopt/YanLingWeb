'use client';

import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
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

type EditorPageListener = () => void;

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

class EditorPageStateStore {
  private readonly listeners = new Set<EditorPageListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorPageSnapshot => this.snapshot;

  getServerSnapshot = (): EditorPageSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorPageListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  startLoading(loadKey: string): void {
    this.update((current) => ({
      ...current,
      loadKey,
      loading: true,
      marketTemplates: [],
      ownedTemplate: null,
    }));
  }

  finishLoading(loadKey: string, marketTemplates: ThemeSpec[], ownedTemplate: ThemeSpec | null): void {
    this.update((current) => {
      if (current.loadKey !== loadKey) {
        return current;
      }

      return {
        ...current,
        loading: false,
        marketTemplates,
        ownedTemplate,
      };
    });
  }

  failLoading(loadKey: string): void {
    this.update((current) => {
      if (current.loadKey !== loadKey) {
        return current;
      }

      return {
        ...current,
        loading: false,
        marketTemplates: [],
        ownedTemplate: null,
      };
    });
  }

  syncGenerationIntent(generationKey: string, shouldGenerate: boolean): void {
    this.update((current) => {
      if (current.generationKey === generationKey) {
        return current;
      }

      return {
        ...current,
        generationKey,
        generating: shouldGenerate,
        generateError: null,
      };
    });
  }

  finishGeneration(generationKey: string): void {
    this.update((current) => {
      if (current.generationKey !== generationKey) {
        return current;
      }

      return {
        ...current,
        generating: false,
      };
    });
  }

  setGenerationError(generationKey: string, generateError: string): void {
    this.update((current) => {
      if (current.generationKey !== generationKey) {
        return current;
      }

      return {
        ...current,
        generating: false,
        generateError,
      };
    });
  }

  private update(updater: (current: EditorPageSnapshot) => EditorPageSnapshot): void {
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

  private createSnapshotKey(snapshot: EditorPageSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const editorPageStateStore = new EditorPageStateStore();

export const editorPageStateActions = {
  startLoading: (loadKey: string) => editorPageStateStore.startLoading(loadKey),
  finishLoading: (loadKey: string, marketTemplates: ThemeSpec[], ownedTemplate: ThemeSpec | null) =>
    editorPageStateStore.finishLoading(loadKey, marketTemplates, ownedTemplate),
  failLoading: (loadKey: string) => editorPageStateStore.failLoading(loadKey),
  syncGenerationIntent: (generationKey: string, shouldGenerate: boolean) =>
    editorPageStateStore.syncGenerationIntent(generationKey, shouldGenerate),
  finishGeneration: (generationKey: string) => editorPageStateStore.finishGeneration(generationKey),
  setGenerationError: (generationKey: string, generateError: string) =>
    editorPageStateStore.setGenerationError(generationKey, generateError),
};

export function useEditorPageSnapshot(): EditorPageSnapshot {
  return useSyncExternalStore(
    editorPageStateStore.subscribe,
    editorPageStateStore.getSnapshot,
    editorPageStateStore.getServerSnapshot,
  );
}
