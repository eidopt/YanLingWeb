import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/aiTokenUsage.entity';
import { EditorAiConversation } from '../ai/entities/editorAiConversation.entity';
import type { ServerConfig } from '../config/config.factory';
import { ExportRecord } from '../exports/entities/exportRecord.entity';
import { PublishedSite } from '../sites/entities/publishedSite.entity';
import { PublishedSiteRevision } from '../sites/entities/publishedSiteRevision.entity';
import { AssetLibraryImage } from '../templates/entities/assetLibraryImage.entity';
import { Template } from '../templates/entities/template.entity';
import { TemplateAgentPermissions } from '../templates/entities/templateAgentPermissions.entity';
import { TemplateAssetManifest } from '../templates/entities/templateAssetManifest.entity';
import { TemplateEvaluationSpec } from '../templates/entities/templateEvaluationSpec.entity';
import { TemplateProfileGenerated } from '../templates/entities/templateProfileGenerated.entity';
// prettier-ignore
import {
  TemplateProfileOverrideEntity,
} from '../templates/entities/templateProfileOverride.entity';
import { Theme } from '../themes/entities/theme.entity';
import { User } from '../users/entities/user.entity';

const DATABASE_ENTITIES = [
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
  AssetLibraryImage,
  EditorAiConversation,
  AiTokenUsageEvent,
];

export function createDatabaseOptions(env: ServerConfig): TypeOrmModuleOptions {
  switch (env.database.driver) {
    case 'sqlite':
      return createSqliteOptions(env);
    case 'postgres':
      return createPostgresOptions(env);
  }
}

function createSqliteOptions(env: ServerConfig): TypeOrmModuleOptions {
  const databasePath = env.database.path ?? 'data/app.db';

  return {
    type: 'better-sqlite3',
    database: databasePath,
    entities: DATABASE_ENTITIES,
    synchronize: env.database.synchronize,
    logging: env.database.logging,
    prepareDatabase: (db: unknown) => {
      // Enable WAL mode for better read/write concurrency.
      // WAL allows concurrent readers while a write is in progress,
      // which is a significant improvement over the default DELETE journal
      // for a NestJS server handling concurrent requests.
      (db as { pragma: (sql: string) => void }).pragma('journal_mode = WAL');
      // Enable foreign key enforcement (SQLite has it off by default).
      (db as { pragma: (sql: string) => void }).pragma('foreign_keys = ON');
    },
  };
}

function createPostgresOptions(env: ServerConfig): TypeOrmModuleOptions {
  const common = {
    type: 'postgres' as const,
    entities: DATABASE_ENTITIES,
    synchronize: env.database.synchronize,
    logging: env.database.logging,
    ...(env.database.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  if (env.database.url) {
    return {
      ...common,
      url: env.database.url,
    };
  }

  return {
    ...common,
    host: env.database.host,
    port: env.database.port ?? 5432,
    username: env.database.username,
    password: env.database.password,
    database: env.database.name,
  };
}
