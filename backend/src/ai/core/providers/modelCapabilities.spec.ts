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

  describe('OpenAI GPT (via openai-compatible)', () => {
    it('gpt-4o → no reasoning, no cache, supports developer role', () => {
      const caps = resolveCapabilitiesForModel('gpt-4o');
      expect(caps.reasoningMode).toBe('none');
      expect(caps.cacheStrategy).toBe('none');
      expect(caps.supportsDeveloperRole).toBe(true);
      expect(caps).toBe(GPT_COMPAT_CAPS);
    });

    it('gpt-4.1 → no reasoning', () => {
      const caps = resolveCapabilitiesForModel('gpt-4.1');
      expect(caps.reasoningMode).toBe('none');
      expect(caps.supportsDeveloperRole).toBe(true);
    });

    it('o1-preview → no reasoning (reasoning models handled differently)', () => {
      const caps = resolveCapabilitiesForModel('o1-preview');
      expect(caps.reasoningMode).toBe('none');
      expect(caps).toBe(GPT_COMPAT_CAPS);
    });

    it('o3-mini → no reasoning', () => {
      const caps = resolveCapabilitiesForModel('o3-mini');
      expect(caps.reasoningMode).toBe('none');
    });

    it('o4-mini → no reasoning', () => {
      const caps = resolveCapabilitiesForModel('o4-mini');
      expect(caps.reasoningMode).toBe('none');
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

    it('switching from GPT (via compatible) to MiMo changes reasoning mode', () => {
      const gpt = resolveCapabilitiesForModel('gpt-4o');
      const mimo = resolveCapabilitiesForModel('mimo-v2-pro');
      expect(gpt.reasoningMode).toBe('none'); // GPT: no reasoning_content
      expect(mimo.reasoningMode).toBe('required'); // MiMo: must have reasoning_content
    });
  });
});
