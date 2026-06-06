import type { QueryRunner } from 'typeorm';

export type MigrationDialect = 'sqlite' | 'postgres';

const SQLITE_UUID_DEFAULT = [
  'lower(hex(randomblob(4)))',
  "'-'",
  'lower(hex(randomblob(2)))',
  "'-4'",
  'substr(lower(hex(randomblob(2))),2)',
  "'-'",
  "substr('89ab',abs(random())%4+1,1)",
  'substr(lower(hex(randomblob(2))),2)',
  "'-'",
  'lower(hex(randomblob(6)))',
].join(' || ');

export function getMigrationDialect(queryRunner: QueryRunner): MigrationDialect {
  const type = queryRunner.connection.options.type;
  if (type === 'postgres') {
    return 'postgres';
  }
  if (type === 'better-sqlite3' || type === 'sqlite') {
    return 'sqlite';
  }
  throw new Error(`Unsupported migration database type: ${type}`);
}

export async function ensurePostgresUuidSupport(
  queryRunner: QueryRunner,
  dialect: MigrationDialect,
): Promise<void> {
  if (dialect === 'postgres') {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }
}

export function uuidPrimaryKey(dialect: MigrationDialect): string {
  if (dialect === 'postgres') {
    return '"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()';
  }
  return `"id" varchar PRIMARY KEY NOT NULL DEFAULT (${SQLITE_UUID_DEFAULT})`;
}

export function varcharPrimaryKey(): string {
  return '"id" varchar PRIMARY KEY NOT NULL';
}

export function timestampColumn(
  dialect: MigrationDialect,
  name: string,
  options: { nullable?: boolean; defaultNow?: boolean } = {},
): string {
  const nullable = options.nullable ?? false;
  const defaultNow = options.defaultNow ?? true;
  const nullSql = nullable ? '' : ' NOT NULL';
  if (dialect === 'postgres') {
    const defaultSql = defaultNow ? ' DEFAULT now()' : '';
    return `"${name}" timestamp with time zone${nullSql}${defaultSql}`;
  }
  const defaultSql = defaultNow ? " DEFAULT (datetime('now'))" : '';
  return `"${name}" datetime${nullSql}${defaultSql}`;
}

export function booleanDefault(dialect: MigrationDialect, value: boolean): string {
  if (dialect === 'postgres') {
    return value ? 'true' : 'false';
  }
  return value ? '1' : '0';
}

export function createIndexSql(
  indexName: string,
  tableName: string,
  columns: string[],
  options: { unique?: boolean } = {},
): string {
  const uniqueSql = options.unique ? 'UNIQUE ' : '';
  const columnSql = columns.map((column) => `"${column}"`).join(', ');
  return (
    `CREATE ${uniqueSql}INDEX IF NOT EXISTS "${indexName}" ` + `ON "${tableName}" (${columnSql})`
  );
}

export async function hasColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  const dialect = getMigrationDialect(queryRunner);
  if (dialect === 'postgres') {
    const rows = (await queryRunner.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      `,
      [table, column],
    )) as { column_name: string }[];
    return rows.length > 0;
  }

  const rows = (await queryRunner.query(`PRAGMA table_info('${table.replace(/'/g, "''")}')`)) as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}
