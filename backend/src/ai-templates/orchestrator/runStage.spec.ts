import type {
  AIProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from '@shared/agent/contracts/provider';

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

  constructor(private readonly batches: ProviderStreamEvent[][]) {}

  getCapabilities(): ProviderCapabilities {
    return capabilities;
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
      [
        {
          type: 'done',
          usage: { inputTokens: 2, outputTokens: 1 },
        },
      ],
    ]);

    const result = await runStructuredStage(createOptions(provider));

    expect(result).toEqual({
      output: { value: 'accepted' },
      usage: { inputTokens: 12, outputTokens: 5, cacheHitTokens: 3 },
      iterations: 2,
    });
    expect(provider.requests[0].model).toBe('test-model');
    expect(provider.requests[0].tools).toEqual([resultTool]);
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
      [{ type: 'done' }],
    ]);

    const result = await runStructuredStage(createOptions(provider));

    expect(result.output).toEqual({ value: 'corrected' });
    expect(result.iterations).toBe(3);
    const feedbackMessage = provider.requests[1].messages.find(
      (message) => message.role === 'tool_result' && message.toolCallId === 'call-1',
    );
    const feedback =
      typeof feedbackMessage?.content === 'string' ? parseFeedback(feedbackMessage.content) : {};

    expect(feedback.error).toBe('value must be a string');
    expect(typeof feedback.hint).toBe('string');
  });

  it('throws when the provider finishes without invoking the target tool', async () => {
    const provider = new FakeProvider([[{ type: 'done' }]]);

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
});
