export type ServerFlavors = 'development' | 'production' | 'test';
export type BackendDatabaseDriver = 'sqlite' | 'postgres';

export interface BackendOAuthProviderConfig {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
}

export interface ServerConfig {
  ai: {
    provider: 'openai' | 'openai-compatible';
    model: string;
    models: {
      pro: string;
      lite?: string;
      image?: string;
    };
    apiKey?: string;
    baseUrl?: string;
  };
  templates: {
    jsonImport: {
      enabled: boolean;
      directory?: string;
      deleteAfterImport: boolean;
    };
  };
  corsOrigins: string[];
  database: {
    driver: BackendDatabaseDriver;
    path?: string;
    url?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    name?: string;
    ssl: boolean;
    logging: boolean;
    synchronize: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  serverFlavor: ServerFlavors;
  enableAgentEvalEndpoint: boolean;
  oauth: {
    qq: BackendOAuthProviderConfig;
    wechat: BackendOAuthProviderConfig;
  };
  port: number;
}

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid backend configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigValidationError';
  }
}

type EnvSource = NodeJS.ProcessEnv;
type CliArgs = readonly string[];

const DEV_JWT_SECRET_FALLBACK = 'dev-insecure-stable-jwt-secret-change-me';
const TEST_JWT_SECRET_FALLBACK = 'test-insecure-stable-jwt-secret-change-me';
const DEFAULT_JWT_EXPIRES_IN = '7d';
const DEFAULT_PORT = 4000;
const SERVER_FLAVOR_ENV_NAME = 'SERVER_FLAVOR';

export class ConfigFactory {
  private static readonly warnedJwtSecretFallbacks = new Set<ServerFlavors>();

  static applyStartupFlavor(
    source: EnvSource = process.env,
    argv: CliArgs = process.argv.slice(2),
  ): ServerFlavors {
    const serverFlavor = this.resolveServerFlavor(source, argv);
    source[SERVER_FLAVOR_ENV_NAME] = serverFlavor;
    source.NODE_ENV = serverFlavor;
    return serverFlavor;
  }

  static build(
    source: EnvSource = process.env,
    argv: CliArgs = process.argv.slice(2),
  ): ServerConfig {
    const serverFlavor = this.resolveServerFlavor(source, argv);

    // Build provider-specific env var mapping
    const VAR_PREFIX: Record<string, string> = {
      openai: 'OPENAI',
      'openai-compatible': 'DEEPSEEK',
    };
    const configuredProvider = this.read(source, serverFlavor, 'AI_PROVIDER');
    const aiProvider = configuredProvider === 'openai-compatible' ? 'openai-compatible' : 'openai';
    const prefix = VAR_PREFIX[aiProvider];

    const defaultModel = aiProvider === 'openai-compatible' ? 'deepseek-chat' : 'gpt-5.4';
    const aiProModel =
      this.read(source, serverFlavor, 'AI_PRO_MODEL') ??
      this.read(source, serverFlavor, 'AI_MODEL') ??
      defaultModel;
    const aiLiteModel = this.read(source, serverFlavor, 'AI_LITE_MODEL');
    const aiImageModel = this.read(source, serverFlavor, 'AI_IMAGE_MODEL');
    const databaseDriver = this.readDatabaseDriver(source, serverFlavor);

    const config: ServerConfig = {
      ai: {
        provider: aiProvider,
        model: aiProModel,
        models: {
          pro: aiProModel,
          ...(aiLiteModel ? { lite: aiLiteModel } : {}),
          ...(aiImageModel ? { image: aiImageModel } : {}),
        },
        // Try provider-specific vars (e.g. OPENAI_API_KEY), fall back to generic AI_*
        apiKey:
          this.read(source, serverFlavor, `${prefix}_API_KEY`) ??
          this.read(source, serverFlavor, 'AI_API_KEY'),
        baseUrl:
          this.read(source, serverFlavor, `${prefix}_BASE_URL`) ??
          this.read(source, serverFlavor, 'AI_BASE_URL'),
      },
      templates: {
        jsonImport: {
          enabled: this.readBoolean(source, serverFlavor, 'TEMPLATE_JSON_IMPORT_ENABLED') ?? true,
          directory: this.read(source, serverFlavor, 'TEMPLATE_JSON_IMPORT_DIR'),
          deleteAfterImport:
            this.readBoolean(source, serverFlavor, 'TEMPLATE_JSON_DELETE_AFTER_IMPORT') ?? true,
        },
      },
      corsOrigins: this.readList(source, serverFlavor, 'CORS_ORIGINS'),
      database: {
        driver: databaseDriver,
        path:
          this.read(source, serverFlavor, 'DB_PATH') ??
          this.read(source, serverFlavor, 'DEFAULT_DB_PATH'),
        url:
          this.read(source, serverFlavor, 'DATABASE_URL') ??
          this.read(source, serverFlavor, 'DB_URL'),
        host: this.read(source, serverFlavor, 'DB_HOST'),
        port: this.readNumber(source, serverFlavor, 'DB_PORT'),
        username:
          this.read(source, serverFlavor, 'DB_USERNAME') ??
          this.read(source, serverFlavor, 'DB_USER'),
        password: this.read(source, serverFlavor, 'DB_PASSWORD'),
        name:
          this.read(source, serverFlavor, 'DB_NAME') ??
          this.read(source, serverFlavor, 'DATABASE_NAME'),
        ssl: this.readBoolean(source, serverFlavor, 'DB_SSL') ?? false,
        logging: serverFlavor !== 'production',
        synchronize:
          this.readBoolean(source, serverFlavor, 'DB_SYNCHRONIZE') ?? serverFlavor !== 'production',
      },
      jwt: {
        secret: this.resolveJwtSecret(source, serverFlavor),
        expiresIn: this.read(source, serverFlavor, 'JWT_EXPIRES_IN') ?? DEFAULT_JWT_EXPIRES_IN,
      },
      serverFlavor,
      enableAgentEvalEndpoint:
        serverFlavor !== 'production' ||
        this.read(source, serverFlavor, 'ENABLE_AGENT_EVAL_ENDPOINT') === 'true',
      oauth: {
        qq: {
          appId: this.read(source, serverFlavor, 'QQ_APP_ID'),
          appSecret: this.read(source, serverFlavor, 'QQ_APP_SECRET'),
          redirectUri: this.read(source, serverFlavor, 'QQ_REDIRECT_URI'),
        },
        wechat: {
          appId: this.read(source, serverFlavor, 'WECHAT_APP_ID'),
          appSecret: this.read(source, serverFlavor, 'WECHAT_APP_SECRET'),
          redirectUri: this.read(source, serverFlavor, 'WECHAT_REDIRECT_URI'),
        },
      },
      port: this.readNumber(source, serverFlavor, 'PORT') ?? DEFAULT_PORT,
    };

    this.validate(config);
    return config;
  }

  static envFilePaths(serverFlavor: ServerFlavors): string[] {
    const aliases = this.envFileAliases(serverFlavor);
    return aliases.flatMap((alias) => [`.env.${alias}.local`, `.env.${alias}`]);
  }

  static validate(config: ServerConfig): void {
    const issues: string[] = [];

    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      issues.push('PORT must be an integer between 1 and 65535.');
    }

    if (config.serverFlavor === 'production') {
      if (config.database.synchronize) {
        issues.push('DB_SYNCHRONIZE must be false in production; run migrations instead.');
      }

      if (config.corsOrigins.length === 0) {
        issues.push('CORS_ORIGINS must list at least one explicit origin in production.');
      }
    }

    this.validateDatabase(config, issues);
    // Electron 桌面端通过自定义协议（如 app://）加载渲染层时，其请求 Origin 不是
    // http(s)，需在 CORS 白名单中显式允许。
    const desktopOriginSchemes = ['app:'];
    for (const origin of config.corsOrigins) {
      if (origin === '*') {
        issues.push('CORS_ORIGINS must not contain wildcard "*".');
        continue;
      }
      try {
        const parsed = new URL(origin);
        if (['http:', 'https:'].includes(parsed.protocol)) {
          if (parsed.origin !== origin) {
            issues.push(`CORS origin "${origin}" must be an http(s) origin without a path.`);
          }
        } else if (desktopOriginSchemes.includes(parsed.protocol)) {
          // 自定义 scheme 的 URL.origin 恒为 "null"，故按结构校验：不允许 path/query/fragment。
          const hasPath = parsed.pathname !== '' && parsed.pathname !== '/';
          if (hasPath || parsed.search !== '' || parsed.hash !== '') {
            issues.push(
              `CORS origin "${origin}" must be a desktop (app://) origin without a path.`,
            );
          }
        } else {
          issues.push(
            `CORS origin "${origin}" must be an http(s) or desktop (app://) origin without a path.`,
          );
        }
      } catch {
        issues.push(`CORS origin "${origin}" is not a valid URL origin.`);
      }
    }

    this.validateOAuthProvider('QQ', config.oauth.qq, issues);
    this.validateOAuthProvider('WECHAT', config.oauth.wechat, issues);

    if (issues.length) {
      throw new ConfigValidationError(issues);
    }
  }

  private static resolveServerFlavor(source: EnvSource, argv: CliArgs): ServerFlavors {
    return (
      this.normalizeServerFlavor(this.readCliServerFlavor(argv)) ??
      this.normalizeServerFlavor(source[SERVER_FLAVOR_ENV_NAME]) ??
      this.normalizeServerFlavor(source.NODE_ENV) ??
      'development'
    );
  }

  private static readCliServerFlavor(argv: CliArgs): string | undefined {
    const flags = ['--flavor', '--env', '--server-flavor'];

    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      const matchedInlineFlag = flags.find((flag) => arg.startsWith(`${flag}=`));
      if (matchedInlineFlag) {
        return arg.slice(matchedInlineFlag.length + 1);
      }

      if (flags.includes(arg)) {
        return argv[index + 1];
      }
    }

    return undefined;
  }

  private static normalizeServerFlavor(value: string | undefined): ServerFlavors | undefined {
    const normalized = this.clean(value)?.toLowerCase();
    if (normalized === 'prod' || normalized === 'production') {
      return 'production';
    }
    if (normalized === 'dev' || normalized === 'development') {
      return 'development';
    }
    if (normalized === 'test') {
      return 'test';
    }
    return undefined;
  }

  private static read(source: EnvSource, nodeEnv: ServerFlavors, name: string): string | undefined {
    const scopedName = `${this.scopePrefix(nodeEnv)}_${name}`;
    const scopedValue = this.clean(source[scopedName]);
    if (scopedValue) {
      return scopedValue;
    }

    return this.clean(source[name]);
  }

  private static readList(source: EnvSource, nodeEnv: ServerFlavors, name: string): string[] {
    return (this.read(source, nodeEnv, name) ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private static readNumber(
    source: EnvSource,
    nodeEnv: ServerFlavors,
    name: string,
  ): number | undefined {
    const value = this.read(source, nodeEnv, name);
    if (!value) {
      return undefined;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Invalid number environment variable ${name}: ${value}`);
    }
    return numberValue;
  }

  private static resolveJwtSecret(source: EnvSource, nodeEnv: ServerFlavors): string {
    const configured = this.read(source, nodeEnv, 'JWT_SECRET');
    if (configured) {
      return configured;
    }

    if (nodeEnv === 'production') {
      throw new Error(
        'Missing required JWT secret for production. Set JWT_SECRET or PROD_JWT_SECRET ' +
          'to a stable random value before starting the backend.',
      );
    }

    if (!this.warnedJwtSecretFallbacks.has(nodeEnv)) {
      this.warnedJwtSecretFallbacks.add(nodeEnv);
      console.warn(
        `[ConfigFactory] ${this.scopePrefix(nodeEnv)}_JWT_SECRET/JWT_SECRET is not set; ` +
          'using a fixed insecure development fallback. Configure a stable secret ' +
          'in .env.*.local to keep sessions valid across environments.',
      );
    }

    return nodeEnv === 'test' ? TEST_JWT_SECRET_FALLBACK : DEV_JWT_SECRET_FALLBACK;
  }

  private static readBoolean(
    source: EnvSource,
    nodeEnv: ServerFlavors,
    name: string,
  ): boolean | undefined {
    const value = this.read(source, nodeEnv, name);
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

  private static readDatabaseDriver(
    source: EnvSource,
    nodeEnv: ServerFlavors,
  ): BackendDatabaseDriver {
    const value =
      this.read(source, nodeEnv, 'DATABASE_DRIVER') ?? this.read(source, nodeEnv, 'DB_DRIVER');
    if (!value) {
      return 'sqlite';
    }

    const normalized = value.toLowerCase();
    if (normalized === 'sqlite' || normalized === 'postgres') {
      return normalized;
    }

    throw new Error(`Unsupported database driver: ${value}`);
  }

  private static scopePrefix(nodeEnv: ServerFlavors): 'DEV' | 'PROD' | 'TEST' {
    if (nodeEnv === 'production') {
      return 'PROD';
    }
    if (nodeEnv === 'test') {
      return 'TEST';
    }
    return 'DEV';
  }

  private static envFileAliases(serverFlavor: ServerFlavors): string[] {
    if (serverFlavor === 'production') {
      return ['prod', 'production'];
    }
    if (serverFlavor === 'test') {
      return ['test'];
    }
    return ['dev', 'development'];
  }

  private static clean(value: string | undefined): string | undefined {
    const cleaned = value?.trim();
    if (!cleaned) {
      return undefined;
    }
    return cleaned;
  }

  private static validateOAuthProvider(
    label: 'QQ' | 'WECHAT',
    provider: BackendOAuthProviderConfig,
    issues: string[],
  ): void {
    const values = [provider.appId, provider.appSecret, provider.redirectUri];
    const configuredCount = values.filter(Boolean).length;
    if (configuredCount > 0 && configuredCount < values.length) {
      issues.push(`${label} OAuth config must set app id, app secret, and redirect URI together.`);
    }
    if (provider.redirectUri) {
      try {
        const parsed = new URL(provider.redirectUri);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          issues.push(`${label} OAuth redirect URI must use http or https.`);
        }
      } catch {
        issues.push(`${label} OAuth redirect URI is not a valid URL.`);
      }
    }
  }

  private static validateDatabase(config: ServerConfig, issues: string[]): void {
    if (config.database.driver === 'sqlite') {
      return;
    }

    if (config.database.url) {
      return;
    }

    if (!config.database.host) {
      issues.push('DB_HOST is required when DATABASE_DRIVER=postgres and DATABASE_URL is not set.');
    }
    if (!config.database.name) {
      issues.push('DB_NAME is required when DATABASE_DRIVER=postgres and DATABASE_URL is not set.');
    }
    if (!config.database.username) {
      issues.push(
        'DB_USERNAME or DB_USER is required when DATABASE_DRIVER=postgres ' +
          'and DATABASE_URL is not set.',
      );
      return;
    }
  }
}
