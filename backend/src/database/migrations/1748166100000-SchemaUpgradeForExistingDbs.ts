import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Safe schema upgrade for databases that already existed before the
 * InitialSchema migration (e.g. created by synchronize:true or an older version).
 *
 * This migration is fully idempotent:
 * - Uses PRAGMA table_info to check if columns exist before ALTER TABLE ADD COLUMN
 * - Uses CREATE INDEX IF NOT EXISTS for all indexes
 * - Can run on both fresh (post-InitialSchema) and legacy databases
 */
export class SchemaUpgradeForExistingDbs1748166100000 implements MigrationInterface {
  name = 'SchemaUpgradeForExistingDbs1748166100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Helper: check if a column exists on a table ──
    const hasColumn = async (table: string, column: string): Promise<boolean> => {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info('${table}')`,
      );
      return rows.some((r) => r.name === column);
    };

    // ── templates: add columns introduced in the refactoring ──

    if (!(await hasColumn('templates', 'primaryFunctionalCategory'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "primaryFunctionalCategory" varchar`,
      );
    }

    if (!(await hasColumn('templates', 'platformCategories'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "platformCategories" text NOT NULL DEFAULT ('[]')`,
      );
    }

    if (!(await hasColumn('templates', 'functionalCategories'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "functionalCategories" text NOT NULL DEFAULT ('[]')`,
      );
    }

    if (!(await hasColumn('templates', 'tags'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "tags" text NOT NULL DEFAULT ('[]')`,
      );
    }

    if (!(await hasColumn('templates', 'cssAnimations'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "cssAnimations" text DEFAULT ('{}')`,
      );
    }

    if (!(await hasColumn('templates', 'sourceTemplateId'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "sourceTemplateId" varchar`,
      );
    }

    if (!(await hasColumn('templates', 'isPublic'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "isPublic" boolean NOT NULL DEFAULT (1)`,
      );
    }

    // Backfill primaryFunctionalCategory from functionalCategories JSON
    // Only updates rows where primaryFunctionalCategory is still NULL
    await queryRunner.query(`
      UPDATE "templates"
      SET "primaryFunctionalCategory" = json_extract("functionalCategories", '$[0]')
      WHERE "primaryFunctionalCategory" IS NULL
        AND "functionalCategories" IS NOT NULL
        AND json_array_length("functionalCategories") > 0
    `);

    // ── Indexes (all IF NOT EXISTS) ──

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_templates_ownerUserId_updatedAt" ON "templates" ("ownerUserId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_templates_ownerUserId_isPublic" ON "templates" ("ownerUserId", "isPublic")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_templates_sourceTemplateId" ON "templates" ("sourceTemplateId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_templates_category" ON "templates" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_templates_primaryFunctionalCategory" ON "templates" ("primaryFunctionalCategory")`,
    );

    // ── themes indexes ──
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_themes_category" ON "themes" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_themes_createdAt" ON "themes" ("createdAt")`,
    );

    // ── published_sites indexes ──
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_published_sites_subdomain" ON "published_sites" ("subdomain")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_published_sites_ownerUserId_updatedAt" ON "published_sites" ("ownerUserId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_published_sites_templateId" ON "published_sites" ("templateId")`,
    );

    // ── published_site_revisions indexes ──
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_published_site_revisions_siteId_createdAt" ON "published_site_revisions" ("siteId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_published_site_revisions_templateId" ON "published_site_revisions" ("templateId")`,
    );

    // ── export_records indexes ──
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_export_records_ownerUserId_createdAt" ON "export_records" ("ownerUserId", "createdAt")`,
    );

    // ── ai_token_usage_events indexes ──
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_token_usage_events_ownerUserId_createdAt" ON "ai_token_usage_events" ("ownerUserId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_token_usage_events_provider_model" ON "ai_token_usage_events" ("provider", "model")`,
    );

    // ── editor_ai_conversations indexes ──
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_editor_ai_conversations_ownerUserId_updatedAt" ON "editor_ai_conversations" ("ownerUserId", "updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN in older versions.
    // This migration is additive-only; reverting requires recreating the table.
    // For safety, no-op on down.
  }
}
