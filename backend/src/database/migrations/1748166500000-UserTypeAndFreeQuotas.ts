import { MigrationInterface, QueryRunner } from 'typeorm';

import { hasColumn } from '../migrationSql';

/**
 * Adds user tier and free quota counters to `users`:
 *  - `userType` ('normal' | 'pro', default 'normal')
 *  - `freeChatUsedCount` (integer, default 0)
 *  - `freeTemplateGenUsedCount` (integer, default 0)
 */
export class UserTypeAndFreeQuotas1748166500000 implements MigrationInterface {
  name = 'UserTypeAndFreeQuotas1748166500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasColumn(queryRunner, 'users', 'userType'))) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "userType" varchar NOT NULL DEFAULT ('normal')`,
      );
    }
    if (!(await hasColumn(queryRunner, 'users', 'freeChatUsedCount'))) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "freeChatUsedCount" integer NOT NULL DEFAULT (0)`,
      );
    }
    if (!(await hasColumn(queryRunner, 'users', 'freeTemplateGenUsedCount'))) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "freeTemplateGenUsedCount" integer NOT NULL DEFAULT (0)`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite 不支持 DROP COLUMN; 与同系列迁移保持一致, down() 为 no-op.
  }
}
