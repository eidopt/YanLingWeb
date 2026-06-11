import { MigrationInterface, QueryRunner } from 'typeorm';

import { hasColumn } from '../migrationSql';

/**
 * Adds the `undoStack` JSON column to `editor_ai_conversations` so the
 * editor AI undo stack can survive across browser sessions.
 *
 * Idempotent: uses `hasColumn` so it can safely run on databases that
 * were either created by the InitialSchema migration (which already
 * declares the column) or by synchronize:true before this column was added.
 */
export class EditorAiConversationUndoStack1748166300000 implements MigrationInterface {
  name = 'EditorAiConversationUndoStack1748166300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasColumn(queryRunner, 'editor_ai_conversations', 'undoStack'))) {
      await queryRunner.query(`ALTER TABLE "editor_ai_conversations" ADD "undoStack" text`);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN in older versions.
    // This migration is additive-only; reverting requires recreating the table.
    // For safety, no-op on down.
  }
}
