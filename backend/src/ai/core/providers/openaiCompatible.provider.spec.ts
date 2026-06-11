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
