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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
