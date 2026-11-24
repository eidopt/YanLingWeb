import { MigrationInterface, QueryRunner } from 'typeorm';

import { createIndexSql } from '../migrationSql';

/**
 * Stores oversized editor edit payloads so any API process sharing the database
 * can serve the follow-up fetch. The previous in-memory map was invisible to
 * other instances.
 */
export class EditorEditOutbox1748166800000 implements MigrationInterface {
  name = 'EditorEditOutbox1748166800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "editor_edit_outbox" (
        "id" varchar PRIMARY KEY NOT NULL,
        "ownerUserId" varchar NOT NULL,
        "body" text NOT NULL,
        "expiresAt" bigint NOT NULL
      )
    `);
    await queryRunner.query(
      createIndexSql('IDX_editor_edit_outbox_expiresAt', 'editor_edit_outbox', ['expiresAt']),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "editor_edit_outbox"`);
  }
}
