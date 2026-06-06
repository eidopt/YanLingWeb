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
  GPT_COMPAT_CAPS,
} from './modelCapabilities';

describe('resolveCapabilitiesForModel', () => {
  describe('MiMo (Xiaomi)', () => {
    it('mimo → required reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('mimo');
      expect(caps.reasoningMode).toBe('required');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MIMO_CAPS);
    });
  });

  describe('MiniMax', () => {
    it('minimax-m2.7 → passthrough reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('minimax-m2.7');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MINIMAX_CAPS);
    });
  });

  describe('DeepSeek', () => {
    it('deepseek-chat → passthrough reasoning, prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-chat');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('prefix');
      expect(caps).toBe(DEEPSEEK_CAPS);
    });

    it('deepseek-reasoner → prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-reasoner');
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

  describe('OpenAI GPT', () => {
    it('gpt-5.5 → no reasoning, supports developer role', () => {
      const caps = resolveCapabilitiesForModel('gpt-5.5');
      expect(caps.reasoningMode).toBe('none');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps.supportsDeveloperRole).toBe(true);
      expect(caps).toBe(GPT_COMPAT_CAPS);
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

    it('switching from GPT-5.5 to MiMo changes reasoning mode', () => {
      const gpt = resolveCapabilitiesForModel('gpt-5.5');
      const mimo = resolveCapabilitiesForModel('mimo-v2-pro');
      expect(gpt.reasoningMode).toBe('none');
      expect(mimo.reasoningMode).toBe('required');
    });
  });
});
