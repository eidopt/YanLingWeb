import type { ServerConfig } from '../config/config.factory';
import { createDatabaseOptions } from './database-options.factory';

function baseConfig(): ServerConfig {
  return {
    ai: {
      provider: 'openai',
      model: 'gpt-5.4',
      models: { pro: 'gpt-5.4' },
    },
    templates: {
      jsonImport: {
        enabled: true,
        deleteAfterImport: true,
      },
    },
    corsOrigins: [],
    database: {
      driver: 'sqlite',
      path: 'data/test.db',
      ssl: false,
      logging: false,
      synchronize: false,
    },
    jwt: {
      secret: 'test-secret',
      expiresIn: '7d',
    },
    serverFlavor: 'test',
    enableAgentEvalEndpoint: false,
    oauth: {
      qq: {},
      wechat: {},
    },
    port: 4000,
  };
}

describe('createDatabaseOptions', () => {
  it('creates PostgreSQL options from DATABASE_URL-style config', () => {
    const options = createDatabaseOptions({
      ...baseConfig(),
      database: {
        ...baseConfig().database,
        driver: 'postgres',
        url: 'postgres://app:secret@db.example.com:5432/yanling',
        ssl: true,
      },
    });

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgres://app:secret@db.example.com:5432/yanling',
      synchronize: false,
      logging: false,
      ssl: { rejectUnauthorized: false },
    });
  });

  it('creates PostgreSQL options from host/user/database fields', () => {
    const options = createDatabaseOptions({
      ...baseConfig(),
      database: {
        ...baseConfig().database,
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5433,
        username: 'yanling',
        password: 'secret',
        name: 'yanling_test',
      },
    });

    expect(options).toMatchObject({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5433,
      username: 'yanling',
      password: 'secret',
      database: 'yanling_test',
    });
  });
});
