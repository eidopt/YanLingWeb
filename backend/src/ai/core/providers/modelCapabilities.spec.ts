/**
 * Model Capabilities Registry tests
 * Run: npx vitest run backend/src/ai/core/providers/modelCapabilities.spec.ts
 */
import { describe, expect, it } from 'vitest';

import {
  resolveCapabilitiesForModel,
  DEEPSEEK_CAPS,
  MIMO_CAPS,
  MINIMAX_CAPS,
  KIMI_CAPS,
  GLM_CAPS,
  QWEN_CAPS,
} from './modelCapabilities';

describe('resolveCapabilitiesForModel', () => {
  describe('MiMo (Xiaomi)', () => {
    it('mimo-v2-pro → required reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('mimo-v2-pro');
      expect(caps.reasoningMode).toBe('required');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MIMO_CAPS);
    });

    it('MiMo-7B → required reasoning (case-insensitive)', () => {
      const caps = resolveCapabilitiesForModel('MiMo-7B');
      expect(caps.reasoningMode).toBe('required');
    });
  });

  describe('MiniMax', () => {
    it('minimax-m2.7 → passthrough reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('minimax-m2.7');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MINIMAX_CAPS);
    });

    it('MiniMax-M1 → passthrough reasoning', () => {
      const caps = resolveCapabilitiesForModel('MiniMax-M1');
      expect(caps.reasoningMode).toBe('passthrough');
    });
  });

  describe('DeepSeek', () => {
    it('deepseek-chat → passthrough reasoning, prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-chat');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('prefix');
      expect(caps).toBe(DEEPSEEK_CAPS);
    });

    it('deepseek-v4-pro → prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-v4-pro');
      expect(caps.cacheStrategy).toBe('prefix');
    });
  });

  describe('Kimi (Moonshot)', () => {
    it('kimi-k2 → passthrough reasoning, cache_key', () => {
      const caps = resolveCapabilitiesForModel('kimi-k2');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('cache_key');
      expect(caps).toBe(KIMI_CAPS);
    });

    it('moonshot-v1 → cache_key (via moonshot pattern)', () => {
      const caps = resolveCapabilitiesForModel('moonshot-v1');
      expect(caps.cacheStrategy).toBe('cache_key');
    });
  });

  describe('GLM (Zhipu)', () => {
    it('glm-4.6 → no reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('glm-4.6');
      expect(caps.reasoningMode).toBe('none');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(GLM_CAPS);
    });
  });

  describe('Qwen (Alibaba)', () => {
    it('qwen3-235b → passthrough reasoning, cache_control', () => {
      const caps = resolveCapabilitiesForModel('qwen3-235b');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('cache_control');
      expect(caps).toBe(QWEN_CAPS);
    });
  });

  describe('unknown models', () => {
    it('unknown-model → default passthrough, no cache', () => {
      const caps = resolveCapabilitiesForModel('unknown-model');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps.supportsDeveloperRole).toBe(false);
    });

    it('empty string → defaults', () => {
      const caps = resolveCapabilitiesForModel('');
      expect(caps.reasoningMode).toBe('passthrough');
    });
  });

  describe('cross-model switch capabilities', () => {
    it('switching from DeepSeek to MiMo changes reasoning mode', () => {
      const ds = resolveCapabilitiesForModel('deepseek-chat');
      const mimo = resolveCapabilitiesForModel('mimo-v2-pro');
      expect(ds.reasoningMode).toBe('passthrough');
      expect(mimo.reasoningMode).toBe('required');
    });

    it('switching from GPT (not in registry) to MiMo changes reasoning mode', () => {
      // GPT doesn't go through this registry (uses OpenAIProvider),
      // but if someone uses it as compatible:
      const gpt = resolveCapabilitiesForModel('gpt-5.4');
      const mimo = resolveCapabilitiesForModel('mimo-v2-pro');
      expect(gpt.reasoningMode).toBe('passthrough'); // default
      expect(mimo.reasoningMode).toBe('required');
    });
  });
});
