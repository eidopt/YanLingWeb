import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('editor_edit_outbox')
export class EditorEditOutboxEntry {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  ownerUserId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'bigint' })
  expiresAt: string;
}
