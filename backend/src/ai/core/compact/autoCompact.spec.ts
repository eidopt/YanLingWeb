import type { ProviderMessage } from '../providers/types';
import {
  autoCompactIfNeeded,
  createAutoCompactState,
  getAutoCompactThreshold,
} from './autoCompact';

describe('autoCompactIfNeeded', () => {
  it('increments the turn counter when the conversation is below the threshold', async () => {
    const messages: ProviderMessage[] = [{ role: 'user', content: 'short request' }];

    const result = await autoCompactIfNeeded(messages, 'gpt-5', createAutoCompactState(), () => [
      { role: 'user', content: 'compacted' },
    ]);

    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toBe(messages);
    expect(result.state).toEqual({ compacted: false, turnCounter: 1, consecutiveFailures: 0 });
  });

  it('compacts over-threshold conversations and resets failure state', async () => {
    // Need >500K tokens (threshold = min(contextWindow, 500K)) → 2M chars ≈ 667K tokens
    const messages: ProviderMessage[] = [{ role: 'user', content: 'x'.repeat(2_000_000) }];
    const compacted: ProviderMessage[] = [{ role: 'user', content: 'summary' }];

    const result = await autoCompactIfNeeded(
      messages,
      'kimi-k2',
      { compacted: false, turnCounter: 7, consecutiveFailures: 2 },
      () => compacted,
    );

    expect(result.wasCompacted).toBe(true);
    expect(result.messages).toBe(compacted);
    expect(result.state).toEqual({ compacted: true, turnCounter: 0, consecutiveFailures: 0 });
  });

  it('backs off after repeated compaction failures', async () => {
    // Need >500K tokens to trigger compaction
    const messages: ProviderMessage[] = [{ role: 'user', content: 'x'.repeat(2_000_000) }];

    const failed = await autoCompactIfNeeded(
      messages,
      'kimi-k2',
      { compacted: false, turnCounter: 2, consecutiveFailures: 2 },
      () => {
        throw new Error('compaction failed');
      },
    );
    const skipped = await autoCompactIfNeeded(messages, 'kimi-k2', failed.state, () => [
      { role: 'user', content: 'should not run' },
    ]);

    expect(failed.wasCompacted).toBe(false);
    expect(failed.state).toEqual({ compacted: false, turnCounter: 3, consecutiveFailures: 3 });
    expect(skipped.wasCompacted).toBe(false);
    expect(skipped.messages).toBe(messages);
    expect(skipped.state).toEqual({ compacted: false, turnCounter: 4, consecutiveFailures: 3 });
  });

  it('caps auto compaction thresholds below oversized provider windows', () => {
    expect(getAutoCompactThreshold('deepseek-reasoner')).toBe(500_000);
  });
});
