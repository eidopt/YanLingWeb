'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPersistentStore } from 'state/createPersistentStore';

export type HomeWorkspaceTemplateView = 'marketplace' | 'mine';
export type HomeWorkspaceMode = 'home' | 'templates';

export interface HomeWorkspaceSnapshot {
  templateView: HomeWorkspaceTemplateView;
  searchDraft: string;
  submittedSearch: string;
  submittedCategory: string;
  submittedPlatformCategory: string;
  searchRevision: number;
}

const STORE_NAME = 'homeWorkspace';

const INITIAL_SNAPSHOT: HomeWorkspaceSnapshot = {
  templateView: 'marketplace',
  searchDraft: '',
  submittedSearch: '',
  submittedCategory: '',
  submittedPlatformCategory: '',
  searchRevision: 0,
};

function readSearchParam(name: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? '';
}

function readTemplateView(mode: HomeWorkspaceMode): HomeWorkspaceTemplateView {
  if (mode === 'templates' || typeof window === 'undefined') {
    return 'marketplace';
  }
  return new URLSearchParams(window.location.search).get('view') === 'mine' ? 'mine' : 'marketplace';
}

const store = createPersistentStore<HomeWorkspaceSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
});

export const homeWorkspaceStateActions = {
  setSearchDraft: (searchDraft: string) => store.update((current) => ({ ...current, searchDraft })),
  submitSearch: (search: string) =>
    store.update((current) => ({
      ...current,
      submittedSearch: search.trim(),
      searchRevision: current.searchRevision + 1,
    })),
  showTemplateView: (templateView: HomeWorkspaceTemplateView) =>
    store.update((current) => ({
      ...current,
      templateView,
      searchDraft: '',
      submittedSearch: '',
      submittedCategory: '',
      submittedPlatformCategory: '',
      searchRevision: current.searchRevision + 1,
    })),
  browseCategory: (category: string) =>
    store.update((current) => ({
      ...current,
      templateView: 'marketplace',
      submittedCategory: category,
      searchRevision: current.searchRevision + 1,
    })),
  browsePlatformCategory: (platformCategory: string) =>
    store.update((current) => ({
      ...current,
      templateView: 'marketplace',
      submittedPlatformCategory: platformCategory,
      searchRevision: current.searchRevision + 1,
    })),
};

function syncFromUrl(mode: HomeWorkspaceMode): void {
  store.update((current) => ({
    ...current,
    templateView: readTemplateView(mode),
    submittedCategory: readSearchParam('category'),
    submittedPlatformCategory: readSearchParam('platformCategory'),
  }));
}

export function useHomeWorkspaceSnapshot(mode: HomeWorkspaceMode): HomeWorkspaceSnapshot {
  useEffect(() => {
    const sync = () => {
      syncFromUrl(mode);
    };

    sync();
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
    };
  }, [mode]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
