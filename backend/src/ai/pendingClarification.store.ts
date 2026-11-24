import { Injectable } from '@nestjs/common';

import { extractClarificationChoiceText } from './ai.service.helpers';

interface PendingClarification {
  optionIds: Set<string>;
  allowCustom: boolean;
  expiresAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Server-side record of a clarification the editor just asked.
 * A follow-up may skip a second free-chat charge only when the choice matches
 * this record. Client-supplied flags alone never grant the exemption.
 */
@Injectable()
export class PendingClarificationStore {
  private readonly pending = new Map<string, PendingClarification>();

  remember(
    userId: string,
    conversationId: string | undefined,
    options: readonly { id: string }[],
    allowCustom: boolean,
  ): void {
    if (!conversationId) {
      return;
    }
    this.prune();
    this.pending.set(this.key(userId, conversationId), {
      optionIds: new Set(options.map((option) => option.id)),
      allowCustom,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
  }

  consume(userId: string, conversationId: string | undefined, choice: unknown): boolean {
    if (!conversationId) {
      return false;
    }
    const key = this.key(userId, conversationId);
    const entry = this.pending.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.pending.delete(key);
      return false;
    }
    const value = extractClarificationChoiceText(choice);
    const id = readChoiceId(choice);
    const matched =
      (value.length > 0 && entry.optionIds.has(value)) ||
      (id.length > 0 && entry.optionIds.has(id)) ||
      (entry.allowCustom && value.trim().length > 0);
    if (!matched) {
      return false;
    }
    this.pending.delete(key);
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.pending) {
      if (entry.expiresAt <= now) {
        this.pending.delete(key);
      }
    }
  }

  private key(userId: string, conversationId: string): string {
    return `${userId}\n${conversationId}`;
  }
}

function readChoiceId(choice: unknown): string {
  if (!choice || typeof choice !== 'object' || !('id' in choice)) {
    return '';
  }
  const id = (choice as { id?: unknown }).id;
  return typeof id === 'string' ? id : '';
}
