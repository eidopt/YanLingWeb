import type {
  AIProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from '@shared/agent/contracts/provider';

import type { AiTemplatePipelineProvider } from '../../ai/pipelineProvider.port';
import { runStructuredStage } from './runStage';

interface ParsedResult {
  value: string;
}

interface ParseFeedback {
  error?: unknown;
  hint?: unknown;
}

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

const resultTool: ProviderTool = {
  name: 'submit_result',
  description: 'Submit the structured result.',
  parameters: {
    type: 'object',
    properties: {
      value: { type: 'string' },
    },
    required: ['value'],
  },
};

class FakeProvider implements AIProvider {
  readonly name = 'fake-provider';
  readonly requests: ProviderRequest[] = [];

  constructor(
    private readonly batches: ProviderStreamEvent[][],
    private readonly customCapabilities: ProviderCapabilities = capabilities,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return this.customCapabilities;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    await Promise.resolve();
    const batch = this.batches.shift() ?? [];
    for (const event of batch) {
      yield event;
    }
  }

  cancel(): void {
    // No-op test provider.
  }
}

function parseResult(args: Record<string, unknown>): ParsedResult {
  if (typeof args.value !== 'string') {
    throw new Error('value must be a string');
  }
  return { value: args.value };
}

function parseFeedback(content: string): ParseFeedback {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  return { error: record.error, hint: record.hint };
}

function createOptions(provider: AIProvider, maxIterations?: number) {
  return {
    provider,
    model: 'test-model',
    systemPrompt: 'Return structured data.',
    userMessage: 'Create a result.',
    tool: resultTool,
    parse: parseResult,
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  };
}

describe('runStructuredStage', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('captures the target tool output and aggregates usage', async () => {
    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-1',
          name: 'submit_result',
          arguments: JSON.stringify({ value: 'accepted' }),
        },
        {
          type: 'done',
          usage: { inputTokens: 10, outputTokens: 4, cacheHitTokens: 3 },
        },
      ],
    ]);

    const result = await runStructuredStage(createOptions(provider));

    expect(result).toEqual({
      output: { value: 'accepted' },
      usage: { inputTokens: 10, outputTokens: 4, cacheHitTokens: 3 },
      iterations: 1,
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].model).toBe('test-model');
    expect(provider.requests[0].tools).toEqual([resultTool]);
    expect(provider.requests[0].toolChoice).toEqual({ type: 'function', name: 'submit_result' });
    expect(provider.requests[0].messages.slice(0, 2)).toEqual([
      { role: 'system', content: 'Return structured data.' },
      { role: 'user', content: 'Create a result.' },
    ]);
  });

  it('allows retry after parse feedback and accepts the corrected tool call', async () => {
    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-1',
          name: 'submit_result',
          arguments: JSON.stringify({ value: 123 }),
        },
        { type: 'done' },
      ],
      [
        {
          type: 'tool_call',
          id: 'call-2',
          name: 'submit_result',
          arguments: JSON.stringify({ value: 'corrected' }),
        },
        { type: 'done' },
      ],
    ]);

    const result = await runStructuredStage(createOptions(provider));

    expect(result.output).toEqual({ value: 'corrected' });
    expect(result.iterations).toBe(2);
    expect(provider.requests).toHaveLength(2);
    const feedbackMessage = provider.requests[1].messages.find(
      (message) => message.role === 'tool_result' && message.toolCallId === 'call-1',
    );
    const feedback =
      typeof feedbackMessage?.content === 'string' ? parseFeedback(feedbackMessage.content) : {};

    expect(feedback.error).toBe('value must be a string');
    expect(typeof feedback.hint).toBe('string');
  });

  it('recovers via one-shot nudge when first turn returns plain text', async () => {
    const provider = new FakeProvider([
      [
        { type: 'text_delta', text: 'Let me think about the design first.' },
        { type: 'done', usage: { inputTokens: 12, outputTokens: 6 } },
      ],
      [
        {
          type: 'tool_call',
          id: 'call-nudge',
          name: 'submit_result',
          arguments: JSON.stringify({ value: 'nudged-ok' }),
        },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 8, cacheHitTokens: 10 } },
      ],
    ]);

    const result = await runStructuredStage(createOptions(provider));

    expect(result).toEqual({
      output: { value: 'nudged-ok' },
      usage: { inputTokens: 32, outputTokens: 14, cacheHitTokens: 10 },
      iterations: 2,
    });
    expect(provider.requests).toHaveLength(2);
    const lastMessage = provider.requests[1].messages.at(-1);
    expect(lastMessage?.role).toBe('user');
    expect(lastMessage?.content).toContain('submit_result');
  });

  it('omits toolChoice when provider capabilities disable supportsForcedToolChoice', async () => {
    const provider = new FakeProvider(
      [
        [
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'submit_result',
            arguments: JSON.stringify({ value: 'accepted' }),
          },
          { type: 'done' },
        ],
      ],
      { ...capabilities, supportsForcedToolChoice: false },
    );

    const result = await runStructuredStage(createOptions(provider));

    expect(result.output).toEqual({ value: 'accepted' });
    expect(provider.requests[0].toolChoice).toBeUndefined();
  });

  it('throws when the provider finishes without invoking the target tool', async () => {
    const provider = new FakeProvider([[{ type: 'done' }], [{ type: 'done' }]]);

    await expect(runStructuredStage(createOptions(provider))).rejects.toThrow(
      'stage "submit_result" did not invoke tool',
    );
  });

  it('wraps QueryLoop provider errors with stage context', async () => {
    const provider = new FakeProvider([[{ type: 'error', message: 'provider failed' }]]);

    await expect(runStructuredStage(createOptions(provider))).rejects.toThrow(
      'stage QueryLoop error:',
    );
  });

  it('throws when QueryLoop exceeds the configured iteration limit', async () => {
    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-1',
          name: 'unknown_tool',
          arguments: JSON.stringify({ value: 'ignored' }),
        },
        { type: 'done' },
      ],
    ]);

    await expect(runStructuredStage(createOptions(provider, 1))).rejects.toThrow(
      'stage QueryLoop exceeded max iterations',
    );
  });

  it('records turn token usage for ownerUserId even when the stage fails', async () => {
    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-1',
          name: 'unknown_tool',
          arguments: JSON.stringify({ value: 'ignored' }),
        },
        {
          type: 'done',
          usage: { inputTokens: 25, outputTokens: 8, cacheHitTokens: 5, cacheMissTokens: 20 },
        },
      ],
    ]);
    const recordUsageMock = jest.fn().mockResolvedValue(undefined);
    const aiProvider: AiTemplatePipelineProvider = {
      getProviderForTemplatePipeline: () => ({
        provider,
        model: 'test-model',
        liteModel: 'test-model-lite',
        apiKeyConfigured: true,
      }),
      recordTemplatePipelineTokenUsage: recordUsageMock,
    };

    await expect(
      runStructuredStage({
        ...createOptions(provider, 1),
        aiProvider,
        ownerUserId: 'user-42',
      }),
    ).rejects.toThrow('stage QueryLoop exceeded max iterations');

    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith('user-42', 'test-model', {
      inputTokens: 25,
      outputTokens: 8,
      cacheHitTokens: 5,
      cacheMissTokens: 20,
    });
  });
});
