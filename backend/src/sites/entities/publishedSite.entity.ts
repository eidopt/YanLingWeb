import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PublishedSiteStatus = 'active' | 'disabled';

@Entity('published_sites')
@Index(['ownerUserId', 'updatedAt'])
@Index(['templateId'])
@Index(['subdomain'], { unique: true })
export class PublishedSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @Column()
  templateId: string;

  @Column()
  subdomain: string;

  @Column({ default: 'active' })
  status: PublishedSiteStatus;

  @Column({ type: 'varchar', nullable: true })
  activeRevisionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
