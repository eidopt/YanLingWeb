/**
 * Model Capabilities tests — config-driven, no hardcoded model names.
 * Run: npx vitest run backend/src/ai/core/providers/modelCapabilities.spec.ts
 */
import { describe, expect, it, afterEach } from 'vitest';

import { buildCompatibleCapabilities } from './modelCapabilities';

describe('buildCompatibleCapabilities', () => {
  afterEach(() => {
    delete process.env.AI_REASONING_MODE;
    delete process.env.AI_CACHE_STRATEGY;
    delete process.env.AI_SUPPORTS_DEVELOPER_ROLE;
  });

  it('returns sensible defaults when no env vars set', () => {
    const caps = buildCompatibleCapabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsToolCalls).toBe(true);
    expect(caps.reasoningMode).toBe('passthrough');
    expect(caps.cacheStrategy).toBe('none');
    expect(caps.supportsDeveloperRole).toBe(false);
  });

  it('overrides reasoningMode from AI_REASONING_MODE', () => {
    process.env.AI_REASONING_MODE = 'required';
    const caps = buildCompatibleCapabilities();
    expect(caps.reasoningMode).toBe('required');
  });

  it('overrides reasoningMode to none', () => {
    process.env.AI_REASONING_MODE = 'none';
    const caps = buildCompatibleCapabilities();
    expect(caps.reasoningMode).toBe('none');
  });

  it('ignores invalid reasoningMode', () => {
    process.env.AI_REASONING_MODE = 'invalid';
    const caps = buildCompatibleCapabilities();
    expect(caps.reasoningMode).toBe('passthrough'); // unchanged
  });

  it('overrides cacheStrategy from AI_CACHE_STRATEGY', () => {
    process.env.AI_CACHE_STRATEGY = 'prefix';
    const caps = buildCompatibleCapabilities();
    expect(caps.cacheStrategy).toBe('prefix');
  });

  it('overrides cacheStrategy to cache_key', () => {
    process.env.AI_CACHE_STRATEGY = 'cache_key';
    const caps = buildCompatibleCapabilities();
    expect(caps.cacheStrategy).toBe('cache_key');
  });

  it('overrides supportsDeveloperRole', () => {
    process.env.AI_SUPPORTS_DEVELOPER_ROLE = 'true';
    const caps = buildCompatibleCapabilities();
    expect(caps.supportsDeveloperRole).toBe(true);
  });

  it('all overrides combined', () => {
    process.env.AI_REASONING_MODE = 'required';
    process.env.AI_CACHE_STRATEGY = 'prefix';
    process.env.AI_SUPPORTS_DEVELOPER_ROLE = 'true';
    const caps = buildCompatibleCapabilities();
    expect(caps.reasoningMode).toBe('required');
    expect(caps.cacheStrategy).toBe('prefix');
    expect(caps.supportsDeveloperRole).toBe(true);
  });
});
