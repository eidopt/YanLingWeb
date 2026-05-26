import { MigrationInterface, QueryRunner } from 'typeorm';

export class TemplateAgentConfigTables1748166200000 implements MigrationInterface {
  name = 'TemplateAgentConfigTables1748166200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_profile_generated" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "templateId" varchar NOT NULL,
        "templateVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "profileVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "profile" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_profile_generated_templateId"
      ON "template_profile_generated" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_profile_overrides" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "templateId" varchar NOT NULL,
        "profileVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "override" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_profile_overrides_templateId"
      ON "template_profile_overrides" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_asset_manifests" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "templateId" varchar NOT NULL,
        "manifest" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_asset_manifests_templateId"
      ON "template_asset_manifests" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_agent_permissions" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "templateId" varchar NOT NULL,
        "permissions" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_agent_permissions_templateId"
      ON "template_agent_permissions" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_evaluation_specs" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random())%4+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "templateId" varchar NOT NULL,
        "evaluation" text NOT NULL DEFAULT ('{}'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_evaluation_specs_templateId"
      ON "template_evaluation_specs" ("templateId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "template_evaluation_specs"');
    await queryRunner.query('DROP TABLE IF EXISTS "template_agent_permissions"');
    await queryRunner.query('DROP TABLE IF EXISTS "template_asset_manifests"');
    await queryRunner.query('DROP TABLE IF EXISTS "template_profile_overrides"');
    await queryRunner.query('DROP TABLE IF EXISTS "template_profile_generated"');
  }
}
