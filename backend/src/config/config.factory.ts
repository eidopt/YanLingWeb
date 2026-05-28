export type ServerFlavors = 'development' | 'production' | 'test';
export type BackendDatabaseDriver = 'sqlite' | 'postgres' | 'mysql';

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
    const aiProvider = configuredProvider === 'openai-compatible'
      ? 'openai-compatible'
      : 'openai';
    const prefix = VAR_PREFIX[aiProvider];

    const defaultModel = aiProvider === 'openai-compatible' ? 'deepseek-chat' : 'gpt-5.4';
    const aiProModel = this.read(source, serverFlavor, 'AI_PRO_MODEL')
      ?? this.read(source, serverFlavor, 'AI_MODEL')
      ?? defaultModel;
    const aiLiteModel = this.read(source, serverFlavor, 'AI_LITE_MODEL');
    const aiImageModel = this.read(source, serverFlavor, 'AI_IMAGE_MODEL');
    const databaseDriver = this.readDatabaseDriver(source, serverFlavor);

    return {
      ai: {
        provider: aiProvider,
        model: aiProModel,
        models: {
          pro: aiProModel,
          ...(aiLiteModel ? { lite: aiLiteModel } : {}),
          ...(aiImageModel ? { image: aiImageModel } : {}),
        },
        // Try provider-specific vars (e.g. OPENAI_API_KEY), fall back to generic AI_*
        apiKey: this.read(source, serverFlavor, `${prefix}_API_KEY`)
          ?? this.read(source, serverFlavor, 'AI_API_KEY'),
        baseUrl: this.read(source, serverFlavor, `${prefix}_BASE_URL`)
          ?? this.read(source, serverFlavor, 'AI_BASE_URL'),
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
        logging: serverFlavor !== 'production',
        synchronize: this.readBoolean(source, serverFlavor, 'DB_SYNCHRONIZE')
          ?? serverFlavor !== 'production',
      },
      jwt: {
        secret: this.resolveJwtSecret(source, serverFlavor),
        expiresIn:
          this.read(source, serverFlavor, 'JWT_EXPIRES_IN') ??
          DEFAULT_JWT_EXPIRES_IN,
      },
      serverFlavor,
      enableAgentEvalEndpoint:
        serverFlavor !== 'production'
        || this.read(source, serverFlavor, 'ENABLE_AGENT_EVAL_ENDPOINT') === 'true',
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
  }

  static envFilePaths(serverFlavor: ServerFlavors): string[] {
    const aliases = this.envFileAliases(serverFlavor);
    return aliases.flatMap((alias) => [`.env.${alias}.local`, `.env.${alias}`]);
  }

  private static resolveServerFlavor(
    source: EnvSource,
    argv: CliArgs,
  ): ServerFlavors {
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

  private static read(
    source: EnvSource,
    nodeEnv: ServerFlavors,
    name: string,
  ): string | undefined {
    const scopedName = `${this.scopePrefix(nodeEnv)}_${name}`;
    const scopedValue = this.clean(source[scopedName]);
    if (scopedValue) {
      return scopedValue;
    }

    return this.clean(source[name]);
  }

  private static readList(
    source: EnvSource,
    nodeEnv: ServerFlavors,
    name: string,
  ): string[] {
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
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private static resolveJwtSecret(
    source: EnvSource,
    nodeEnv: ServerFlavors,
  ): string {
    const configured = this.read(source, nodeEnv, 'JWT_SECRET');
    if (configured) {
      return configured;
    }

    if (nodeEnv === 'production') {
      throw new Error(
        'Missing required JWT secret for production. Set JWT_SECRET or PROD_JWT_SECRET '
        + 'to a stable random value before starting the backend.',
      );
    }

    if (!this.warnedJwtSecretFallbacks.has(nodeEnv)) {
      this.warnedJwtSecretFallbacks.add(nodeEnv);
      console.warn(
        `[ConfigFactory] ${this.scopePrefix(nodeEnv)}_JWT_SECRET/JWT_SECRET is not set; `
        + 'using a fixed insecure development fallback. Configure a stable secret '
        + 'in .env.*.local to keep sessions valid across environments.',
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
    const value = this.read(source, nodeEnv, 'DATABASE_DRIVER')
      ?? this.read(source, nodeEnv, 'DB_DRIVER');
    if (!value) {
      return 'sqlite';
    }

    const normalized = value.toLowerCase();
    if (
      normalized === 'sqlite' ||
      normalized === 'postgres' ||
      normalized === 'mysql'
    ) {
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
}
