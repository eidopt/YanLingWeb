import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AiTokenUsageEndpoint = 'stream' | 'editor';

@Entity('ai_token_usage_events')
@Index(['ownerUserId', 'createdAt'])
@Index(['provider', 'model'])
export class AiTokenUsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @Column({ type: 'varchar' })
  endpoint: AiTokenUsageEndpoint;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  model: string;

  @Column({ type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ type: 'integer', default: 0 })
  outputTokens: number;

  @Column({ type: 'integer', default: 0 })
  totalTokens: number;

  @Column({ type: 'integer', nullable: true })
  cacheHitTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  cacheMissTokens: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
