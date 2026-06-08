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
}

class PrefixCacheStrategy implements CacheStrategy {
  readonly type = 'prefix';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    // DeepSeek: passive prefix caching — no injection needed.
    // Observe usage.prompt_cache_hit_tokens in responses.
    return request;
  }
}

class CacheKeyStrategy implements CacheStrategy {
  readonly type = 'cache_key';

  applyToRequest<T extends CacheableRequest>(request: T, cacheOpts?: ProviderCacheOptions): T {
    // PLACEHOLDER — Kimi's prompt_cache_key is not yet read by any provider.
    // When a KimiProvider is implemented, it should read request.cacheKey
    // and inject it into the API call.
    if (!cacheOpts?.conversationId) {
      return request;
    }
    return {
      ...request,
      cacheKey: cacheOpts.conversationId,
    };
  }
}

class CacheControlStrategy implements CacheStrategy {
  readonly type = 'cache_control';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    // PLACEHOLDER — Qwen's cache_control marker should be applied at message level
    // by the provider's convertMessages, not at request level.
    // When a QwenProvider is implemented, it should inject cache_control into messages.
    return request;
  }
}

class NoCacheStrategy implements CacheStrategy {
  readonly type = 'none';

  applyToRequest<T extends CacheableRequest>(request: T): T {
    return request;
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
