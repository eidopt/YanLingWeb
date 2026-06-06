import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('template_profile_generated')
@Index(['templateId'], { unique: true })
export class TemplateProfileGenerated {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Column({ type: 'varchar', default: '1.0.0' })
  templateVersion: string;

  @Column({ type: 'varchar', default: '1.0.0' })
  profileVersion: string;

  @Column({ type: 'simple-json', default: '{}' })
  profile: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
