import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

type LoginType = 'local' | 'wechat' | 'qq';
export type UserType = 'normal' | 'pro';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  /** bcrypt hash — null for OAuth-only accounts */
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  /** WeChat OpenID from WeChat Open Platform */
  @Column({ type: 'varchar', unique: true, nullable: true })
  wechatOpenId: string | null;

  /** QQ OpenID from QQ Connect */
  @Column({ type: 'varchar', unique: true, nullable: true })
  qqOpenId: string | null;

  /** Which login methods this account has linked */
  @Column({ type: 'simple-json', default: '[]' })
  linkedLogins: LoginType[];

  /** User tier: newly registered accounts default to `'normal'` */
  @Column({ type: 'varchar', default: 'normal' })
  userType: UserType;

  /** Number of free AI chat turns used by normal users (max 3) */
  @Column({ type: 'integer', default: 0 })
  freeChatUsedCount: number;

  /** Number of free from-scratch template generations used by normal users (max 1) */
  @Column({ type: 'integer', default: 0 })
  freeTemplateGenUsedCount: number;

  /**
   * Cumulative AI tokens consumed by this user.
   * bigint: 32-bit integer overflows at ~2.1B tokens (reachable by heavy users).
   * TypeORM returns bigint columns as string from SQLite — convert in toDto().
   */
  @Column({ type: 'bigint', default: 0 })
  tokensUsed: string;

  /** Remaining purchased token quota */
  @Column({ type: 'integer', default: 0 })
  tokensBalance: number;

  /** Account balance in cents (e.g. 100 = ¥1.00) */
  @Column({ type: 'integer', default: 0 })
  balanceCents: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
