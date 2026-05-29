'use client';

export interface StateDebugTransition {
  store: string;
  timestamp: string;
  snapshot: unknown;
}

interface StateDebugRegistry {
  stores: Record<string, () => unknown>;
  history: StateDebugTransition[];
}

declare global {
  interface Window {
    __YANLING_STATE__?: StateDebugRegistry;
  }
}

const MAX_HISTORY = 50;

function getDebugRegistry(): StateDebugRegistry | null {
  if (typeof window === 'undefined') {
    return null;
  }

  window.__YANLING_STATE__ ??= {
    stores: {},
    history: [],
  };

  return window.__YANLING_STATE__;
}

export function registerStateDebugStore(name: string, getSnapshot: () => unknown): void {
  const registry = getDebugRegistry();
  if (!registry) {
    return;
  }

  registry.stores[name] = getSnapshot;
}

export function recordStateDebugTransition(name: string, snapshot: unknown): void {
  const registry = getDebugRegistry();
  if (!registry) {
    return;
  }

  registry.history.push({
    store: name,
    timestamp: new Date().toISOString(),
    snapshot,
  });

  if (registry.history.length > MAX_HISTORY) {
    registry.history.splice(0, registry.history.length - MAX_HISTORY);
  }
}
