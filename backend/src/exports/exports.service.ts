import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Repository } from 'typeorm';

import { DatabaseFlushService } from '../database/database-flush.service';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportRecord } from './entities/export-record.entity';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(ExportRecord)
    private readonly repo: Repository<ExportRecord>,
    private readonly databaseFlush: DatabaseFlushService,
  ) {}

  async create(dto: CreateExportDto): Promise<ExportRecord> {
    const record = this.repo.create({
      projectName: dto.projectName,
      themeId: dto.themeId,
      layoutJson: dto.layoutJson ?? {},
      status: 'saving',
    });
    const saved = await this.repo.save(record);
    await this.databaseFlush.flush('export record creation');

    // Async: write the layout JSON to ~/Documents/ai-app-exports/<projectName>/
    this.runExport(saved).catch((err) => {
      console.error('Export failed:', err);
    });

    return saved;
  }

  private async runExport(record: ExportRecord): Promise<void> {
    const outputDir = path.join(
      os.homedir(),
      'Documents',
      'ai-app-exports',
      record.projectName,
    );

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      const jsonPath = path.join(outputDir, 'layout.json');
      fs.writeFileSync(jsonPath, JSON.stringify(record.layoutJson, null, 2));

      await this.repo.update(record.id, {
        status: 'done',
        outputPath: outputDir,
      });
      await this.databaseFlush.flush('export completion');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      await this.repo.update(record.id, {
        status: 'error',
        errorMessage: message,
      });
      await this.databaseFlush.flush('export failure');
    }
  }

  async findAll(): Promise<{ data: ExportRecord[]; total: number; }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findOne(id: string): Promise<ExportRecord> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Export ${id} not found`);
    }
    return record;
  }

  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    await this.repo.remove(record);
  }
}
