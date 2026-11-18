/**
 * MessagePurifier tests
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai/core/providers/messagePurifier.spec.ts
 */
import type { ProviderCapabilities, ProviderMessage } from '@shared/agent/contracts/provider';

import { purifyMessages } from './messagePurifier';

// ── Capabilities presets ──────────────────────────────────────────────

const GPT_CAPS: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
  reasoningMode: 'none',
  cacheStrategy: 'response_id',
  supportsDeveloperRole: true,
};

const DEEPSEEK_CAPS: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  reasoningMode: 'passthrough',
  cacheStrategy: 'prefix',
  supportsDeveloperRole: false,
};

const MIMO_CAPS: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  reasoningMode: 'required',
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

const _GLM_CAPS: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  reasoningMode: 'none',
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

// ── Helpers ──────────────────────────────────────────────────────────

function assistantMsg(content: string, reasoningContent?: string): ProviderMessage {
  return {
    role: 'assistant',
    content,
    ...(reasoningContent !== undefined ? { reasoningContent } : {}),
  };
}

function systemMsg(content: string): ProviderMessage {
  return { role: 'system', content };
}

function developerMsg(content: string): ProviderMessage {
  return { role: 'developer', content };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('purifyMessages', () => {
  describe('reasoningMode: none (GPT/GLM)', () => {
    it('strips reasoningContent from assistant messages', () => {
      const messages = [assistantMsg('hello', 'thinking...')];
      const result = purifyMessages(messages, GPT_CAPS);
      expect(result[0].reasoningContent).toBeUndefined();
      expect(result[0].content).toBe('hello');
    });

    it('strips reasoningContent from tool_call messages', () => {
      const messages: ProviderMessage[] = [
        {
          role: 'tool_call',
          content: '',
          toolCallId: '1',
          toolName: 'test',
          toolArguments: '{}',
          reasoningContent: 'reasoning...',
        },
      ];
      const result = purifyMessages(messages, GPT_CAPS);
      expect(result[0].reasoningContent).toBeUndefined();
    });

    it('does not add empty reasoningContent when mode is none', () => {
      const messages = [assistantMsg('hello')];
      const result = purifyMessages(messages, GPT_CAPS);
      expect(result[0].reasoningContent).toBeUndefined();
    });

    it('preserves non-assistant messages unchanged', () => {
      const messages = [systemMsg('system prompt'), { role: 'user' as const, content: 'hi' }];
      const result = purifyMessages(messages, GPT_CAPS);
      expect(result).toEqual(messages);
    });
  });

  describe('reasoningMode: passthrough (DeepSeek/Kimi/Qwen/MiniMax)', () => {
    it('preserves reasoningContent when present', () => {
      const messages = [assistantMsg('hello', 'thinking...')];
      const result = purifyMessages(messages, DEEPSEEK_CAPS);
      expect(result[0].reasoningContent).toBe('thinking...');
    });

    it('does not add reasoningContent when absent', () => {
      const messages = [assistantMsg('hello')];
      const result = purifyMessages(messages, DEEPSEEK_CAPS);
      expect(result[0].reasoningContent).toBeUndefined();
    });
  });

  describe('reasoningMode: required (MiMo)', () => {
    it('preserves reasoningContent when present', () => {
      const messages = [assistantMsg('hello', 'thinking...')];
      const result = purifyMessages(messages, MIMO_CAPS);
      expect(result[0].reasoningContent).toBe('thinking...');
    });

    it('adds empty reasoningContent when absent on assistant messages', () => {
      const messages = [assistantMsg('hello')];
      const result = purifyMessages(messages, MIMO_CAPS);
      expect(result[0].reasoningContent).toBe('');
    });

    it('adds empty reasoningContent even when field is missing entirely', () => {
      const messages: ProviderMessage[] = [{ role: 'assistant', content: 'hello' }];
      const result = purifyMessages(messages, MIMO_CAPS);
      expect(result[0].reasoningContent).toBe('');
    });

    it('adds empty reasoningContent when absent on tool_call messages', () => {
      const messages: ProviderMessage[] = [
        {
          role: 'tool_call',
          content: '',
          toolCallId: 'call_1',
          toolName: 'submit_node_content',
          toolArguments: '{}',
        },
      ];
      const result = purifyMessages(messages, MIMO_CAPS);
      expect(result[0].reasoningContent).toBe('');
    });
  });

  describe('developer role handling', () => {
    it('preserves developer role when supportsDeveloperRole is true (GPT)', () => {
      const messages = [developerMsg('instructions')];
      const result = purifyMessages(messages, GPT_CAPS);
      expect(result[0].role).toBe('developer');
    });

    it('converts developer to system when supportsDeveloperRole is false (DeepSeek)', () => {
      const messages = [developerMsg('instructions')];
      const result = purifyMessages(messages, DEEPSEEK_CAPS);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('[Developer Instructions]\ninstructions');
    });

    it('converts developer to system for MiMo', () => {
      const messages = [developerMsg('instructions')];
      const result = purifyMessages(messages, MIMO_CAPS);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('[Developer Instructions]\ninstructions');
    });
  });

  describe('cross-model switch simulation', () => {
    it('DeepSeek history → GPT: strips reasoning_content', () => {
      // Simulate conversation history from DeepSeek with reasoning
      const messages: ProviderMessage[] = [
        systemMsg('You are a copilot'),
        { role: 'user', content: 'hello' },
        assistantMsg('response 1', 'I think...'),
        { role: 'user', content: 'edit this' },
        assistantMsg('response 2', 'Let me analyze...'),
      ];

      const result = purifyMessages(messages, GPT_CAPS);

      // System and user messages unchanged
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('user');

      // Assistant messages: reasoning stripped
      expect(result[2].reasoningContent).toBeUndefined();
      expect(result[2].content).toBe('response 1');
      expect(result[4].reasoningContent).toBeUndefined();
      expect(result[4].content).toBe('response 2');
    });

    it('GPT history → MiMo: adds empty reasoning_content to assistant msgs', () => {
      const messages: ProviderMessage[] = [
        systemMsg('You are a copilot'),
        { role: 'user', content: 'hello' },
        assistantMsg('response 1'),
        { role: 'user', content: 'edit this' },
        assistantMsg('response 2'),
      ];

      const result = purifyMessages(messages, MIMO_CAPS);

      // Assistant messages: reasoningContent added as empty
      expect(result[2].reasoningContent).toBe('');
      expect(result[4].reasoningContent).toBe('');
    });

    it('GPT history with developer role → DeepSeek: converts to system', () => {
      const messages: ProviderMessage[] = [
        developerMsg('You are a copilot'),
        { role: 'user', content: 'hello' },
        assistantMsg('response'),
      ];

      const result = purifyMessages(messages, DEEPSEEK_CAPS);

      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('[Developer Instructions]\nYou are a copilot');
    });
  });

  describe('immutability', () => {
    it('does not mutate input messages', () => {
      const original = assistantMsg('hello', 'thinking...');
      const messages = [original];
      const result = purifyMessages(messages, GPT_CAPS);

      // Original unchanged
      expect(original.reasoningContent).toBe('thinking...');
      // Result modified
      expect(result[0].reasoningContent).toBeUndefined();
      // Different object reference
      expect(result[0]).not.toBe(original);
    });
  });

  describe('cache_control gating (Qwen-only)', () => {
    // Build a system message carrying the cacheControl marker that
    // CacheControlStrategy.applyToMessages would have injected.
    function sysWithCacheControl(content: string): ProviderMessage {
      return { role: 'system', content, cacheControl: { type: 'ephemeral' } };
    }

    it('strips cacheControl when target cacheStrategy is not "cache_control"', () => {
      // GPT (response_id) — should drop the marker
      const gptResult = purifyMessages([sysWithCacheControl('you are helpful')], GPT_CAPS);
      expect(gptResult[0].cacheControl).toBeUndefined();

      // DeepSeek (prefix) — should drop the marker
      const dsResult = purifyMessages([sysWithCacheControl('you are helpful')], DEEPSEEK_CAPS);
      expect(dsResult[0].cacheControl).toBeUndefined();

      // MiMo (none) — should drop the marker
      const mimoResult = purifyMessages([sysWithCacheControl('you are helpful')], MIMO_CAPS);
      expect(mimoResult[0].cacheControl).toBeUndefined();
    });

    it('preserves cacheControl when target cacheStrategy is "cache_control" (Qwen)', () => {
      const QWEN_CAPS: ProviderCapabilities = {
        ...DEEPSEEK_CAPS,
        cacheStrategy: 'cache_control',
      };
      const result = purifyMessages([sysWithCacheControl('you are helpful')], QWEN_CAPS);
      expect(result[0].cacheControl).toEqual({ type: 'ephemeral' });
    });

    it('does not mutate original message when stripping cacheControl', () => {
      const original = sysWithCacheControl('you are helpful');
      const messages = [original];
      purifyMessages(messages, GPT_CAPS);
      // Original still carries the marker (purify is non-mutating)
      expect(original.cacheControl).toEqual({ type: 'ephemeral' });
    });
  });
});
