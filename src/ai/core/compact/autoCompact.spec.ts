import type { ProviderMessage } from '../providers/types';
import { autoCompactIfNeeded, createAutoCompactState } from './autoCompact';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function largeToolExchange(index: number): ProviderMessage[] {
  const toolCallId = `tool-${index}`;
  return [
    {
      role: 'tool_call',
      content: '',
      toolCallId,
      toolName: 'editor_read',
      toolArguments: '{}',
    },
    {
      role: 'tool_result',
      content: JSON.stringify({ success: true, data: 'x'.repeat(400_000), index }),
      toolCallId,
    },
  ];
}

function contentText(message: ProviderMessage | undefined): string {
  return typeof message?.content === 'string' ? message.content : '';
}

void describe('autoCompactIfNeeded', () => {
  void it('uses prefix-safe micro compaction for moderate overflow', async () => {
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'stable prefix' },
      ...Array.from({ length: 8 }, (_, index) => largeToolExchange(index)).flat(),
      { role: 'user', content: 'continue' },
    ];

    const result = await autoCompactIfNeeded(messages, 'gpt-5', createAutoCompactState(), {
      cacheHitRate: 0.5,
      forceSynchronous: true,
    });

    assert.equal(result.wasCompacted, true);
    assert.equal(result.strategy, 'micro');
    assert.equal(result.messages.filter((msg) => msg.role === 'system').length, 1);
    assert.equal(
      result.messages.some((msg) => contentText(msg).includes('[Compaction')),
      false,
    );
    assert.match(contentText(result.messages[2]), /\[Tool result truncated/);
    assert.doesNotMatch(contentText(result.messages.at(-2)), /\[Tool result truncated/);
  });
});
