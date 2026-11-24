import {
  SSE_EVENT_SCHEMA_VERSION,
  type SseEventEnvelope,
  type SseEventType,
} from '@shared/agent/contracts/sseEvents';
import { firstValueFrom, toArray } from 'rxjs';

import type { ConfigService } from '../../config/config.service';
import type { TemplateReadRepository } from '../../templates/repositories/templateRead.repository';
// prettier-ignore
import type {
  TemplateAgentKnowledgeServicePort,
} from '../../templates/templateAgentKnowledge.service';
import type { TemplatesService } from '../../templates/templates.service';
import { AiService } from '../ai.service';
import type { AIProvider, ProviderStreamEvent } from '../core/providers/types';
import type { EditorConversationRepository } from '../repositories/editorConversation.repository';
import { EditorConversationService } from './editorConversation.service';
import { EditorEditOutbox } from './editorEditOutbox.service';
import { ProviderLogCompactionService } from './providerLogCompaction.service';
import type { TokenUsageService } from './tokenUsage.service';

class FakeTemplateReadRepository implements TemplateReadRepository {
  searchPublicTemplates(): Promise<[]> {
    return Promise.resolve([]);
  }
  findDiversitySummaries(): Promise<[]> {
    return Promise.resolve([]);
  }
  findOwnedPublishSnapshot(): Promise<null> {
    return Promise.resolve(null);
  }
  findAccessibleIdentity() {
    return Promise.resolve(null);
  }
}

class FakeEditorConversationRepository implements EditorConversationRepository {
  create(): never {
    throw new Error('not used');
  }
  save(): Promise<never> {
    throw new Error('not used');
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  findByOwnerAndTemplate(): Promise<null> {
    return Promise.resolve(null);
  }
}

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  getCapabilities() {
    return {
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsParallelToolCalls: false,
      supportsStructuredOutput: false,
      supportsReasoningEffort: false,
      supportsServerSideContext: false,
      reasoningMode: 'none' as const,
      cacheStrategy: 'none' as const,
      supportsDeveloperRole: false,
    };
  }
  stream(): AsyncIterable<ProviderStreamEvent> {
    const events: ProviderStreamEvent[] = [
      {
        type: 'done',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheHitTokens: 80,
          cacheMissTokens: 20,
        },
        stopReason: 'end_turn',
      },
    ];
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          next() {
            if (i < events.length) {
              return Promise.resolve({ value: events[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }
  cancel(): void {
    /* no-op */
  }
}

function parseEnvelopes(events: { data: string }[]): SseEventEnvelope<SseEventType, unknown>[] {
  const out: SseEventEnvelope<SseEventType, unknown>[] = [];
  for (const e of events) {
    out.push(JSON.parse(e.data) as SseEventEnvelope<SseEventType, unknown>);
  }
  return out;
}

function createService(): { service: AiService; recordSpy: jest.Mock } {
  const config = {
    apiKey: 'test-key',
    provider: 'fake',
    baseUrl: '',
    model: 'fake-model',
    models: { pro: 'fake-model' },
    contextWindow: undefined,
    editorAgentMaxIterations: 5,
    reasoningMode: undefined,
    cacheStrategy: 'none' as const,
    supportsDeveloperRole: false,
    extraRequestParams: undefined,
  };
  const cfg = {
    ai: config,
  } as unknown as ConfigService;

  const templates = new FakeTemplateReadRepository();
  const templateAgentKnowledge = {} as unknown as TemplateAgentKnowledgeServicePort;
  const templatesService = {} as unknown as TemplatesService;
  const editorRepo = new FakeEditorConversationRepository();
  const editorConversations = new EditorConversationService(
    editorRepo,
    templates,
    new ProviderLogCompactionService(),
  );
  const providerLogCompaction = new ProviderLogCompactionService();
  const recordSpy = jest.fn().mockResolvedValue(undefined);
  const tokenUsageService = {
    recordTokenUsage: recordSpy,
    logCacheUsage: jest.fn(),
    getCacheStats: jest.fn(),
  } as unknown as TokenUsageService;

  const provider = new FakeProvider();

  const service = new AiService(
    templates,
    templateAgentKnowledge,
    cfg,
    templatesService,
    tokenUsageService,
    editorConversations,
    providerLogCompaction,
    new EditorEditOutbox(),
  );

  // The constructor builds an OpenAI/OpenAICompatible provider based on ai.provider.
  // Force-replace it with our test provider so the done-with-usage event flows back.
  (service as unknown as { provider: AIProvider }).provider = provider;

  return { service, recordSpy };
}

describe('EditorAiService usage persistence (A.5)', () => {
  it('persists usage_summary envelope to AiTokenUsage when editor stream completes', async () => {
    const { service, recordSpy } = createService();

    // Use the legacy StreamRequest shape (messages[]) to route through runEditorStream,
    // which directly exercises the onUsage -> recordTokenUsage path before emitting
    // the usage_summary envelope.
    const events$ = service.streamEditor('user-1', {
      model: 'fake-model',
      messages: [{ role: 'user', content: 'make the title red' }],
    });

    const events = await firstValueFrom(events$.pipe(toArray()));
    const envelopes = parseEnvelopes(events);

    // 1) usage_summary envelope must be present with the captured model + usage
    const usageSummary = envelopes.find((e) => e.type === 'usage_summary') as
      | SseEventEnvelope<'usage_summary', unknown>
      | undefined;
    expect(usageSummary).toBeDefined();
    expect(usageSummary?.schema).toBe(SSE_EVENT_SCHEMA_VERSION);
    const payload = usageSummary?.payload as {
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    };
    expect(payload.model).toBe('fake-model');
    expect(payload.usage.inputTokens).toBe(100);
    expect(payload.usage.outputTokens).toBe(50);

    // 2) recordTokenUsage must be called with ownerUserId, model, usage, endpoint='editor',
    //    provider matching the configured ai.provider.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    type CallArgs = [string, string, { inputTokens: number; outputTokens: number }, string, string];
    const callArgs = recordSpy.mock.calls[0] as unknown as CallArgs;
    expect(callArgs).toBeDefined();
    const [ownerUserId, model, usage, endpoint, provider] = callArgs;
    expect(ownerUserId).toBe('user-1');
    expect(model).toBe('fake-model');
    expect(usage).toEqual(expect.objectContaining({ inputTokens: 100, outputTokens: 50 }));
    expect(endpoint).toBe('editor');
    expect(provider).toBe('fake');
  });
});
