import { ConfigFactory, ConfigValidationError } from './config.factory';

describe('ConfigFactory validation', () => {
  it('accepts explicit production-safe configuration', () => {
    const config = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'production',
        JWT_SECRET: 'stable-production-secret',
        DB_SYNCHRONIZE: 'false',
        CORS_ORIGINS: 'https://app.example.com',
        PORT: '8080',
      },
      [],
    );

    expect(config.serverFlavor).toBe('production');
    expect(config.database.synchronize).toBe(false);
    expect(config.corsOrigins).toEqual(['https://app.example.com']);
    expect(config.port).toBe(8080);
  });

  it('accepts PostgreSQL database configuration by URL or host fields', () => {
    const byUrl = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'production',
        JWT_SECRET: 'stable-production-secret',
        DB_SYNCHRONIZE: 'false',
        CORS_ORIGINS: 'https://app.example.com',
        DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://app:secret@db.example.com:5432/yanling',
        DB_SSL: 'true',
      },
      [],
    );

    expect(byUrl.database.driver).toBe('postgres');
    expect(byUrl.database.url).toBe('postgres://app:secret@db.example.com:5432/yanling');
    expect(byUrl.database.ssl).toBe(true);

    const byFields = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        DATABASE_DRIVER: 'postgres',
        DB_HOST: '127.0.0.1',
        DB_PORT: '5433',
        DB_NAME: 'yanling_dev',
        DB_USER: 'yanling',
        DB_PASSWORD: 'secret',
      },
      [],
    );

    expect(byFields.database.driver).toBe('postgres');
    expect(byFields.database.host).toBe('127.0.0.1');
    expect(byFields.database.port).toBe(5433);
    expect(byFields.database.name).toBe('yanling_dev');
    expect(byFields.database.username).toBe('yanling');
  });

  it('rejects production synchronize and missing explicit CORS origins', () => {
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'true',
        },
        [],
      ),
    ).toThrow(ConfigValidationError);

    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'true',
        },
        [],
      ),
    ).toThrow(/DB_SYNCHRONIZE must be false/);
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'true',
        },
        [],
      ),
    ).toThrow(/CORS_ORIGINS must list/);
  });

  it('rejects wildcard or path-bearing CORS origins', () => {
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'false',
          CORS_ORIGINS: '*,https://app.example.com/path',
        },
        [],
      ),
    ).toThrow(/wildcard/);

    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'false',
          CORS_ORIGINS: '*,https://app.example.com/path',
        },
        [],
      ),
    ).toThrow(/without a path/);
  });

  it('rejects incomplete or unsupported database driver configuration', () => {
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'development',
          JWT_SECRET: 'development-secret',
          DATABASE_DRIVER: 'postgres',
        },
        [],
      ),
    ).toThrow(ConfigValidationError);

    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'development',
          JWT_SECRET: 'development-secret',
          DATABASE_DRIVER: 'postgres',
        },
        [],
      ),
    ).toThrow(/DB_HOST is required/);

    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'development',
          JWT_SECRET: 'development-secret',
          DATABASE_DRIVER: 'mysql',
        },
        [],
      ),
    ).toThrow(/Unsupported database driver: mysql/);
  });

  it('rejects invalid ports and incomplete OAuth provider config', () => {
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'development',
          JWT_SECRET: 'development-secret',
          PORT: 'not-a-number',
        },
        [],
      ),
    ).toThrow(/Invalid number environment variable PORT/);

    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'development',
          JWT_SECRET: 'development-secret',
          WECHAT_APP_ID: 'wechat-app',
        },
        [],
      ),
    ).toThrow(/WECHAT OAuth config must set/);
  });
});
