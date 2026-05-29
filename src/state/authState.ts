'use client';

import { useAppServices } from 'hooks/useAppServices';
import { useSyncExternalStore } from 'react';
import type { AuthService, AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { createPersistentStore, type PersistentStore } from 'state/createPersistentStore';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
}

const CHECKING_SNAPSHOT: AuthSnapshot = {
  status: 'checking',
  user: null,
};

const ANONYMOUS_SNAPSHOT: AuthSnapshot = {
  status: 'anonymous',
  user: null,
};

function areAuthSnapshotsEqual(a: AuthSnapshot, b: AuthSnapshot): boolean {
  return a.status === b.status && JSON.stringify(a.user) === JSON.stringify(b.user);
}

/**
 * Auth is sourced from `authService.getUser()` (not localStorage), and reacts to a
 * custom `AUTH_CHANGED_EVENT` plus the cross-tab `storage` event. So it uses the
 * in-memory factory for the shared plumbing (listeners, debug, dedup→record→notify)
 * and wires its bespoke event listeners + per-service instances on top.
 */
class AuthStateStore {
  private readonly store: PersistentStore<AuthSnapshot> = createPersistentStore<AuthSnapshot>({
    name: 'auth',
    initialSnapshot: CHECKING_SNAPSHOT,
    areEqual: areAuthSnapshotsEqual,
  });
  private listening = false;

  constructor(private readonly authService: AuthService) {}

  getSnapshot = (): AuthSnapshot => this.store.getSnapshot();

  getServerSnapshot = (): AuthSnapshot => this.store.getServerSnapshot();

  subscribe = (listener: () => void): (() => void) => {
    const unsubscribe = this.store.subscribe(listener);
    this.startListening();
    this.syncFromStorage();

    return () => {
      unsubscribe();
      this.stopListeningIfIdle();
    };
  };

  private startListening(): void {
    if (this.listening || typeof window === 'undefined') {
      return;
    }

    window.addEventListener(AUTH_CHANGED_EVENT, this.syncFromStorage);
    window.addEventListener('storage', this.syncFromStorage);
    this.listening = true;
  }

  private stopListeningIfIdle(): void {
    if (!this.listening || typeof window === 'undefined') {
      return;
    }

    window.removeEventListener(AUTH_CHANGED_EVENT, this.syncFromStorage);
    window.removeEventListener('storage', this.syncFromStorage);
    this.listening = false;
  }

  private syncFromStorage = (): void => {
    const user = this.authService.getUser();
    this.store.update(user ? { status: 'authenticated', user } : ANONYMOUS_SNAPSHOT);
  };
}

const storesByAuthService = new WeakMap<AuthService, AuthStateStore>();

function getAuthStateStore(authService: AuthService): AuthStateStore {
  const existing = storesByAuthService.get(authService);
  if (existing) {
    return existing;
  }

  const store = new AuthStateStore(authService);
  storesByAuthService.set(authService, store);
  return store;
}

export function useAuthSnapshot(): AuthSnapshot {
  const { authService } = useAppServices();
  const store = getAuthStateStore(authService);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useAuthUser(): AuthUser | null | undefined {
  const snapshot = useAuthSnapshot();
  return snapshot.status === 'checking' ? undefined : snapshot.user;
}
