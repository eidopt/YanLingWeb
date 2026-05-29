'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import {
  getBrowserStateStorage,
  readPersistedObject,
  type StateStorage,
  writePersistedObject,
} from 'state/statePersistence';

export type TemplatesPageSortKey = 'default' | 'name-asc' | 'newest';

export interface TemplatesPageSnapshot {
  search: string;
  debouncedSearch: string;
  activeCategory: string;
  sortKey: TemplatesPageSortKey;
}

type TemplatesPageListener = () => void;

const STORE_NAME = 'templatesPage';
const SEARCH_DEBOUNCE_MS = 300;
export const TEMPLATES_PAGE_STATE_STORAGE_KEY = 'yanling:templates-page:v1';

const INITIAL_SNAPSHOT: TemplatesPageSnapshot = {
  search: '',
  debouncedSearch: '',
  activeCategory: '',
  sortKey: 'default',
};

const SORT_KEYS = new Set<TemplatesPageSortKey>(['default', 'name-asc', 'newest']);

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readSortKey(value: unknown): TemplatesPageSortKey {
  return typeof value === 'string' && SORT_KEYS.has(value as TemplatesPageSortKey)
    ? (value as TemplatesPageSortKey)
    : 'default';
}

export function restoreTemplatesPageSnapshot(
  storage: StateStorage | null,
  fallback: TemplatesPageSnapshot = INITIAL_SNAPSHOT,
): TemplatesPageSnapshot {
  const persisted = readPersistedObject(storage, TEMPLATES_PAGE_STATE_STORAGE_KEY);
  if (!persisted) {
    return fallback;
  }

  const search = readString(persisted.search);
  return {
    ...fallback,
    search,
    debouncedSearch: search,
    activeCategory: readString(persisted.activeCategory),
    sortKey: readSortKey(persisted.sortKey),
  };
}

export function persistTemplatesPageSnapshot(storage: StateStorage | null, snapshot: TemplatesPageSnapshot): void {
  writePersistedObject(storage, TEMPLATES_PAGE_STATE_STORAGE_KEY, {
    search: snapshot.search,
    activeCategory: snapshot.activeCategory,
    sortKey: snapshot.sortKey,
  });
}

class TemplatesPageStateStore {
  private readonly listeners = new Set<TemplatesPageListener>();
  private hydrated = false;
  private listening = false;
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): TemplatesPageSnapshot => this.snapshot;

  getServerSnapshot = (): TemplatesPageSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: TemplatesPageListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    this.startListening();
    this.restoreFromStorage();
    return () => {
      this.listeners.delete(listener);
      this.stopListeningIfIdle();
    };
  };

  setSearch(search: string): void {
    this.update((current) => ({ ...current, search }));
  }

  setDebouncedSearch(debouncedSearch: string): void {
    this.update((current) => ({ ...current, debouncedSearch }));
  }

  clearSearch(): void {
    this.update((current) => ({
      ...current,
      search: '',
      debouncedSearch: '',
    }));
  }

  setActiveCategory(activeCategory: string): void {
    this.update((current) => ({ ...current, activeCategory }));
  }

  setSortKey(sortKey: TemplatesPageSortKey): void {
    this.update((current) => ({ ...current, sortKey }));
  }

  private update(updater: (current: TemplatesPageSnapshot) => TemplatesPageSnapshot): void {
    const next = updater(this.snapshot);
    if (this.createSnapshotKey(next) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

    this.snapshot = next;
    persistTemplatesPageSnapshot(getBrowserStateStorage(), this.snapshot);
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
    this.applyRestoredSnapshot(restoreTemplatesPageSnapshot(getBrowserStateStorage(), this.snapshot));
  }

  private handleStorage = (event: StorageEvent): void => {
    if (event.key !== TEMPLATES_PAGE_STATE_STORAGE_KEY) {
      return;
    }

    this.applyRestoredSnapshot(restoreTemplatesPageSnapshot(getBrowserStateStorage(), this.snapshot));
  };

  private applyRestoredSnapshot(snapshot: TemplatesPageSnapshot): void {
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

  private createSnapshotKey(snapshot: TemplatesPageSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const templatesPageStateStore = new TemplatesPageStateStore();

export const templatesPageStateActions = {
  setSearch: (search: string) => templatesPageStateStore.setSearch(search),
  clearSearch: () => templatesPageStateStore.clearSearch(),
  setActiveCategory: (activeCategory: string) => templatesPageStateStore.setActiveCategory(activeCategory),
  setSortKey: (sortKey: TemplatesPageSortKey) => templatesPageStateStore.setSortKey(sortKey),
};

export function useTemplatesPageSnapshot(): TemplatesPageSnapshot {
  const snapshot = useSyncExternalStore(
    templatesPageStateStore.subscribe,
    templatesPageStateStore.getSnapshot,
    templatesPageStateStore.getServerSnapshot,
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      templatesPageStateStore.setDebouncedSearch(snapshot.search);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [snapshot.search]);

  return snapshot;
}
