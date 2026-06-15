/**
 * End-to-end tests for the `cache_diagnostic` SSE event emitted by
 * `runStructuredEditorStream` in `ai.service.ts`. PR-A (cache_diagnostic
 * observability) + PR-E (cross-session `lastPrefixHash` persistence) both
 * converge on this envelope, so a regression here breaks the editor AI panel
 * "cache" badge.
 *
 * Run:
 *   pnpm --dir backend exec jest --runTestsByPath \
 *     src/ai/services/editorAi.cacheDiagnostic.spec.ts
 */
import { SSE_EVENT_SCHEMA_VERSION, type SseEventType } from '@shared/agent/contracts/sseEvents';
import type { ThemeLayoutDocument } from '@shared/agent/types';
import { firstValueFrom, toArray } from 'rxjs';

import type { ConfigService } from '../../config/config.service';
import type { TemplateReadRepository } from '../../templates/repositories/templateRead.repository';
// prettier-ignore
import type {
  TemplateAgentKnowledgeServicePort,
} from '../../templates/templateAgentKnowledge.service';
import type { TemplatesService } from '../../templates/templates.service';
import { hashJson } from '../agentRunner.helpers';
import { AiService } from '../ai.service';
import type { AIProvider, ProviderStreamEvent } from '../core/providers/types';
import { EditorAiConversation } from '../entities/editorAiConversation.entity';
import type {
  CreateEditorConversationInput,
  EditorConversationRepository,
} from '../repositories/editorConversation.repository';
import { EditorConversationService } from './editorConversation.service';
import { ProviderLogCompactionService } from './providerLogCompaction.service';
import type { TokenUsageService } from './tokenUsage.service';

// ── 复用 editorAi.usage.spec.ts 的 fake 仓库 + 假 provider 模式 ──────────────
// 目的: 跑 runStructuredEditorStream 主路径, 验 cache_diagnostic SSE envelope.
// 关键差异: 真实 EditorAiConversation 实例 (含 PR-E 新列 lastPrefixHash /
// cacheContext / compactSummary), 多轮之间共享同一个 repo, 模拟跨 session.

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
  findAccessibleIdentity(): Promise<{ templateId: string; sourceTemplateId: null }> {
    return Promise.resolve({ templateId: 'any', sourceTemplateId: null });
  }
}

class FakeEditorConversationRepository implements EditorConversationRepository {
  // 测试需要在多次 stream 调用之间保持实体状态 (lastPrefixHash 持久化).
  readonly store = new Map<string, EditorAiConversation>();

  create(input: CreateEditorConversationInput): EditorAiConversation {
    const conv = Object.assign(new EditorAiConversation(), {
      id: `conv-${input.templateId}`,
      ownerUserId: input.ownerUserId,
      templateId: input.templateId,
      messages: [],
      providerMessages: [],
      providerSession: null,
      undoStack: null,
      compactSummary: null,
      lastPrefixHash: null,
      cacheContext: null,
      createdAt: new Date('2026-05-29T00:00:00.000Z'),
      updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    });
    this.store.set(`${input.ownerUserId}:${input.templateId}`, conv);
    return conv;
  }
  save(conversation: EditorAiConversation): Promise<EditorAiConversation> {
    this.store.set(`${conversation.ownerUserId}:${conversation.templateId}`, conversation);
    return Promise.resolve(conversation);
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  findByOwnerAndTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversation | null> {
    return Promise.resolve(this.store.get(`${ownerUserId}:${templateId}`) ?? null);
  }
}

interface FakeProviderOptions {
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  };
}

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  private readonly opts: FakeProviderOptions;

  constructor(opts: FakeProviderOptions = {}) {
    this.opts = opts;
  }

  getCapabilities() {
    return {
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsParallelToolCalls: false,
      supportsStructuredOutput: false,
      supportsReasoningEffort: false,
      supportsServerSideContext: false,
      reasoningMode: 'none' as const,
      cacheStrategy: 'prefix' as const,
      supportsDeveloperRole: false,
    };
  }
  stream(): AsyncIterable<ProviderStreamEvent> {
    const usage = this.opts.usage ?? {
      inputTokens: 100,
      outputTokens: 50,
      cacheHitTokens: 0,
      cacheMissTokens: 100,
    };
    const events: ProviderStreamEvent[] = [
      {
        type: 'done',
        usage,
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

function parseEnvelopes(events: { data: string }[]): {
  schema: string;
  type: SseEventType;
  ts: string;
  payload: Record<string, unknown>;
}[] {
  return events.map(
    (e) =>
      JSON.parse(e.data) as {
        schema: string;
        type: SseEventType;
        ts: string;
        payload: Record<string, unknown>;
      },
  );
}

/**
 * 包装 jest 的 `expect(x).toBeDefined()` 检查, 在同一行 narrow 出非空类型,
 * 避免 ESLint `@typescript-eslint/no-non-null-assertion` 拒绝 `x!` 写法.
 */
function defined<T>(value: T | undefined | null, hint: string): T {
  expect(value).toBeDefined();
  if (value === undefined || value === null) {
    throw new Error(`expected ${hint} to be defined`);
  }
  return value;
}

const MUTATED_COMPONENTS = [
  {
    alias: 'core.text',
    name: 'Text',
    kind: 'component' as const,
    description: 'a text node',
    props: [],
  },
];

const MIN_DOCUMENT: ThemeLayoutDocument = {
  version: 1,
  themeId: 'theme-test',
  themeName: 'Test',
  description: '',
  components: [],
  pages: [
    {
      id: 'page-1',
      name: 'Home',
      layout: { id: 'root', alias: 'core.stack', layout: { mode: 'flow' }, children: [] },
    },
  ],
  defaultPageId: 'page-1',
  layout: { id: 'root', alias: 'core.stack', layout: { mode: 'flow' }, children: [] },
};

function createHarness(
  opts: { provider?: FakeProvider; repo?: FakeEditorConversationRepository } = {},
) {
  const cfg = {
    ai: {
      apiKey: 'test-key',
      provider: 'fake',
      baseUrl: '',
      model: 'fake-model',
      models: { pro: 'fake-model' },
      contextWindow: undefined,
      editorAgentMaxIterations: 5,
      reasoningMode: undefined,
      cacheStrategy: 'prefix' as const,
      supportsDeveloperRole: false,
      extraRequestParams: undefined,
    },
  } as unknown as ConfigService;

  const templates = new FakeTemplateReadRepository();
  const templateAgentKnowledge: TemplateAgentKnowledgeServicePort = {
    loadForEditor: () => Promise.resolve({}),
  };
  const templatesService = {} as unknown as TemplatesService;
  const repo = opts.repo ?? new FakeEditorConversationRepository();
  const editorConversations = new EditorConversationService(
    repo,
    templates,
    new ProviderLogCompactionService(),
  );
  const providerLogCompaction = new ProviderLogCompactionService();
  const tokenUsageService = {
    recordTokenUsage: jest.fn().mockResolvedValue(undefined),
    logCacheUsage: jest.fn(),
    getCacheStats: jest.fn(),
  } as unknown as TokenUsageService;

  const provider = opts.provider ?? new FakeProvider();
  const service = new AiService(
    templates,
    templateAgentKnowledge,
    cfg,
    templatesService,
    tokenUsageService,
    editorConversations,
    providerLogCompaction,
  );
  (service as unknown as { provider: AIProvider }).provider = provider;

  return { service, provider, repo, editorConversations };
}

describe('cache_diagnostic SSE envelope (PR-A + PR-E)', () => {
  // PR-A: cache_diagnostic 事件本身 + 字段语义
  describe('per-turn envelope shape', () => {
    it('emits one cache_diagnostic envelope per structured editor turn', async () => {
      const { service } = createHarness();
      const events$ = service.streamEditor('user-1', {
        model: 'fake-model',
        prompt: '把主标题改成红色',
        document: MIN_DOCUMENT,
      });
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelopes = parseEnvelopes(events);
      const diagnostics = envelopes.filter((e) => e.type === 'cache_diagnostic');
      expect(diagnostics).toHaveLength(1);
      const envelope = defined(diagnostics[0], 'diagnostics[0]');
      expect(envelope.schema).toBe(SSE_EVENT_SCHEMA_VERSION);
      expect(typeof envelope.ts).toBe('string');
    });

    it('reports cacheHitRate = cacheHitTokens / (cacheHitTokens + cacheMissTokens)', async () => {
      const { service } = createHarness({
        provider: new FakeProvider({
          usage: { inputTokens: 100, outputTokens: 50, cacheHitTokens: 75, cacheMissTokens: 25 },
        }),
      });
      const events$ = service.streamEditor('user-1', {
        model: 'fake-model',
        prompt: 'edit',
        document: MIN_DOCUMENT,
      });
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelope = defined(
        parseEnvelopes(events).find((e) => e.type === 'cache_diagnostic'),
        'cache_diagnostic envelope',
      );
      const payload = envelope.payload as { cacheHitRate: number | null };
      expect(payload.cacheHitRate).toBeCloseTo(0.75, 5);
    });

    it('reports cacheHitRate = null when no usage tokens were recorded', async () => {
      // 不带 cacheHit/cacheMiss 字段 → ai.service 拿到 lastUsage 后 hit/miss 都 undefined
      // (undefined + undefined + 0 > 0) => null 分支
      const { service } = createHarness({
        provider: new FakeProvider({
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      });
      const events$ = service.streamEditor('user-1', {
        model: 'fake-model',
        prompt: 'edit',
        document: MIN_DOCUMENT,
      });
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelope = defined(
        parseEnvelopes(events).find((e) => e.type === 'cache_diagnostic'),
        'cache_diagnostic envelope',
      );
      const payload = envelope.payload as { cacheHitRate: number | null };
      expect(payload.cacheHitRate).toBeNull();
    });
  });

  // PR-E: 跨 session prefixChanged 翻转 (依赖 lastPrefixHash 持久化)
  describe('cross-session prefixChanged flipping', () => {
    it('first turn of a session emits prefixChanged=false (no prior hash)', async () => {
      const { service } = createHarness();
      const events$ = service.streamEditor(
        'user-1',
        { model: 'fake-model', prompt: 'first turn', document: MIN_DOCUMENT },
        { conversationId: 'editor-template-template-1' },
      );
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelope = defined(
        parseEnvelopes(events).find((e) => e.type === 'cache_diagnostic'),
        'cache_diagnostic envelope',
      );
      const payload = envelope.payload as { prefixChanged: boolean };
      expect(payload.prefixChanged).toBe(false);
    });

    it('emits prefixChanged=true on the second turn with a changed document prefix', async () => {
      // 共享同一 repo, 模拟"同一用户同一模板在两个进程间切换".
      // cache_diagnostic.prefixChanged 反映的是 "system+tools+stable catalog" 这段
      // cache prefix 是否被 bust 掉; 改 user prompt 不会让它翻转 (符合
      // OpenAI / Anthropic cache semantics), 必须改 document.components 这种
      // 稳定前缀的一部分.
      const repo = new FakeEditorConversationRepository();
      const h1 = createHarness({ repo });
      await firstValueFrom(
        h1.service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'prompt A', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const firstRow = defined(repo.store.get('user-1:template-1'), 'first conversation row');
      const firstHash = firstRow.lastPrefixHash;
      expect(firstHash).toMatch(/^[0-9a-f]{16}$/);

      // 第二次: 加一个新 component descriptor, 稳定 prefix 内容变化 → cache bust.
      const mutatedDocument: ThemeLayoutDocument = {
        ...MIN_DOCUMENT,
        components: MUTATED_COMPONENTS,
      };
      const events$ = h1.service.streamEditor(
        'user-1',
        { model: 'fake-model', prompt: 'same prompt as before', document: mutatedDocument },
        { conversationId: 'editor-template-template-1' },
      );
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelope = defined(
        parseEnvelopes(events).find((e) => e.type === 'cache_diagnostic'),
        'cache_diagnostic envelope',
      );
      const payload = envelope.payload as { prefixChanged: boolean; prefixHash: string };
      expect(payload.prefixChanged).toBe(true);
      expect(payload.prefixHash).not.toBe(firstHash);
    });

    it('keeps prefixChanged=false when the user prompt differs but prefix is stable', async () => {
      // 改 user prompt 不应 bust cache prefix — 验证 computePrefixChanged 不会被
      // 误触发 (前一个测试是反例, 二者合在一起是 contract).
      const repo = new FakeEditorConversationRepository();
      const h1 = createHarness({ repo });
      await firstValueFrom(
        h1.service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'first prompt', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const firstRow = defined(repo.store.get('user-1:template-1'), 'first conversation row');
      const firstHash = firstRow.lastPrefixHash;
      // 第二轮: 同样 document, 改 prompt.
      const events$ = h1.service.streamEditor(
        'user-1',
        { model: 'fake-model', prompt: 'second totally different prompt', document: MIN_DOCUMENT },
        { conversationId: 'editor-template-template-1' },
      );
      const events = await firstValueFrom(events$.pipe(toArray()));
      const envelope = defined(
        parseEnvelopes(events).find((e) => e.type === 'cache_diagnostic'),
        'cache_diagnostic envelope',
      );
      const payload = envelope.payload as { prefixChanged: boolean; prefixHash: string };
      expect(payload.prefixChanged).toBe(false);
      expect(payload.prefixHash).toBe(firstHash);
    });

    it('emitted prefixHash matches hashJson shape and is deterministic', async () => {
      const repo = new FakeEditorConversationRepository();
      const { service } = createHarness({ repo });
      const first = await firstValueFrom(
        service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'stable prefix check', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const env1 = defined(
        parseEnvelopes(first).find((e) => e.type === 'cache_diagnostic'),
        'first cache_diagnostic envelope',
      );
      const payload1 = env1.payload as { prefixHash: string };

      // shape: 16 lowercase hex
      expect(payload1.prefixHash).toMatch(/^[0-9a-f]{16}$/);
      // 跑两遍, 同样的输入应当产生同样的 hash (这是 cache 命中的前提).
      const second = await firstValueFrom(
        service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'stable prefix check', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const env2 = defined(
        parseEnvelopes(second).find((e) => e.type === 'cache_diagnostic'),
        'second cache_diagnostic envelope',
      );
      const payload2 = env2.payload as { prefixHash: string };
      expect(payload2.prefixHash).toBe(payload1.prefixHash);
    });
  });

  // PR-A + PR-E 联动: 每次 SSE emit 都把 lastPrefixHash 落库
  describe('cache_diagnostic persistence to cacheContext', () => {
    it('saves the emitted prefixHash + cacheStrategy to the conversation row', async () => {
      const repo = new FakeEditorConversationRepository();
      const { service } = createHarness({ repo });
      await firstValueFrom(
        service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'persist me', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const row = defined(repo.store.get('user-1:template-1'), 'persisted conversation row');
      expect(row.lastPrefixHash).toMatch(/^[0-9a-f]{16}$/);
      expect(row.cacheContext).toMatchObject({
        provider: 'fake',
        model: 'fake-model',
        cacheStrategy: 'prefix',
      });
      const ctx = defined(row.cacheContext, 'cacheContext');
      expect(typeof ctx.updatedAt).toBe('string');
    });

    it('updates lastPrefixHash and lastCacheHitRate on subsequent turns', async () => {
      const repo = new FakeEditorConversationRepository();
      const { service } = createHarness({
        repo,
        provider: new FakeProvider({
          usage: { inputTokens: 100, outputTokens: 50, cacheHitTokens: 60, cacheMissTokens: 40 },
        }),
      });
      // 第一轮
      await firstValueFrom(
        service
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'turn 1', document: MIN_DOCUMENT },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const firstRow = defined(repo.store.get('user-1:template-1'), 'first row');
      const firstCtx = defined(firstRow.cacheContext, 'first cacheContext');
      const firstHash = firstRow.lastPrefixHash;
      const firstRate = firstCtx.lastCacheHitRate;
      expect(firstHash).toMatch(/^[0-9a-f]{16}$/);
      expect(firstRate).toBeCloseTo(0.6, 5);

      // 第二轮: 换 provider 配置 (改 cache 命中比例) + 换 document.components
      // (使 prefix 变化 → lastPrefixHash 也更新). 同 repo 共享 lastPrefixHash.
      const { service: service2 } = createHarness({
        repo,
        provider: new FakeProvider({
          usage: { inputTokens: 100, outputTokens: 50, cacheHitTokens: 10, cacheMissTokens: 90 },
        }),
      });
      const mutatedDocument: ThemeLayoutDocument = {
        ...MIN_DOCUMENT,
        components: MUTATED_COMPONENTS,
      };
      await firstValueFrom(
        service2
          .streamEditor(
            'user-1',
            { model: 'fake-model', prompt: 'turn 2 different', document: mutatedDocument },
            { conversationId: 'editor-template-template-1' },
          )
          .pipe(toArray()),
      );
      const secondRow = defined(repo.store.get('user-1:template-1'), 'second row');
      const secondCtx = defined(secondRow.cacheContext, 'second cacheContext');
      expect(secondRow.lastPrefixHash).not.toBe(firstHash);
      expect(secondCtx.lastCacheHitRate).toBeCloseTo(0.1, 5);
    });
  });

  // 诊断纯函数: hashJson 行为 (delegated 至此避免跨文件)
  describe('hashJson contract used by cache_diagnostic', () => {
    it('matches the 16-hex SHA-256 prefix used by ai.service', () => {
      const h = hashJson({ messages: ['a', 'b'] });
      expect(h).toMatch(/^[0-9a-f]{16}$/);
      expect(h).toHaveLength(16);
    });
  });
});
