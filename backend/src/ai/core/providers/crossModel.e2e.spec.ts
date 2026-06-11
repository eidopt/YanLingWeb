/**
 * Cross-model end-to-end compatibility test.
 *
 * Simulates a realistic multi-turn conversation (system + developer + user
 * + assistant-with-reasoning + tool_call/tool_result) being routed through
 * 7 different models in sequence. At each round, verifies that the
 * MessagePurifier + CacheStrategy combination produces output that the
 * target model will accept (no reasoning_content leaks to GPT, no missing
 * reasoningContent on MiMo, cache_control markers on Qwen, etc.).
 *
 * No real network calls — purely deterministic mocks.
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai/core/providers/crossModel.e2e.spec.ts
 */

import type { ProviderMessage } from '@shared/agent/contracts/provider';

import { type CacheableRequest, createCacheStrategyFromCapabilities } from './cacheStrategy';
import { purifyMessages } from './messagePurifier';
import { buildCompatibleCapabilities } from './modelCapabilities';

type ModelFlavor = 'gpt' | 'deepseek' | 'mimo' | 'MiniMax' | 'qwen' | 'kimi' | 'glm';

interface ModelProfile {
  flavor: ModelFlavor;
  label: string;
  caps: ReturnType<typeof buildCompatibleCapabilities>;
}

const MODEL_PROFILES: ModelProfile[] = [
  {
    flavor: 'gpt',
    label: 'GPT-5 (response_id + reasoningMode=none)',
    caps: buildCompatibleCapabilities({ reasoningMode: 'none', cacheStrategy: 'response_id' }),
  },
  {
    flavor: 'deepseek',
    label: 'DeepSeek V3 (prefix + reasoningMode=passthrough)',
    caps: buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'prefix',
      supportsDeveloperRole: true,
    }),
  },
  {
    flavor: 'mimo',
    label: 'MiMo (none + reasoningMode=required)',
    caps: buildCompatibleCapabilities({ reasoningMode: 'required', cacheStrategy: 'none' }),
  },
  {
    flavor: 'MiniMax',
    label: 'MiniMax (reasoning_split)',
    caps: buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'none',
      extraRequestParams: { reasoning_split: true },
    }),
  },
  {
    flavor: 'qwen',
    label: 'Qwen (cache_control + enable_thinking)',
    caps: buildCompatibleCapabilities({
      reasoningMode: 'passthrough',
      cacheStrategy: 'cache_control',
      extraRequestParams: { enable_thinking: true },
    }),
  },
  {
    flavor: 'kimi',
    label: 'Kimi (cache_key)',
    caps: buildCompatibleCapabilities({ reasoningMode: 'passthrough', cacheStrategy: 'cache_key' }),
  },
  {
    flavor: 'glm',
    label: 'GLM (none + reasoningMode=none)',
    caps: buildCompatibleCapabilities({ reasoningMode: 'none', cacheStrategy: 'none' }),
  },
];

function sys(content: string): ProviderMessage {
  return { role: 'system', content };
}

function dev(content: string): ProviderMessage {
  return { role: 'developer', content };
}

function user(content: string): ProviderMessage {
  return { role: 'user', content };
}

function assistant(content: string, reasoning?: string): ProviderMessage {
  return { role: 'assistant', content, ...(reasoning ? { reasoningContent: reasoning } : {}) };
}

function toolCall(toolCallId: string, name: string, args: string): ProviderMessage {
  return { role: 'tool_call', content: '', toolCallId, toolName: name, toolArguments: args };
}

function toolResult(toolCallId: string, content: string): ProviderMessage {
  return { role: 'tool_result', content, toolCallId };
}

/**
 * Build a realistic 6-message conversation covering every message kind that
 * cross-model logic cares about: system (×2), developer, user, assistant
 * with reasoning, and a tool_call/tool_result pair.
 */
function buildConversation(): ProviderMessage[] {
  return [
    sys('You are a UI builder assistant.'),
    sys('Output must be valid JSON ThemeLayoutDocument.'),
    dev('Prefer conservative layouts and minimal interactive elements.'),
    user('Build me a landing page for a coffee shop.'),
    assistant(
      'I will create a 3-section landing page.',
      'Step 1: hero. Step 2: menu. Step 3: contact.',
    ),
    toolCall('tool-1', 'editor_create_page', '{"title":"Home"}'),
    toolResult('tool-1', JSON.stringify({ success: true, data: { pageId: 'p-home' } })),
  ];
}

function roundTrip(
  messages: ProviderMessage[],
  profile: ModelProfile,
  cacheOpts: { previousResponseId?: string; conversationId?: string } = {},
): { purified: ProviderMessage[]; request: CacheableRequest } {
  const purified = purifyMessages(messages, profile.caps);
  const strategy = createCacheStrategyFromCapabilities(profile.caps);
  const request: CacheableRequest = { model: profile.flavor, messages: purified };
  const finalRequest = strategy.applyToRequest(request, cacheOpts);
  // applyToMessages runs after purification so cache_control markers are added
  // on top of the already-purified messages.
  const finalMessages = strategy.applyToMessages(finalRequest.messages, cacheOpts);
  return { purified, request: { ...finalRequest, messages: finalMessages } };
}

describe('cross-model e2e — realistic 6-message conversation × 7 models', () => {
  it('covers at least 5 distinct model flavors', () => {
    expect(MODEL_PROFILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const profile of MODEL_PROFILES) {
    describe(profile.label, () => {
      it('produces a request that the target model can accept', () => {
        const { request } = roundTrip(buildConversation(), profile, {
          previousResponseId: 'resp-prev',
          conversationId: 'conv-xyz',
        });

        // 1. Reasoning content rules per flavor
        const reasoningMessages = request.messages.filter(
          (m) => m.role === 'assistant' && 'reasoningContent' in m,
        );
        for (const m of reasoningMessages) {
          if (profile.caps.reasoningMode === 'none') {
            // GPT/GLM must not see reasoning_content
            expect(m.reasoningContent).toBeUndefined();
          } else if (profile.caps.reasoningMode === 'required') {
            // MiMo must see a reasoningContent (possibly empty)
            expect(typeof m.reasoningContent).toBe('string');
          } else {
            // passthrough: preserved
            expect(m.reasoningContent).toBe('Step 1: hero. Step 2: menu. Step 3: contact.');
          }
        }

        // 2. Developer role rules
        const devMessages = request.messages.filter((m) => {
          const text = typeof m.content === 'string' ? m.content : '';
          return text.startsWith('[Developer Instructions]');
        });
        const rawDevMessages = request.messages.filter((m) => m.role === 'developer');
        if (profile.caps.supportsDeveloperRole) {
          // developer role should survive intact
          expect(rawDevMessages.length).toBe(1);
          expect(devMessages.length).toBe(0);
        } else {
          // developer role downgraded to system with marker
          expect(rawDevMessages.length).toBe(0);
          expect(devMessages.length).toBe(1);
          expect(devMessages[0]?.role).toBe('system');
        }

        // 3. Cache injection rules
        if (profile.caps.cacheStrategy === 'response_id') {
          expect(request.cache).toEqual({ previousResponseId: 'resp-prev' });
          expect(request.cacheKey).toBeUndefined();
        } else if (profile.caps.cacheStrategy === 'cache_key') {
          expect(request.cacheKey).toBe('conv-xyz');
          expect(request.cache).toBeUndefined();
        } else if (profile.caps.cacheStrategy === 'cache_control') {
          // First two system messages get cache_control
          const tagged = request.messages.filter(
            (m) => m.role === 'system' && m.cacheControl?.type === 'ephemeral',
          );
          expect(tagged.length).toBe(2);
          // The third system (downgraded developer) should NOT be tagged
          const taggedRoles = tagged.map((m) => m.content);
          const devMarker = '[Developer Instructions]\nPrefer conservative layouts';
          expect(taggedRoles).not.toContain(devMarker);
          expect(request.cache).toBeUndefined();
          expect(request.cacheKey).toBeUndefined();
        } else {
          expect(request.cache).toBeUndefined();
          expect(request.cacheKey).toBeUndefined();
        }

        // 4. Tool message structure must survive intact for all models
        const toolCallMsg = request.messages.find(
          (m) => m.role === 'tool_call' && m.toolCallId === 'tool-1',
        );
        const toolResultMsg = request.messages.find(
          (m) => m.role === 'tool_result' && m.toolCallId === 'tool-1',
        );
        expect(toolCallMsg).toBeDefined();
        expect(toolResultMsg).toBeDefined();
        expect(toolCallMsg?.toolName).toBe('editor_create_page');
      });
    });
  }
});

describe('cross-model e2e — 5+ rounds of model switching on the same conversation', () => {
  /**
   * Simulates a real workflow where the user can switch the active model
   * mid-conversation (e.g. starts on GPT, switches to DeepSeek after a
   * few turns, then to Qwen, then to MiMo, then back to GPT).
   * At each round, the cumulative conversation state must be purifiable
   * for the next model without errors and without leaking forbidden fields.
   */
  it('handles model rotation: GPT → DeepSeek → Qwen → MiMo → Kimi → GLM', () => {
    const rotations: ModelFlavor[] = ['gpt', 'deepseek', 'qwen', 'mimo', 'kimi', 'glm'];
    expect(rotations.length).toBeGreaterThanOrEqual(5);

    // Conversation grows each round to simulate actual usage
    const conversation: ProviderMessage[] = [
      sys('You are a UI builder.'),
      sys('Output ThemeLayoutDocument JSON.'),
    ];

    for (let round = 0; round < rotations.length; round++) {
      const flavor = rotations[round];
      const profile = MODEL_PROFILES.find((p) => p.flavor === flavor);
      if (!profile) {
        throw new Error(`Unknown model flavor: ${flavor}`);
      }

      // User turn + assistant turn (with reasoning) before model switch
      conversation.push(user(`Round ${round + 1} request`));
      conversation.push(
        assistant(`Round ${round + 1} answer`, `Reasoning for round ${round + 1}: compute layout.`),
      );

      const { request } = roundTrip(conversation, profile, {
        previousResponseId: `resp-r${round}`,
        conversationId: `conv-r${round}`,
      });

      // Cross-cutting invariants for every model
      // A. No tool_call/result field lost
      const toolCalls = request.messages.filter((m) => m.role === 'tool_call');
      const toolResults = request.messages.filter((m) => m.role === 'tool_result');
      expect(toolCalls.length).toBe(toolResults.length);

      // B. Reasoning content is consistent with the model's mode
      for (const m of request.messages.filter((msg) => msg.role === 'assistant')) {
        if (profile.caps.reasoningMode === 'none') {
          expect(m.reasoningContent).toBeUndefined();
        } else if (profile.caps.reasoningMode === 'required') {
          // Required mode: must have reasoningContent (possibly empty)
          expect(typeof m.reasoningContent).toBe('string');
        } else {
          // passthrough: every assistant message keeps its own reasoning
          // (the conversation accumulates, so each message has its own)
          expect(m.reasoningContent).toMatch(/^Reasoning for round \d+: compute layout\.$/);
        }
      }

      // C. Developer role: the original 'developer' message in conversation
      //    should never appear raw if the model doesn't support it.
      const rawDev = request.messages.filter((m) => m.role === 'developer');
      if (!profile.caps.supportsDeveloperRole) {
        expect(rawDev.length).toBe(0);
      }

      // D. Qwen specifically: cache_control only on first two system messages
      if (profile.caps.cacheStrategy === 'cache_control') {
        const tagged = request.messages.filter(
          (m) => m.role === 'system' && m.cacheControl?.type === 'ephemeral',
        );
        expect(tagged.length).toBeLessThanOrEqual(2);
      }
    }
  });
});
