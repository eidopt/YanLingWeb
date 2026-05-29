'use client';

export type StateStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function getBrowserStateStorage(): StateStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistedObject(storage: StateStorage | null, key: string): Record<string, unknown> | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writePersistedObject(storage: StateStorage | null, key: string, value: Record<string, unknown>): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or unavailable in private contexts; state must remain usable in memory.
  }
}
