import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ExportRecord } from '../entities/export-record.entity';
import type {
  CreateExportRecordInput,
  ExportRecordListResult,
  ExportRecordRepository,
} from './export-record.repository';

@Injectable()
export class TypeOrmExportRecordRepository implements ExportRecordRepository {
  constructor(
    @InjectRepository(ExportRecord)
    private readonly repo: Repository<ExportRecord>,
  ) {}

  async createSaving(input: CreateExportRecordInput): Promise<ExportRecord> {
    const record = this.repo.create({
      ownerUserId: input.ownerUserId,
      projectName: input.projectName,
      themeId: input.themeId,
      layoutJson: input.layoutJson,
      status: 'saving',
    });
    return this.repo.save(record);
  }

  async markDone(id: string, outputPath: string): Promise<void> {
    await this.repo.update(id, {
      status: 'done',
      outputPath,
    });
  }

  async markError(id: string, errorMessage: string): Promise<void> {
    await this.repo.update(id, {
      status: 'error',
      errorMessage,
    });
  }

  async findForOwner(ownerUserId: string): Promise<ExportRecordListResult> {
    const [data, total] = await this.repo.findAndCount({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  findOneForOwner(ownerUserId: string, id: string): Promise<ExportRecord | null> {
    return this.repo.findOne({ where: { id, ownerUserId } });
  }

  async remove(record: ExportRecord): Promise<void> {
    await this.repo.remove(record);
  }
}
