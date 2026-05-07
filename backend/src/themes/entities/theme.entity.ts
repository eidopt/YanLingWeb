import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('themes')
export class Theme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
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

  @Column({ type: 'simple-json', default: '{}' })
  cssVars: Record<string, string>;

  @Column({ type: 'simple-json', default: '{}' })
  componentTemplates: Record<string, unknown>;

  @Column({ type: 'simple-json', default: '{}' })
  layoutDocument: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
