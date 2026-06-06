import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  booleanDefault,
  createIndexSql,
  ensurePostgresUuidSupport,
  getMigrationDialect,
  hasColumn,
  timestampColumn,
  uuidPrimaryKey,
  varcharPrimaryKey,
} from '../migrationSql';

/**
 * Initial schema migration — creates all application tables.
 *
 * This migration is idempotent: it uses CREATE TABLE IF NOT EXISTS and
 * CREATE INDEX IF NOT EXISTS so it can safely run on both fresh databases
 * and databases that already have tables (e.g. from synchronize:true).
 */
export class InitialSchema1748166000000 implements MigrationInterface {
  name = 'InitialSchema1748166000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = getMigrationDialect(queryRunner);
    await ensurePostgresUuidSupport(queryRunner, dialect);
    const generatedId = uuidPrimaryKey(dialect);
    const stableId = varcharPrimaryKey();
    const activeDefault = booleanDefault(dialect, true);
    const createdAt = timestampColumn(dialect, 'createdAt');
    const updatedAt = timestampColumn(dialect, 'updatedAt');
    const lastLoginAt = timestampColumn(dialect, 'lastLoginAt', {
      nullable: true,
      defaultNow: false,
    });

    // ── users ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        ${generatedId},
        "username" varchar NOT NULL,
        "email" varchar,
        "phone" varchar,
        "passwordHash" varchar,
        "wechatOpenId" varchar,
        "qqOpenId" varchar,
        "linkedLogins" text NOT NULL DEFAULT ('[]'),
        "tokensUsed" bigint NOT NULL DEFAULT (0),
        "tokensBalance" integer NOT NULL DEFAULT (0),
        "balanceCents" integer NOT NULL DEFAULT (0),
        "isActive" boolean NOT NULL DEFAULT (${activeDefault}),
        ${lastLoginAt},
        ${createdAt},
        ${updatedAt},
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "UQ_users_wechatOpenId" UNIQUE ("wechatOpenId"),
        CONSTRAINT "UQ_users_qqOpenId" UNIQUE ("qqOpenId")
      )
    `);

    // ── themes ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "themes" (
        ${stableId},
        "name" varchar NOT NULL,
        "tagline" varchar NOT NULL DEFAULT (''),
        "description" varchar NOT NULL DEFAULT (''),
        "accent" varchar NOT NULL DEFAULT ('#000000'),
        "category" varchar NOT NULL DEFAULT ('general'),
        "traits" text NOT NULL DEFAULT ('[]'),
        "cssVars" text NOT NULL DEFAULT ('{}'),
        "componentTemplates" text NOT NULL DEFAULT ('{}'),
        "layoutDocument" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt},
        CONSTRAINT "UQ_themes_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(createIndexSql('IDX_themes_category', 'themes', ['category']));
    await queryRunner.query(createIndexSql('IDX_themes_createdAt', 'themes', ['createdAt']));

    // ── templates ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "templates" (
        ${stableId},
        "templateId" varchar NOT NULL,
        "ownerUserId" varchar,
        "sourceTemplateId" varchar,
        "isPublic" boolean NOT NULL DEFAULT (${activeDefault}),
        "name" varchar NOT NULL,
        "tagline" varchar NOT NULL DEFAULT (''),
        "description" varchar NOT NULL DEFAULT (''),
        "accent" varchar NOT NULL DEFAULT ('#000000'),
        "category" varchar NOT NULL DEFAULT ('general'),
        "displayCategory" varchar NOT NULL DEFAULT ('general'),
        "primaryFunctionalCategory" varchar,
        "platformCategories" text NOT NULL DEFAULT ('[]'),
        "functionalCategories" text NOT NULL DEFAULT ('[]'),
        "traits" text NOT NULL DEFAULT ('[]'),
        "tags" text NOT NULL DEFAULT ('[]'),
        "cssVars" text NOT NULL DEFAULT ('{}'),
        "cssAnimations" text DEFAULT ('{}'),
        "componentTemplates" text NOT NULL DEFAULT ('{}'),
        "layoutDocument" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt},
        CONSTRAINT "UQ_templates_templateId" UNIQUE ("templateId")
      )
    `);
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'sourceTemplateId',
      `"sourceTemplateId" varchar`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'isPublic',
      `"isPublic" boolean NOT NULL DEFAULT (${activeDefault})`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'displayCategory',
      `"displayCategory" varchar NOT NULL DEFAULT ('general')`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'primaryFunctionalCategory',
      `"primaryFunctionalCategory" varchar`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'platformCategories',
      `"platformCategories" text NOT NULL DEFAULT ('[]')`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'functionalCategories',
      `"functionalCategories" text NOT NULL DEFAULT ('[]')`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'tags',
      `"tags" text NOT NULL DEFAULT ('[]')`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'templates',
      'cssAnimations',
      `"cssAnimations" text DEFAULT ('{}')`,
    );
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

    // ── published_sites ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "published_sites" (
        ${stableId},
        "ownerUserId" varchar NOT NULL,
        "templateId" varchar NOT NULL,
        "subdomain" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT ('active'),
        "activeRevisionId" varchar,
        ${createdAt},
        ${updatedAt}
      )
    `);
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

    // ── published_site_revisions ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "published_site_revisions" (
        ${stableId},
        "siteId" varchar NOT NULL,
        "templateId" varchar NOT NULL,
        "schemaVersion" integer NOT NULL,
        "runtimeVersion" varchar NOT NULL,
        "layoutJson" text NOT NULL,
        "themeJson" text NOT NULL,
        "dataJson" text NOT NULL DEFAULT ('{}'),
        "manifestJson" text NOT NULL,
        "status" varchar NOT NULL DEFAULT ('active'),
        "errorMessage" text,
        ${createdAt}
      )
    `);
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

    // ── export_records ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "export_records" (
        ${stableId},
        "ownerUserId" varchar,
        "projectName" varchar NOT NULL,
        "themeId" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT ('idle'),
        "layoutJson" text NOT NULL DEFAULT ('{}'),
        "outputPath" varchar,
        "errorMessage" text,
        ${createdAt},
        ${updatedAt}
      )
    `);
    await queryRunner.query(
      createIndexSql('IDX_export_records_ownerUserId_createdAt', 'export_records', [
        'ownerUserId',
        'createdAt',
      ]),
    );

    // ── ai_token_usage_events ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_token_usage_events" (
        ${stableId},
        "ownerUserId" varchar NOT NULL,
        "endpoint" varchar NOT NULL,
        "provider" varchar NOT NULL,
        "model" varchar NOT NULL,
        "inputTokens" integer NOT NULL DEFAULT (0),
        "outputTokens" integer NOT NULL DEFAULT (0),
        "totalTokens" integer NOT NULL DEFAULT (0),
        "cacheHitTokens" integer,
        "cacheMissTokens" integer,
        ${createdAt}
      )
    `);
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

    // ── editor_ai_conversations ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "editor_ai_conversations" (
        ${stableId},
        "ownerUserId" varchar NOT NULL,
        "templateId" varchar NOT NULL,
        "messages" text NOT NULL DEFAULT ('[]'),
        "providerMessages" text NOT NULL DEFAULT ('[]'),
        "providerSession" text,
        ${createdAt},
        ${updatedAt},
        CONSTRAINT "UQ_editor_ai_conversations_ownerUserId_templateId"
          UNIQUE ("ownerUserId", "templateId")
      )
    `);
    await queryRunner.query(
      createIndexSql(
        'IDX_editor_ai_conversations_ownerUserId_updatedAt',
        'editor_ai_conversations',
        ['ownerUserId', 'updatedAt'],
      ),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "editor_ai_conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_token_usage_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "export_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "published_site_revisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "published_sites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "themes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    if (!(await hasColumn(queryRunner, table, column))) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD ${definition}`);
    }
  }
}
