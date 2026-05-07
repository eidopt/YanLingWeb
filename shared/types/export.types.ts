// Shared export types — used by both frontend (Next.js) and backend (NestJS)

export type ExportStatus = 'idle' | 'saving' | 'building' | 'done' | 'error';

export interface ExportRecordDto {
  id: string;
  projectName: string;
  themeId: string;
  status: ExportStatus;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExportDto {
  projectName: string;
  themeId: string;
  layoutJson: Record<string, unknown>;
}

export interface ExportListResponse {
  data: ExportRecordDto[];
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
