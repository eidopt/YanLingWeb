import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  buildConversationContextMessages,
  buildEditorMinimalVolatileContext,
  buildEditorStablePrefixContext,
  buildEditorTrimmedVolatileContext,
} from '@shared/agent/context/editorContext';
import { EDITOR_COPILOT_SYSTEM_PROMPT } from '@shared/agent/prompts/editorCopilotPrompt';
import type {
  AgentConversationMessage,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/types';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';
import { Observable, Subject } from 'rxjs';
import { IsNull, Not, Repository } from 'typeorm';

import { ConfigService } from '../config/config.service';
import { deriveTags } from '../shared/derive-tags';
import { Template } from '../templates/entities/template.entity';
import { assertValidTemplateLayout } from '../templates/template-layout-validation';
import { User } from '../users/entities/user.entity';
import { OpenAIProvider } from './core/providers/openai.provider';
import { OpenAICompatibleProvider } from './core/providers/openai-compatible.provider';
import type {
  AIProvider,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderTool,
} from './core/providers/types';
import { QueryLoop, type ToolResult } from './core/query-loop';
import { tokenCountWithEstimation } from './core/utils/tokens';
import { buildEditorClarification } from './editor-clarification';
import {
  type AiTokenUsageEndpoint,
  AiTokenUsageEvent,
} from './entities/ai-token-usage.entity';
import {
  EditorAiConversation,
  type EditorAiConversationMessageRecord,
  type EditorAiProviderSessionRecord,
} from './entities/editor-ai-conversation.entity';
import {
  AI_SEMANTIC_TARGETS,
  type AiSemanticTargetConfig,
} from './semantic-targets.config';
import { EditorConversationService, type EditorAiConversationDto, type SaveEditorAiConversationInput } from './services/editor-conversation.service';
import { ProviderLogCompactionService } from './services/provider-log-compaction.service';
import { TokenUsageService, type AiCacheStatsDto } from './services/token-usage.service';
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
  };
  semanticTargets: AiSemanticTargetConfig[];
}

// Re-export types from sub-services for backward compatibility
export type { EditorAiConversationDto, SaveEditorAiConversationInput } from './services/editor-conversation.service';
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

interface TokenUsagePayload {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

// Simple in-memory rate limiter: max N requests per window per user
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number; }>();
const DEFAULT_EDITOR_AGENT_MAX_ITERATIONS = 96;
const EDITOR_PROVIDER_SESSION_TTL_MS = 30 * 60_000;
const EDITOR_PROVIDER_SESSION_EXPIRY_SAFETY_MS = 60_000;
const MAX_EDITOR_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_EDITOR_CONVERSATION_MESSAGE_CHARS = 40_000;
const MAX_PROVIDER_LOG_TOKENS = 500_000;
const PROVIDER_LOG_FOLD_TAIL_TOKENS = 180_000;
const PROVIDER_LOG_FOLD_MARKER = [
  '[Editor provider history summary - earlier provider messages folded',
  'for cache and context efficiency]',
].join(' ');

function resolveEditorAgentMaxIterations() {
  const configured = Number(process.env.EDITOR_AGENT_MAX_ITERATIONS);
  return Number.isFinite(configured) && configured >= 32
    ? Math.floor(configured)
    : DEFAULT_EDITOR_AGENT_MAX_ITERATIONS;
}

const EDITOR_AGENT_MAX_ITERATIONS = resolveEditorAgentMaxIterations();

function normalizeEditorConversationMessages(
  messages: unknown,
): EditorAiConversationMessageRecord[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized = messages
    .flatMap((message): EditorAiConversationMessageRecord[] => {
      if (!message || typeof message !== 'object') {
        return [];
      }

      const value = message as Record<string, unknown>;
      const role = value.role;
      const content = typeof value.content === 'string'
        ? value.content.trim()
        : '';
      if (
        (role !== 'user' && role !== 'assistant')
        || content.length === 0
      ) {
        return [];
      }

      return [{
        role,
        content: content.length > MAX_EDITOR_CONVERSATION_MESSAGE_CHARS
          ? `[Earlier content omitted]\n${content.slice(-MAX_EDITOR_CONVERSATION_MESSAGE_CHARS)}`
          : content,
      }];
    });

  const retained: EditorAiConversationMessageRecord[] = [];
  let totalChars = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const next = normalized[index];
    const nextTotal = totalChars + next.content.length;
    if (nextTotal > MAX_EDITOR_CONVERSATION_CONTEXT_CHARS) {
      break;
    }
    retained.unshift(next);
    totalChars = nextTotal;
  }
  return retained;
}

function normalizeProviderMessages(messages: unknown): ProviderMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message): ProviderMessage[] => {
    if (!message || typeof message !== 'object') {
      return [];
    }
    const value = message as Record<string, unknown>;
    const role = value.role;
    if (
      role !== 'user'
      && role !== 'assistant'
      && role !== 'tool_call'
      && role !== 'tool_result'
    ) {
      return [];
    }
    const content = typeof value.content === 'string' ? value.content : '';
    const normalized: ProviderMessage = { role, content };
    if (typeof value.toolCallId === 'string') {
      normalized.toolCallId = value.toolCallId;
    }
    if (typeof value.toolName === 'string') {
      normalized.toolName = value.toolName;
    }
    if (typeof value.toolArguments === 'string') {
      normalized.toolArguments = value.toolArguments;
    }
    if (typeof value.reasoningContent === 'string') {
      normalized.reasoningContent = value.reasoningContent;
    }
    return [normalized];
  });
}

function providerMessageTokenEstimate(message: ProviderMessage): number {
  return tokenCountWithEstimation([message]);
}

function providerLogFoldBoundary(
  messages: readonly ProviderMessage[],
  tailTokens = PROVIDER_LOG_FOLD_TAIL_TOKENS,
): number {
  let tokens = 0;
  let boundary = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const nextTokens = tokens + providerMessageTokenEstimate(message);
    if (nextTokens > tailTokens && boundary >= 0) {
      break;
    }
    tokens = nextTokens;
    if (message.role === 'user') {
      boundary = index;
    }
  }
  return boundary;
}

function serializeProviderMessageForSummary(message: ProviderMessage, index: number): string {
  const lines = [
    `Message ${index + 1}`,
    `role: ${message.role}`,
  ];
  if (message.toolName) {
    lines.push(`toolName: ${message.toolName}`);
  }
  if (message.toolCallId) {
    lines.push(`toolCallId: ${message.toolCallId}`);
  }
  if (message.toolArguments) {
    lines.push(`toolArguments: ${message.toolArguments}`);
  }
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);
  lines.push('content:', content);
  return lines.join('\n');
}

function templateIdFromConversationId(conversationId: string | undefined): string | null {
  const prefix = 'editor-template-';
  if (!conversationId?.startsWith(prefix)) {
    return null;
  }
  try {
    return decodeURIComponent(conversationId.slice(prefix.length));
  } catch {
    return conversationId.slice(prefix.length);
  }
}

function isProviderSessionFresh(
  session: EditorAiProviderSessionRecord | null | undefined,
): session is EditorAiProviderSessionRecord {
  if (!session?.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt)
    && expiresAt - EDITOR_PROVIDER_SESSION_EXPIRY_SAFETY_MS > Date.now();
}

function buildProviderSessionRecord(
  provider: string,
  model: string,
  conversationId: string,
  previousResponseId?: string,
): EditorAiProviderSessionRecord {
  const now = new Date();
  return {
    provider,
    model,
    conversationId,
    ...(previousResponseId && { previousResponseId }),
    expiresAt: new Date(now.getTime() + EDITOR_PROVIDER_SESSION_TTL_MS).toISOString(),
    updatedAt: now.toISOString(),
  };
}

@Injectable()
export class AiService {
  readonly aiConfig: AiConfigDto;
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AIProvider;
  private readonly apiKeyConfigured: boolean;

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(EditorAiConversation)
    private readonly editorConversationRepo: Repository<EditorAiConversation>,
    @InjectRepository(AiTokenUsageEvent)
    private readonly tokenUsageRepo: Repository<AiTokenUsageEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
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

  async getEditorConversation(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversationDto> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });

    return {
      templateId,
      messages: conversation?.messages ?? [],
      updatedAt: conversation?.updatedAt.toISOString() ?? null,
    };
  }

  async saveEditorConversation(
    ownerUserId: string,
    templateId: string,
    input: SaveEditorAiConversationInput,
  ): Promise<EditorAiConversationDto> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const messages = normalizeEditorConversationMessages(input.messages);
    const existing = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });

    if (!messages.length) {
      if (existing) {
        await this.editorConversationRepo.remove(existing);
      }
      return { templateId, messages: [], updatedAt: null };
    }

    const conversation = existing ?? this.editorConversationRepo.create({
      ownerUserId,
      templateId,
    });
    conversation.messages = messages;
    conversation.providerMessages ??= [];
    conversation.providerSession ??= null;
    const saved = await this.editorConversationRepo.save(conversation);

    return {
      templateId,
      messages: saved.messages,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  private async loadEditorProviderLog(
    ownerUserId: string,
    conversationId: string | undefined,
  ): Promise<ProviderMessage[]> {
    const templateId = templateIdFromConversationId(conversationId);
    if (!templateId) {
      return [];
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });
    return this.foldEditorProviderMessagesByTokenBudget(conversation?.providerMessages ?? []);
  }

  private async loadEditorProviderSession(
    ownerUserId: string,
    conversationId: string | undefined,
    model: string,
  ): Promise<EditorAiProviderSessionRecord | null> {
    const templateId = templateIdFromConversationId(conversationId);
    if (!templateId || !conversationId) {
      return null;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });
    const session = conversation?.providerSession;
    if (
      !isProviderSessionFresh(session)
      || session.provider !== this.provider.name
      || session.model !== model
      || session.conversationId !== conversationId
    ) {
      return null;
    }
    return session;
  }

  private async saveEditorProviderSession(
    ownerUserId: string,
    conversationId: string | undefined,
    model: string,
    previousResponseId?: string,
  ): Promise<void> {
    const templateId = templateIdFromConversationId(conversationId);
    if (!templateId || !conversationId) {
      return;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const existing = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });
    const conversation = existing ?? this.editorConversationRepo.create({
      ownerUserId,
      templateId,
      messages: [],
      providerMessages: [],
    });
    conversation.providerSession = buildProviderSessionRecord(
      this.provider.name,
      model,
      conversationId,
      previousResponseId,
    );
    await this.editorConversationRepo.save(conversation);
  }

  private async saveEditorProviderLog(
    ownerUserId: string,
    conversationId: string | undefined,
    messages: readonly ProviderMessage[],
  ): Promise<void> {
    const templateId = templateIdFromConversationId(conversationId);
    if (!templateId) {
      return;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const existing = await this.editorConversationRepo.findOne({
      where: { ownerUserId, templateId },
    });
    const conversation = existing ?? this.editorConversationRepo.create({
      ownerUserId,
      templateId,
      messages: [],
    });
    conversation.providerMessages = await this.foldEditorProviderMessagesByTokenBudget(messages);
    conversation.providerSession ??= null;
    await this.editorConversationRepo.save(conversation);
  }

  async foldEditorProviderMessagesByTokenBudget(
    messages: readonly ProviderMessage[],
    maxTokens = MAX_PROVIDER_LOG_TOKENS,
  ): Promise<ProviderMessage[]> {
    const normalized = normalizeProviderMessages(messages);
    const tokens = tokenCountWithEstimation(normalized);
    if (tokens <= maxTokens) {
      return normalized;
    }

    const boundary = providerLogFoldBoundary(normalized);
    if (boundary <= 0) {
      this.logger.warn(
        [
          `[ProviderLog] log is over budget (~${tokens} tokens) but no safe`,
          'user-turn fold boundary was found; keeping full log.',
        ].join(' '),
      );
      return normalized;
    }

    const head = normalized.slice(0, boundary);
    const tail = normalized.slice(boundary);
    const summary = await this.summarizeProviderLog(head);
    if (!summary?.content) {
      this.logger.warn(
        [
          `[ProviderLog] summary fold failed for over-budget log (~${tokens}`,
          'tokens); keeping full log.',
        ].join(' '),
      );
      return normalized;
    }

    const folded: ProviderMessage[] = [
      {
        role: 'assistant',
        content: [
          PROVIDER_LOG_FOLD_MARKER,
          '',
          summary.content,
        ].join('\n'),
        ...(summary.reasoningContent ? { reasoningContent: summary.reasoningContent } : {}),
      },
      ...tail,
    ];
    this.logger.log(
      `[ProviderLog] folded provider log messages ${normalized.length}->${folded.length} `
      + `tokens ~${tokens}->~${tokenCountWithEstimation(folded)}`,
    );
    return folded;
  }

  private async summarizeProviderLog(
    messages: readonly ProviderMessage[],
  ): Promise<{ content: string; reasoningContent?: string; } | null> {
    if (!this.apiKeyConfigured || messages.length === 0) {
      return null;
    }

    const serialized = messages
      .map((message, index) => serializeProviderMessageForSummary(message, index))
      .join('\n\n---\n\n');
    const summaryModel = this.aiConfig.models.lite ?? this.aiConfig.models.pro;
    const request: StreamRequest = {
      model: summaryModel,
      messages: [
        {
          role: 'system',
          content: [
            'You compact provider conversation history for an editor AI agent.',
            'Return a concise but self-contained prose summary.',
            [
              'Preserve user goals, clarification decisions, target pages/nodes,',
              'tool calls, edit results, unresolved issues, and constraints needed',
              'for future turns.',
            ].join(' '),
            'Do not invent facts. Do not include markdown headings. Do not call tools.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            [
              'Summarize the provider messages below. This summary will replace',
              'them in the next request history.',
            ].join(' '),
            '',
            serialized,
          ].join('\n'),
        },
      ],
    };

    let content = '';
    let reasoningContent = '';
    try {
      for await (const event of this.provider.stream(request)) {
        if (event.type === 'text_delta') {
          content += event.text;
        } else if (event.type === 'done' && event.reasoningContent) {
          reasoningContent = event.reasoningContent;
        } else if (event.type === 'error') {
          this.logger.warn(`[ProviderLog] summary fold provider error: ${event.message}`);
          return null;
        }
      }
    } catch (err) {
      this.logger.warn(
        '[ProviderLog] summary fold failed',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }

    const trimmed = content.trim();
    return trimmed ? { content: trimmed, reasoningContent } : null;
  }

  async getCacheStats(ownerUserId: string): Promise<AiCacheStatsDto> {
    const records = await this.tokenUsageRepo.find({
      where: { ownerUserId, cacheHitTokens: Not(IsNull()) },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const totalHit = records.reduce((sum, record) => sum + (record.cacheHitTokens ?? 0), 0);
    const totalMiss = records.reduce((sum, record) => sum + (record.cacheMissTokens ?? 0), 0);
    const byEndpoint = new Map<AiTokenUsageEndpoint, {
      count: number;
      cacheHitTokens: number;
      cacheMissTokens: number;
    }>();

    for (const record of records) {
      const current = byEndpoint.get(record.endpoint) ?? {
        count: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
      };
      current.count += 1;
      current.cacheHitTokens += record.cacheHitTokens ?? 0;
      current.cacheMissTokens += record.cacheMissTokens ?? 0;
      byEndpoint.set(record.endpoint, current);
    }

    return {
      totalRequests: records.length,
      totalCacheHitTokens: totalHit,
      totalCacheMissTokens: totalMiss,
      overallCacheHitRate: formatHitRate(totalHit, totalMiss),
      byEndpoint: [...byEndpoint.entries()].map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        cacheHitTokens: stats.cacheHitTokens,
        cacheMissTokens: stats.cacheMissTokens,
        hitRate: formatHitRate(stats.cacheHitTokens, stats.cacheMissTokens),
      })),
      recentRequests: records.slice(0, 20).map((record) => ({
        timestamp: record.createdAt.toISOString(),
        endpoint: record.endpoint,
        model: record.model,
        cacheHitTokens: record.cacheHitTokens,
        cacheMissTokens: record.cacheMissTokens,
        hitRate: formatHitRate(record.cacheHitTokens ?? 0, record.cacheMissTokens ?? 0),
      })),
    };
  }

  /** Proxy a streaming OpenAI-compatible Responses API request, forwarding events as SSE */
  stream(
    ownerUserId: string,
    req: StreamRequest,
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
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
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
  ): Observable<StreamSseEvent> {
    return new Observable<StreamSseEvent>((subscriber) => {
      const subject = new Subject<StreamSseEvent>();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      const runner = isEditorAgentStreamRequest(req)
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
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
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
        this.logCacheUsage(ownerUserId, model, event.usage, 'stream');
        await this.recordTokenUsage(ownerUserId, model, event.usage, 'stream');
      }
      this.emitStreamEvent(subject, event);
    }

    subject.complete();
  }

  private withRequestScopedCache(
    req: StreamRequest,
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
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

  private async ensureTemplateAccessible(
    ownerUserId: string,
    templateId: string,
  ): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: [
        { templateId, ownerUserId },
        { templateId, ownerUserId: IsNull(), isPublic: true },
      ],
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
  }

  private emitStreamEvent(
    subject: Subject<StreamSseEvent>,
    event: ProviderStreamEvent,
  ): void {
    subject.next({ data: JSON.stringify(event) });
  }

  private async runEditorStream(
    ownerUserId: string,
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
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
    const persistedSession = await this.loadEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
    );
    const previousResponseId = cacheOptions?.previousResponseId
      ?? persistedSession?.previousResponseId;
    await this.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
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
      onUsage: (usage) => this.recordTokenUsage(
        ownerUserId,
        model,
        usage,
        'editor',
      ).then(() => {
        this.logCacheUsage(ownerUserId, model, usage, 'editor');
      }),
      requestCache: previousResponseId
        ? { previousResponseId }
        : undefined,
      toolExecutor: (name, args) => this.executeEditorTool(subject, name, args),
    });

    const result = await loop.run(req.messages);
    await this.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
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
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
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
    const selectedChoiceText = req.clarificationChoice
      && typeof req.clarificationChoice === 'object'
      && 'value' in req.clarificationChoice
      && typeof (req.clarificationChoice as { value?: unknown; }).value === 'string'
      ? (req.clarificationChoice as { value: string; }).value
      : '';

    const providerLog = await this.loadEditorProviderLog(
      ownerUserId,
      cacheOptions?.conversationId,
    );
    const persistedSession = await this.loadEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
    );
    const previousResponseId = cacheOptions?.previousResponseId
      ?? persistedSession?.previousResponseId;
    await this.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      previousResponseId,
    );
    const fallbackConversation = providerLog.length > 0
      ? []
      : buildConversationContextMessages(req.conversation);
    const prefixMessages: StreamRequest['messages'] = [
      { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },
      { role: 'system', content: buildEditorStablePrefixContext(req.document.components) },
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
        ].filter(Boolean).join('\n'),
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
      onUsage: (usage) => this.recordTokenUsage(
        ownerUserId,
        model,
        usage,
        'editor',
      ).then(() => {
        this.logCacheUsage(ownerUserId, model, usage, 'editor');
      }),
      requestCache: previousResponseId
        ? { previousResponseId }
        : undefined,
      toolExecutor: (name, args) => this.executeEditorTool(subject, name, args),
    });

    const result = await loop.run(messages);
    await this.saveEditorProviderLog(
      ownerUserId,
      cacheOptions?.conversationId,
      result.messages.slice(prefixMessages.length),
    );
    await this.saveEditorProviderSession(
      ownerUserId,
      cacheOptions?.conversationId,
      model,
      result.responseId ?? previousResponseId,
    );
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, { type: 'error', data: result.error ?? 'Unknown error' });
    }
    this.emitEditorEvent(subject, { type: 'done', data: '' });
    subject.complete();
  }

  private emitEditorEvent(
    subject: Subject<StreamSseEvent>,
    event: { type: string; data: unknown; },
  ): void {
    subject.next({ data: JSON.stringify(event) });
  }

  private editorToolSpecs(tools: readonly ProviderTool[] = EDITOR_EDIT_TOOLS) {
    return new Map(tools.map((tool) => [tool.name, { name: tool.name }]));
  }

  private executeEditorTool(
    subject: Subject<StreamSseEvent>,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
      return Promise.resolve({
        output: JSON.stringify({ error: `Unknown tool: ${name}` }),
      });
    }

    try {
      const edit = editorToolCallToOperations(name, args);
      this.assertEditorOperations(edit);
      this.emitEditorEvent(subject, {
        type: 'edit_request',
        data: JSON.stringify(edit),
      });
      return Promise.resolve({
        output: JSON.stringify({
          success: true,
          detail: 'Edit instructions were sent to the editor client.',
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

  private async recordTokenUsage(
    ownerUserId: string,
    model: string,
    usage: TokenUsagePayload,
    endpoint: AiTokenUsageEndpoint,
  ): Promise<void> {
    const inputTokens = sanitizeTokenCount(usage.inputTokens);
    const outputTokens = sanitizeTokenCount(usage.outputTokens);
    const totalTokens = inputTokens + outputTokens;

    if (totalTokens <= 0) {
      return;
    }

    try {
      await this.tokenUsageRepo.save(this.tokenUsageRepo.create({
        ownerUserId,
        endpoint,
        provider: this.aiConfig.provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        cacheHitTokens: sanitizeOptionalTokenCount(usage.cacheHitTokens),
        cacheMissTokens: sanitizeOptionalTokenCount(usage.cacheMissTokens),
      }));

      const user = await this.userRepo.findOne({ where: { id: ownerUserId } });
      if (user) {
        const currentUsed = BigInt(user.tokensUsed);
        user.tokensUsed = (currentUsed + BigInt(totalTokens)).toString();
        user.tokensBalance = Math.max(0, user.tokensBalance - totalTokens);
        await this.userRepo.save(user);
      }

    } catch (err) {
      this.logger.error(
        'Failed to record AI token usage',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private logCacheUsage(
    ownerUserId: string,
    model: string,
    usage: TokenUsagePayload,
    endpoint: AiTokenUsageEndpoint,
  ): void {
    const hitTokens = sanitizeTokenCount(usage.cacheHitTokens);
    const missTokens = sanitizeTokenCount(usage.cacheMissTokens);
    const total = hitTokens + missTokens;
    if (total <= 0) {
      return;
    }

    const rate = hitTokens / total;
    const ratio = (rate * 100).toFixed(1);
    const user = ownerUserId.slice(0, 8);
    this.logger.log(
      `[Cache] endpoint=${endpoint} user=${user} model=${model} `
      + `hit=${hitTokens} miss=${missTokens} ratio=${ratio}%`,
    );
    if (rate < 0.3) {
      this.logger.warn(
        `[Cache] low hit rate (${ratio}%) for endpoint=${endpoint}; `
        + 'check whether stable context is being placed before per-turn data.',
      );
    }
  }

  async saveTemplate(
    ownerUserId: string,
    input: TemplateToolInput,
  ): Promise<{ templateId: string; action: 'created' | 'updated'; }> {
    assertValidTemplateLayout({
      layoutDocument: input.layoutDocument,
      componentTemplates: input.componentTemplates,
    });

    const existing = await this.templateRepo.findOne({ where: { templateId: input.templateId } });

    if (existing?.ownerUserId === ownerUserId) {
      this.applyGeneratedTemplateInput(existing, input);
      existing.ownerUserId = ownerUserId;
      existing.sourceTemplateId = null;
      existing.isPublic = false;
      await this.templateRepo.save(existing);
      this.logger.log(`Template updated: ${existing.templateId}`);
      return { templateId: existing.templateId, action: 'updated' };
    }

    const template = this.templateRepo.create({
      templateId: existing
        ? await this.createAvailableUserTemplateId(input.templateId, ownerUserId)
        : input.templateId,
      ownerUserId,
      sourceTemplateId: null,
      isPublic: false,
    });
    this.applyGeneratedTemplateInput(template, input);
    await this.templateRepo.save(template);
    this.logger.log(`Template created: ${template.templateId}`);
    return { templateId: template.templateId, action: 'created' };
  }

  private applyGeneratedTemplateInput(
    template: Template,
    input: TemplateToolInput,
  ): void {
    template.name = input.name;
    template.tagline = input.tagline;
    template.description = input.description;
    template.category = input.category;
    template.accent = input.accent;
    template.traits = input.traits;
    template.tags = deriveTags({
      ...input,
      templateId: template.templateId,
    });
    template.cssVars = input.cssVars;
    template.cssAnimations = input.cssAnimations ?? null;
    template.componentTemplates = input.componentTemplates;
    template.layoutDocument = withThemeLayoutStyleManifest(
      input.layoutDocument,
      input.cssVars,
    );
  }

  private async createAvailableUserTemplateId(
    baseTemplateId: string,
    ownerUserId: string,
  ): Promise<string> {
    const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
    const base = baseTemplateId.trim() || 'ai-template';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}${
        attempt ? `-${attempt}` : ''
      }`;
      const exists = await this.templateRepo.exists({ where: { templateId: candidate } });
      if (!exists) {
        return candidate;
      }
    }

    return `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }
}

function sanitizeTokenCount(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return 0;
  }
  return Math.floor(Math.min(value, Number.MAX_SAFE_INTEGER));
}

function sanitizeOptionalTokenCount(value: number | undefined): number | null {
  const sanitized = sanitizeTokenCount(value);
  return sanitized > 0 ? sanitized : null;
}

function isEditorAgentStreamRequest(value: unknown): value is EditorAgentStreamRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const input = value as Partial<EditorAgentStreamRequest> & { messages?: unknown; };
  return typeof input.prompt === 'string'
    && Boolean(input.document)
    && typeof input.document === 'object'
    && !Array.isArray(input.messages);
}

function formatHitRate(hitTokens: number, missTokens: number): string {
  const total = hitTokens + missTokens;
  return total > 0 ? `${((hitTokens / total) * 100).toFixed(1)}%` : 'N/A';
}
