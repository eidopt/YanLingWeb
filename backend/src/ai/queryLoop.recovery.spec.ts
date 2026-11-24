import type {
  AIProvider,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from '@shared/agent/contracts/provider';
import { compactProviderMessages, QueryLoop } from '@shared/agent/runtime';

const capabilities: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: false,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  supportsForcedToolChoice: true,
  reasoningMode: 'none',
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

const tool: ProviderTool = {
  name: 'editor_update_props',
  description: 'Update props',
  parameters: { type: 'object' },
};

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  readonly requests: ProviderRequest[] = [];

  constructor(
    private readonly batches: ProviderStreamEvent[][],
    private readonly customCapabilities: ProviderCapabilities = capabilities,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return this.customCapabilities;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(structuredClone(request));
    await Promise.resolve();
    const batch = this.batches.shift() ?? [];
    for (const event of batch) {
      yield event;
    }
  }

  cancel(): void {
    // Test provider has no live request.
  }
}

function loop(
  provider: AIProvider,
  messages: ProviderMessage[] = [{ role: 'user', content: '改标题' }],
) {
  return new QueryLoop({
    provider,
    model: 'test-model',
    tools: [tool],
    toolSpecs: new Map([[tool.name, { name: tool.name, supportsParallel: false }]]),
    maxContextTokens: 128_000,
    isCancelled: () => false,
    onTextDelta: () => undefined,
    onToolEvent: () => undefined,
    toolExecutor: () => Promise.resolve({ output: JSON.stringify({ success: true }) }),
  }).run(messages);
}

describe('QueryLoop recovery', () => {
  it('retries a retryable error event before any output', async () => {
    const provider = new FakeProvider([
      [{ type: 'error', message: '429 rate limit' }],
      [
        { type: 'text_delta', text: '好的' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const result = await loop(provider);

    expect(provider.requests).toHaveLength(2);
    expect(result.stopReason).toBe('completed');
    expect(result.finalText).toBe('好的');
    expect(result.error).toBeUndefined();
  });

  it('sends only new tool results when continuing an OpenAI response chain', async () => {
    const provider = new FakeProvider(
      [
        [
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'editor_update_props',
            arguments: '{"nodeId":"title"}',
          },
          { type: 'done', stopReason: 'end_turn', response_id: 'resp-1' },
        ],
        [
          { type: 'text_delta', text: '已改' },
          { type: 'done', stopReason: 'end_turn', response_id: 'resp-2' },
        ],
      ],
      { ...capabilities, cacheStrategy: 'response_id' },
    );

    const result = await loop(provider, [
      { role: 'system', content: 'stable prompt' },
      { role: 'user', content: '改标题' },
    ]);

    expect(result.stopReason).toBe('completed');
    expect(result.responseId).toBe('resp-2');
    expect(provider.requests[0]?.cache).toBeUndefined();
    expect(provider.requests[0]?.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
    ]);
    expect(provider.requests[1]?.cache).toEqual({ previousResponseId: 'resp-1' });
    expect(provider.requests[1]?.messages.map((message) => message.role)).toEqual(['tool_result']);
  });

  it('raises the output ceiling after an empty max_tokens stop', async () => {
    const provider = new FakeProvider([
      [{ type: 'done', stopReason: 'max_tokens' }],
      [
        { type: 'text_delta', text: '继续' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const result = await loop(provider);

    expect(result.finalText).toBe('继续');
    expect(provider.requests[0]?.maxTokens).toBeUndefined();
    expect(provider.requests[1]?.maxTokens).toBe(8192);
  });
});

describe('compactProviderMessages', () => {
  it('does not start the kept tail on an orphan tool result', () => {
    const messages: ProviderMessage[] = [
      { role: 'user', content: 'old goal' },
      {
        role: 'tool_call',
        content: '',
        toolCallId: 'call-9',
        toolName: 'editor_update_props',
        toolArguments: '{}',
      },
      { role: 'tool_result', content: '{"success":true}', toolCallId: 'call-9' },
      ...Array.from({ length: 11 }, (_, index) => ({
        role: 'user' as const,
        content: `note ${index}`,
      })),
    ];

    const compacted = compactProviderMessages(messages);
    const kept = compacted.slice(1);
    expect(kept[0]?.role).toBe('tool_call');
    expect(
      kept.some((message) => message.role === 'tool_result' && message.toolCallId === 'call-9'),
    ).toBe(true);
    expect(
      kept.some(
        (message) =>
          message.role === 'tool_result' &&
          !kept.some((call) => call.role === 'tool_call' && call.toolCallId === message.toolCallId),
      ),
    ).toBe(false);
  });
});
