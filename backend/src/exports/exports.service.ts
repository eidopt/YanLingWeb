import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { CreateExportDto } from './dto/createExport.dto';
import { ExportRecord } from './entities/exportRecord.entity';
import {
  EXPORT_RECORD_REPOSITORY,
  type ExportRecordListResult,
  type ExportRecordRepository,
} from './repositories/exportRecord.repository';

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

@Injectable()
export class ExportsService {
  constructor(
    @Inject(EXPORT_RECORD_REPOSITORY)
    private readonly exports: ExportRecordRepository,
  ) {}

  async create(ownerUserId: string, dto: CreateExportDto): Promise<ExportRecord> {
    const outputDir = resolveExportDirectory(dto.projectName);
    const saved = await this.exports.createSaving({
      ownerUserId,
      projectName: dto.projectName,
      themeId: dto.themeId,
      layoutJson: dto.layoutJson ?? {},
    });

    this.runExport(saved, outputDir).catch((err) => {
      console.error('Export failed:', err);
    });

    return saved;
  }

  private async runExport(record: ExportRecord, outputDir: string): Promise<void> {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      const jsonPath = path.join(outputDir, 'layout.json');
      await fs.writeFile(jsonPath, JSON.stringify(record.layoutJson, null, 2));

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

export function resolveExportDirectory(projectName: string): string {
  if (!PROJECT_NAME_PATTERN.test(projectName)) {
    throw new BadRequestException('projectName 只能包含字母、数字、下划线和短横线');
  }
  const baseDir = path.resolve(os.homedir(), 'Documents', 'ai-app-exports');
  const outputDir = path.resolve(baseDir, projectName);
  if (!outputDir.startsWith(`${baseDir}${path.sep}`)) {
    throw new BadRequestException('projectName 不合法');
  }
  return outputDir;
}
