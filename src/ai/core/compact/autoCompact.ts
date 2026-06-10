import type { AIProvider, ProviderMessage } from '../providers/types';
import { compactConversation, compactConversationWithLLM, needsCompaction } from './compact';
import { type CompactionStrategy, decideCompaction } from './compactionDecision';

const MAX_FAILURES = 3;

export interface AutoCompactState {
  compacted: boolean;
  turnCounter: number;
  consecutiveFailures: number;
  recentCacheHitRate: number;
}

export function createAutoCompactState(): AutoCompactState {
  return {
    compacted: false,
    turnCounter: 0,
    consecutiveFailures: 0,
    recentCacheHitRate: 0,
  };
}

export interface AutoCompactOptions {
  provider?: AIProvider;
  compactionModel?: string;
  forceSynchronous?: boolean;
  /** Recent cache hit rate (0-1) from the provider's usage stats. */
  cacheHitRate?: number;
}

/**
 * Check if compaction is needed and apply it.
 *
 * Uses cache-aware decision logic:
 * - High cache hit rate → skip compaction to preserve prefix
 * - Moderate overflow → micro compact (truncate large tool results)
 * - Severe overflow → full semantic compaction
 *
 * Falls back to synchronous rule-based compaction when provider is unavailable.
 */
export async function autoCompactIfNeeded(
  messages: ProviderMessage[],
  model: string,
  state: AutoCompactState,
  options?: AutoCompactOptions,
): Promise<{
  messages: ProviderMessage[];
  state: AutoCompactState;
  wasCompacted: boolean;
  strategy?: CompactionStrategy;
}> {
  if (state.consecutiveFailures >= MAX_FAILURES) {
    return {
      messages,
      state: { ...state, turnCounter: state.turnCounter + 1 },
      wasCompacted: false,
    };
  }

  // Update cache hit rate from options
  const cacheHitRate = options?.cacheHitRate ?? state.recentCacheHitRate;

  if (!needsCompaction(messages, model)) {
    return {
      messages,
      state: {
        ...state,
        turnCounter: state.turnCounter + 1,
        recentCacheHitRate: cacheHitRate,
      },
      wasCompacted: false,
    };
  }

  // Cache-aware compaction decision
  const { getContextWindow } = await import('../utils/tokens');
  const { tokenCountWithEstimation } = await import('../utils/tokens');
  const maxTokens = getContextWindow(model);
  const decision = decideCompaction({
    currentTokenCount: tokenCountWithEstimation(messages),
    maxTokens,
    recentCacheHitRate: cacheHitRate,
    turnCounter: state.turnCounter,
  });

  if (!decision.shouldCompact) {
    return {
      messages,
      state: {
        ...state,
        turnCounter: state.turnCounter + 1,
        recentCacheHitRate: cacheHitRate,
      },
      wasCompacted: false,
      strategy: decision.strategy,
    };
  }

  try {
    let compacted: ProviderMessage[];

    if (decision.strategy === 'micro') {
      // Micro compact: truncate large tool results without changing system prefix
      compacted = compactConversation(messages, model);
    } else if (options?.provider && !options.forceSynchronous) {
      // Full: LLM-based semantic compaction
      compacted = await compactConversationWithLLM(messages, options.provider, options.compactionModel ?? model);
    } else {
      // Synchronous fallback
      compacted = compactConversation(messages, model);
    }

    return {
      messages: compacted,
      state: {
        compacted: true,
        turnCounter: 0,
        consecutiveFailures: 0,
        recentCacheHitRate: cacheHitRate,
      },
      wasCompacted: true,
      strategy: decision.strategy,
    };
  } catch {
    return {
      messages,
      state: {
        ...state,
        turnCounter: state.turnCounter + 1,
        consecutiveFailures: state.consecutiveFailures + 1,
        recentCacheHitRate: cacheHitRate,
      },
      wasCompacted: false,
      strategy: decision.strategy,
    };
  }
}
