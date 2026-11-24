import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { EditorEditOutboxEntry } from '../entities/editorEditOutbox.entity';

const EDIT_TTL_MS = 10 * 60 * 1000;
const EDIT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared store for editor edits that do not fit in one SSE frame.
 * Rows live in the application database, so a fetch can be served by a
 * different process than the one that streamed the edit id.
 */
@Injectable()
export class EditorEditOutbox {
  constructor(
    @InjectRepository(EditorEditOutboxEntry)
    private readonly entries: Repository<EditorEditOutboxEntry>,
  ) {}

  async put(ownerUserId: string, body: string): Promise<string> {
    await this.sweep();
    const editId = randomUUID();
    await this.entries.insert({
      id: editId,
      ownerUserId,
      body,
      expiresAt: String(Date.now() + EDIT_TTL_MS),
    });
    return editId;
  }

  /** Return the body once. A second read, another user, or an expired row yields null. */
  async take(ownerUserId: string, editId: string): Promise<string | null> {
    if (!EDIT_ID_PATTERN.test(editId)) {
      return null;
    }
    await this.sweep();
    const entry = await this.entries.findOne({ where: { id: editId } });
    if (entry?.ownerUserId !== ownerUserId) {
      return null;
    }
    const removed = await this.entries.delete({ id: editId, ownerUserId });
    if (!removed.affected) {
      return null;
    }
    return entry.body;
  }

  private async sweep(): Promise<void> {
    await this.entries
      .createQueryBuilder()
      .delete()
      .where('expiresAt <= :now', { now: String(Date.now()) })
      .execute();
  }
}
