import type { QueryRunner } from 'typeorm';
import { DataSource, type MigrationInterface } from 'typeorm';

import { InitialSchema1748166000000 } from './1748166000000-InitialSchema';
import * as existingDbUpgrade from './1748166100000-SchemaUpgradeForExistingDbs';
import { TemplateAgentConfigTables1748166200000 } from './1748166200000-TemplateAgentConfigTables';
// prettier-ignore
import {
  EditorAiConversationUndoStack1748166300000,
} from './1748166300000-EditorAiConversationUndoStack';
// prettier-ignore
import {
  EditorAiConversationCacheContext1748166400000,
} from './1748166400000-EditorAiConversationCacheContext';
// prettier-ignore
import {
  UserTypeAndFreeQuotas1748166500000,
} from './1748166500000-UserTypeAndFreeQuotas';

const SchemaUpgradeForExistingDbs = existingDbUpgrade.SchemaUpgradeForExistingDbs1748166100000;

const MIGRATIONS = [
  InitialSchema1748166000000,
  SchemaUpgradeForExistingDbs,
  TemplateAgentConfigTables1748166200000,
  EditorAiConversationUndoStack1748166300000,
  EditorAiConversationCacheContext1748166400000,
  UserTypeAndFreeQuotas1748166500000,
];

interface SqliteNamedRow {
  name: string;
}

const APPLICATION_TABLES = [
  'users',
  'themes',
  'templates',
  'published_sites',
  'published_site_revisions',
  'export_records',
  'ai_token_usage_events',
  'editor_ai_conversations',
  'template_profile_generated',
  'template_profile_overrides',
  'template_asset_manifests',
  'template_agent_permissions',
  'template_evaluation_specs',
];

const APPLICATION_SCHEMA_CONTRACT: Record<string, readonly string[]> = {
  users: [
    'id',
    'username',
    'email',
    'userType',
    'freeChatUsedCount',
    'freeTemplateGenUsedCount',
    'tokensUsed',
    'tokensBalance',
    'balanceCents',
    'isActive',
    'lastLoginAt',
    'createdAt',
    'updatedAt',
  ],
  themes: [
    'id',
    'name',
    'category',
    'traits',
    'cssVars',
    'componentTemplates',
    'layoutDocument',
    'createdAt',
    'updatedAt',
  ],
  templates: [
    'id',
    'templateId',
    'ownerUserId',
    'sourceTemplateId',
    'isPublic',
    'displayCategory',
    'primaryFunctionalCategory',
    'platformCategories',
    'functionalCategories',
    'cssAnimations',
    'layoutDocument',
    'createdAt',
    'updatedAt',
  ],
  published_sites: [
    'id',
    'ownerUserId',
    'templateId',
    'subdomain',
    'status',
    'activeRevisionId',
    'createdAt',
    'updatedAt',
  ],
  published_site_revisions: [
    'id',
    'siteId',
    'templateId',
    'schemaVersion',
    'runtimeVersion',
    'layoutJson',
    'themeJson',
    'dataJson',
    'manifestJson',
    'createdAt',
  ],
  export_records: [
    'id',
    'ownerUserId',
    'projectName',
    'themeId',
    'status',
    'layoutJson',
    'outputPath',
    'errorMessage',
    'createdAt',
    'updatedAt',
  ],
  ai_token_usage_events: [
    'id',
    'ownerUserId',
    'endpoint',
    'provider',
    'model',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheHitTokens',
    'cacheMissTokens',
    'createdAt',
  ],
  editor_ai_conversations: [
    'id',
    'ownerUserId',
    'templateId',
    'messages',
    'providerMessages',
    'providerSession',
    'undoStack',
    'compactSummary',
    'lastPrefixHash',
    'cacheContext',
    'createdAt',
    'updatedAt',
  ],
  template_profile_generated: [
    'id',
    'templateId',
    'templateVersion',
    'profileVersion',
    'profile',
    'createdAt',
    'updatedAt',
  ],
  template_profile_overrides: [
    'id',
    'templateId',
    'profileVersion',
    'override',
    'createdAt',
    'updatedAt',
  ],
  template_asset_manifests: ['id', 'templateId', 'manifest', 'createdAt', 'updatedAt'],
  template_agent_permissions: ['id', 'templateId', 'permissions', 'createdAt', 'updatedAt'],
  template_evaluation_specs: ['id', 'templateId', 'evaluation', 'createdAt', 'updatedAt'],
};

async function hasTable(dataSource: DataSource, tableName: string): Promise<boolean> {
  const rows = await dataSource.query<SqliteNamedRow[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName],
  );
  return rows.length > 0;
}

async function tableColumns(dataSource: DataSource, tableName: string): Promise<string[]> {
  const rows = await dataSource.query<SqliteNamedRow[]>(`PRAGMA table_info("${tableName}")`);
  return rows.map((row) => row.name);
}

function createCollectingQueryRunner(type: 'postgres' | 'better-sqlite3'): {
  queryRunner: QueryRunner;
  statements: string[];
} {
  const statements: string[] = [];
  const queryRunner = {
    connection: {
      options: { type },
    },
    query: (sql: string) => {
      statements.push(sql);
      return Promise.resolve([]);
    },
  } as QueryRunner;

  return { queryRunner, statements };
}

describe('database migrations', () => {
  let dataSource: DataSource | null = null;

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    dataSource = null;
  });

  it('declares reversible migration contracts', () => {
    for (const Migration of MIGRATIONS) {
      const migration = new Migration() as MigrationInterface;
      expect(migration.name).toEqual(expect.any(String));
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    }
  });

  it('runs the full SQLite migration chain and reverts it cleanly', async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      migrations: MIGRATIONS,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const executed = await dataSource.runMigrations({ transaction: 'none' });

    expect(executed.map((migration) => migration.name)).toEqual([
      'InitialSchema1748166000000',
      'SchemaUpgradeForExistingDbs1748166100000',
      'TemplateAgentConfigTables1748166200000',
      'EditorAiConversationUndoStack1748166300000',
      'EditorAiConversationCacheContext1748166400000',
      'UserTypeAndFreeQuotas1748166500000',
    ]);

    for (const [tableName, expectedColumns] of Object.entries(APPLICATION_SCHEMA_CONTRACT)) {
      await expect(hasTable(dataSource, tableName)).resolves.toBe(true);
      await expect(tableColumns(dataSource, tableName)).resolves.toEqual(
        expect.arrayContaining(expectedColumns),
      );
    }

    for (const _migration of executed) {
      await dataSource.undoLastMigration({ transaction: 'none' });
    }

    for (const tableName of APPLICATION_TABLES) {
      await expect(hasTable(dataSource, tableName)).resolves.toBe(false);
    }
  });

  it('generates PostgreSQL-compatible migration SQL', async () => {
    const { queryRunner, statements } = createCollectingQueryRunner('postgres');

    for (const Migration of MIGRATIONS) {
      const migration = new Migration() as MigrationInterface;
      await migration.up(queryRunner);
    }

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    expect(sql).toContain('gen_random_uuid()');
    expect(sql).toContain('timestamp with time zone');
    expect(sql).toContain('"functionalCategories"::jsonb ->> 0');
    expect(sql).not.toMatch(/randomblob|datetime\('now'\)|PRAGMA|json_extract/);
  });
});
