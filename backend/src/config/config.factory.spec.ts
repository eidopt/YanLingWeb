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

  it('accepts Electron desktop custom-scheme CORS origins (app://)', () => {
    const config = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'production',
        JWT_SECRET: 'stable-production-secret',
        DB_SYNCHRONIZE: 'false',
        CORS_ORIGINS: 'https://app.example.com,app://',
      },
      [],
    );

    expect(config.corsOrigins).toEqual(['https://app.example.com', 'app://']);
  });

  it('rejects desktop custom-scheme CORS origins that carry a path', () => {
    expect(() =>
      ConfigFactory.build(
        {
          SERVER_FLAVOR: 'production',
          JWT_SECRET: 'stable-production-secret',
          DB_SYNCHRONIZE: 'false',
          CORS_ORIGINS: 'app://host/path',
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

  it('keeps independent image config when main provider is openai-compatible (DeepSeek)', () => {
    const config = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        AI_PROVIDER: 'openai-compatible',
        AI_PRO_MODEL: 'deepseek-flash',
        DEEPSEEK_API_KEY: 'sk-deepseek-chat',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
        AI_IMAGE_MODEL: 'MiniMax-H3-Image-Highspeed',
        AI_IMAGE_GENERATION: 'sk-cp-image-secret',
        AI_IMAGE_BASE_URL: 'https://api.minimax.io/v1',
        OPENAI_API_KEY: '',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      [],
    );

    expect(config.ai.provider).toBe('openaiCompatible');
    expect(config.ai.apiKey).toBe('sk-deepseek-chat');
    expect(config.ai.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(config.ai.imageGenerationEnabled).toBe(true);
    expect(config.ai.models.image).toBe('MiniMax-H3-Image-Highspeed');
    expect(config.ai.image).toEqual({
      model: 'MiniMax-H3-Image-Highspeed',
      apiKey: 'sk-cp-image-secret',
      baseUrl: 'https://api.minimax.io/v1',
    });
  });

  it('supports AI_IMAGE_API_KEY, AI_IMAGE_API_URL, full URLs, and adapter overrides', () => {
    const withExplicitOverride = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        AI_PROVIDER: 'openai-compatible',
        AI_IMAGE_MODEL: 'MiniMax-H3-Image-Highspeed',
        AI_IMAGE_GENERATION: 'sk-from-gen',
        AI_IMAGE_API_KEY: 'sk-from-dedicated',
        AI_IMAGE_API_URL: 'https://api.minimaxi.com/v1/images/generations',
        AI_IMAGE_PROVIDER: 'minimax',
        AI_IMAGE_TIMEOUT_MS: '240000',
        AI_IMAGE_MAX_RETRIES: '0',
        AI_IMAGE_OUTPUT_FORMAT: 'png',
      },
      [],
    );

    expect(withExplicitOverride.ai.image).toEqual({
      provider: 'minimax',
      model: 'MiniMax-H3-Image-Highspeed',
      apiKey: 'sk-from-dedicated',
      baseUrl: 'https://api.minimaxi.com/v1/images/generations',
      timeoutMs: 240000,
      maxRetries: 0,
      outputFormat: 'png',
    });

    const withoutHardcodedUrl = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        AI_PROVIDER: 'openai-compatible',
        AI_IMAGE_MODEL: 'MiniMax-H3-Image-Highspeed',
        AI_IMAGE_GENERATION: 'sk-minimax-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      [],
    );

    expect(withoutHardcodedUrl.ai.image).toEqual({
      model: 'MiniMax-H3-Image-Highspeed',
      apiKey: 'sk-minimax-key',
      baseUrl: 'https://api.openai.com/v1',
    });
  });

  it('treats boolean flags in AI_IMAGE_GENERATION as toggles rather than API keys', () => {
    const disabled = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        AI_IMAGE_MODEL: 'gpt-image-1.5',
        AI_IMAGE_GENERATION: 'off',
      },
      [],
    );

    expect(disabled.ai.imageGenerationEnabled).toBe(false);
    expect(disabled.ai.image.apiKey).toBeUndefined();

    const enabledFlagOnly = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'development-secret',
        AI_IMAGE_MODEL: 'gpt-image-1.5',
        AI_IMAGE_GENERATION: 'true',
        OPENAI_API_KEY: 'sk-openai-fallback',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      [],
    );

    expect(enabledFlagOnly.ai.imageGenerationEnabled).toBe(true);
    expect(enabledFlagOnly.ai.materializeImages).toBe(false);
    expect(enabledFlagOnly.ai.image).toEqual({
      model: 'gpt-image-1.5',
      apiKey: 'sk-openai-fallback',
      baseUrl: 'https://api.openai.com/v1',
    });
  });

  it('defaults AI_MATERIALIZE_IMAGES by flavor and supports AI_IMAGE_PUBLIC_BASE_URL', () => {
    const devDefault = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'dev-secret',
      },
      [],
    );
    expect(devDefault.ai.materializeImages).toBe(false);

    const devEnabled = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'development',
        JWT_SECRET: 'dev-secret',
        AI_MATERIALIZE_IMAGES: 'true',
        AI_IMAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/template-assets/',
      },
      [],
    );
    expect(devEnabled.ai.materializeImages).toBe(true);
    expect(devEnabled.ai.image.publicBaseUrl).toBe('https://cdn.example.com/template-assets/');

    const prodDefault = ConfigFactory.build(
      {
        SERVER_FLAVOR: 'production',
        JWT_SECRET: 'prod-secret',
        DB_SYNCHRONIZE: 'false',
        CORS_ORIGINS: 'https://app.example.com',
      },
      [],
    );
    expect(prodDefault.ai.materializeImages).toBe(true);
  });
});
