import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';

import { ConfigFactory } from '../config/config.factory';
import { Template } from '../templates/entities/template.entity';
import { OpenAICompatibleProvider } from './core/providers/openai-compatible.provider';
import { OpenAIProvider } from './core/providers/openai.provider';
import type { AIProvider, ProviderRequest, ProviderStreamEvent } from './core/providers/types';
import type { TemplateToolInput } from './tools/generate-template.tool';

export interface AiConfigDto {
  provider: string;
  model: string;
}

export type StreamRequest = ProviderRequest;

export interface StreamSseEvent {
  data: string;
}

// Simple in-memory rate limiter: max N requests per window per user
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number; }>();

@Injectable()
export class AiService {
  readonly aiConfig: AiConfigDto;
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AIProvider;
  private readonly apiKeyConfigured: boolean;

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
  ) {
    const env = ConfigFactory.build();
    const apiKey = env.ai.apiKey ?? '';

    this.aiConfig = { provider: env.ai.provider, model: env.ai.model };

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

  /** Proxy a streaming OpenAI-compatible Responses API request, forwarding events as SSE */
  stream(
    req: StreamRequest,
    cacheOptions?: { conversationId?: string; previousResponseId?: string },
  ): Observable<StreamSseEvent> {
    const subject = new Subject<StreamSseEvent>();
    this.runStream(req, subject, cacheOptions).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStreamEvent(subject, { type: 'error', message: msg });
      subject.complete();
    });
    return subject.asObservable();
  }

  private async runStream(
    req: StreamRequest,
    subject: Subject<StreamSseEvent>,
    cacheOptions?: { conversationId?: string; previousResponseId?: string },
  ): Promise<void> {
    if (!this.apiKeyConfigured) {
      this.emitStreamEvent(subject, {
        type: 'error',
        message: 'AI_API_KEY is not configured on the backend.',
      });
      subject.complete();
      return;
    }

    // Only the OpenAI Responses API provider supports prompt caching
    if (this.provider instanceof OpenAIProvider) {
      this.provider.setCacheOptions(cacheOptions);
    }

    for await (const event of this.provider.stream(req)) {
      this.emitStreamEvent(subject, event);
    }

    subject.complete();
  }

  private emitStreamEvent(
    subject: Subject<StreamSseEvent>,
    event: ProviderStreamEvent,
  ): void {
    subject.next({ data: JSON.stringify(event) });
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
    this.logger.log(`Template created: ${input.templateId}`);
    return { templateId: input.templateId, action: 'created' };
  }
}
