import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';

import { ConfigFactory } from '../config/config.factory';
import { DatabaseFlushService } from '../database/database-flush.service';
import { Template } from '../templates/entities/template.entity';
import { OpenAIProvider } from './core/providers/openai.provider';
import { OpenAICompatibleProvider } from './core/providers/openai-compatible.provider';
import type { AIProvider, ProviderRequest, ProviderStreamEvent } from './core/providers/types';
import { QueryLoop } from './core/query-loop';
import {
  EditorAiConversation,
  type EditorAiConversationMessageRecord,
} from './entities/editor-ai-conversation.entity';
import {
  AI_SEMANTIC_TARGETS,
  type AiSemanticTargetConfig,
} from './semantic-targets.config';
import { APPLY_EDITOR_EDITS_TOOL } from './tools/editor-edit.tool';
import type { TemplateToolInput } from './tools/generate-template.tool';

export interface AiConfigDto {
  provider: string;
  model: string;
  semanticTargets: AiSemanticTargetConfig[];
}

export interface EditorAiConversationDto {
  templateId: string;
  messages: EditorAiConversationMessageRecord[];
  updatedAt: string | null;
}

export interface SaveEditorAiConversationInput {
  messages?: unknown;
}

export type StreamRequest = ProviderRequest;

export interface StreamSseEvent {
  data: string;
}

interface EditorToolInput {
  operations?: unknown;
  reason?: unknown;
}

// Simple in-memory rate limiter: max N requests per window per user
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number; }>();
const MAX_EDITOR_CONVERSATION_MESSAGES = 40;
const MAX_EDITOR_CONVERSATION_MESSAGE_CHARS = 8000;

function normalizeEditorConversationMessages(
  messages: unknown,
): EditorAiConversationMessageRecord[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
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
    })
    .slice(-MAX_EDITOR_CONVERSATION_MESSAGES);
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
    private readonly databaseFlush: DatabaseFlushService,
  ) {
    const env = ConfigFactory.build();
    const apiKey = env.ai.apiKey ?? '';

    this.aiConfig = {
      provider: env.ai.provider,
      model: env.ai.model,
      semanticTargets: AI_SEMANTIC_TARGETS,
    };

    this.apiKeyConfigured = apiKey.length > 0;
    if (!this.apiKeyConfigured) {
      this.logger.warn('AI_API_KEY is not configured. AI stream requests will fail.');
    }

    this.logger.log(
      `AI provider: ${env.ai.provider} (baseUrl: ${env.ai.baseUrl ?? 'default'})`,
    );

    if (env.ai.provider === 'openai-compatible') {
      this.provider = new OpenAICompatibleProvider(
        apiKey,
        env.ai.baseUrl,
        'openai-compatible',
      );
    } else {
      this.provider = new OpenAIProvider(apiKey, env.ai.baseUrl, 'openai');
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
        await this.databaseFlush.flush('editor AI conversation removal');
      }
      return { templateId, messages: [], updatedAt: null };
    }

    const conversation = existing ?? this.editorConversationRepo.create({
      ownerUserId,
      templateId,
    });
    conversation.messages = messages;
    const saved = await this.editorConversationRepo.save(conversation);
    await this.databaseFlush.flush('editor AI conversation save');

    return {
      templateId,
      messages: saved.messages,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /** Proxy a streaming OpenAI-compatible Responses API request, forwarding events as SSE */
  stream(
    req: StreamRequest,
    cacheOptions?: { conversationId?: string; previousResponseId?: string; },
  ): Observable<StreamSseEvent> {
    const subject = new Subject<StreamSseEvent>();
    this.runStream(req, subject, cacheOptions).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStreamEvent(subject, { type: 'error', message: msg });
      subject.complete();
    });
    return subject.asObservable();
  }

  /** Run the editor copilot loop on the backend and stream UI-safe events. */
  streamEditor(req: StreamRequest): Observable<StreamSseEvent> {
    const subject = new Subject<StreamSseEvent>();
    this.runEditorStream(req, subject).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitEditorEvent(subject, { type: 'error', data: msg });
      subject.complete();
    });
    return subject.asObservable();
  }

  private async runStream(
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

    const request = this.withRequestScopedCache(req, cacheOptions);

    for await (const event of this.provider.stream(request)) {
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
        { templateId, isPublic: true },
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
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
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

    const loop = new QueryLoop({
      provider: this.provider,
      model: req.model,
      tools: [APPLY_EDITOR_EDITS_TOOL],
      toolSpecs: new Map([[
        APPLY_EDITOR_EDITS_TOOL.name,
        { name: APPLY_EDITOR_EDITS_TOOL.name },
      ]]),
      maxIterations: 8,
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
      toolExecutor: (name, args) => {
        if (name !== APPLY_EDITOR_EDITS_TOOL.name) {
          return Promise.resolve({
            output: JSON.stringify({ error: `Unknown tool: ${name}` }),
          });
        }

        try {
          this.assertEditorOperations(args);
          this.emitEditorEvent(subject, {
            type: 'edit_request',
            data: JSON.stringify(args),
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
      },
    });

    const result = await loop.run(req.messages);
    if (result.stopReason === 'error') {
      this.emitEditorEvent(subject, { type: 'error', data: result.error ?? 'Unknown error' });
    }
    this.emitEditorEvent(subject, { type: 'done', data: '' });
    subject.complete();
  }

  private emitEditorEvent(
    subject: Subject<StreamSseEvent>,
    event: { type: string; data: string; },
  ): void {
    subject.next({ data: JSON.stringify(event) });
  }

  private assertEditorOperations(input: EditorToolInput): void {
    if (!Array.isArray(input.operations)) {
      throw new Error('apply_editor_edits requires an operations array');
    }

    for (const operation of input.operations) {
      if (!operation || typeof operation !== 'object') {
        throw new Error('Each editor operation must be an object');
      }
    }
  }

  async saveTemplate(
    input: TemplateToolInput,
  ): Promise<{ templateId: string; action: 'created' | 'updated'; }> {
    const existing = await this.templateRepo.findOne({ where: { templateId: input.templateId } });

    if (existing) {
      existing.name = input.name;
      existing.tagline = input.tagline;
      existing.description = input.description;
      existing.category = input.category;
      existing.accent = input.accent;
      existing.traits = input.traits;
      existing.cssVars = input.cssVars;
      existing.cssAnimations = input.cssAnimations ?? null;
      existing.componentTemplates = input.componentTemplates;
      existing.layoutDocument = input.layoutDocument;
      await this.templateRepo.save(existing);
      await this.databaseFlush.flush('AI template update');
      this.logger.log(`Template updated: ${input.templateId}`);
      return { templateId: input.templateId, action: 'updated' };
    }

    const template = this.templateRepo.create({
      templateId: input.templateId,
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      accent: input.accent,
      traits: input.traits,
      cssVars: input.cssVars,
      cssAnimations: input.cssAnimations ?? null,
      componentTemplates: input.componentTemplates,
      layoutDocument: input.layoutDocument,
    });
    await this.templateRepo.save(template);
    await this.databaseFlush.flush('AI template creation');
    this.logger.log(`Template created: ${input.templateId}`);
    return { templateId: input.templateId, action: 'created' };
  }
}
