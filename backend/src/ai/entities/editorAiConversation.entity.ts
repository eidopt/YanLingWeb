import type { EditorUndoSnapshot } from '@shared/agent/contracts/editorUndoStack';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { ProviderMessage } from '../core/providers/types';

export interface EditorAiConversationMessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

export interface EditorAiProviderSessionRecord {
  provider: string;
  model: string;
  conversationId: string;
  previousResponseId?: string;
  expiresAt: string;
  updatedAt: string;
}

export interface EditorAiConversationUndoStackRecord {
  maxSize?: number;
  entries?: EditorUndoSnapshot[];
}

/**
 * 跨 session 持久化的 cache 上下文 (PR-E).
 *  - cacheStrategy: 记录上次使用的 provider cache 策略, 用于切模型时给出提示.
 *  - lastCompactionStrategy / lastCacheHitRate: 上轮 compaction 与命中快照, 供诊断.
 *  - updatedAt: 该上下文最后刷新时间 (ISO).
 */
export interface EditorAiCacheContextRecord {
  provider: string;
  model: string;
  cacheStrategy: 'response_id' | 'prefix' | 'cache_control' | 'cache_key' | 'none';
  lastCompactionStrategy: 'skip' | 'micro' | 'full' | null;
  lastCacheHitRate: number | null;
  updatedAt: string;
}

@Entity('editor_ai_conversations')
@Unique(['ownerUserId', 'templateId'])
@Index(['ownerUserId', 'updatedAt'])
export class EditorAiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @Column()
  templateId: string;

  @Column({ type: 'simple-json', default: '[]' })
  messages: EditorAiConversationMessageRecord[];

  @Column({ type: 'simple-json', default: '[]' })
  providerMessages: ProviderMessage[];

  @Column({ type: 'simple-json', nullable: true })
  providerSession: EditorAiProviderSessionRecord | null;

  @Column({ type: 'simple-json', nullable: true })
  undoStack: EditorAiConversationUndoStackRecord | null;

  // PR-E 新增字段 (持久化跨 session 状态, 详见 EditorAiCacheContextRecord):
  //   compactSummary  — 上次 compaction 产出的语义摘要, 留作未来 PR 接入.
  //   lastPrefixHash  — 上次发送的 prefix (system+tools) 的 sha256[:16] 摘要, 用于跨轮比较 prefixChanged.
  //   cacheContext    — 上次的 cache 策略/模型快照, 用于诊断与切模型提示.
  @Column({ type: 'text', nullable: true })
  compactSummary: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  lastPrefixHash: string | null;

  @Column({ type: 'simple-json', nullable: true })
  cacheContext: EditorAiCacheContextRecord | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
