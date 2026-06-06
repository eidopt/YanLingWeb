import { MigrationInterface, QueryRunner } from 'typeorm';

import { booleanDefault, createIndexSql, getMigrationDialect, hasColumn } from '../migrationSql';

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
    const dialect = getMigrationDialect(queryRunner);
    const activeDefault = booleanDefault(dialect, true);

    // ── templates: add columns introduced in the refactoring ──

    if (!(await hasColumn(queryRunner, 'templates', 'displayCategory'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "displayCategory" varchar NOT NULL DEFAULT ('general')`,
      );
    }

    if (!(await hasColumn(queryRunner, 'templates', 'primaryFunctionalCategory'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD "primaryFunctionalCategory" varchar`);
    }

    if (!(await hasColumn(queryRunner, 'templates', 'platformCategories'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "platformCategories" text NOT NULL DEFAULT ('[]')`,
      );
    }

    if (!(await hasColumn(queryRunner, 'templates', 'functionalCategories'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "functionalCategories" text NOT NULL DEFAULT ('[]')`,
      );
    }

    if (!(await hasColumn(queryRunner, 'templates', 'tags'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD "tags" text NOT NULL DEFAULT ('[]')`);
    }

    if (!(await hasColumn(queryRunner, 'templates', 'cssAnimations'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD "cssAnimations" text DEFAULT ('{}')`);
    }

    if (!(await hasColumn(queryRunner, 'templates', 'sourceTemplateId'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD "sourceTemplateId" varchar`);
    }

    if (!(await hasColumn(queryRunner, 'templates', 'isPublic'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "isPublic" boolean NOT NULL DEFAULT (${activeDefault})`,
      );
    }

    // Backfill primaryFunctionalCategory from functionalCategories JSON
    // Only updates rows where primaryFunctionalCategory is still NULL
    if (dialect === 'postgres') {
      await queryRunner.query(`
        UPDATE "templates"
        SET "primaryFunctionalCategory" = ("functionalCategories"::jsonb ->> 0)
        WHERE "primaryFunctionalCategory" IS NULL
          AND "functionalCategories" IS NOT NULL
          AND jsonb_array_length("functionalCategories"::jsonb) > 0
      `);
    } else {
      await queryRunner.query(`
        UPDATE "templates"
        SET "primaryFunctionalCategory" = json_extract("functionalCategories", '$[0]')
        WHERE "primaryFunctionalCategory" IS NULL
          AND "functionalCategories" IS NOT NULL
          AND json_array_length("functionalCategories") > 0
      `);
    }

    await queryRunner.query(`
      UPDATE "templates"
      SET "displayCategory" = COALESCE(
        NULLIF("displayCategory", ''),
        NULLIF("category", ''),
        'general'
      )
      WHERE "displayCategory" IS NULL OR "displayCategory" = ''
    `);

    // ── Indexes (all IF NOT EXISTS) ──

    await queryRunner.query(
      createIndexSql('IDX_templates_ownerUserId_updatedAt', 'templates', [
        'ownerUserId',
        'updatedAt',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_templates_ownerUserId_isPublic', 'templates', [
        'ownerUserId',
        'isPublic',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_templates_sourceTemplateId', 'templates', ['sourceTemplateId']),
    );
    await queryRunner.query(createIndexSql('IDX_templates_category', 'templates', ['category']));
    await queryRunner.query(
      createIndexSql('IDX_templates_displayCategory', 'templates', ['displayCategory']),
    );
    await queryRunner.query(
      createIndexSql('IDX_templates_primaryFunctionalCategory', 'templates', [
        'primaryFunctionalCategory',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_templates_isPublic_displayCategory', 'templates', [
        'isPublic',
        'displayCategory',
      ]),
    );

    // ── themes indexes ──
    await queryRunner.query(createIndexSql('IDX_themes_category', 'themes', ['category']));
    await queryRunner.query(createIndexSql('IDX_themes_createdAt', 'themes', ['createdAt']));

    // ── published_sites indexes ──
    await queryRunner.query(
      createIndexSql('IDX_published_sites_subdomain', 'published_sites', ['subdomain'], {
        unique: true,
      }),
    );
    await queryRunner.query(
      createIndexSql('IDX_published_sites_ownerUserId_updatedAt', 'published_sites', [
        'ownerUserId',
        'updatedAt',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_published_sites_templateId', 'published_sites', ['templateId']),
    );

    // ── published_site_revisions indexes ──
    await queryRunner.query(
      createIndexSql('IDX_published_site_revisions_siteId_createdAt', 'published_site_revisions', [
        'siteId',
        'createdAt',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_published_site_revisions_templateId', 'published_site_revisions', [
        'templateId',
      ]),
    );

    // ── export_records indexes ──
    await queryRunner.query(
      createIndexSql('IDX_export_records_ownerUserId_createdAt', 'export_records', [
        'ownerUserId',
        'createdAt',
      ]),
    );

    // ── ai_token_usage_events indexes ──
    await queryRunner.query(
      createIndexSql('IDX_ai_token_usage_events_ownerUserId_createdAt', 'ai_token_usage_events', [
        'ownerUserId',
        'createdAt',
      ]),
    );
    await queryRunner.query(
      createIndexSql('IDX_ai_token_usage_events_provider_model', 'ai_token_usage_events', [
        'provider',
        'model',
      ]),
    );

    // ── editor_ai_conversations indexes ──
    await queryRunner.query(
      createIndexSql(
        'IDX_editor_ai_conversations_ownerUserId_updatedAt',
        'editor_ai_conversations',
        ['ownerUserId', 'updatedAt'],
      ),
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN in older versions.
    // This migration is additive-only; reverting requires recreating the table.
    // For safety, no-op on down.
  }
}
