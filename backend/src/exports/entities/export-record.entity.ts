import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('export_records')
export class ExportRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectName: string;

  @Column()
  themeId: string;

  @Column({ type: 'varchar', default: 'idle' })
  status: 'idle' | 'saving' | 'building' | 'done' | 'error';

  @Column({ type: 'simple-json', default: '{}' })
  layoutJson: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  outputPath: string | null;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
