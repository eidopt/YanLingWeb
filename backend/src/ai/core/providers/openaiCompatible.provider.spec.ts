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

describe('OpenAICompatibleProvider WP2 fixes', () => {
  it('captures trailing choices: [] usage chunk with cached_tokens', async () => {
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test');
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue([
            {
              id: 'resp-1',
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call-1',
                        function: { name: 'submit_x', arguments: '{"a":1}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            },
            {
              id: 'resp-1',
              choices: [],
              usage: {
                prompt_tokens: 120,
                completion_tokens: 30,
                prompt_tokens_details: { cached_tokens: 80 },
              },
            },
          ]),
        },
      },
    };
    (provider as unknown as { client: unknown }).client = mockClient;

    const events: { type: string; usage?: unknown; name?: string }[] = [];
    for await (const ev of provider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(ev);
    }

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'done']);
    const done = events.find((e) => e.type === 'done');
    expect(done?.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      cacheHitTokens: 80,
      cacheMissTokens: 40,
    });
  });

  it('forwards prompt_cache_key only when cacheStrategy is cache_key', async () => {
    const kimiProvider = new OpenAICompatibleProvider('test-key', undefined, 'kimi', {
      cacheStrategy: 'cache_key',
    });
    const plainProvider = new OpenAICompatibleProvider('test-key', undefined, 'plain', {
      cacheStrategy: 'prefix',
    });
    const kimiCreate = jest
      .fn<Promise<unknown>, [Record<string, unknown>, ...unknown[]]>()
      .mockResolvedValue([
        { id: 'r1', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
      ]);
    const plainCreate = jest
      .fn<Promise<unknown>, [Record<string, unknown>, ...unknown[]]>()
      .mockResolvedValue([
        { id: 'r2', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
      ]);
    (kimiProvider as unknown as { client: unknown }).client = {
      chat: { completions: { create: kimiCreate } },
    };
    (plainProvider as unknown as { client: unknown }).client = {
      chat: { completions: { create: plainCreate } },
    };

    for await (const _ev of kimiProvider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      cacheKey: 'conv-abc',
    })) {
      // drain
    }
    for await (const _ev of plainProvider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      cacheKey: 'conv-abc',
    })) {
      // drain
    }

    expect(kimiCreate.mock.calls[0][0].prompt_cache_key).toBe('conv-abc');
    expect(plainCreate.mock.calls[0][0].prompt_cache_key).toBeUndefined();
  });

  it('maps toolChoice and falls back cleanly on 400 tool_choice error', async () => {
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test');
    const createMock = jest
      .fn<Promise<unknown>, [Record<string, unknown>, ...unknown[]]>()
      .mockRejectedValueOnce(
        Object.assign(new Error('thinking mode does not support tool_choice'), { status: 400 }),
      )
      .mockResolvedValueOnce([
        {
          id: 'r1',
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'c1', function: { name: 'submit_x', arguments: '{}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'r2',
          choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
        },
      ]);
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const tool = { name: 'submit_x', description: 'submit', parameters: { type: 'object' } };
    const events: { type: string }[] = [];
    for await (const ev of provider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
      toolChoice: { type: 'function', name: 'submit_x' },
    })) {
      events.push(ev);
    }

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'done']);
    expect(createMock.mock.calls[0][0].tool_choice).toEqual({
      type: 'function',
      function: { name: 'submit_x' },
    });
    expect(createMock.mock.calls[1][0].tool_choice).toBeUndefined();

    // Subsequent call remembers runtime downgrade and omits forced tool_choice immediately
    for await (const _ev of provider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi2' }],
      tools: [tool],
      toolChoice: { type: 'function', name: 'submit_x' },
    })) {
      // drain
    }
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(createMock.mock.calls[2][0].tool_choice).toBeUndefined();
  });

  it('isolates per-request AbortSignal across concurrent streams', async () => {
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test');
    const capturedSignals: AbortSignal[] = [];
    const createMock = jest
      .fn()
      .mockImplementation((_params: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) {
          capturedSignals.push(opts.signal);
        }
        return Promise.resolve([
          { id: 'r', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
        ]);
      });
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const controller1 = new AbortController();
    const controller2 = new AbortController();

    const iter1 = provider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'one' }],
      signal: controller1.signal,
    });
    const iter2 = provider.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'two' }],
      signal: controller2.signal,
    });

    controller1.abort();

    const events1: unknown[] = [];
    for await (const ev of iter1) {
      events1.push(ev);
    }
    const events2: { type: string }[] = [];
    for await (const ev of iter2) {
      events2.push(ev);
    }

    expect(events1).toHaveLength(0);
    expect(events2.map((e) => e.type)).toEqual(['text_delta', 'done']);
    expect(capturedSignals).toHaveLength(1);
    expect(capturedSignals[0].aborted).toBe(false);
  });
});
