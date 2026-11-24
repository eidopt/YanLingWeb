import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface StoredEditorEdit {
  ownerUserId: string;
  body: string;
  expiresAt: number;
}

const EDIT_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class EditorEditOutbox {
  private readonly entries = new Map<string, StoredEditorEdit>();

  put(ownerUserId: string, body: string): string {
    this.sweep();
    const editId = randomUUID();
    this.entries.set(editId, {
      ownerUserId,
      body,
      expiresAt: Date.now() + EDIT_TTL_MS,
    });
    return editId;
  }

  /** Return the body once. A second read, or a read by another user, yields null. */
  take(ownerUserId: string, editId: string): string | null {
    this.sweep();
    const entry = this.entries.get(editId);
    if (entry?.ownerUserId !== ownerUserId) {
      return null;
    }
    this.entries.delete(editId);
    return entry.body;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [editId, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(editId);
      }
    }
  }
}
