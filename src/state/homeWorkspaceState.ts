'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';

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

type HomeWorkspaceListener = () => void;

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

class HomeWorkspaceStateStore {
  private readonly listeners = new Set<HomeWorkspaceListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): HomeWorkspaceSnapshot => this.snapshot;

  getServerSnapshot = (): HomeWorkspaceSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: HomeWorkspaceListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  syncFromUrl(mode: HomeWorkspaceMode): void {
    this.update((current) => ({
      ...current,
      templateView: readTemplateView(mode),
      submittedCategory: readSearchParam('category'),
      submittedPlatformCategory: readSearchParam('platformCategory'),
    }));
  }

  setSearchDraft(searchDraft: string): void {
    this.update((current) => ({ ...current, searchDraft }));
  }

  submitSearch(search: string): void {
    this.update((current) => ({
      ...current,
      submittedSearch: search.trim(),
      searchRevision: current.searchRevision + 1,
    }));
  }

  showTemplateView(templateView: HomeWorkspaceTemplateView): void {
    this.update((current) => ({
      ...current,
      templateView,
      searchDraft: '',
      submittedSearch: '',
      submittedCategory: '',
      submittedPlatformCategory: '',
      searchRevision: current.searchRevision + 1,
    }));
  }

  browseCategory(category: string): void {
    this.update((current) => ({
      ...current,
      templateView: 'marketplace',
      submittedCategory: category,
      searchRevision: current.searchRevision + 1,
    }));
  }

  browsePlatformCategory(platformCategory: string): void {
    this.update((current) => ({
      ...current,
      templateView: 'marketplace',
      submittedPlatformCategory: platformCategory,
      searchRevision: current.searchRevision + 1,
    }));
  }

  private update(updater: (current: HomeWorkspaceSnapshot) => HomeWorkspaceSnapshot): void {
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

  private createSnapshotKey(snapshot: HomeWorkspaceSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const homeWorkspaceStateStore = new HomeWorkspaceStateStore();

export const homeWorkspaceStateActions = {
  setSearchDraft: (searchDraft: string) => homeWorkspaceStateStore.setSearchDraft(searchDraft),
  submitSearch: (search: string) => homeWorkspaceStateStore.submitSearch(search),
  showTemplateView: (templateView: HomeWorkspaceTemplateView) => homeWorkspaceStateStore.showTemplateView(templateView),
  browseCategory: (category: string) => homeWorkspaceStateStore.browseCategory(category),
  browsePlatformCategory: (platformCategory: string) =>
    homeWorkspaceStateStore.browsePlatformCategory(platformCategory),
};

export function useHomeWorkspaceSnapshot(mode: HomeWorkspaceMode): HomeWorkspaceSnapshot {
  useEffect(() => {
    const sync = () => {
      homeWorkspaceStateStore.syncFromUrl(mode);
    };

    sync();
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
    };
  }, [mode]);

  return useSyncExternalStore(
    homeWorkspaceStateStore.subscribe,
    homeWorkspaceStateStore.getSnapshot,
    homeWorkspaceStateStore.getServerSnapshot,
  );
}
