import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Semantic identifier used for lookups (e.g. "commerce-market"). Immutable after seed. */
  @Column({ unique: true })
  templateId: string;

  /** Null means marketplace/system template. Non-null means user-owned copy. */
  @Column({ type: 'varchar', nullable: true })
  ownerUserId: string | null;

  /** Original marketplace template id when this record is a user copy. */
  @Column({ type: 'varchar', nullable: true })
  sourceTemplateId: string | null;

  /** Whether this template appears in the public marketplace. */
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  @Column()
  name: string;

  @Column({ default: '' })
  tagline: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: '#000000' })
  accent: string;

  @Column({ default: 'general' })
  category: string;

  @Column({ type: 'simple-json', default: '[]' })
  traits: string[];

  /** Search keywords and business tags used for template discovery. */
  @Column({ type: 'simple-json', default: '[]' })
  tags: string[];

  @Column({ type: 'simple-json', default: '{}' })
  cssVars: Record<string, string>;

  @Column({ type: 'simple-json', default: '{}', nullable: true })
  cssAnimations: Record<string, string> | null;

  @Column({ type: 'simple-json', default: '{}' })
  componentTemplates: Record<string, unknown>;

  @Column({ type: 'simple-json', default: '{}' })
  layoutDocument: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
