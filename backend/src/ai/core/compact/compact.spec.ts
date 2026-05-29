import type { ProviderMessage } from '../providers/types';
import { compactConversation } from './compact';

describe('compactConversation', () => {
  it('returns the original messages when the conversation is within the token budget', () => {
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'Build a dashboard' },
    ];

    expect(compactConversation(messages)).toBe(messages);
  });

  it('preserves system and recent messages while summarizing old over-budget context', () => {
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'Build a dashboard with project analytics' },
      {
        role: 'tool_call',
        content: '',
        toolCallId: 'call-1',
        toolName: 'generate_template',
        toolArguments: '{"name":"Analytics Dashboard","category":"SaaS"}',
      },
      { role: 'assistant', content: 'x'.repeat(2_000_000) },
      { role: 'user', content: 'Keep working from the saved draft' },
    ];

    const compacted = compactConversation(messages);

    expect(compacted).toHaveLength(3);
    expect(compacted[0]).toBe(messages[0]);
    expect(compacted[1].role).toBe('user');
    expect(compacted[1].content).toContain('[Compaction Summary - prior context compressed]');
    expect(compacted[1].content).toContain('- Goal: Build a dashboard with project analytics');
    expect(compacted[1].content).toContain('- Generated template: Analytics Dashboard (SaaS)');
    expect(compacted[2]).toBe(messages[4]);
  });
});
