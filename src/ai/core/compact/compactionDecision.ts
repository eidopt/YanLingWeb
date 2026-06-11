/**
 * Compaction Decision — cache-aware compaction strategy.
 *
 * Instead of blindly compacting when token count exceeds threshold,
 * this module considers cache hit rate to decide the optimal strategy.
 *
 * Strategies:
 * - 'skip': Cache hit rate is high, delay compaction to preserve prefix
 * - 'micro': Light truncation without changing the system prefix
 * - 'full': Full LLM-based compaction (inevitable when token budget is exceeded)
 */

export type CompactionStrategy = 'skip' | 'micro' | 'full';

export interface CompactionDecision {
  shouldCompact: boolean;
  strategy: CompactionStrategy;
  reason: string;
}

export interface CompactionDecisionInput {
  currentTokenCount: number;
  maxTokens: number;
  recentCacheHitRate: number;
  turnCounter: number;
}

/**
 * Decide whether to compact and which strategy to use.
 *
 * Decision logic:
 * 1. If cache hit rate > 70% and token count < 120% of max → skip (preserve prefix)
 * 2. If token count < 150% of max → micro compact (truncate large tool results)
 * 3. Otherwise → full compact (LLM-based semantic compaction)
 */
export function decideCompaction(input: CompactionDecisionInput): CompactionDecision {
  const { currentTokenCount, maxTokens, recentCacheHitRate } = input;
  const tokenRatio = currentTokenCount / maxTokens;

  // Strategy 1: Skip compaction when cache is performing well
  if (recentCacheHitRate > 0.7 && tokenRatio < 1.2) {
    return {
      shouldCompact: false,
      strategy: 'skip',
      reason:
        `Cache hit rate ${(recentCacheHitRate * 100).toFixed(1)}% > 70%, ` +
        `token ratio ${(tokenRatio * 100).toFixed(1)}% < 120% — preserving prefix`,
    };
  }

  // Strategy 2: Micro compact for moderate overflow
  if (tokenRatio < 1.5) {
    return {
      shouldCompact: true,
      strategy: 'micro',
      reason: `Token ratio ${(tokenRatio * 100).toFixed(1)}% < 150% — ` + `micro compact (truncate large tool results)`,
    };
  }

  // Strategy 3: Full compact for severe overflow
  return {
    shouldCompact: true,
    strategy: 'full',
    reason: `Token ratio ${(tokenRatio * 100).toFixed(1)}% >= 150% — ` + `full semantic compaction required`,
  };
}
