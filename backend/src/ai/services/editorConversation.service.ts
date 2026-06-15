import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EditorUndoSnapshot } from '@shared/agent/contracts/editorUndoStack';

import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
} from '../../templates/repositories/templateRead.repository';
import type { ProviderMessage } from '../core/providers/types';
import {
  type EditorAiCacheContextRecord,
  type EditorAiConversationMessageRecord,
  type EditorAiConversationUndoStackRecord,
  type EditorAiProviderSessionRecord,
} from '../entities/editorAiConversation.entity';
import {
  EDITOR_CONVERSATION_REPOSITORY,
  type EditorConversationRepository,
} from '../repositories/editorConversation.repository';
import { ProviderLogCompactionService } from './providerLogCompaction.service';

export interface EditorAiConversationDto {
  templateId: string;
  messages: EditorAiConversationMessageRecord[];
  undoStack: EditorAiConversationUndoStackRecord | null;
  updatedAt: string | null;
}

export interface SaveEditorAiConversationInput {
  messages?: unknown;
  undoStack?: EditorAiConversationUndoStackRecord | null;
}

const MAX_EDITOR_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_EDITOR_CONVERSATION_MESSAGE_CHARS = 40_000;
const EDITOR_PROVIDER_SESSION_TTL_MS = 30 * 60_000;
const EDITOR_PROVIDER_SESSION_EXPIRY_SAFETY_MS = 60_000;
const MAX_EDITOR_UNDO_STACK_ENTRIES = 20;
const MAX_EDITOR_UNDO_STACK_TOTAL_CHARS = 1_000_000;
const MAX_COMPACT_SUMMARY_CHARS = 8_000;

@Injectable()
export class EditorConversationService {
  static templateIdFromConversationId(conversationId: string | undefined): string | null {
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

  /**
   * Pure helper exposed for unit testing the `cache_diagnostic.prefixChanged`
   * boolean in isolation. Mirrors the inline computation in
   * `ai.service.ts`'s `cache_diagnostic` emit block.
   *
   * Semantics:
   *  - null lastPrefixHash  → first turn, never "changed"
   *  - matching hash        → stable cache, not "changed"
   *  - differing hash       → cache prefix shifted, "changed" = true
   */
  static computePrefixChanged(lastPrefixHash: string | null, prefixHash: string): boolean {
    return lastPrefixHash !== null && lastPrefixHash !== prefixHash;
  }

  constructor(
    @Inject(EDITOR_CONVERSATION_REPOSITORY)
    private readonly conversations: EditorConversationRepository,
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
    private readonly compactionService: ProviderLogCompactionService,
  ) {}

  async getEditorConversation(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversationDto> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);

    return {
      templateId,
      messages: conversation?.messages ?? [],
      undoStack: conversation?.undoStack ?? null,
      updatedAt: conversation?.updatedAt.toISOString() ?? null,
    };
  }

  async saveEditorConversation(
    ownerUserId: string,
    templateId: string,
    input: SaveEditorAiConversationInput,
  ): Promise<EditorAiConversationDto> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const messages = this.normalizeEditorConversationMessages(input.messages);
    const undoStack = this.normalizeUndoStack(input.undoStack);
    const existing = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);

    // If the caller is clearing both messages and undo stack, the row is empty
    // and we can safely drop the conversation to keep the table tidy.
    if (!messages.length && undoStack === null) {
      if (existing) {
        await this.conversations.remove(existing);
      }
      return { templateId, messages: [], undoStack: null, updatedAt: null };
    }

    const conversation =
      existing ??
      this.conversations.create({
        ownerUserId,
        templateId,
      });
    conversation.messages = messages;
    conversation.providerSession ??= null;
    // If the caller omitted `undoStack` in the input, preserve any existing
    // server-side stack. Only overwrite when an explicit value (including null)
    // is provided.
    conversation.undoStack =
      input.undoStack === undefined ? (conversation.undoStack ?? null) : undoStack;
    const saved = await this.conversations.save(conversation);

    return {
      templateId,
      messages: saved.messages,
      undoStack: saved.undoStack ?? null,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async loadEditorProviderLog(
    ownerUserId: string,
    conversationId: string | undefined,
  ): Promise<ProviderMessage[]> {
    const templateId = EditorConversationService.templateIdFromConversationId(conversationId);
    if (!templateId) {
      return [];
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
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
    const templateId = EditorConversationService.templateIdFromConversationId(conversationId);
    if (!templateId || !conversationId) {
      return null;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const session = conversation?.providerSession;
    if (
      !this.isProviderSessionFresh(session) ||
      session.provider !== providerName ||
      session.model !== model ||
      session.conversationId !== conversationId
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
    const templateId = EditorConversationService.templateIdFromConversationId(conversationId);
    if (!templateId || !conversationId) {
      return;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const existing = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const conversation =
      existing ??
      this.conversations.create({
        ownerUserId,
        templateId,
        messages: [],
        providerMessages: [],
      });
    conversation.providerSession = this.buildProviderSessionRecord(
      providerName,
      model,
      conversationId,
      previousResponseId,
    );
    await this.conversations.save(conversation);
  }

  async saveEditorProviderLog(
    ownerUserId: string,
    conversationId: string | undefined,
    messages: readonly ProviderMessage[],
  ): Promise<void> {
    const templateId = EditorConversationService.templateIdFromConversationId(conversationId);
    if (!templateId) {
      return;
    }
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const existing = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const conversation =
      existing ??
      this.conversations.create({
        ownerUserId,
        templateId,
        messages: [],
      });
    conversation.providerMessages =
      await this.compactionService.foldEditorProviderMessagesByTokenBudget(messages);
    conversation.providerSession ??= null;
    await this.conversations.save(conversation);
  }

  // ── PR-E: 跨 session 状态持久化 ───────────────────────────────
  // 把 cache 诊断相关的 3 个字段 (lastPrefixHash, cacheContext, compactSummary)
  // 抽成独立方法, 由 ai.service 在每轮结束 (与每轮开始之前) 调用, 不与
  // 既有 messages/undoStack 写入路径耦合.

  /**
   * 取上次发送的 prefix 摘要 (16-hex), 用于在 ai.service 中计算 `prefixChanged`.
   * 若会话不存在或该字段为空, 返回 null.
   */
  async loadLastPrefixHash(ownerUserId: string, templateId: string): Promise<string | null> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const conversation = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const value = conversation?.lastPrefixHash ?? null;
    return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value) ? value : null;
  }

  /**
   * 把本轮 prefix 摘要写回; 同时刷新 cacheContext 快照.
   *  - prefixHash: hashJson(prefixMessages) 的 16-hex 结果
   *  - context: { provider, model, cacheStrategy, lastCompactionStrategy, lastCacheHitRate, updatedAt }
   * compactSummary 不在此处写入, 留给将来的 PR.
   */
  async saveCacheContext(
    ownerUserId: string,
    templateId: string,
    prefixHash: string,
    context: Omit<EditorAiCacheContextRecord, 'updatedAt'>,
  ): Promise<void> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    if (!/^[0-9a-f]{16}$/.test(prefixHash)) {
      return;
    }
    const existing = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const conversation =
      existing ??
      this.conversations.create({
        ownerUserId,
        templateId,
        messages: [],
      });
    conversation.lastPrefixHash = prefixHash;
    conversation.cacheContext = {
      ...context,
      updatedAt: new Date().toISOString(),
    };
    conversation.providerSession ??= null;
    await this.conversations.save(conversation);
  }

  /**
   * 写 compactSummary (语义摘要), 限制长度避免膨胀.
   * 留作未来 PR 接入: 目前 ai.service 暂未调用, 先把路径打通 + 加测试.
   */
  async saveCompactSummary(
    ownerUserId: string,
    templateId: string,
    summary: string,
  ): Promise<void> {
    await this.ensureTemplateAccessible(ownerUserId, templateId);
    const trimmed =
      summary.length > MAX_COMPACT_SUMMARY_CHARS
        ? summary.slice(0, MAX_COMPACT_SUMMARY_CHARS)
        : summary;
    const existing = await this.conversations.findByOwnerAndTemplate(ownerUserId, templateId);
    const conversation =
      existing ??
      this.conversations.create({
        ownerUserId,
        templateId,
        messages: [],
      });
    conversation.compactSummary = trimmed.length > 0 ? trimmed : null;
    conversation.providerSession ??= null;
    await this.conversations.save(conversation);
  }

  private async ensureTemplateAccessible(ownerUserId: string, templateId: string): Promise<void> {
    const template = await this.templates.findAccessibleIdentity(ownerUserId, templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
  }

  private normalizeEditorConversationMessages(
    messages: unknown,
  ): EditorAiConversationMessageRecord[] {
    if (!Array.isArray(messages)) {
      return [];
    }

    const normalized = messages.flatMap((message): EditorAiConversationMessageRecord[] => {
      if (!message || typeof message !== 'object') {
        return [];
      }

      const value = message as Record<string, unknown>;
      const role = value.role;
      const content = typeof value.content === 'string' ? value.content.trim() : '';
      if ((role !== 'user' && role !== 'assistant') || content.length === 0) {
        return [];
      }

      return [
        {
          role,
          content:
            content.length > MAX_EDITOR_CONVERSATION_MESSAGE_CHARS
              ? `[Earlier content omitted]\n${content.slice(
                  -MAX_EDITOR_CONVERSATION_MESSAGE_CHARS,
                )}`
              : content,
        },
      ];
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

  private normalizeUndoStack(undoStack: unknown): EditorAiConversationUndoStackRecord | null {
    if (undoStack === null || undoStack === undefined) {
      return null;
    }
    if (typeof undoStack !== 'object') {
      return null;
    }

    const value = undoStack as Record<string, unknown>;
    const rawEntries = value.entries;

    if (!Array.isArray(rawEntries)) {
      return { entries: [] };
    }

    // Per-entry shape filter (existing logic).
    const objectEntries = rawEntries.filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object',
    );

    // Size cap — compute running total of JSON.stringify(entry).length and drop
    // entries that push the total over MAX_EDITOR_UNDO_STACK_TOTAL_CHARS. Apply
    // BEFORE the count cap so the count cap doesn't silently mask oversized payloads.
    let runningTotal = 0;
    const sizeFiltered: Record<string, unknown>[] = [];
    for (const entry of objectEntries) {
      const size = JSON.stringify(entry).length;
      if (runningTotal + size > MAX_EDITOR_UNDO_STACK_TOTAL_CHARS) {
        break;
      }
      sizeFiltered.push(entry);
      runningTotal += size;
    }

    // Count cap.
    const entries = sizeFiltered.slice(
      -MAX_EDITOR_UNDO_STACK_ENTRIES,
    ) as unknown as EditorUndoSnapshot[];

    const maxSizeRaw = value.maxSize;
    const maxSize =
      typeof maxSizeRaw === 'number' && Number.isFinite(maxSizeRaw) && maxSizeRaw > 0
        ? Math.min(Math.floor(maxSizeRaw), MAX_EDITOR_UNDO_STACK_ENTRIES)
        : undefined;

    return {
      ...(maxSize !== undefined ? { maxSize } : {}),
      entries,
    };
  }

  private isProviderSessionFresh(
    session: EditorAiProviderSessionRecord | null | undefined,
  ): session is EditorAiProviderSessionRecord {
    if (!session?.expiresAt) {
      return false;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return (
      Number.isFinite(expiresAt) &&
      expiresAt - EDITOR_PROVIDER_SESSION_EXPIRY_SAFETY_MS > Date.now()
    );
  }

  private buildProviderSessionRecord(
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
}
