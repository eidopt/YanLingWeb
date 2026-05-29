import type { ExportRecord } from '../entities/export-record.entity';

export const EXPORT_RECORD_REPOSITORY = 'EXPORT_RECORD_REPOSITORY';

export interface CreateExportRecordInput {
  ownerUserId: string;
  projectName: string;
  themeId: string;
  layoutJson: Record<string, unknown>;
}

export interface ExportRecordListResult {
  data: ExportRecord[];
  total: number;
}

export interface ExportRecordRepository {
  createSaving(input: CreateExportRecordInput): Promise<ExportRecord>;
  markDone(id: string, outputPath: string): Promise<void>;
  markError(id: string, errorMessage: string): Promise<void>;
  findForOwner(ownerUserId: string): Promise<ExportRecordListResult>;
  findOneForOwner(ownerUserId: string, id: string): Promise<ExportRecord | null>;
  remove(record: ExportRecord): Promise<void>;
}
