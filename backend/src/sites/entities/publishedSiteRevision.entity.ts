import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PublishedSiteRevisionStatus = 'active';

@Entity('published_site_revisions')
@Index(['siteId', 'createdAt'])
@Index(['templateId'])
export class PublishedSiteRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  siteId: string;

  @Column()
  templateId: string;

  @Column({ type: 'integer' })
  schemaVersion: number;

  @Column()
  runtimeVersion: string;

  @Column({ type: 'simple-json' })
  layoutJson: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  themeJson: Record<string, unknown>;

  @Column({ type: 'simple-json', default: '{}' })
  dataJson: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  manifestJson: Record<string, unknown>;

  @Column({ default: 'active' })
  status: PublishedSiteRevisionStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
