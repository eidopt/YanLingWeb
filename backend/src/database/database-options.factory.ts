import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/ai-token-usage.entity';
import { EditorAiConversation } from '../ai/entities/editor-ai-conversation.entity';
import type { ServerConfig } from '../config/config.factory';
import { ExportRecord } from '../exports/entities/export-record.entity';
import { PublishedSite } from '../sites/entities/published-site.entity';
import { PublishedSiteRevision } from '../sites/entities/published-site-revision.entity';
import { Template } from '../templates/entities/template.entity';
import { Theme } from '../themes/entities/theme.entity';
import { User } from '../users/entities/user.entity';

const DATABASE_ENTITIES = [
  Theme,
  Template,
  PublishedSite,
  PublishedSiteRevision,
  ExportRecord,
  User,
  EditorAiConversation,
  AiTokenUsageEvent,
];

export function createDatabaseOptions(env: ServerConfig): TypeOrmModuleOptions {
  switch (env.database.driver) {
    case 'sqljs':
      return createSqlJsOptions(env);
    case 'sqlite':
    case 'postgres':
    case 'mysql':
      throw new Error(
        `Database driver "${env.database.driver}" is configured but not implemented yet.`,
      );
  }
}

function createSqlJsOptions(env: ServerConfig): TypeOrmModuleOptions {
  if (!env.database.path) {
    throw new Error('DATABASE_DRIVER=sqljs requires DB_PATH or DEFAULT_DB_PATH');
  }

  return {
    type: 'sqljs',
    location: env.database.path,
    autoSave: true,
    useLocalForage: false,
    entities: DATABASE_ENTITIES,
    synchronize: env.database.synchronize,
    logging: env.database.logging,
  };
}
