'use client';

import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import {
  getBrowserStateStorage,
  readPersistedObject,
  type StateStorage,
  writePersistedObject,
} from 'state/statePersistence';

type Listener = () => void;

export type SnapshotUpdater<TSnapshot> = TSnapshot | ((current: TSnapshot) => TSnapshot);

export interface PersistentStore<TSnapshot> {
  getSnapshot: () => TSnapshot;
  getServerSnapshot: () => TSnapshot;
  subscribe: (listener: Listener) => () => void;
  /** Apply an updater (value or function); dedups, persists, debug-records, notifies. */
  update: (updater: SnapshotUpdater<TSnapshot>) => void;
  /** Commit a snapshot without notifying listeners (e.g. lazy session init). Still dedups + persists + debug-records. */
  commitSilently: (updater: SnapshotUpdater<TSnapshot>) => void;
  /** Read-only access to the current snapshot for callers that need to peek without subscribing. */
  peek: () => TSnapshot;
  /** Restore back to the initial snapshot. Primarily for test isolation. */
  reset: () => void;
}

export interface CreatePersistentStoreConfig<TSnapshot> {
  /** Debug-registry name, also used for transition records. */
  name: string;
  /** Initial / server snapshot. Returned from getServerSnapshot for SSR-safety. */
  initialSnapshot: TSnapshot;
  /**
   * localStorage key. When omitted, the store is purely in-memory:
   * no persistence and no cross-tab `storage` listening / lazy hydration.
   */
  storageKey?: string;
  /**
   * Build a snapshot from the raw persisted object (already JSON-parsed by
   * `readPersistedObject`, or `null` when absent/corrupt). Falls back to `fallback`.
   * Only invoked when `storageKey` is set.
   */
  restore?: (raw: Record<string, unknown> | null, fallback: TSnapshot) => TSnapshot;
  /** Persist the snapshot. Only invoked when `storageKey` is set. */
  persist?: (snapshot: TSnapshot) => void;
  /** Equality check used to dedup updates. Defaults to a shallow compare. */
  areEqual?: (a: TSnapshot, b: TSnapshot) => boolean;
}

function shallowEqual<TSnapshot>(a: TSnapshot, b: TSnapshot): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

function resolveUpdater<TSnapshot>(current: TSnapshot, updater: SnapshotUpdater<TSnapshot>): TSnapshot {
  return typeof updater === 'function' ? (updater as (value: TSnapshot) => TSnapshot)(current) : updater;
}

export function createPersistentStore<TSnapshot>(
  config: CreatePersistentStoreConfig<TSnapshot>,
): PersistentStore<TSnapshot> {
  const { name, initialSnapshot, storageKey, restore, persist } = config;
  const areEqual = config.areEqual ?? shallowEqual;
  const persisted = typeof storageKey === 'string';

  const listeners = new Set<Listener>();
  let snapshot = initialSnapshot;
  let hydrated = false;
  let listening = false;
  let registered = false;

  function getSnapshot(): TSnapshot {
    return snapshot;
  }

  function getServerSnapshot(): TSnapshot {
    return initialSnapshot;
  }

  function notify(): void {
    listeners.forEach((listener) => {
      listener();
    });
  }

  function registerDebugStore(): void {
    if (registered) {
      return;
    }
    registerStateDebugStore(name, getSnapshot);
    registered = true;
  }

  function readRestoredSnapshot(fallback: TSnapshot): TSnapshot {
    if (!persisted || !restore) {
      return fallback;
    }
    const raw = readPersistedObject(getBrowserStateStorage(), storageKey);
    return restore(raw, fallback);
  }

  function applyRestoredSnapshot(next: TSnapshot): void {
    if (areEqual(next, snapshot)) {
      return;
    }
    snapshot = next;
    recordStateDebugTransition(name, snapshot);
    notify();
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key !== storageKey) {
      return;
    }
    applyRestoredSnapshot(readRestoredSnapshot(snapshot));
  }

  function startListening(): void {
    if (!persisted || listening || typeof window === 'undefined') {
      return;
    }
    window.addEventListener('storage', handleStorage);
    listening = true;
  }

  function stopListeningIfIdle(): void {
    if (!listening || listeners.size > 0 || typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('storage', handleStorage);
    listening = false;
  }

  function restoreFromStorage(): void {
    if (!persisted || hydrated) {
      return;
    }
    hydrated = true;
    applyRestoredSnapshot(readRestoredSnapshot(snapshot));
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    registerDebugStore();
    startListening();
    restoreFromStorage();
    return () => {
      listeners.delete(listener);
      stopListeningIfIdle();
    };
  }

  function commit(next: TSnapshot, shouldNotify: boolean): void {
    if (areEqual(next, snapshot)) {
      return;
    }
    snapshot = next;
    if (persisted && persist) {
      persist(snapshot);
    }
    recordStateDebugTransition(name, snapshot);
    if (shouldNotify) {
      notify();
    }
  }

  function update(updater: SnapshotUpdater<TSnapshot>): void {
    commit(resolveUpdater(snapshot, updater), true);
  }

  function commitSilently(updater: SnapshotUpdater<TSnapshot>): void {
    commit(resolveUpdater(snapshot, updater), false);
  }

  function reset(): void {
    snapshot = initialSnapshot;
    hydrated = false;
  }

  return {
    getSnapshot,
    getServerSnapshot,
    subscribe,
    update,
    commitSilently,
    peek: getSnapshot,
    reset,
  };
}

export type { StateStorage };
export { getBrowserStateStorage, readPersistedObject, writePersistedObject };
