import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  booleanDefault,
  createIndexSql,
  ensurePostgresUuidSupport,
  getMigrationDialect,
  hasColumn,
  timestampColumn,
  uuidPrimaryKey,
} from '../migrationSql';

/**
 * Production asset-library table, admin/password-seal columns, missing template
 * indexes, and a one-time 1_000_000 token gift for accounts still at the old
 * zero default. Accounts that already hold a balance are left unchanged.
 */
export class AssetLibraryAndTokenGift1748166600000 implements MigrationInterface {
  name = 'AssetLibraryAndTokenGift1748166600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = getMigrationDialect(queryRunner);
    await ensurePostgresUuidSupport(queryRunner, dialect);
    const generatedId = uuidPrimaryKey(dialect);
    const createdAt = timestampColumn(dialect, 'createdAt');
    const updatedAt = timestampColumn(dialect, 'updatedAt');
    const adminDefault = booleanDefault(dialect, false);

    if (!(await hasColumn(queryRunner, 'users', 'passwordSeal'))) {
      await queryRunner.query(`ALTER TABLE "users" ADD "passwordSeal" varchar`);
    }
    if (!(await hasColumn(queryRunner, 'users', 'isAdmin'))) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "isAdmin" boolean NOT NULL DEFAULT (${adminDefault})`,
      );
    }

    await queryRunner.query(
      `UPDATE "users" SET "tokensBalance" = 1000000 WHERE "tokensBalance" = 0`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "asset_library_images" (
        ${generatedId},
        "slug" varchar NOT NULL,
        "category" varchar NOT NULL,
        "keywords" text NOT NULL DEFAULT ('[]'),
        "role" varchar NOT NULL,
        "prompt" text NOT NULL DEFAULT (''),
        "alt" text NOT NULL DEFAULT (''),
        "url" varchar NOT NULL,
        "storageKey" varchar NOT NULL,
        "embedding" text,
        ${createdAt},
        ${updatedAt},
        CONSTRAINT "UQ_asset_library_images_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(
      createIndexSql('IDX_asset_library_images_storageKey', 'asset_library_images', ['storageKey']),
    );
    await queryRunner.query(
      createIndexSql('IDX_asset_library_images_category', 'asset_library_images', ['category']),
    );
    await queryRunner.query(
      createIndexSql('IDX_asset_library_images_role', 'asset_library_images', ['role']),
    );

    await queryRunner.query(
      createIndexSql('IDX_templates_isPublic_category', 'templates', ['isPublic', 'category']),
    );
    await queryRunner.query(
      createIndexSql('IDX_templates_isPublic_primaryFunctionalCategory', 'templates', [
        'isPublic',
        'primaryFunctionalCategory',
      ]),
    );
    await queryRunner.query(createIndexSql('IDX_templates_name', 'templates', ['name']));
    await queryRunner.query(createIndexSql('IDX_templates_tagline', 'templates', ['tagline']));
    if (!(await hasColumn(queryRunner, 'templates', 'searchText'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD "searchText" varchar NOT NULL DEFAULT ('')`,
      );
    }
    await queryRunner.query(
      createIndexSql('IDX_templates_searchText', 'templates', ['searchText']),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "asset_library_images"`);
  }
}
