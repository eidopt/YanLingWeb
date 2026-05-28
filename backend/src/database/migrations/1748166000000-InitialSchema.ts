import { MigrationInterface, QueryRunner } from 'typeorm';

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
    // ── users ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
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
        "isActive" boolean NOT NULL DEFAULT (1),
        "lastLoginAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
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
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "tagline" varchar NOT NULL DEFAULT (''),
        "description" varchar NOT NULL DEFAULT (''),
        "accent" varchar NOT NULL DEFAULT ('#000000'),
        "category" varchar NOT NULL DEFAULT ('general'),
        "traits" text NOT NULL DEFAULT ('[]'),
        "cssVars" text NOT NULL DEFAULT ('{}'),
        "componentTemplates" text NOT NULL DEFAULT ('{}'),
        "layoutDocument" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_themes_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_themes_category" ON "themes" ("category")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_themes_createdAt" ON "themes" ("createdAt")`);

    // ── templates ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "templates" (
        "id" varchar PRIMARY KEY NOT NULL,
        "templateId" varchar NOT NULL,
        "ownerUserId" varchar,
        "sourceTemplateId" varchar,
        "isPublic" boolean NOT NULL DEFAULT (1),
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
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
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
      `"isPublic" boolean NOT NULL DEFAULT (1)`,
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
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_ownerUserId_updatedAt" ON "templates" ("ownerUserId", "updatedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_ownerUserId_isPublic" ON "templates" ("ownerUserId", "isPublic")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_sourceTemplateId" ON "templates" ("sourceTemplateId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_category" ON "templates" ("category")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_displayCategory" ON "templates" ("displayCategory")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_primaryFunctionalCategory" ON "templates" ("primaryFunctionalCategory")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_isPublic_displayCategory" ON "templates" ("isPublic", "displayCategory")`);

    // ── published_sites ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "published_sites" (
        "id" varchar PRIMARY KEY NOT NULL,
        "ownerUserId" varchar NOT NULL,
        "templateId" varchar NOT NULL,
        "subdomain" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT ('active'),
        "activeRevisionId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_published_sites_subdomain" ON "published_sites" ("subdomain")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_published_sites_ownerUserId_updatedAt" ON "published_sites" ("ownerUserId", "updatedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_published_sites_templateId" ON "published_sites" ("templateId")`);

    // ── published_site_revisions ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "published_site_revisions" (
        "id" varchar PRIMARY KEY NOT NULL,
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
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_published_site_revisions_siteId_createdAt" ON "published_site_revisions" ("siteId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_published_site_revisions_templateId" ON "published_site_revisions" ("templateId")`);

    // ── export_records ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "export_records" (
        "id" varchar PRIMARY KEY NOT NULL,
        "ownerUserId" varchar,
        "projectName" varchar NOT NULL,
        "themeId" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT ('idle'),
        "layoutJson" text NOT NULL DEFAULT ('{}'),
        "outputPath" varchar,
        "errorMessage" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_export_records_ownerUserId_createdAt" ON "export_records" ("ownerUserId", "createdAt")`);

    // ── ai_token_usage_events ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_token_usage_events" (
        "id" varchar PRIMARY KEY NOT NULL,
        "ownerUserId" varchar NOT NULL,
        "endpoint" varchar NOT NULL,
        "provider" varchar NOT NULL,
        "model" varchar NOT NULL,
        "inputTokens" integer NOT NULL DEFAULT (0),
        "outputTokens" integer NOT NULL DEFAULT (0),
        "totalTokens" integer NOT NULL DEFAULT (0),
        "cacheHitTokens" integer,
        "cacheMissTokens" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_token_usage_events_ownerUserId_createdAt" ON "ai_token_usage_events" ("ownerUserId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_token_usage_events_provider_model" ON "ai_token_usage_events" ("provider", "model")`);

    // ── editor_ai_conversations ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "editor_ai_conversations" (
        "id" varchar PRIMARY KEY NOT NULL,
        "ownerUserId" varchar NOT NULL,
        "templateId" varchar NOT NULL,
        "messages" text NOT NULL DEFAULT ('[]'),
        "providerMessages" text NOT NULL DEFAULT ('[]'),
        "providerSession" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_editor_ai_conversations_ownerUserId_templateId" UNIQUE ("ownerUserId", "templateId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_editor_ai_conversations_ownerUserId_updatedAt" ON "editor_ai_conversations" ("ownerUserId", "updatedAt")`);
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
    const rows: { name: string; }[] = await queryRunner.query(
      `PRAGMA table_info('${table}')`,
    );
    if (!rows.some((row) => row.name === column)) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD ${definition}`);
    }
  }
}
