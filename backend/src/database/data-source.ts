/**
 * TypeORM DataSource configuration for CLI migrations.
 *
 * This file mirrors the env-loading logic from ConfigFactory so that
 * migration commands see the same database config as the running app.
 *
 * Usage (always pass --flavor to select the target environment):
 *   npx ts-node -r tsconfig-paths/register \
 *     ./node_modules/typeorm/cli.js migration:generate \
 *     -d src/database/data-source.ts src/database/migrations/MigrationName \
 *     -- --flavor=prod
 *
 *   pnpm migration:run:prod      # convenience script (see package.json)
 *   pnpm migration:generate:prod -- src/database/migrations/Name
 *   pnpm migration:revert:prod
 *
 * This file is NOT used at runtime — the NestJS app uses database.module.ts instead.
 */

import * as path from 'node:path';

import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

// ── CLI --flavor parsing (mirrors ConfigFactory.readCliServerFlavor) ──

function readCliFlavor(): string | undefined {
  const argv = process.argv.slice(2);
  const flags = ['--flavor', '--env', '--server-flavor'];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const inline = flags.find((f) => arg.startsWith(`${f}=`));
    if (inline) {
      return arg.slice(inline.length + 1);
    }
    if (flags.includes(arg)) {
      return argv[i + 1];
    }
  }
  return undefined;
}

function normalizeFlavor(raw: string | undefined): 'development' | 'production' | 'test' {
  const v = raw?.trim().toLowerCase();
  if (v === 'prod' || v === 'production') {
    return 'production';
  }
  if (v === 'test') {
    return 'test';
  }
  return 'development';
}

// ── Resolve flavor BEFORE loading any env files ──

const flavor = normalizeFlavor(
  readCliFlavor() ?? process.env.SERVER_FLAVOR ?? process.env.NODE_ENV,
);

// Set these so downstream code (and dotenv's override behavior) is consistent.
process.env.SERVER_FLAVOR = flavor;
process.env.NODE_ENV = flavor;

// ── Load env files: flavor-specific FIRST, .env as fallback ──
// dotenv.config does NOT overwrite already-set vars by default,
// so loading order determines precedence:
//   1. Flavor-specific files (highest priority)
//   2. .env (lowest priority, only fills in missing vars)

const backendRoot = path.resolve(__dirname, '..', '..');

const flavorAliases =
  flavor === 'production'
    ? ['prod', 'production']
    : flavor === 'test'
      ? ['test']
      : ['dev', 'development'];

// Load flavor-specific files first (e.g. .env.prod.local, .env.prod)
for (const alias of flavorAliases) {
  for (const suffix of [`.${alias}.local`, `.${alias}`]) {
    config({ path: path.join(backendRoot, `.env${suffix}`) });
  }
}
// Then load .env as fallback (won't overwrite vars already set above)
config({ path: path.join(backendRoot, '.env') });

// ── Scoped env var reading (mirrors ConfigFactory.read) ──

function scopePrefix(): 'DEV' | 'PROD' | 'TEST' {
  if (flavor === 'production') {
    return 'PROD';
  }
  if (flavor === 'test') {
    return 'TEST';
  }
  return 'DEV';
}

function readEnv(name: string): string | undefined {
  // Try scoped var first (e.g. PROD_DATABASE_DRIVER)
  const scoped = process.env[`${scopePrefix()}_${name}`]?.trim();
  if (scoped) {
    return scoped;
  }
  // Fall back to generic var (e.g. DATABASE_DRIVER)
  const generic = process.env[name]?.trim();
  if (generic) {
    return generic;
  }
  return undefined;
}

// ── Resolve database config ──

const driver = readEnv('DATABASE_DRIVER') ?? readEnv('DB_DRIVER') ?? 'sqlite';

const dbPath = readEnv('DB_PATH') ?? readEnv('DEFAULT_DB_PATH') ?? 'data/app.db';

const databaseUrl = readEnv('DATABASE_URL') ?? readEnv('DB_URL');
const dbHost = readEnv('DB_HOST');
const dbPort = readOptionalIntegerEnv('DB_PORT');
const dbUsername = readEnv('DB_USERNAME') ?? readEnv('DB_USER');
const dbPassword = readEnv('DB_PASSWORD');
const dbName = readEnv('DB_NAME') ?? readEnv('DATABASE_NAME');
const dbSsl = readBooleanEnv('DB_SSL') ?? false;

// ── Entity imports (must match database-options.factory.ts) ──

import { AiTokenUsageEvent } from '../ai/entities/ai-token-usage.entity';
import { EditorAiConversation } from '../ai/entities/editor-ai-conversation.entity';
import { ExportRecord } from '../exports/entities/export-record.entity';
import { PublishedSite } from '../sites/entities/published-site.entity';
import { PublishedSiteRevision } from '../sites/entities/published-site-revision.entity';
import { Template } from '../templates/entities/template.entity';
import { TemplateAgentPermissions } from '../templates/entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from '../templates/entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from '../templates/entities/template-evaluation-spec.entity';
import { TemplateProfileGenerated } from '../templates/entities/template-profile-generated.entity';
// eslint-disable-next-line max-len
import { TemplateProfileOverrideEntity } from '../templates/entities/template-profile-override.entity';
import { Theme } from '../themes/entities/theme.entity';
import { User } from '../users/entities/user.entity';

const ALL_ENTITIES = [
  Theme,
  Template,
  PublishedSite,
  PublishedSiteRevision,
  ExportRecord,
  User,
  TemplateProfileGenerated,
  TemplateProfileOverrideEntity,
  TemplateAssetManifest,
  TemplateAgentPermissions,
  TemplateEvaluationSpec,
  EditorAiConversation,
  AiTokenUsageEvent,
];

// ── Build DataSource ──

function buildOptions(): DataSourceOptions {
  if (driver === 'sqlite') {
    return {
      type: 'better-sqlite3',
      database: path.resolve(backendRoot, dbPath),
      entities: ALL_ENTITIES,
      migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
      prepareDatabase: (db: unknown) => {
        (db as { pragma: (sql: string) => void }).pragma('journal_mode = WAL');
        (db as { pragma: (sql: string) => void }).pragma('foreign_keys = ON');
      },
    };
  }

  if (driver === 'postgres') {
    const common = {
      type: 'postgres' as const,
      entities: ALL_ENTITIES,
      migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
      ...(dbSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };

    if (databaseUrl) {
      return {
        ...common,
        url: databaseUrl,
      };
    }

    if (!dbHost || !dbName || !dbUsername) {
      throw new Error(
        'PostgreSQL migration DataSource requires DATABASE_URL or ' +
          'DB_HOST + DB_NAME + DB_USERNAME/DB_USER.',
      );
    }

    return {
      ...common,
      host: dbHost,
      port: dbPort ?? 5432,
      username: dbUsername,
      password: dbPassword,
      database: dbName,
    };
  }

  throw new Error(`Unsupported database driver: ${driver}`);
}

export const AppDataSource = new DataSource(buildOptions());

function readBooleanEnv(name: string): boolean | undefined {
  const value = readEnv(name);
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable ${name}: ${value}`);
}

function readOptionalIntegerEnv(name: string): number | undefined {
  const value = readEnv(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer environment variable ${name}: ${value}`);
  }
  return parsed;
}
