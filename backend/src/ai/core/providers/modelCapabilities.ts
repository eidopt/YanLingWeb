/**
 * Model Capabilities — derived from provider type + config overrides.
 *
 * No model names are hardcoded. Capabilities are determined by:
 *   1. Provider type (OpenAI Responses API vs Chat Completions)
 *   2. Optional env var overrides: AI_REASONING_MODE, AI_CACHE_STRATEGY
 *
 * This means adding a new model requires ZERO code changes — just set
 * AI_PROVIDER, AI_MODEL, AI_BASE_URL, AI_API_KEY in .env.
 */
import type { ProviderCapabilities } from '@shared/agent/contracts/provider';

/** Safe defaults for Chat Completions compatible providers */
const COMPATIBLE_DEFAULTS: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  reasoningMode: 'passthrough',
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

/**
 * Build capabilities for an OpenAI-compatible provider instance.
 * Reads optional overrides from env vars.
 */
export function buildCompatibleCapabilities(): ProviderCapabilities {
  const caps = { ...COMPATIBLE_DEFAULTS };

  const reasoningMode = process.env.AI_REASONING_MODE;
  if (reasoningMode === 'none' || reasoningMode === 'passthrough' || reasoningMode === 'required') {
    caps.reasoningMode = reasoningMode;
  }

  const cacheStrategy = process.env.AI_CACHE_STRATEGY;
  if (
    cacheStrategy === 'response_id' ||
    cacheStrategy === 'prefix' ||
    cacheStrategy === 'cache_key' ||
    cacheStrategy === 'cache_control' ||
    cacheStrategy === 'none'
  ) {
    caps.cacheStrategy = cacheStrategy;
  }

  if (process.env.AI_SUPPORTS_DEVELOPER_ROLE === 'true') {
    caps.supportsDeveloperRole = true;
  }

  return caps;
}
