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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
