import { MigrationInterface, QueryRunner } from 'typeorm';

import { hasColumn } from '../migrationSql';

export class TokenVersion1748166700000 implements MigrationInterface {
  name = 'TokenVersion1748166700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasColumn(queryRunner, 'users', 'tokenVersion'))) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "tokenVersion" integer NOT NULL DEFAULT (0)`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite cannot drop the column. The initial schema migration drops users on full revert.
  }
}
