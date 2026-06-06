import { Logger } from '@nestjs/common';

import type { AiConfigDto } from '../ai.service';
import type {
  AIProvider,
  ProviderCapabilities,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
} from '../core/providers/types';
import { ProviderLogCompactionService } from './provider-log-compaction.service';

class FakeProvider implements AIProvider {
  readonly name = 'fake-provider';
  readonly requests: ProviderRequest[] = [];

  constructor(private readonly events: ProviderStreamEvent[]) {}

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsParallelToolCalls: false,
      supportsStructuredOutput: false,
      supportsReasoningEffort: false,
      supportsServerSideContext: false,
      reasoningMode: 'none',
      cacheStrategy: 'none',
      supportsDeveloperRole: false,
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    await Promise.resolve();
    for (const event of this.events) {
      yield event;
    }
  }

  cancel(): void {
    // No-op for tests.
  }
}

function createAiConfig(overrides: Partial<AiConfigDto> = {}): AiConfigDto {
  return {
    provider: 'fake',
    model: 'gpt-5',
    models: {
      pro: 'gpt-5',
      lite: 'gpt-5-lite',
    },
    semanticTargets: [],
    ...overrides,
  };
}

function createFoldableMessages(): ProviderMessage[] {
  return [
    { role: 'user', content: 'Initial editor goal' },
    { role: 'assistant', content: 'x'.repeat(800_000) },
    { role: 'user', content: 'Recent user instruction' },
  ];
}

describe('ProviderLogCompactionService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('normalizes stored provider messages and returns early when under budget', async () => {
    const service = new ProviderLogCompactionService();
    const messages: ProviderMessage[] = [
      { role: 'developer', content: 'developer messages are not replayed' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'array content is not persisted in provider history' }],
        reasoningContent: 'hidden reasoning',
      },
      {
        role: 'tool_call',
        content: 'call',
        toolCallId: 'tool-1',
        toolName: 'generate_template',
        toolArguments: '{"name":"Demo"}',
      },
    ];

    const folded = await service.foldEditorProviderMessagesByTokenBudget(messages);

    expect(folded).toEqual([
      { role: 'user', content: '', reasoningContent: 'hidden reasoning' },
      {
        role: 'tool_call',
        content: 'call',
        toolCallId: 'tool-1',
        toolName: 'generate_template',
        toolArguments: '{"name":"Demo"}',
      },
    ]);
  });

  it('folds old over-budget provider history with a configured summary provider', async () => {
    const provider = new FakeProvider([
      { type: 'text_delta', text: 'Old goal summarized' },
      { type: 'text_delta', text: ' with tool results preserved.' },
      { type: 'done', reasoningContent: 'summary reasoning' },
    ]);
    const service = new ProviderLogCompactionService();
    service.configure(createAiConfig(), provider, true);

    const folded = await service.foldEditorProviderMessagesByTokenBudget(
      createFoldableMessages(),
      1,
    );

    expect(folded).toHaveLength(2);
    expect(folded[0]).toMatchObject({
      role: 'assistant',
      reasoningContent: 'summary reasoning',
    });
    expect(folded[0].content).toContain(
      '[Editor provider history summary - earlier provider messages folded',
    );
    expect(folded[0].content).toContain('Old goal summarized with tool results preserved.');
    expect(folded[1]).toEqual({ role: 'user', content: 'Recent user instruction' });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].model).toBe('gpt-5-lite');
    expect(provider.requests[0].messages[1].content).toContain('Initial editor goal');
  });

  it('uses configured context window as the default fold budget', async () => {
    const provider = new FakeProvider([{ type: 'text_delta', text: 'Summary' }]);
    const service = new ProviderLogCompactionService();
    service.configure(
      createAiConfig({ model: 'custom-small-model', contextWindow: 100_000 }),
      provider,
      true,
    );

    const folded = await service.foldEditorProviderMessagesByTokenBudget([
      { role: 'user', content: 'Initial editor goal' },
      { role: 'assistant', content: 'x'.repeat(400_000) },
      { role: 'user', content: 'Recent user instruction' },
    ]);

    expect(folded).toHaveLength(2);
    expect(folded[0].content).toContain('Summary');
    expect(folded[1]).toEqual({ role: 'user', content: 'Recent user instruction' });
    expect(provider.requests).toHaveLength(1);
  });

  it('keeps full history when summary folding is unavailable or fails', async () => {
    const noKeyService = new ProviderLogCompactionService();
    noKeyService.configure(createAiConfig(), new FakeProvider([]), false);
    const providerError = new FakeProvider([{ type: 'error', message: 'rate limited' }]);
    const providerErrorService = new ProviderLogCompactionService();
    providerErrorService.configure(createAiConfig(), providerError, true);
    const messages = createFoldableMessages();

    await expect(
      noKeyService.foldEditorProviderMessagesByTokenBudget(messages, 1),
    ).resolves.toEqual(messages);
    await expect(
      providerErrorService.foldEditorProviderMessagesByTokenBudget(messages, 1),
    ).resolves.toEqual(messages);
    expect(providerError.requests).toHaveLength(1);
  });

  it('keeps full history when no safe user-turn boundary exists', async () => {
    const provider = new FakeProvider([{ type: 'text_delta', text: 'unused' }]);
    const service = new ProviderLogCompactionService();
    service.configure(createAiConfig(), provider, true);
    const messages: ProviderMessage[] = [{ role: 'assistant', content: 'x'.repeat(800_000) }];

    await expect(service.foldEditorProviderMessagesByTokenBudget(messages, 1)).resolves.toEqual(
      messages,
    );
    expect(provider.requests).toHaveLength(0);
  });
});
