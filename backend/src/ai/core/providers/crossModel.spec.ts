/**
 * Cross-model compatibility tests.
 *
 * Verifies that CacheStrategy, MessagePurifier, and ProviderCapabilities
 * work correctly for all supported model types.
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai/core/providers/crossModel.spec.ts
 */

import type { ProviderMessage } from '@shared/agent/contracts/provider';

import { type CacheableRequest, createCacheStrategy } from './cacheStrategy';
import { purifyMessages } from './messagePurifier';
import { buildCompatibleCapabilities } from './modelCapabilities';

function sys(content: string): ProviderMessage {
  return { role: 'system', content };
}

function user(content: string): ProviderMessage {
  return { role: 'user', content };
}

function assistant(content: string, reasoning?: string): ProviderMessage {
  return { role: 'assistant', content, ...(reasoning ? { reasoningContent: reasoning } : {}) };
}

describe('CacheStrategy.applyToMessages', () => {
  it('CacheControlStrategy injects cache_control on first two system messages', () => {
    const strategy = createCacheStrategy('cache_control');
    const messages = [sys('system-1'), sys('system-2'), user('hello'), sys('system-3')];
    const result = strategy.applyToMessages(messages);

    const cc = { cacheControl: { type: 'ephemeral' } };
    expect(result[0]).toEqual({ role: 'system', content: 'system-1', ...cc });
    expect(result[1]).toEqual({ role: 'system', content: 'system-2', ...cc });
    expect(result[2]).toEqual({ role: 'user', content: 'hello' });
    // Third system message should NOT get cache_control (limit is 2)
    expect(result[3]).toEqual({ role: 'system', content: 'system-3' });
  });

  it('CacheKeyStrategy returns messages unchanged', () => {
    const strategy = createCacheStrategy('cache_key');
    const messages = [sys('s'), user('u')];
    const result = strategy.applyToMessages(messages);
    expect(result).toEqual(messages);
  });

  it('PrefixCacheStrategy returns messages unchanged', () => {
    const strategy = createCacheStrategy('prefix');
    const messages = [sys('s'), user('u')];
    const result = strategy.applyToMessages(messages);
    expect(result).toEqual(messages);
  });

  it('ResponseIdCacheStrategy returns messages unchanged', () => {
    const strategy = createCacheStrategy('response_id');
    const messages = [sys('s'), user('u')];
    const result = strategy.applyToMessages(messages);
    expect(result).toEqual(messages);
  });

  it('NoCacheStrategy returns messages unchanged', () => {
    const strategy = createCacheStrategy('none');
    const messages = [sys('s'), user('u')];
    const result = strategy.applyToMessages(messages);
    expect(result).toEqual(messages);
  });
});

describe('CacheStrategy.applyToRequest', () => {
  it('ResponseIdCacheStrategy injects previousResponseId', () => {
    const strategy = createCacheStrategy('response_id');
    const req: CacheableRequest = { model: 'gpt-4', messages: [user('hi')] };
    const result = strategy.applyToRequest(req, { previousResponseId: 'resp-123' });
    expect(result.cache).toEqual({ previousResponseId: 'resp-123' });
  });

  it('ResponseIdCacheStrategy without previousResponseId is no-op', () => {
    const strategy = createCacheStrategy('response_id');
    const req: CacheableRequest = { model: 'gpt-4', messages: [user('hi')] };
    const result = strategy.applyToRequest(req);
    expect(result.cache).toBeUndefined();
  });

  it('CacheKeyStrategy injects cacheKey from conversationId', () => {
    const strategy = createCacheStrategy('cache_key');
    const req: CacheableRequest = { model: 'kimi-k2', messages: [user('hi')] };
    const result = strategy.applyToRequest(req, { conversationId: 'conv-456' });
    expect(result.cacheKey).toBe('conv-456');
  });
});

describe('MessagePurifier cross-model', () => {
  it('GPT (reasoningMode=none): strips reasoning_content', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'none' });
    const messages = [assistant('hello', 'my-reasoning')];
    const result = purifyMessages(messages, caps);
    expect(result[0].reasoningContent).toBeUndefined();
  });

  it('DeepSeek (reasoningMode=passthrough): preserves reasoning_content', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'passthrough' });
    const messages = [assistant('hello', 'my-reasoning')];
    const result = purifyMessages(messages, caps);
    expect(result[0].reasoningContent).toBe('my-reasoning');
  });

  it('MiMo (reasoningMode=required): fills empty reasoningContent', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'required' });
    const messages = [assistant('hello')];
    const result = purifyMessages(messages, caps);
    expect(result[0].reasoningContent).toBe('');
  });

  it('MiMo (reasoningMode=required): preserves existing reasoningContent', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'required' });
    const messages = [assistant('hello', 'existing-reasoning')];
    const result = purifyMessages(messages, caps);
    expect(result[0].reasoningContent).toBe('existing-reasoning');
  });

  it('developer role downgraded to system when not supported', () => {
    const caps = buildCompatibleCapabilities({ supportsDeveloperRole: false });
    const messages: ProviderMessage[] = [{ role: 'developer', content: 'dev instructions' }];
    const result = purifyMessages(messages, caps);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe('[Developer Instructions]\ndev instructions');
  });

  it('developer role preserved when supported', () => {
    const caps = buildCompatibleCapabilities({ supportsDeveloperRole: true });
    const messages: ProviderMessage[] = [{ role: 'developer', content: 'dev instructions' }];
    const result = purifyMessages(messages, caps);
    expect(result[0].role).toBe('developer');
    expect(result[0].content).toBe('dev instructions');
  });
});

describe('ProviderCapabilities per model type', () => {
  it('DeepSeek config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'prefix',
      supportsDeveloperRole: true,
    });
    expect(caps.reasoningMode).toBe('passthrough');
    expect(caps.cacheStrategy).toBe('prefix');
    expect(caps.supportsDeveloperRole).toBe(true);
  });

  it('MiMo config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'required',
      cacheStrategy: 'none',
    });
    expect(caps.reasoningMode).toBe('required');
    expect(caps.cacheStrategy).toBe('none');
  });

  it('MiniMax config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'none',
      extraRequestParams: { reasoning_split: true },
    });
    expect(caps.reasoningMode).toBe('passthrough');
    expect(caps.extraRequestParams).toEqual({ reasoning_split: true });
  });

  it('Qwen config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'cache_control',
      extraRequestParams: { enable_thinking: true },
    });
    expect(caps.cacheStrategy).toBe('cache_control');
    expect(caps.extraRequestParams).toEqual({ enable_thinking: true });
  });

  it('Kimi config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'cache_key',
    });
    expect(caps.cacheStrategy).toBe('cache_key');
  });

  it('GLM config', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'none',
      cacheStrategy: 'none',
    });
    expect(caps.reasoningMode).toBe('none');
    expect(caps.cacheStrategy).toBe('none');
  });
});
