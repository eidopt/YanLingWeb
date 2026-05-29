/// <reference types="jest" />

import { NotFoundException } from '@nestjs/common';

import { ExportRecord } from './entities/export-record.entity';
import { ExportsService } from './exports.service';
import type {
  CreateExportRecordInput,
  ExportRecordListResult,
  ExportRecordRepository,
} from './repositories/export-record.repository';

function makeExportRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    id: 'export-1',
    ownerUserId: 'owner-1',
    projectName: 'demo-export',
    themeId: 'theme-1',
    status: 'done',
    layoutJson: {},
    outputPath: null,
    errorMessage: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  };
}

function createRepositoryMock(): jest.Mocked<ExportRecordRepository> {
  return {
    createSaving: jest.fn<Promise<ExportRecord>, [CreateExportRecordInput]>(),
    markDone: jest.fn<Promise<void>, [string, string]>(),
    markError: jest.fn<Promise<void>, [string, string]>(),
    findForOwner: jest.fn<Promise<ExportRecordListResult>, [string]>(),
    findOneForOwner: jest.fn<Promise<ExportRecord | null>, [string, string]>(),
    remove: jest.fn<Promise<void>, [ExportRecord]>(),
  };
}

describe('ExportsService repository boundary', () => {
  it('reads exports through the repository port', async () => {
    const repo = createRepositoryMock();
    const record = makeExportRecord();
    repo.findForOwner.mockResolvedValue({ data: [record], total: 1 });
    const service = new ExportsService(repo);

    await expect(service.findAll('owner-1')).resolves.toEqual({
      data: [record],
      total: 1,
    });
    expect(repo.findForOwner.mock.calls).toEqual([['owner-1']]);
  });

  it('throws when an owned export is not found', async () => {
    const repo = createRepositoryMock();
    repo.findOneForOwner.mockResolvedValue(null);
    const service = new ExportsService(repo);

    await expect(service.findOne('owner-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOneForOwner.mock.calls).toEqual([['owner-1', 'missing']]);
  });

  it('removes exports through the repository port after owner lookup', async () => {
    const repo = createRepositoryMock();
    const record = makeExportRecord();
    repo.findOneForOwner.mockResolvedValue(record);
    const service = new ExportsService(repo);

    await service.remove('owner-1', 'export-1');

    expect(repo.findOneForOwner.mock.calls).toEqual([['owner-1', 'export-1']]);
    expect(repo.remove.mock.calls).toEqual([[record]]);
  });
});
