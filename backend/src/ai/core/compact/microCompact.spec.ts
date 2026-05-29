import type { ProviderMessage } from '../providers/types';
import { microcompactMessages } from './microCompact';

describe('microcompactMessages', () => {
  it('clears old large compactable tool results while keeping recent context', () => {
    const messages: ProviderMessage[] = [
      { role: 'tool_call', content: '', toolCallId: 'old-1', toolName: 'generate_template' },
      { role: 'tool_result', content: 'a'.repeat(1200), toolCallId: 'old-1' },
      { role: 'tool_call', content: '', toolCallId: 'old-2', toolName: 'validate_template' },
      { role: 'tool_result', content: 'b'.repeat(1400), toolCallId: 'old-2' },
      { role: 'tool_call', content: '', toolCallId: 'new-1', toolName: 'generate_template' },
      { role: 'tool_result', content: 'c'.repeat(1600), toolCallId: 'new-1' },
      { role: 'tool_result', content: 'd'.repeat(1600), toolCallId: 'not-compactable' },
    ];

    const compacted = microcompactMessages(messages, 1);

    expect(compacted).not.toBe(messages);
    expect(compacted[1].content).toBe('[Old tool result content cleared]');
    expect(compacted[3].content).toBe('[Old tool result content cleared]');
    expect(compacted[5].content).toBe('c'.repeat(1600));
    expect(compacted[6].content).toBe('d'.repeat(1600));
  });

  it('returns the original array when no large compactable results exist', () => {
    const messages: ProviderMessage[] = [
      { role: 'tool_call', content: '', toolCallId: 'small-1', toolName: 'generate_template' },
      { role: 'tool_result', content: 'small result', toolCallId: 'small-1' },
    ];

    expect(microcompactMessages(messages)).toBe(messages);
  });
});
