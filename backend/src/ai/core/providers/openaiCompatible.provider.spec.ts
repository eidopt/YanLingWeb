import { OpenAICompatibleProvider } from './openaiCompatible.provider';

// 跳过真实 LLM 调用, 用 mock OpenAI client 验证 reasoning_content 实时 yield
describe('OpenAICompatibleProvider reasoning streaming', () => {
  it('yields reasoning_delta events for each reasoning_content chunk', async () => {
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test');
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue([
            // 第一个 chunk: reasoning 增量 1
            {
              id: 'r1',
              choices: [{ delta: { reasoning_content: 'Let me ' }, finish_reason: null }],
            },
            // 第二个 chunk: reasoning 增量 2
            { id: 'r1', choices: [{ delta: { reasoning_content: 'think' }, finish_reason: null }] },
            // 第三个 chunk: 文本 + finish
            { id: 'r1', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
          ]),
        },
      },
    };
    // 替换内部 client (用类型 any 绕过私有访问)
    (provider as unknown as { client: unknown }).client = mockClient;

    const events: { type: string; text?: string; reasoningContent?: string }[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }

    const reasoningDeltas = events.filter((e) => e.type === 'reasoning_delta');
    expect(reasoningDeltas).toHaveLength(2);
    expect(reasoningDeltas[0]).toEqual({ type: 'reasoning_delta', text: 'Let me ' });
    expect(reasoningDeltas[1]).toEqual({ type: 'reasoning_delta', text: 'think' });

    // done 事件仍包含聚合的 reasoningContent (兜底)
    const done = events.find((e) => e.type === 'done');
    expect(done?.reasoningContent).toBe('Let me think');
  });
});

// Defense-in-depth: cache_control field must not leak to providers that
// don't support it. We assert this by capturing the wire-level messages
// the mock OpenAI client receives.
describe('OpenAICompatibleProvider cache_control gating', () => {
  function buildProviderWithCapture(caps: { cacheStrategy: string }) {
    let captured: { messages: unknown[] } | undefined;
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockImplementation((params: { messages: unknown[] }) => {
            captured = { messages: params.messages };
            return Promise.resolve([
              { id: 'r1', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
            ]);
          }),
        },
      },
    };
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test', {
      cacheStrategy: caps.cacheStrategy as never,
    });
    (provider as unknown as { client: unknown }).client = mockClient;
    return {
      provider,
      getCaptured: () => captured,
    };
  }

  it('does NOT emit cache_control on system messages for response_id (GPT)', async () => {
    const { provider, getCaptured } = buildProviderWithCapture({ cacheStrategy: 'response_id' });
    for await (const _ev of provider.stream({
      model: 'm',
      messages: [
        {
          role: 'system',
          content: 'sys',
          // Simulate a marker injected upstream by an unrelated strategy
          cacheControl: { type: 'ephemeral' },
        },
      ],
    })) {
      // drain
    }
    const wireMessages = getCaptured()?.messages as Record<string, unknown>[];
    expect(wireMessages).toBeDefined();
    expect(wireMessages[0].role).toBe('system');
    expect(wireMessages[0].cache_control).toBeUndefined();
  });

  it('does NOT emit cache_control when target cacheStrategy is "prefix" (DeepSeek)', async () => {
    const { provider, getCaptured } = buildProviderWithCapture({ cacheStrategy: 'prefix' });
    for await (const _ev of provider.stream({
      model: 'm',
      messages: [{ role: 'system', content: 'sys', cacheControl: { type: 'ephemeral' } }],
    })) {
      // drain
    }
    const wireMessages = getCaptured()?.messages as Record<string, unknown>[];
    expect(wireMessages[0].cache_control).toBeUndefined();
  });

  it('emits cache_control on system messages for cache_control target (Qwen)', async () => {
    const { provider, getCaptured } = buildProviderWithCapture({
      cacheStrategy: 'cache_control',
    });
    for await (const _ev of provider.stream({
      model: 'm',
      messages: [{ role: 'system', content: 'sys', cacheControl: { type: 'ephemeral' } }],
    })) {
      // drain
    }
    const wireMessages = getCaptured()?.messages as Record<string, unknown>[];
    expect(wireMessages[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
