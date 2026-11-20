/**
 * Model Capabilities — derived from provider type + config overrides.
 *
 * No model names are hardcoded. Capabilities are determined by:
 *   1. Provider type (OpenAI Responses API vs Chat Completions)
 *   2. Config overrides from ConfigFactory (originally from env vars)
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
  supportsForcedToolChoice: true,
  reasoningMode: 'passthrough',
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

export interface CompatibleCapabilitiesOverrides {
  reasoningMode?: 'none' | 'passthrough' | 'required';
  cacheStrategy?: 'response_id' | 'prefix' | 'cache_key' | 'cache_control' | 'none';
  supportsDeveloperRole?: boolean;
  supportsForcedToolChoice?: boolean;
  extraRequestParams?: Record<string, unknown>;
}

/**
 * Build capabilities for an OpenAI-compatible provider instance.
 * Accepts config overrides from ConfigFactory — never reads process.env directly.
 */
export function buildCompatibleCapabilities(
  overrides?: CompatibleCapabilitiesOverrides,
): ProviderCapabilities {
  const caps = { ...COMPATIBLE_DEFAULTS };

  if (overrides?.reasoningMode) {
    caps.reasoningMode = overrides.reasoningMode;
  }
  if (overrides?.cacheStrategy) {
    caps.cacheStrategy = overrides.cacheStrategy;
  }
  if (overrides?.supportsDeveloperRole) {
    caps.supportsDeveloperRole = true;
  }
  if (overrides?.extraRequestParams) {
    caps.extraRequestParams = overrides.extraRequestParams;
  }
  if (overrides?.supportsForcedToolChoice !== undefined) {
    caps.supportsForcedToolChoice = overrides.supportsForcedToolChoice;
  } else if (overrides?.extraRequestParams?.enable_thinking === true) {
    caps.supportsForcedToolChoice = false;
  }

  return caps;
}
