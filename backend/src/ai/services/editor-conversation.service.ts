import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Template } from '../../templates/entities/template.entity';
import type { ProviderMessage } from '../core/providers/types';
import {
  EditorAiConversation,
  type EditorAiConversationMessageRecord,
  type EditorAiProviderSessionRecord,
} from '../entities/editor-ai-conversation.entity';
import { ProviderLogCompactionService } from './provider-log-compaction.service';

export interface EditorAiConversationDto {
  templateId: string;
  messages: EditorAiConversationMessageRecord[];
  updatedAt: string | null;
}

export interface SaveEditorAiConversationInput {
  messages?: unknown;
}

const MAX_EDITOR_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_EDITOR_CONVERSATION_MESSAGE_CHARS = 40_000;
const EDITOR_PROVIDER_SESSION_TTL_MS = 30 * 60_000;
const EDITOR_PROVIDER_SESSION_EXPIRY_SAFETY_MS = 60_000;

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
export class EditorConversationService {
  private readonly logger = new Logger(EditorConversationService.name);

  constructor(
    @InjectRepository(EditorAiConversation)
    private readonly editorConversationRepo: Repository<EditorAiConversation>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly compactionService: ProviderLogCompactionService,
  ) {}

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

  async loadEditorProviderLog(
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
    return this.compactionService.foldEditorProviderMessagesByTokenBudget(
      conversation?.providerMessages ?? [],
    );
  }

  async loadEditorProviderSession(
    ownerUserId: string,
    conversationId: string | undefined,
    model: string,
    providerName: string,
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
      || session.provider !== providerName
      || session.model !== model
      || session.conversationId !== conversationId
    ) {
      return null;
    }
    return session;
  }

  async saveEditorProviderSession(
    ownerUserId: string,
    conversationId: string | undefined,
    model: string,
    providerName: string,
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
      providerName,
      model,
      conversationId,
      previousResponseId,
    );
    await this.editorConversationRepo.save(conversation);
  }

  async saveEditorProviderLog(
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
    conversation.providerMessages = await this.compactionService.foldEditorProviderMessagesByTokenBudget(messages);
    conversation.providerSession ??= null;
    await this.editorConversationRepo.save(conversation);
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
}
