import { MigrationInterface, QueryRunner } from 'typeorm';

import { hasColumn } from '../migrationSql';

/**
 * Adds three columns to `editor_ai_conversations` for cross-session state
 * persistence (PR-E):
 *  - `compactSummary` (text, nullable) — last compaction summary, reserved
 *  - `lastPrefixHash` (varchar(16), nullable) — last sent prefix sha256[:16]
 *  - `cacheContext` (text/simple-json, nullable) — last cache strategy snapshot
 *
 * Idempotent: each `ADD COLUMN` is gated by `hasColumn` so it's safe on
 * databases that were created before the column was added. SQLite does not
 * support DROP COLUMN in older versions, so the down() is a no-op (matches
 * the existing EditorAiConversationUndoStack migration).
 */
export class EditorAiConversationCacheContext1748166400000 implements MigrationInterface {
  name = 'EditorAiConversationCacheContext1748166400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasColumn(queryRunner, 'editor_ai_conversations', 'compactSummary'))) {
      await queryRunner.query(`ALTER TABLE "editor_ai_conversations" ADD "compactSummary" text`);
    }
    if (!(await hasColumn(queryRunner, 'editor_ai_conversations', 'lastPrefixHash'))) {
      await queryRunner.query(
        `ALTER TABLE "editor_ai_conversations" ADD "lastPrefixHash" varchar(16)`,
      );
    }
    if (!(await hasColumn(queryRunner, 'editor_ai_conversations', 'cacheContext'))) {
      await queryRunner.query(`ALTER TABLE "editor_ai_conversations" ADD "cacheContext" text`);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite 不支持 DROP COLUMN; 与同系列迁移保持一致, down() 为 no-op.
  }
}
