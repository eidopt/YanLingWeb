/**
 * Model Capabilities Registry
 *
 * Maps model name patterns to their ProviderCapabilities.
 * Used by OpenAICompatibleProvider to determine how to handle
 * reasoning_content, caching, and developer role for each model.
 */
import type { ProviderCapabilities } from '@shared/agent/contracts/provider';

/** Default capabilities for generic OpenAI-compatible models (DeepSeek, etc.) */
const DEFAULT_COMPATIBLE_CAPS: ProviderCapabilities = {
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

/** DeepSeek: passive prefix caching, optional reasoning_content */
const DEEPSEEK_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'passthrough',
  cacheStrategy: 'prefix',
};

/** MiMo (Xiaomi): reasoning_content mandatory on every assistant message */
const MIMO_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'required',
  cacheStrategy: 'none',
};

/** MiniMax: passthrough reasoning, thinking.budget_tokens control */
const MINIMAX_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'passthrough',
  cacheStrategy: 'none',
};

/** Kimi (Moonshot): prompt_cache_key for caching, thinking.type for reasoning */
const KIMI_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'passthrough',
  cacheStrategy: 'cache_key',
};

/** GLM (Zhipu): no special reasoning or caching */
const GLM_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'none',
  cacheStrategy: 'none',
};

/** Qwen (Alibaba): cache_control marker, enable_thinking for reasoning */
const QWEN_CAPS: ProviderCapabilities = {
  ...DEFAULT_COMPATIBLE_CAPS,
  reasoningMode: 'passthrough',
  cacheStrategy: 'cache_control',
};

/**
 * Model pattern → capabilities mapping.
 * Patterns are tested against model name with startsWith (case-insensitive).
 * First match wins; order matters.
 */
const MODEL_CAPABILITIES_REGISTRY: [string, ProviderCapabilities][] = [
  ['mimo', MIMO_CAPS],
  ['minimax', MINIMAX_CAPS],
  ['kimi', KIMI_CAPS],
  ['moonshot', KIMI_CAPS],
  ['glm', GLM_CAPS],
  ['qwen', QWEN_CAPS],
  ['deepseek', DEEPSEEK_CAPS],
];

/**
 * Resolve capabilities for a given model name.
 * Falls back to DEFAULT_COMPATIBLE_CAPS if no pattern matches.
 */
export function resolveCapabilitiesForModel(model: string): ProviderCapabilities {
  const lower = model.toLowerCase();
  for (const [pattern, caps] of MODEL_CAPABILITIES_REGISTRY) {
    if (lower.startsWith(pattern) || lower.includes(pattern)) {
      return caps;
    }
  }
  return DEFAULT_COMPATIBLE_CAPS;
}

export {
  DEFAULT_COMPATIBLE_CAPS,
  DEEPSEEK_CAPS,
  MIMO_CAPS,
  MINIMAX_CAPS,
  KIMI_CAPS,
  GLM_CAPS,
  QWEN_CAPS,
};
