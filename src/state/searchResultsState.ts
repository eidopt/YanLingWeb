'use client';

import { useSyncExternalStore } from 'react';
import type { CreateWithAiResult, SearchTemplatesResult } from 'services/SearchService';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';

export type SearchResultsSnapshot =
  | { query: string; status: 'idle' }
  | { query: string; status: 'loading' }
  | { query: string; status: 'results'; results: SearchTemplatesResult }
  | { query: string; status: 'created'; result: CreateWithAiResult }
  | { query: string; status: 'error'; message: string };

type SearchResultsListener = () => void;

const STORE_NAME = 'searchResults';

const INITIAL_SNAPSHOT: SearchResultsSnapshot = {
  query: '',
  status: 'idle',
};

class SearchResultsStateStore {
  private readonly listeners = new Set<SearchResultsListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): SearchResultsSnapshot => this.snapshot;

  getServerSnapshot = (): SearchResultsSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: SearchResultsListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  setQuery(query: string): void {
    this.update((current) => ({ ...current, query }));
  }

  setLoading(): void {
    this.update((current) => ({ query: current.query, status: 'loading' }));
  }

  setResults(results: SearchTemplatesResult): void {
    this.update((current) => ({ query: current.query, status: 'results', results }));
  }

  setCreated(result: CreateWithAiResult): void {
    this.update((current) => ({ query: current.query, status: 'created', result }));
  }

  setError(message: string): void {
    this.update((current) => ({ query: current.query, status: 'error', message }));
  }

  private update(updater: (current: SearchResultsSnapshot) => SearchResultsSnapshot): void {
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

  private createSnapshotKey(snapshot: SearchResultsSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const searchResultsStateStore = new SearchResultsStateStore();

export const searchResultsStateActions = {
  setQuery: (query: string) => searchResultsStateStore.setQuery(query),
  setLoading: () => searchResultsStateStore.setLoading(),
  setResults: (results: SearchTemplatesResult) => searchResultsStateStore.setResults(results),
  setCreated: (result: CreateWithAiResult) => searchResultsStateStore.setCreated(result),
  setError: (message: string) => searchResultsStateStore.setError(message),
};

export function useSearchResultsSnapshot(): SearchResultsSnapshot {
  return useSyncExternalStore(
    searchResultsStateStore.subscribe,
    searchResultsStateStore.getSnapshot,
    searchResultsStateStore.getServerSnapshot,
  );
}
