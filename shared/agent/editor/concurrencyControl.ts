import type { AgentEditResult } from '../errors/agentErrors';
import type { ThemeLayoutDocument } from '../types';

export interface DocumentLock {
  documentId: string;
  lockId: string;
  lockedBy: string;
  lockedAt: number;
  expiresAt: number;
  operation: string;
}

export interface VersionedDocumentState {
  documentId: string;
  version: number;
  lastModified: number;
  checksum: string;
}

function checksumDocument(document: ThemeLayoutDocument): string {
  const source = JSON.stringify(document);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export class ConcurrencyControl {
  private locks = new Map<string, DocumentLock>();
  private versions = new Map<string, VersionedDocumentState>();

  constructor(private readonly lockTimeoutMs = 30 * 1000) {}

  acquireLock(documentId: string, sessionId: string, operation: string): AgentEditResult<{ lockId: string }> {
    const existing = this.locks.get(documentId);
    if (existing && !this.isLockExpired(existing)) {
      if (existing.lockedBy === sessionId) {
        return { success: true, data: { lockId: existing.lockId } };
      }
      return {
        success: false,
        error: {
          code: 'apply_failed',
          reason: `Document locked by ${existing.lockedBy}: ${existing.operation}`,
          partialSuccess: false,
          recoverable: false,
        },
      };
    }

    const now = Date.now();
    const lockId = `lock_${now}_${Math.random().toString(36).slice(2, 10)}`;
    this.locks.set(documentId, {
      documentId,
      lockId,
      lockedBy: sessionId,
      lockedAt: now,
      expiresAt: now + this.lockTimeoutMs,
      operation,
    });
    return { success: true, data: { lockId } };
  }

  releaseLock(documentId: string, lockId: string): boolean {
    const lock = this.locks.get(documentId);
    if (lock?.lockId === lockId) {
      this.locks.delete(documentId);
      return true;
    }
    return false;
  }

  initializeVersion(document: ThemeLayoutDocument): VersionedDocumentState {
    const existing = this.versions.get(document.themeId);
    if (existing) {
      return existing;
    }
    const state = {
      documentId: document.themeId,
      version: document.version,
      lastModified: Date.now(),
      checksum: checksumDocument(document),
    };
    this.versions.set(document.themeId, state);
    return state;
  }

  checkVersion(documentId: string, expectedVersion: number): AgentEditResult<{ currentVersion: number }> {
    const current = this.versions.get(documentId);
    const actual = current?.version ?? expectedVersion;
    if (actual === expectedVersion) {
      return { success: true, data: { currentVersion: actual } };
    }
    return {
      success: false,
      error: {
        code: 'version_conflict',
        expected: expectedVersion,
        actual,
        recoverable: true,
      },
    };
  }

  incrementVersion(document: ThemeLayoutDocument): VersionedDocumentState {
    const current = this.initializeVersion(document);
    const next = {
      documentId: document.themeId,
      version: current.version + 1,
      lastModified: Date.now(),
      checksum: checksumDocument(document),
    };
    this.versions.set(document.themeId, next);
    return next;
  }

  cleanupExpiredLocks(): number {
    let removed = 0;
    for (const [documentId, lock] of this.locks) {
      if (this.isLockExpired(lock)) {
        this.locks.delete(documentId);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.locks.clear();
    this.versions.clear();
  }

  private isLockExpired(lock: DocumentLock): boolean {
    return Date.now() > lock.expiresAt;
  }
}

export const concurrencyControl = new ConcurrencyControl();
