import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AgentConversationMessage,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/contracts/agent';
import {
  type AgentTemplateKnowledgeContext,
  buildConversationContextMessages,
  buildEditorMinimalVolatileContext,
  buildEditorStablePrefixContext,
  buildEditorTrimmedVolatileContext,
  compileSemanticEditorInstruction,
  EDITOR_COPILOT_SYSTEM_PROMPT,
  formatUiDesignSkillContextForPrompt,
  inferUiDesignSkillContext,
  isSemanticEditorInstruction,
  QueryLoop,
  type SemanticEditorInstruction,
  summarizeTemplateAgentKnowledge,
  type TemplateProfile,
  type ToolResult,
} from '@shared/agent/runtime';
import { Observable, Subject } from 'rxjs';

import { ConfigService } from '../config/config.service';
import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
} from '../templates/repositories/template-read.repository';
import {
  TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
  type TemplateAgentKnowledgeServicePort,
} from '../templates/template-agent-knowledge.service';
import { TemplatesService } from '../templates/templates.service';
import { OpenAIProvider } from './core/providers/openai.provider';
import { OpenAICompatibleProvider } from './core/providers/openai-compatible.provider';
import type {
  AIProvider,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from './core/providers/types';
import { buildEditorClarification } from './editor-clarification';
import { AI_SEMANTIC_TARGETS, type AiSemanticTargetConfig } from './semantic-targets.config';
import {
  type EditorAiConversationDto,
  EditorConversationService,
  type SaveEditorAiConversationInput,
} from './services/editor-conversation.service';
import { ProviderLogCompactionService } from './services/provider-log-compaction.service';
import { type AiCacheStatsDto, TokenUsageService } from './services/token-usage.service';
import {
  EDITOR_EDIT_TOOL_NAMES,
  EDITOR_EDIT_TOOLS,
  editorToolCallToOperations,
  selectEditorEditTools,
} from './tools/editor-edit.tool';
import type { TemplateToolInput } from './tools/generate-template.tool';

export interface AiConfigDto {
  provider: string;
  model: string;
  models: {
    pro: string;
    lite?: string;
    image?: string;
  };
  semanticTargets: AiSemanticTargetConfig[];
}

// Re-export types from sub-services for backward compatibility
export type {
  EditorAiConversationDto,
  SaveEditorAiConversationInput,
} from './services/editor-conversation.service';
export type { AiCacheStatsDto } from './services/token-usage.service';

export type StreamRequest = ProviderRequest;

export interface EditorAgentStreamRequest {
  model?: string;
  prompt: string;
  document: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  conversation?: AgentConversationMessage[];
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  clarificationChoice?: unknown;
}

export interface StreamSseEvent {
  data: string;
}

interface EditorToolInput {
  operations?: unknown;
  reason?: unknown;
}

interface EditorToolInputWithWarnings extends EditorToolInput {
  warnings?: string[];
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface ProviderCacheOptions {
  conversationId?: string;
  previousResponseId?: string;
}

interface ClarificationChoiceRecord {
  value?: unknown;
}

interface RequiredClarificationChoiceRecord {
  value: string;
}

interface OperationTypeRecord {
  type?: unknown;
}

interface SemanticOperationRecord {
  type: string;
}

interface EditorSseEventPayload {
  type: string;
  data: unknown;
}

interface SaveGeneratedTemplateResult {
  templateId: string;
  action: 'created' | 'updated';
}

interface EditorAgentStreamRequestCandidate extends Partial<EditorAgentStreamRequest> {
  messages?: unknown;
}

// 简单内存限流器：每个用户在一个窗口内最多 N 次请求。
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, RateLimitEntry>();
const DEFAULT_EDITOR_AGENT_MAX_ITERATIONS = 96;
const EDITOR_AGENT_MAX_ITERATIONS = (() => {
  const configured = Number(process.env.EDITOR_AGENT_MAX_ITERATIONS);
  return Number.isFinite(configured) && configured >= 32
    ? Math.floor(configured)
    : DEFAULT_EDITOR_AGENT_MAX_ITERATIONS;
})();

@Injectable()
export class AiService {
  readonly aiConfig: AiConfigDto;
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AIProvider;
  private readonly apiKeyConfigured: boolean;

  constructor(
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
    @Inject(TEMPLATE_AGENT_KNOWLEDGE_SERVICE)
    private readonly templateAgentKnowledge: TemplateAgentKnowledgeServicePort,
    private readonly config: ConfigService,
    private readonly templatesService: TemplatesService,
    private readonly tokenUsageService: TokenUsageService,
    private readonly editorConversations: EditorConversationService,
    private readonly providerLogCompaction: ProviderLogCompactionService,
  ) {
    const apiKey = this.config.ai.apiKey ?? '';

    this.aiConfig = {
      provider: this.config.ai.provider,
      model: this.config.ai.model,
      models: this.config.ai.models,
      semanticTargets: AI_SEMANTIC_TARGETS,
    };

    this.apiKeyConfigured = apiKey.length > 0;
    if (!this.apiKeyConfigured) {
      this.logger.warn('AI_API_KEY is not configured. AI stream requests will fail.');
    }

    this.logger.log(
      `AI provider: ${this.config.ai.provider} (baseUrl: ${this.config.ai.baseUrl ?? 'default'})`,
    );

    if (this.config.ai.provider === 'openai-compatible') {
      this.provider = new OpenAICompatibleProvider(
        apiKey,
        this.config.ai.baseUrl,
        'openai-compatible',
      );
    } else {
      this.provider = new OpenAIProvider(apiKey, this.config.ai.baseUrl, 'openai');
    }

    this.providerLogCompaction.configure(this.aiConfig, this.provider, this.apiKeyConfigured);
  }

  checkRateLimit(userId: string): void {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) {
      throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX} requests per minute`);
    }
  }

  getConfig(): AiConfigDto {
    return this.aiConfig;
  }

  getProviderForAgentEval(): AIProvider {
    return this.provider;
  }

  /**
   * Public accessor used by the multi-stage template pipeline (`AiTemplatesModule`).
   * Returns the shared provider + the configured "pro" model, plus a flag indicating
   * whether the API key is configured (the pipeline aborts gracefully if not).
   */
  getProviderForTemplatePipeline(): {
    provider: AIProvider;
    model: string;
    apiKeyConfigured: boolean;
  } {
    return {
      provider: this.provider,
      model: this.aiConfig.models.pro,
      apiKeyConfigured: this.apiKeyConfigured,
    };
  }

  private resolveConfiguredModel(requestedModel?: string): string {
    const { pro, lite } = this.aiConfig.models;
    if (requestedModel && lite && requestedModel === lite) {
      return lite;
    }
    return pro;
  }

  hasConfiguredApiKey(): boolean {
    return this.apiKeyConfigured;
  }

  foldEditorProviderMessagesByTokenBudget(
    messages: readonly ProviderMessage[],
  ): Promise<ProviderMessage[]> {
    return this.providerLogCompaction.foldEditorProviderMessagesByTokenBudget(messages);
  }

  async getEditorConversation(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversationDto> {
    return this.editorConversations.getEditorConversation(ownerUserId, templateId);
  }

  async saveEditorConversation(
    ownerUserId: string,
    templateId: string,
    input: SaveEditorAiConversationInput,
  ): Promise<EditorAiConversationDto> {
    return this.editorConversations.saveEditorConversation(ownerUserId, templateId, input);
  }

  async getCacheStats(ownerUserId: string): Promise<AiCacheStatsDto> {
    return this.tokenUsageService.getCacheStats(ownerUserId);
  }

  /** Proxy a streaming OpenAI-compatible Responses API request, forwarding events as SSE */
  stream(
    ownerUserId: string,
    req: StreamRequest,
    cacheOptions?: ProviderCacheOptions,
  ): Observable<StreamSseEvent> {
    return new Observable<StreamSseEvent>((subscriber) => {
      const subject = new Subject<StreamSseEvent>();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      void this.runStream(ownerUserId, req, subject, cacheOptions).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.emitStreamEvent(subject, { type: 'error', message: msg });
        subject.complete();
      });

      return () => {
        relay.unsubscribe();
        subject.complete();
      };
    });
  }

  /** Run the editor copilot loop on the backend and stream UI-safe events. */
  streamEditor(
    ownerUserId: string,
    req: StreamRequest | EditorAgentStreamRequest,
    cacheOptions?: ProviderCacheOptions,
  ): Observable<StreamSseEvent> {
    return new Observable<StreamSseEvent>((subscriber) => {
      const subject = new Subject<StreamSseEvent>();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      const runner = this.isEditorAgentStreamRequest(req)
        ? this.runStructuredEditorStream(ownerUserId, req, subject, cacheOptions)
        : this.runEditorStream(ownerUserId, req, subject, cacheOptions);
      runner.catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.emitEditorEvent(subject, { type: 'error', data: msg });
        subject.complete();
      });

      return () => {
        relay.unsubscribe();
        subject.complete();
      };
    });
  }

  private async runStream(
    ownerUserId: string,
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: ProviderCacheOptions,
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitStreamEvent(subject, {
        type: 'error',
        message: 'AI_API_KEY is not configured on the backend.',
      });
      subject.complete();
      return;
    }

    const model = this.resolveConfiguredModel(req.model);
    const request = this.withRequestScopedCache({ ...req, model }, cacheOptions);

    for await (const event of this.provider.stream(request)) {
      if (event.type === 'done' && event.usage) {
        this.tokenUsageService.logCacheUsage(ownerUserId, model, event.usage, 'stream');
        await this.tokenUsageService.recordTokenUsage(
          ownerUserId,
          model,
          event.usage,
          'stream',
          this.aiConfig.provider,
        );
      }
      this.emitStreamEvent(subject, event);
    }

    subject.complete();
  }

  private withRequestScopedCache(
    req: StreamRequest,
    cacheOptions?: ProviderCacheOptions,
  ): StreamRequest {
    if (!(this.provider instanceof OpenAIProvider) || !cacheOptions?.previousResponseId) {
      return req;
    }

    return {
      ...req,
      cache: {
        previousResponseId: cacheOptions.previousResponseId,
      },
    };
  }

  private async ensureTemplateAccessible(ownerUserId: string, templateId: string): Promise<void> {
    const template = await this.templates.findAccessibleIdentity(ownerUserId, templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
  }

  private async loadTemplateAgentKnowledge(
    ownerUserId: string,
    document: ThemeLayoutDocument,
    conversationId: string | undefined,
  ): Promise<AgentTemplateKnowledgeContext> {
    const requestedTemplateId =
      EditorConversationService.templateIdFromConversationId(conversationId) ?? document.themeId;
    return this.templateAgentKnowledge.loadForEditor({
      ownerUserId,
      document,
      ...(requestedTemplateId ? { templateId: requestedTemplateId } : {}),
    });
  }

  private emitStreamEvent(subject: Subject<StreamSseEvent>, event: ProviderStreamEvent): void {
    subject.next({ data: JSON.stringify(event) });
  }

  private async runEditorStream(
    ownerUserId: string,
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: ProviderCacheOptions,
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitEditorEvent(subject, {
        type: 'error',
        data: 'AI_API_KEY is not configured on the backend.',
      });
      this.emitEditorEvent(subject, { type: 'done', data: '' });
      subject.complete();
      return;
    }

    const model = this.resolveConfiguredModel(req.model);
    const editorTools = [...EDITOR_EDIT_TOOLS];
    const persistedSession = await this.editorConversations.loadEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
    );
    const previousResponseId =
      cacheOptions?.previousResponseId ?? persistedSession?.previousResponseId;
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      previousResponseId,
    );
    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools: editorTools,
      toolSpecs: this.editorToolSpecs(editorTools),
      maxIterations: EDITOR_AGENT_MAX_ITERATIONS,
      isCancelled: () => subject.closed,
      onTextDelta: (text) => {
        this.emitEditorEvent(subject, { type: 'text', data: text });
      },
      onToolEvent: (event) => {
        if (event.status === 'start') {
          this.emitEditorEvent(subject, { type: 'tool_start', data: event.name });
        } else if (event.status === 'done') {
          this.emitEditorEvent(subject, { type: 'tool_done', data: event.name });
        }
      },
      onError: (msg) => {
        this.emitEditorEvent(subject, { type: 'error', data: msg });
      },
      onUsage: (usage) =>
        this.tokenUsageService
          .recordTokenUsage(ownerUserId, model, usage, 'editor', this.aiConfig.provider)
          .then(() => {
            this.tokenUsageService.logCacheUsage(ownerUserId, model, usage, 'editor');
          }),
      requestCache: previousResponseId ? { previousResponseId } : undefined,
      toolExecutor: (name, args) => this.executeEditorTool(subject, name, args),
    });

    const result = await loop.run(req.messages);
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      result.responseId ?? previousResponseId,
    );
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, { type: 'error', data: result.error ?? 'Unknown error' });
    }
    this.emitEditorEvent(subject, { type: 'done', data: '' });
    subject.complete();
  }

  private async runStructuredEditorStream(
    ownerUserId: string,
    req: EditorAgentStreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: ProviderCacheOptions,
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitEditorEvent(subject, {
        type: 'error',
        data: 'AI_API_KEY is not configured on the backend.',
      });
      this.emitEditorEvent(subject, { type: 'done', data: '' });
      subject.complete();
      return;
    }

    const prompt = req.prompt.trim();
    const skillContext = inferUiDesignSkillContext(prompt);
    const clarification = buildEditorClarification({
      prompt,
      document: req.document,
      pages: req.pages,
      selectedNode: req.selectedNode,
      selectedDescriptor: req.selectedDescriptor,
      clarificationChoice: req.clarificationChoice,
    });
    if (clarification) {
      this.emitEditorEvent(subject, { type: 'clarification', data: clarification });
      this.emitEditorEvent(subject, { type: 'done', data: '' });
      subject.complete();
      return;
    }

    const model = this.resolveConfiguredModel(req.model);
    const selectedChoiceText =
      req.clarificationChoice &&
      typeof req.clarificationChoice === 'object' &&
      'value' in req.clarificationChoice &&
      typeof (req.clarificationChoice as ClarificationChoiceRecord).value === 'string'
        ? (req.clarificationChoice as RequiredClarificationChoiceRecord).value
        : '';

    const providerLog = await this.editorConversations.loadEditorProviderLog(
      ownerUserId,
      cacheOptions?.conversationId,
    );
    const persistedSession = await this.editorConversations.loadEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
    );
    const previousResponseId =
      cacheOptions?.previousResponseId ?? persistedSession?.previousResponseId;
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      previousResponseId,
    );
    const fallbackConversation =
      providerLog.length > 0 ? [] : buildConversationContextMessages(req.conversation);
    const templateKnowledge = await this.loadTemplateAgentKnowledge(
      ownerUserId,
      req.document,
      cacheOptions?.conversationId,
    );
    const templateKnowledgeContext = summarizeTemplateAgentKnowledge(templateKnowledge);
    const stableEditorContext = [
      buildEditorStablePrefixContext(req.document.components),
      templateKnowledgeContext,
    ]
      .filter(Boolean)
      .join('\n\n');
    const effectiveTemplateProfile = templateKnowledge.effectiveProfile
      ? (templateKnowledge.effectiveProfile as TemplateProfile)
      : undefined;
    const prefixMessages: StreamRequest['messages'] = [
      { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },
      { role: 'system', content: stableEditorContext },
    ];
    const messages: StreamRequest['messages'] = [
      ...prefixMessages,
      ...providerLog,
      ...fallbackConversation,
      {
        role: 'user',
        content: [
          'Current turn context:',
          '',
          formatUiDesignSkillContextForPrompt(skillContext),
          '',
          selectedChoiceText
            ? buildEditorMinimalVolatileContext(
                req.document,
                req.pages,
                req.selectedNode,
                req.selectedDescriptor,
              )
            : buildEditorTrimmedVolatileContext(
                req.document,
                req.pages,
                req.selectedNode,
                req.selectedDescriptor,
                prompt,
              ),
          selectedChoiceText
            ? ['', 'Confirmed clarification choice:', selectedChoiceText].join('\n')
            : '',
          '',
          'User request:',
          prompt,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const editorTools = selectEditorEditTools([prompt, selectedChoiceText].join('\n'));
    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools: editorTools,
      toolSpecs: this.editorToolSpecs(editorTools),
      maxIterations: EDITOR_AGENT_MAX_ITERATIONS,
      isCancelled: () => subject.closed,
      onTextDelta: (text) => {
        this.emitEditorEvent(subject, { type: 'text', data: text });
      },
      onToolEvent: (event) => {
        if (event.status === 'start') {
          this.emitEditorEvent(subject, { type: 'tool_start', data: event.name });
        } else if (event.status === 'done') {
          this.emitEditorEvent(subject, { type: 'tool_done', data: event.name });
        } else {
          this.emitEditorEvent(subject, { type: 'tool_error', data: event.detail ?? event.name });
        }
      },
      onError: (msg) => {
        this.emitEditorEvent(subject, { type: 'error', data: msg });
      },
      onUsage: (usage) =>
        this.tokenUsageService
          .recordTokenUsage(ownerUserId, model, usage, 'editor', this.aiConfig.provider)
          .then(() => {
            this.tokenUsageService.logCacheUsage(ownerUserId, model, usage, 'editor');
          }),
      requestCache: previousResponseId ? { previousResponseId } : undefined,
      toolExecutor: (name, args) =>
        this.executeEditorTool(subject, name, args, req.document, effectiveTemplateProfile),
    });

    const result = await loop.run(messages);
    await this.editorConversations.saveEditorProviderLog(
      ownerUserId,
      cacheOptions?.conversationId,
      result.messages.slice(prefixMessages.length),
    );
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      result.responseId ?? previousResponseId,
    );
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, { type: 'error', data: result.error ?? 'Unknown error' });
    }
    this.emitEditorEvent(subject, { type: 'done', data: '' });
    subject.complete();
  }

  private emitEditorEvent(subject: Subject<StreamSseEvent>, event: EditorSseEventPayload): void {
    subject.next({ data: JSON.stringify(event) });
  }

  private editorToolSpecs(tools: readonly ProviderTool[] = EDITOR_EDIT_TOOLS) {
    return new Map(tools.map((tool) => [tool.name, { name: tool.name }]));
  }

  private executeEditorTool(
    subject: Subject<StreamSseEvent>,
    name: string,
    args: Record<string, unknown>,
    document?: ThemeLayoutDocument,
    profile?: TemplateProfile,
  ): Promise<ToolResult> {
    if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
      return Promise.resolve({
        output: JSON.stringify({ error: `Unknown tool: ${name}` }),
      });
    }

    try {
      const edit = editorToolCallToOperations(name, args);
      const compiledEdit = this.compileSemanticEditorOperations(edit, document, profile);
      this.assertEditorOperations(compiledEdit);
      this.emitEditorEvent(subject, {
        type: 'edit_request',
        data: JSON.stringify(compiledEdit),
      });
      return Promise.resolve({
        output: JSON.stringify({
          success: true,
          detail: 'Edit instructions were sent to the editor client.',
          warnings: compiledEdit.warnings,
        }),
      });
    } catch (err) {
      return Promise.resolve({
        output: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }

  private compileSemanticEditorOperations(
    edit: EditorToolInput,
    document: ThemeLayoutDocument | undefined,
    profile: TemplateProfile | undefined,
  ): EditorToolInputWithWarnings {
    if (!Array.isArray(edit.operations) || !document) {
      return edit;
    }

    const operations: unknown[] = [];
    const warnings: string[] = [];
    for (const operation of edit.operations) {
      if (
        operation &&
        typeof operation === 'object' &&
        typeof (operation as OperationTypeRecord).type === 'string' &&
        isSemanticEditorInstruction(operation as SemanticOperationRecord)
      ) {
        const compiled = compileSemanticEditorInstruction(
          document,
          operation as SemanticEditorInstruction,
          profile,
        );
        if (!compiled.success || !compiled.data) {
          throw new Error(JSON.stringify(compiled.error));
        }
        operations.push(...compiled.data.operations);
        warnings.push(...compiled.data.warnings);
        continue;
      }
      operations.push(operation);
    }

    return {
      ...edit,
      operations,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  private assertEditorOperations(input: EditorToolInput): void {
    if (!Array.isArray(input.operations)) {
      throw new Error('editor tool requires an operations array');
    }

    for (const operation of input.operations) {
      if (!operation || typeof operation !== 'object') {
        throw new Error('Each editor operation must be an object');
      }
    }
  }

  async saveTemplate(
    ownerUserId: string,
    input: TemplateToolInput,
  ): Promise<SaveGeneratedTemplateResult> {
    const result = await this.templatesService.saveGeneratedTemplate(ownerUserId, input);
    this.logger.log(`Template ${result.action}: ${result.templateId}`);
    return result;
  }

  private isEditorAgentStreamRequest(value: unknown): value is EditorAgentStreamRequest {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const input = value as EditorAgentStreamRequestCandidate;
    return (
      typeof input.prompt === 'string' &&
      Boolean(input.document) &&
      typeof input.document === 'object' &&
      !Array.isArray(input.messages)
    );
  }
}
