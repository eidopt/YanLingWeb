'use client';

import { useSyncExternalStore } from 'react';
import type { CreateWithAiResult, SearchTemplatesResult } from 'services/SearchService';
import { createPersistentStore } from 'state/createPersistentStore';

export type SearchResultsSnapshot =
  | { query: string; status: 'idle' }
  | { query: string; status: 'loading' }
  | { query: string; status: 'results'; results: SearchTemplatesResult }
  | { query: string; status: 'created'; result: CreateWithAiResult }
  | { query: string; status: 'error'; message: string };

const STORE_NAME = 'searchResults';

const INITIAL_SNAPSHOT: SearchResultsSnapshot = {
  query: '',
  status: 'idle',
};

const store = createPersistentStore<SearchResultsSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  areEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

export const searchResultsStateActions = {
  setQuery: (query: string) => store.update((current) => ({ ...current, query })),
  setLoading: () => store.update((current) => ({ query: current.query, status: 'loading' })),
  setResults: (results: SearchTemplatesResult) =>
    store.update((current) => ({ query: current.query, status: 'results', results })),
  setCreated: (result: CreateWithAiResult) =>
    store.update((current) => ({ query: current.query, status: 'created', result })),
  setError: (message: string) => store.update((current) => ({ query: current.query, status: 'error', message })),
};

export function useSearchResultsSnapshot(): SearchResultsSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
