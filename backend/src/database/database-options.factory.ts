import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/ai-token-usage.entity';
import { EditorAiConversation } from '../ai/entities/editor-ai-conversation.entity';
import type { ServerConfig } from '../config/config.factory';
import { ExportRecord } from '../exports/entities/export-record.entity';
import { PublishedSite } from '../sites/entities/published-site.entity';
import { PublishedSiteRevision } from '../sites/entities/published-site-revision.entity';
import { TemplateAgentPermissions } from '../templates/entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from '../templates/entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from '../templates/entities/template-evaluation-spec.entity';
import { Template } from '../templates/entities/template.entity';
import { TemplateProfileGenerated } from '../templates/entities/template-profile-generated.entity';
import { TemplateProfileOverrideEntity } from '../templates/entities/template-profile-override.entity';
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
  EditorAiConversation,
  AiTokenUsageEvent,
];

export function createDatabaseOptions(env: ServerConfig): TypeOrmModuleOptions {
  switch (env.database.driver) {
    case 'sqlite':
      return createSqliteOptions(env);
    case 'postgres':
    case 'mysql':
      throw new Error(
        `Database driver "${env.database.driver}" is configured but not implemented yet.`,
      );
  }
}

function createSqliteOptions(env: ServerConfig): TypeOrmModuleOptions {
  const databasePath = env.database.path || 'data/app.db';

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
      (db as { pragma: (sql: string) => void; }).pragma('journal_mode = WAL');
      // Enable foreign key enforcement (SQLite has it off by default).
      (db as { pragma: (sql: string) => void; }).pragma('foreign_keys = ON');
    },
  };
}
