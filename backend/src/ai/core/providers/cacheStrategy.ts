/**
 * CacheStrategy — per-provider caching strategy.
 *
 * Replaces the instanceof OpenAIProvider check in withRequestScopedCache
 * with a capability-driven strategy pattern.
 *
 * Strategies:
 * - ResponseIdCacheStrategy: GPT — inject previous_response_id
 * - PrefixCacheStrategy: DeepSeek — passive, observe prompt_cache_hit_tokens
 * - CacheKeyStrategy: Kimi — inject prompt_cache_key
 * - CacheControlStrategy: Qwen — inject cache_control marker
 * - NoCacheStrategy: MiMo, GLM, MiniMax — no caching
 */
import type { ProviderCapabilities, ProviderRequest } from '@shared/agent/contracts/provider';

export interface ProviderCacheOptions {
  conversationId?: string;
  previousResponseId?: string;
}

export type CacheableRequest = ProviderRequest & {
  cacheKey?: string;
};

export interface CacheStrategy {
  readonly type: string;

  /** Inject cache hints into the request before sending to the provider. */
  applyToRequest<T extends CacheableRequest>(request: T, cacheOpts?: ProviderCacheOptions): T;

  /** Inject cache markers into messages (e.g. Qwen cache_control). Default: no-op. */
  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
    cacheOpts?: ProviderCacheOptions,
  ): import('@shared/agent/contracts/provider').ProviderMessage[];
}

// ── Implementations ──────────────────────────────────────────────────

class ResponseIdCacheStrategy implements CacheStrategy {
  readonly type = 'response_id';

  applyToRequest<T extends CacheableRequest>(request: T, cacheOpts?: ProviderCacheOptions): T {
    if (!cacheOpts?.previousResponseId) {
      return request;
    }
    return {
      ...request,
      cache: { previousResponseId: cacheOpts.previousResponseId },
    };
  }

  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
  ): import('@shared/agent/contracts/provider').ProviderMessage[] {
    return messages;
  }
}

class PrefixCacheStrategy implements CacheStrategy {
  readonly type = 'prefix';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    // DeepSeek: passive prefix caching — no injection needed.
    // Observe usage.prompt_cache_hit_tokens in responses.
    return request;
  }

  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
  ): import('@shared/agent/contracts/provider').ProviderMessage[] {
    return messages;
  }
}

class CacheKeyStrategy implements CacheStrategy {
  readonly type = 'cache_key';

  applyToRequest<T extends CacheableRequest>(request: T, cacheOpts?: ProviderCacheOptions): T {
    if (!cacheOpts?.conversationId) {
      return request;
    }
    return {
      ...request,
      cacheKey: cacheOpts.conversationId,
    };
  }

  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
  ): import('@shared/agent/contracts/provider').ProviderMessage[] {
    // Kimi uses request-level cache_key, no message-level changes needed.
    return messages;
  }
}

class CacheControlStrategy implements CacheStrategy {
  readonly type = 'cache_control';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    return request;
  }

  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
  ): import('@shared/agent/contracts/provider').ProviderMessage[] {
    // Qwen: inject cache_control: { type: 'ephemeral' } on the first two system messages.
    // This enables Qwen's explicit prefix caching (5 min TTL).
    let systemCount = 0;
    return messages.map((msg) => {
      if (msg.role === 'system' && systemCount < 2) {
        systemCount++;
        return { ...msg, cacheControl: { type: 'ephemeral' } };
      }
      return msg;
    });
  }
}

class NoCacheStrategy implements CacheStrategy {
  readonly type = 'none';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    return request;
  }

  applyToMessages(
    messages: import('@shared/agent/contracts/provider').ProviderMessage[],
  ): import('@shared/agent/contracts/provider').ProviderMessage[] {
    return messages;
  }
}

// ── Factory ──────────────────────────────────────────────────────────

const STRATEGY_MAP: Record<string, CacheStrategy> = {
  response_id: new ResponseIdCacheStrategy(),
  prefix: new PrefixCacheStrategy(),
  cache_key: new CacheKeyStrategy(),
  cache_control: new CacheControlStrategy(),
  none: new NoCacheStrategy(),
};

export function createCacheStrategy(cacheStrategyType: string): CacheStrategy {
  return STRATEGY_MAP[cacheStrategyType] ?? STRATEGY_MAP.none;
}

export function createCacheStrategyFromCapabilities(caps: ProviderCapabilities): CacheStrategy {
  return createCacheStrategy(caps.cacheStrategy);
}
