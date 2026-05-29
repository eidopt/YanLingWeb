'use client';

import { useAppServices } from 'hooks/useAppServices';
import { useSyncExternalStore } from 'react';
import type { AuthService, AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
}

type AuthStateListener = () => void;

const CHECKING_SNAPSHOT: AuthSnapshot = {
  status: 'checking',
  user: null,
};

const ANONYMOUS_SNAPSHOT: AuthSnapshot = {
  status: 'anonymous',
  user: null,
};

class AuthStateStore {
  private readonly debugName = 'auth';
  private readonly listeners = new Set<AuthStateListener>();
  private snapshot: AuthSnapshot = CHECKING_SNAPSHOT;
  private snapshotKey = 'checking';
  private listening = false;

  constructor(private readonly authService: AuthService) {}

  getSnapshot = (): AuthSnapshot => this.snapshot;

  getServerSnapshot = (): AuthSnapshot => CHECKING_SNAPSHOT;

  subscribe = (listener: AuthStateListener): (() => void) => {
    this.listeners.add(listener);
    this.startListening();
    this.syncFromStorage();

    return () => {
      this.listeners.delete(listener);
      this.stopListeningIfIdle();
    };
  };

  private startListening(): void {
    if (this.listening || typeof window === 'undefined') {
      return;
    }

    window.addEventListener(AUTH_CHANGED_EVENT, this.syncFromStorage);
    window.addEventListener('storage', this.syncFromStorage);
    registerStateDebugStore(this.debugName, this.getSnapshot);
    this.listening = true;
  }

  private stopListeningIfIdle(): void {
    if (!this.listening || this.listeners.size > 0 || typeof window === 'undefined') {
      return;
    }

    window.removeEventListener(AUTH_CHANGED_EVENT, this.syncFromStorage);
    window.removeEventListener('storage', this.syncFromStorage);
    this.listening = false;
  }

  private syncFromStorage = (): void => {
    const user = this.authService.getUser();
    const next: AuthSnapshot = user ? { status: 'authenticated', user } : ANONYMOUS_SNAPSHOT;

    const nextKey = this.createSnapshotKey(next);
    if (this.snapshotKey === nextKey) {
      return;
    }

    this.snapshot = next;
    this.snapshotKey = nextKey;
    recordStateDebugTransition(this.debugName, this.snapshot);
    this.listeners.forEach((notify) => {
      notify();
    });
  };

  private createSnapshotKey(snapshot: AuthSnapshot): string {
    return `${snapshot.status}:${JSON.stringify(snapshot.user)}`;
  }
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
