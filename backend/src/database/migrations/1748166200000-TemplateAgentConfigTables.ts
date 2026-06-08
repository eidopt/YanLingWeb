import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  ensurePostgresUuidSupport,
  getMigrationDialect,
  timestampColumn,
  uuidPrimaryKey,
} from '../migrationSql';

export class TemplateAgentConfigTables1748166200000 implements MigrationInterface {
  name = 'TemplateAgentConfigTables1748166200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = getMigrationDialect(queryRunner);
    await ensurePostgresUuidSupport(queryRunner, dialect);
    const generatedId = uuidPrimaryKey(dialect);
    const createdAt = timestampColumn(dialect, 'createdAt');
    const updatedAt = timestampColumn(dialect, 'updatedAt');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_profile_generated" (
        ${generatedId},
        "templateId" varchar NOT NULL,
        "templateVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "profileVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "profile" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_profile_generated_templateId"
      ON "template_profile_generated" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_profile_overrides" (
        ${generatedId},
        "templateId" varchar NOT NULL,
        "profileVersion" varchar NOT NULL DEFAULT ('1.0.0'),
        "override" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_profile_overrides_templateId"
      ON "template_profile_overrides" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_asset_manifests" (
        ${generatedId},
        "templateId" varchar NOT NULL,
        "manifest" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_asset_manifests_templateId"
      ON "template_asset_manifests" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_agent_permissions" (
        ${generatedId},
        "templateId" varchar NOT NULL,
        "permissions" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_agent_permissions_templateId"
      ON "template_agent_permissions" ("templateId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_evaluation_specs" (
        ${generatedId},
        "templateId" varchar NOT NULL,
        "evaluation" text NOT NULL DEFAULT ('{}'),
        ${createdAt},
        ${updatedAt}
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
