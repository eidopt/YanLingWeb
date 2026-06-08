/**
 * Model Capabilities tests — config-driven, no hardcoded model names.
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai/core/providers/modelCapabilities.spec.ts
 */

import { buildCompatibleCapabilities } from './modelCapabilities';

describe('buildCompatibleCapabilities', () => {
  it('returns sensible defaults when no overrides provided', () => {
    const caps = buildCompatibleCapabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.supportsToolCalls).toBe(true);
    expect(caps.reasoningMode).toBe('passthrough');
    expect(caps.cacheStrategy).toBe('none');
    expect(caps.supportsDeveloperRole).toBe(false);
    expect(caps.extraRequestParams).toBeUndefined();
  });

  it('applies reasoningMode override', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'required' });
    expect(caps.reasoningMode).toBe('required');
  });

  it('applies reasoningMode none', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'none' });
    expect(caps.reasoningMode).toBe('none');
  });

  it('applies cacheStrategy override', () => {
    const caps = buildCompatibleCapabilities({ cacheStrategy: 'prefix' });
    expect(caps.cacheStrategy).toBe('prefix');
  });

  it('applies cacheStrategy cache_key', () => {
    const caps = buildCompatibleCapabilities({ cacheStrategy: 'cache_key' });
    expect(caps.cacheStrategy).toBe('cache_key');
  });

  it('applies supportsDeveloperRole override', () => {
    const caps = buildCompatibleCapabilities({ supportsDeveloperRole: true });
    expect(caps.supportsDeveloperRole).toBe(true);
  });

  it('applies extraRequestParams', () => {
    const caps = buildCompatibleCapabilities({ extraRequestParams: { reasoning_split: true } });
    expect(caps.extraRequestParams).toEqual({ reasoning_split: true });
  });

  it('applies extraRequestParams with multiple keys', () => {
    const caps = buildCompatibleCapabilities({
      extraRequestParams: { enable_thinking: true, max_tokens: 4096 },
    });
    expect(caps.extraRequestParams).toEqual({ enable_thinking: true, max_tokens: 4096 });
  });

  it('leaves extraRequestParams undefined when not provided', () => {
    const caps = buildCompatibleCapabilities({ reasoningMode: 'none' });
    expect(caps.extraRequestParams).toBeUndefined();
  });

  it('all overrides combined', () => {
    const caps = buildCompatibleCapabilities({
      reasoningMode: 'required',
      cacheStrategy: 'prefix',
      supportsDeveloperRole: true,
      extraRequestParams: { enable_thinking: true },
    });
    expect(caps.reasoningMode).toBe('required');
    expect(caps.cacheStrategy).toBe('prefix');
    expect(caps.supportsDeveloperRole).toBe(true);
    expect(caps.extraRequestParams).toEqual({ enable_thinking: true });
  });

  it('does not mutate defaults when overrides are partial', () => {
    const caps1 = buildCompatibleCapabilities({ reasoningMode: 'none' });
    const caps2 = buildCompatibleCapabilities();
    expect(caps2.reasoningMode).toBe('passthrough');
    expect(caps1.reasoningMode).toBe('none');
  });
});
