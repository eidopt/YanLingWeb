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
    it('mimo-v2.5-pro → required reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('mimo-v2.5-pro');
      expect(caps.reasoningMode).toBe('required');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MIMO_CAPS);
    });

    it('mimo-v2.5-flash → required reasoning', () => {
      const caps = resolveCapabilitiesForModel('mimo-v2.5-flash');
      expect(caps.reasoningMode).toBe('required');
      expect(caps).toBe(MIMO_CAPS);
    });
  });

  describe('MiniMax', () => {
    it('minimax-m3 → passthrough reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('minimax-m3');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(MINIMAX_CAPS);
    });
  });

  describe('DeepSeek', () => {
    it('deepseek-v4-pro → passthrough reasoning, prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-v4-pro');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('prefix');
      expect(caps).toBe(DEEPSEEK_CAPS);
    });

    it('deepseek-v4-flash → prefix cache', () => {
      const caps = resolveCapabilitiesForModel('deepseek-v4-flash');
      expect(caps.cacheStrategy).toBe('prefix');
      expect(caps).toBe(DEEPSEEK_CAPS);
    });
  });

  describe('Kimi (Moonshot)', () => {
    it('kimi-v2.6 → passthrough reasoning, cache_key', () => {
      const caps = resolveCapabilitiesForModel('kimi-v2.6');
      expect(caps.reasoningMode).toBe('passthrough');
      expect(caps.cacheStrategy).toBe('cache_key');
      expect(caps).toBe(KIMI_CAPS);
    });
  });

  describe('GLM (Zhipu)', () => {
    it('glm-5.1 → no reasoning, no cache', () => {
      const caps = resolveCapabilitiesForModel('glm-5.1');
      expect(caps.reasoningMode).toBe('none');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps).toBe(GLM_CAPS);
    });
  });

  describe('Qwen (Alibaba)', () => {
    it('qwen-3.7 → passthrough reasoning, cache_control', () => {
      const caps = resolveCapabilitiesForModel('qwen-3.7');
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
      const ds = resolveCapabilitiesForModel('deepseek-v4-pro');
      const mimo = resolveCapabilitiesForModel('mimo-v2.5-pro');
      expect(ds.reasoningMode).toBe('passthrough');
      expect(mimo.reasoningMode).toBe('required');
    });

    it('switching from GPT-5.5 to MiMo changes reasoning mode', () => {
      const gpt = resolveCapabilitiesForModel('gpt-5.5');
      const mimo = resolveCapabilitiesForModel('mimo-v2.5-pro');
      expect(gpt.reasoningMode).toBe('none');
      expect(mimo.reasoningMode).toBe('required');
    });
  });
});
