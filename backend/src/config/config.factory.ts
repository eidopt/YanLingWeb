import { v4 as uuidv4 } from 'uuid';

export type ServerFlavors = 'development' | 'production' | 'test';

export interface BackendOAuthProviderConfig {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
}

export interface ServerConfig {
  ai: {
    provider: 'openai' | 'openai-compatible';
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
  corsOrigins: string[];
  database: {
    path: string;
    logging: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  serverFlavor: ServerFlavors;
  oauth: {
    qq: BackendOAuthProviderConfig;
    wechat: BackendOAuthProviderConfig;
  };
  port: number;
}

type EnvSource = NodeJS.ProcessEnv;
type CliArgs = readonly string[];

const DEFAULT_JWT_SECRET = uuidv4();
const DEFAULT_JWT_EXPIRES_IN = '7d';
const DEFAULT_PORT = 4000;
const SERVER_FLAVOR_ENV_NAME = 'SERVER_FLAVOR';

export class ConfigFactory {
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
    const aiProvider = (this.read(source, serverFlavor, 'AI_PROVIDER') as 'openai' | 'openai-compatible') ?? 'openai';
    const prefix = VAR_PREFIX[aiProvider];

    const aiModel = this.read(source, serverFlavor, 'AI_MODEL');

    return {
      ai: {
        provider: aiProvider,
        model: aiModel ?? (aiProvider === 'openai-compatible' ? 'deepseek-chat' : 'gpt-5.4'),
        // Try provider-specific vars (e.g. OPENAI_API_KEY), fall back to generic AI_*
        apiKey: this.read(source, serverFlavor, `${prefix}_API_KEY`)
          ?? this.read(source, serverFlavor, 'AI_API_KEY'),
        baseUrl: this.read(source, serverFlavor, `${prefix}_BASE_URL`)
          ?? this.read(source, serverFlavor, 'AI_BASE_URL'),
      },
      corsOrigins: this.readList(source, serverFlavor, 'CORS_ORIGINS'),
      database: {
        path:
          this.read(source, serverFlavor, 'DB_PATH') ??
          this.readRequired(source, serverFlavor, 'DEFAULT_DB_PATH'),
        logging: serverFlavor !== 'production',
      },
      jwt: {
        secret: this.read(source, serverFlavor, 'JWT_SECRET') ?? DEFAULT_JWT_SECRET,
        expiresIn:
          this.read(source, serverFlavor, 'JWT_EXPIRES_IN') ??
          DEFAULT_JWT_EXPIRES_IN,
      },
      serverFlavor,
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

  private static readRequired(
    source: EnvSource,
    nodeEnv: ServerFlavors,
    name: string,
  ): string {
    const value = this.read(source, nodeEnv, name);
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
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
