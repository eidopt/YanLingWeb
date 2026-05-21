import { Injectable } from '@nestjs/common';

import { ConfigFactory, type ServerConfig } from './config.factory';

/**
 * Singleton service that builds the full ServerConfig once and exposes it
 * via dependency injection to every other provider, controller, and module.
 *
 * This replaces direct `ConfigFactory.build()` calls (which re-read process.env
 * every time) and direct `process.env` access (which bypasses the config layer).
 */
@Injectable()
export class ConfigService {
  private readonly config: ServerConfig;

  constructor() {
    this.config = ConfigFactory.build();
  }

  // ---------------------------------------------------------------------------
  // Full config (escaping hatch for consumers that need the raw shape)
  // ---------------------------------------------------------------------------

  /** The raw ServerConfig object — use typed accessors below when possible. */
  get raw(): Readonly<ServerConfig> {
    return this.config;
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  get ai() {
    return this.config.ai;
  }

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------

  get corsOrigins() {
    return this.config.corsOrigins;
  }

  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------

  get database() {
    return this.config.database;
  }

  // ---------------------------------------------------------------------------
  // JWT
  // ---------------------------------------------------------------------------

  get jwt() {
    return this.config.jwt;
  }

  // ---------------------------------------------------------------------------
  // Server
  // ---------------------------------------------------------------------------

  get serverFlavor() {
    return this.config.serverFlavor;
  }

  get port() {
    return this.config.port;
  }

  get enableAgentEvalEndpoint() {
    return this.config.enableAgentEvalEndpoint;
  }

  // ---------------------------------------------------------------------------
  // OAuth
  // ---------------------------------------------------------------------------

  get oauth() {
    return this.config.oauth;
  }
}
