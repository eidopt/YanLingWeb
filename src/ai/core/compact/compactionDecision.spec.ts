/**
 * compactionDecision tests.
 *
 * Run: npx tsx --test src/ai/core/compact/compactionDecision.spec.ts
 */

import { decideCompaction } from './compactionDecision';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

void describe('decideCompaction', () => {
  void it('skips when cache hit rate > 70% and token ratio < 120%', () => {
    const decision = decideCompaction({
      currentTokenCount: 100_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.8,
      turnCounter: 3,
    });
    assert.equal(decision.shouldCompact, false);
    assert.equal(decision.strategy, 'skip');
  });

  void it('micro compact when token ratio < 150%', () => {
    const decision = decideCompaction({
      currentTokenCount: 140_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.5,
      turnCounter: 3,
    });
    assert.equal(decision.shouldCompact, true);
    assert.equal(decision.strategy, 'micro');
  });

  void it('full compact when token ratio >= 150%', () => {
    const decision = decideCompaction({
      currentTokenCount: 160_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.3,
      turnCounter: 3,
    });
    assert.equal(decision.shouldCompact, true);
    assert.equal(decision.strategy, 'full');
  });

  void it('micro compact when cache is high but tokens exceed 120%', () => {
    const decision = decideCompaction({
      currentTokenCount: 130_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.8,
      turnCounter: 3,
    });
    assert.equal(decision.shouldCompact, true);
    assert.equal(decision.strategy, 'micro');
  });

  void it('micro compact when cache is low but tokens are moderate', () => {
    const decision = decideCompaction({
      currentTokenCount: 50_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.3,
      turnCounter: 3,
    });
    assert.equal(decision.shouldCompact, true);
    assert.equal(decision.strategy, 'micro');
  });

  void it('provides a reason string', () => {
    const decision = decideCompaction({
      currentTokenCount: 100_000,
      maxTokens: 100_000,
      recentCacheHitRate: 0.8,
      turnCounter: 3,
    });
    assert.ok(decision.reason);
    assert.equal(typeof decision.reason, 'string');
  });
});
