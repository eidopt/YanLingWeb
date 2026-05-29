import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CreateExportDto } from './dto/create-export.dto';
import { ExportRecord } from './entities/export-record.entity';
import {
  EXPORT_RECORD_REPOSITORY,
  type ExportRecordListResult,
  type ExportRecordRepository,
} from './repositories/export-record.repository';

@Injectable()
export class ExportsService {
  constructor(
    @Inject(EXPORT_RECORD_REPOSITORY)
    private readonly exports: ExportRecordRepository,
  ) {}

  async create(ownerUserId: string, dto: CreateExportDto): Promise<ExportRecord> {
    const saved = await this.exports.createSaving({
      ownerUserId,
      projectName: dto.projectName,
      themeId: dto.themeId,
      layoutJson: dto.layoutJson ?? {},
    });

    // Async: write the layout JSON to ~/Documents/ai-app-exports/<projectName>/
    this.runExport(saved).catch((err) => {
      console.error('Export failed:', err);
    });

    return saved;
  }

  private async runExport(record: ExportRecord): Promise<void> {
    const outputDir = path.join(os.homedir(), 'Documents', 'ai-app-exports', record.projectName);

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      const jsonPath = path.join(outputDir, 'layout.json');
      fs.writeFileSync(jsonPath, JSON.stringify(record.layoutJson, null, 2));

      await this.exports.markDone(record.id, outputDir);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      await this.exports.markError(record.id, message);
    }
  }

  findAll(ownerUserId: string): Promise<ExportRecordListResult> {
    return this.exports.findForOwner(ownerUserId);
  }

  async findOne(ownerUserId: string, id: string): Promise<ExportRecord> {
    const record = await this.exports.findOneForOwner(ownerUserId, id);
    if (!record) {
      throw new NotFoundException(`Export ${id} not found`);
    }
    return record;
  }

  async remove(ownerUserId: string, id: string): Promise<void> {
    const record = await this.findOne(ownerUserId, id);
    await this.exports.remove(record);
  }
}
