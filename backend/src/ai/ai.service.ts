import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { type SseEventType } from '@shared/agent/contracts/sseEvents';
import {
  type AgentTemplateKnowledgeContext,
  buildTemplateProfile,
  commitEditorDocumentSnapshot,
  firstMissingExistingNode,
  QueryLoop,
  type TemplateProfile,
  type ToolResult,
} from '@shared/agent/runtime';
import { Observable, Subject } from 'rxjs';

import { ConfigService } from '../config/config.service';
import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
} from '../templates/repositories/templateRead.repository';
import {
  TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
  type TemplateAgentKnowledgeServicePort,
} from '../templates/templateAgentKnowledge.service';
import { TemplatesService } from '../templates/templates.service';
import { TOKEN_BALANCE_EXHAUSTED_MESSAGE } from '../users/services/userQuota.service';
import { hashJson } from './agentRunner.helpers';
import {
  assertEditorOperations,
  buildStructuredEditorMessages,
  checkRateLimit,
  compileSemanticEditorOperations,
  type EditorAgentStreamRequest,
  editorToolSpecs,
  extractClarificationChoiceText,
  isEditorAgentStreamRequest,
  type ProviderCacheOptions,
  type RateLimitEntry,
  type SaveGeneratedTemplateResult,
  type StreamRequest,
  type StreamSseEvent,
  withRequestScopedCache,
} from './ai.service.helpers';
import { OpenAIProvider } from './core/providers/openai.provider';
import { OpenAICompatibleProvider } from './core/providers/openaiCompatible.provider';
import type { AIProvider, ProviderMessage, ProviderStreamEvent } from './core/providers/types';
import { getContextWindow } from './core/utils/tokens';
import {
  bindEditorEditTarget,
  buildEditorClarification,
  formatBoundEditorTarget,
} from './editorClarification';
import { PendingClarificationStore } from './pendingClarification.store';
import { AI_SEMANTIC_TARGETS, type AiSemanticTargetConfig } from './semanticTargets.config';
import {
  type EditorAiConversationDto,
  EditorConversationService,
  type SaveEditorAiConversationInput,
} from './services/editorConversation.service';
import { EditorEditOutbox } from './services/editorEditOutbox.service';
import { ProviderLogCompactionService } from './services/providerLogCompaction.service';
import { type AiCacheStatsDto, TokenUsageService } from './services/tokenUsage.service';
import { fitsSseFrame, serializeSseEvent } from './sse/sseEnvelope';
import {
  EDITOR_EDIT_TOOL_NAMES,
  EDITOR_EDIT_TOOLS,
  editorToolCallToOperations,
  runEditorSearchTool,
  selectEditorEditTools,
} from './tools/editorEdit.tool';
import type { TemplateToolInput } from './tools/generateTemplate.tool';

export interface AiConfigDto {
  provider: string;
  model: string;
  models: {
    pro: string;
    lite?: string;
    image?: string;
  };
  contextWindow?: number;
  semanticTargets: AiSemanticTargetConfig[];
}

// Re-export types from sub-services for backward compatibility
export type {
  EditorAgentStreamRequest,
  PipelineStagePayload,
  StreamRequest,
  StreamSseEvent,
} from './ai.service.helpers';
export type {
  EditorAiConversationDto,
  SaveEditorAiConversationInput,
} from './services/editorConversation.service';
export type { AiCacheStatsDto } from './services/tokenUsage.service';

const rateLimitMap = new Map<string, RateLimitEntry>();

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
    private readonly editorEditOutbox: EditorEditOutbox,
    @Optional() private readonly clarifications?: PendingClarificationStore,
  ) {
    const apiKey = this.config.ai.apiKey ?? '';

    this.aiConfig = {
      provider: this.config.ai.provider,
      model: this.config.ai.model,
      models: this.config.ai.models,
      contextWindow: this.config.ai.contextWindow,
      semanticTargets: AI_SEMANTIC_TARGETS,
    };

    this.apiKeyConfigured = apiKey.length > 0;
    if (!this.apiKeyConfigured) {
      this.logger.warn('AI_API_KEY is not configured. AI stream requests will fail.');
    }

    this.logger.log(
      `AI provider: ${this.config.ai.provider} (baseUrl: ${this.config.ai.baseUrl ?? 'default'})`,
    );

    if (this.config.ai.provider === 'openaiCompatible') {
      this.provider = new OpenAICompatibleProvider(
        apiKey,
        this.config.ai.baseUrl,
        'openaiCompatible',
        {
          reasoningMode: this.config.ai.reasoningMode,
          cacheStrategy: this.config.ai.cacheStrategy,
          supportsDeveloperRole: this.config.ai.supportsDeveloperRole,
          supportsForcedToolChoice: this.config.ai.supportsForcedToolChoice,
          extraRequestParams: this.config.ai.extraRequestParams,
        },
      );
    } else {
      this.provider = new OpenAIProvider(apiKey, this.config.ai.baseUrl, 'openai');
    }

    this.providerLogCompaction.configure(this.aiConfig, this.provider, this.apiKeyConfigured);
  }

  checkRateLimit(userId: string): void {
    checkRateLimit(rateLimitMap, userId);
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
    liteModel: string;
    apiKeyConfigured: boolean;
  } {
    return {
      provider: this.provider,
      model: this.aiConfig.models.pro,
      // 辅助 stage 用 lite 提速；未配 lite 时回退 pro（行为不变）。
      liteModel: this.aiConfig.models.lite ?? this.aiConfig.models.pro,
      apiKeyConfigured: this.apiKeyConfigured,
    };
  }

  async recordTemplatePipelineTokenUsage(
    ownerUserId: string,
    model: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheHitTokens?: number;
      cacheMissTokens?: number;
    },
  ): Promise<number | undefined> {
    const remaining = await this.tokenUsageService.recordTokenUsage(
      ownerUserId,
      model,
      usage,
      'ai-templates',
      this.aiConfig.provider,
    );
    this.tokenUsageService.logCacheUsage(ownerUserId, model, usage, 'ai-templates');
    return remaining;
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
      const abortController = new AbortController();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      void this.runStream(ownerUserId, req, subject, cacheOptions, abortController.signal).catch(
        (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitStreamEvent(subject, { type: 'error', message: msg });
          subject.complete();
        },
      );

      return () => {
        abortController.abort();
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
      const abortController = new AbortController();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      const runner = isEditorAgentStreamRequest(req)
        ? this.runStructuredEditorStream(
            ownerUserId,
            req,
            subject,
            cacheOptions,
            abortController.signal,
          )
        : this.runEditorStream(ownerUserId, req, subject, cacheOptions, abortController.signal);
      runner.catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.emitEditorEvent(subject, 'error', { message: msg });
        subject.complete();
      });

      return () => {
        abortController.abort();
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
    signal?: AbortSignal,
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
    const request = withRequestScopedCache(
      this.provider,
      { ...req, model, ...(signal ? { signal } : {}) },
      cacheOptions,
    );

    for await (const event of this.provider.stream(request)) {
      if (signal?.aborted || subject.closed) {
        break;
      }
      if (event.type === 'done' && event.usage) {
        this.tokenUsageService.logCacheUsage(ownerUserId, model, event.usage, 'stream');
        await this.tokenUsageService.recordTokenUsage(
          ownerUserId,
          model,
          event.usage,
          'stream',
          this.aiConfig.provider,
        );
        // 在 done 之前先发 usage_summary, 让前端能独立消费
        subject.next({
          data: serializeSseEvent('usage_summary', { model, usage: event.usage }),
        });
      }
      this.emitStreamEvent(subject, event);
    }

    subject.complete();
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

  private async recordEditorUsage(
    ownerUserId: string,
    model: string,
    subject: Subject<StreamSseEvent>,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheHitTokens?: number;
      cacheMissTokens?: number;
    },
    markExhausted: () => void,
  ): Promise<void> {
    const remaining = await this.tokenUsageService.recordTokenUsage(
      ownerUserId,
      model,
      usage,
      'editor',
      this.aiConfig.provider,
    );
    this.tokenUsageService.logCacheUsage(ownerUserId, model, usage, 'editor');
    if (remaining === 0) {
      markExhausted();
      this.emitEditorEvent(subject, 'error', { message: TOKEN_BALANCE_EXHAUSTED_MESSAGE });
    }
  }

  private emitStreamEvent(subject: Subject<StreamSseEvent>, event: ProviderStreamEvent): void {
    const type =
      event.type === 'reasoning_delta'
        ? 'reasoning_delta'
        : event.type === 'text_delta'
          ? 'text_delta'
          : event.type === 'tool_call'
            ? 'tool_call'
            : event.type === 'done'
              ? 'done'
              : 'error';
    const payload =
      event.type === 'reasoning_delta'
        ? { delta: event.text }
        : event.type === 'text_delta'
          ? { text: event.text }
          : event.type === 'tool_call'
            ? { id: event.id, name: event.name, arguments: event.arguments }
            : event.type === 'done'
              ? {
                  ...(event.usage ? { usage: event.usage } : {}),
                  ...(event.stopReason ? { stopReason: event.stopReason } : {}),
                  ...(event.response_id ? { response_id: event.response_id } : {}),
                  ...(event.reasoningContent ? { reasoningContent: event.reasoningContent } : {}),
                }
              : { message: event.message };
    subject.next({ data: serializeSseEvent(type, payload as never) });
  }

  private async runEditorStream(
    ownerUserId: string,
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: ProviderCacheOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitEditorEvent(subject, 'error', {
        message: 'AI_API_KEY is not configured on the backend.',
      });
      this.emitEditorEvent(subject, 'done', {});
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
    const persistedResponseId = persistedSession?.previousResponseId;
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      persistedResponseId,
    );
    const scopedRequest = withRequestScopedCache(
      this.provider,
      { model, messages: req.messages, tools: editorTools },
      {
        conversationId: cacheOptions?.conversationId,
      },
    );
    let balanceExhausted = false;
    let lastUsage = emptyEditorUsage();
    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools: editorTools,
      toolSpecs: editorToolSpecs(editorTools),
      maxIterations: this.config.ai.editorAgentMaxIterations,
      maxContextTokens: getContextWindow(model, this.aiConfig.contextWindow),
      isCancelled: () => subject.closed || Boolean(signal?.aborted) || balanceExhausted,
      ...(signal ? { signal } : {}),
      onTextDelta: (text) => {
        this.emitEditorEvent(subject, 'text_delta', { text });
      },
      onReasoningDelta: (delta) => {
        this.emitEditorEvent(subject, 'reasoning_delta', { delta });
      },
      onToolEvent: (event) => {
        if (event.status === 'start') {
          this.emitEditorEvent(subject, 'tool_start', {
            name: event.name,
            ts: new Date().toISOString(),
          });
        } else if (event.status === 'done') {
          this.emitEditorEvent(subject, 'tool_done', {
            name: event.name,
            durationMs: 0,
          });
        } else {
          this.emitEditorEvent(subject, 'tool_error', {
            name: event.name,
            error: event.detail ?? event.name,
          });
        }
      },
      onError: (msg) => {
        this.emitEditorEvent(subject, 'error', { message: msg });
      },
      onUsage: (usage) => {
        lastUsage = addEditorUsage(lastUsage, usage);
        return this.recordEditorUsage(ownerUserId, model, subject, usage, () => {
          balanceExhausted = true;
        });
      },
      ...(scopedRequest.cache ? { requestCache: scopedRequest.cache } : {}),
      ...(scopedRequest.cacheKey ? { requestCacheKey: scopedRequest.cacheKey } : {}),
      toolExecutor: (name, args) => this.executeEditorTool(subject, ownerUserId, name, args),
    });

    const result = await loop.run(scopedRequest.messages);
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      result.responseId ?? persistedResponseId,
    );
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, 'error', { message: result.error ?? 'Unknown error' });
    }
    if (lastUsage.inputTokens > 0 || lastUsage.outputTokens > 0) {
      this.emitEditorEvent(subject, 'usage_summary', { model, usage: lastUsage });
    }
    this.emitEditorEvent(subject, 'done', { stopReason: result.stopReason });
    subject.complete();
  }

  private async runStructuredEditorStream(
    ownerUserId: string,
    req: EditorAgentStreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: ProviderCacheOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitEditorEvent(subject, 'error', {
        message: 'AI_API_KEY is not configured on the backend.',
      });
      this.emitEditorEvent(subject, 'done', {});
      subject.complete();
      return;
    }

    const prompt = req.prompt.trim();
    const clarification = buildEditorClarification({
      prompt,
      document: req.document,
      pages: req.pages,
      selectedNode: req.selectedNode,
      selectedDescriptor: req.selectedDescriptor,
      clarificationChoice: req.clarificationChoice,
    });
    if (clarification) {
      this.clarifications?.remember(
        ownerUserId,
        cacheOptions?.conversationId,
        clarification.options,
        Boolean(clarification.allowCustom),
      );
      this.emitEditorEvent(subject, 'clarification', {
        question: clarification.question,
        options: clarification.options,
      });
      this.emitEditorEvent(subject, 'done', {});
      subject.complete();
      return;
    }

    const model = this.resolveConfiguredModel(req.model);
    const selectedChoiceText = extractClarificationChoiceText(req.clarificationChoice);

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
    // PR-E: 读取上次发送的 prefix 摘要, 供本轮 cache_diagnostic 计算 prefixChanged 用.
    // 没有 conversationId (旧客户端) 或会话首次发送时, 返回 null → prefixChanged = false.
    const resolvedTemplateId = EditorConversationService.templateIdFromConversationId(
      cacheOptions?.conversationId,
    );
    const lastPrefixHash = resolvedTemplateId
      ? await this.editorConversations
          .loadLastPrefixHash(ownerUserId, resolvedTemplateId)
          .catch(() => null)
      : null;
    const persistedResponseId = persistedSession?.previousResponseId;
    await this.editorConversations.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      this.provider.name,
      persistedResponseId,
    );
    const templateKnowledge = await this.loadTemplateAgentKnowledge(
      ownerUserId,
      req.document,
      cacheOptions?.conversationId,
    );
    const boundTarget = bindEditorEditTarget({
      prompt,
      document: req.document,
      pages: req.pages,
      selectedNode: req.selectedNode,
      selectedDescriptor: req.selectedDescriptor,
      clarificationChoice: req.clarificationChoice,
    });
    const { prefixMessages, messages, effectiveTemplateProfile } = buildStructuredEditorMessages({
      req,
      prompt,
      selectedChoiceText,
      providerLog,
      templateKnowledge,
      boundTargetText: boundTarget ? formatBoundEditorTarget(boundTarget) : '',
    });

    const editorTools = selectEditorEditTools([prompt, selectedChoiceText].join('\n'));
    const scopedRequest = withRequestScopedCache(
      this.provider,
      { model, messages, tools: editorTools },
      {
        conversationId: cacheOptions?.conversationId,
      },
    );
    let balanceExhausted = false;
    let lastUsage = emptyEditorUsage();
    const profileBox: { profile?: TemplateProfile } = { profile: effectiveTemplateProfile };
    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools: editorTools,
      toolSpecs: editorToolSpecs(editorTools),
      maxIterations: this.config.ai.editorAgentMaxIterations,
      maxContextTokens: getContextWindow(model, this.aiConfig.contextWindow),
      isCancelled: () => subject.closed || Boolean(signal?.aborted) || balanceExhausted,
      ...(signal ? { signal } : {}),
      onTextDelta: (text) => {
        this.emitEditorEvent(subject, 'text_delta', { text });
      },
      onReasoningDelta: (delta) => {
        this.emitEditorEvent(subject, 'reasoning_delta', { delta });
      },
      onToolEvent: (event) => {
        if (event.status === 'start') {
          this.emitEditorEvent(subject, 'tool_start', {
            name: event.name,
            ts: new Date().toISOString(),
          });
        } else if (event.status === 'done') {
          this.emitEditorEvent(subject, 'tool_done', {
            name: event.name,
            durationMs: 0,
          });
        } else {
          this.emitEditorEvent(subject, 'tool_error', {
            name: event.name,
            error: event.detail ?? event.name,
          });
        }
      },
      onError: (msg) => {
        this.emitEditorEvent(subject, 'error', { message: msg });
      },
      onUsage: (usage) => {
        lastUsage = addEditorUsage(lastUsage, usage);
        return this.recordEditorUsage(ownerUserId, model, subject, usage, () => {
          balanceExhausted = true;
        });
      },
      ...(scopedRequest.cache ? { requestCache: scopedRequest.cache } : {}),
      ...(scopedRequest.cacheKey ? { requestCacheKey: scopedRequest.cacheKey } : {}),
      toolExecutor: (name, args) =>
        this.executeEditorTool(
          subject,
          ownerUserId,
          name,
          args,
          { document: req.document },
          profileBox,
        ),
    });

    const result = await loop.run(scopedRequest.messages);
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
      result.responseId ?? persistedResponseId,
    );
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, 'error', { message: result.error ?? 'Unknown error' });
    }
    if (lastUsage.inputTokens > 0 || lastUsage.outputTokens > 0) {
      this.emitEditorEvent(subject, 'usage_summary', { model, usage: lastUsage });
    }
    // 缓存诊断 (P0 可观测性): 每轮结束后 emit 一次, 前端可用于诊断 cache 命中率与 prefix 稳定性.
    // 字段含义详见 shared/agent/contracts/sseEvents.ts 的 cache_diagnostic payload.
    // PR-E 接入: prefixChanged 与 lastPrefixHash 真实联动; compactionStrategy 仍为 null
    // (editor 流暂未启用 autoCompact).
    {
      const prefixHash = hashJson(prefixMessages);
      const hit = lastUsage.cacheHitTokens;
      const miss = lastUsage.cacheMissTokens;
      const cacheHitRate =
        typeof hit === 'number' && typeof miss === 'number' && hit + miss > 0
          ? hit / (hit + miss)
          : null;
      const prefixChanged = EditorConversationService.computePrefixChanged(
        lastPrefixHash,
        prefixHash,
      );
      this.emitEditorEvent(subject, 'cache_diagnostic', {
        prefixHash,
        cacheHitRate,
        compactionStrategy: null,
        prefixChanged,
      });
      // PR-E 持久化: 把本轮 prefix 摘要 + cache 快照写回 DB, 供下次启动时比较.
      // 失败仅记录, 不中断主流程 (诊断数据是 best-effort).
      if (resolvedTemplateId) {
        try {
          const providerCaps = this.provider.getCapabilities();
          await this.editorConversations.saveCacheContext(
            ownerUserId,
            resolvedTemplateId,
            prefixHash,
            {
              provider: this.provider.name,
              model,
              cacheStrategy: providerCaps.cacheStrategy,
              lastCompactionStrategy: null,
              lastCacheHitRate: cacheHitRate,
            },
          );
        } catch (err) {
          this.logger.warn(
            `saveCacheContext failed for ${resolvedTemplateId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
    this.emitEditorEvent(subject, 'done', { stopReason: result.stopReason });
    subject.complete();
  }

  private emitEditorEvent(
    subject: Subject<StreamSseEvent>,
    type: SseEventType,
    payload: unknown,
  ): void {
    subject.next({ data: serializeSseEvent(type, payload as never) });
  }

  private async executeEditorTool(
    subject: Subject<StreamSseEvent>,
    ownerUserId: string,
    name: string,
    args: Record<string, unknown>,
    snapshot?: { document: ThemeLayoutDocument },
    profileBox?: { profile?: TemplateProfile },
  ): Promise<ToolResult> {
    if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
      return Promise.resolve({
        output: JSON.stringify({ error: `Unknown tool: ${name}` }),
      });
    }

    const search = runEditorSearchTool(name, args, snapshot?.document);
    if (search) {
      return Promise.resolve(search);
    }

    try {
      const edit = editorToolCallToOperations(name, args);
      const compiledEdit = compileSemanticEditorOperations(
        edit,
        snapshot?.document,
        profileBox?.profile,
      );
      assertEditorOperations(compiledEdit);
      const operations = Array.isArray(compiledEdit.operations) ? compiledEdit.operations : [];
      let nextDocument: ThemeLayoutDocument | undefined;
      if (snapshot?.document) {
        const missing = firstMissingExistingNode(snapshot.document, operations);
        if (missing) {
          return Promise.resolve({ output: JSON.stringify(missing) });
        }
        const committed = commitEditorDocumentSnapshot(snapshot.document, operations);
        if (!committed.document) {
          return Promise.resolve({
            output: JSON.stringify({
              error: committed.error ?? 'Edit could not be applied to the current document.',
            }),
          });
        }
        nextDocument = committed.document;
      }
      const delivered = await this.deliverEditorEdit(subject, ownerUserId, compiledEdit);
      if (!delivered) {
        return Promise.resolve({
          output: JSON.stringify({
            error: 'Edit instructions were too large to deliver to the editor.',
          }),
        });
      }
      if (snapshot && nextDocument) {
        snapshot.document = nextDocument;
        if (profileBox) {
          try {
            profileBox.profile = buildTemplateProfile(nextDocument);
          } catch {
            // Keep the previous profile when the in-progress tree cannot be summarized yet.
          }
        }
      }
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

  private async deliverEditorEdit(
    subject: Subject<StreamSseEvent>,
    ownerUserId: string,
    compiledEdit: { operations?: unknown; warnings?: unknown; reason?: unknown },
  ): Promise<boolean> {
    const data = JSON.stringify(compiledEdit);
    const inline = { data };
    if (fitsSseFrame('edit_request', inline)) {
      this.emitEditorEvent(subject, 'edit_request', inline);
      return true;
    }

    const editId = await this.editorEditOutbox.put(ownerUserId, data);
    const reference = { editId, bytes: data.length };
    if (!fitsSseFrame('edit_request', reference)) {
      return false;
    }
    this.emitEditorEvent(subject, 'edit_request', reference);
    return true;
  }

  async saveTemplate(
    ownerUserId: string,
    input: TemplateToolInput,
  ): Promise<SaveGeneratedTemplateResult> {
    const result = await this.templatesService.saveGeneratedTemplate(ownerUserId, input);
    this.logger.log(`Template ${result.action}: ${result.templateId}`);
    return result;
  }
}

interface EditorUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

function emptyEditorUsage(): EditorUsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 };
}

function addEditorUsage(total: EditorUsageTotals, delta: EditorUsageTotals): EditorUsageTotals {
  return {
    inputTokens: total.inputTokens + delta.inputTokens,
    outputTokens: total.outputTokens + delta.outputTokens,
    cacheHitTokens: (total.cacheHitTokens ?? 0) + (delta.cacheHitTokens ?? 0),
    cacheMissTokens: (total.cacheMissTokens ?? 0) + (delta.cacheMissTokens ?? 0),
  };
}
