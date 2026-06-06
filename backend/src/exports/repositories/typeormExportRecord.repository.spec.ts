/// <reference types="jest" />

import type { Repository } from 'typeorm';

import { ExportRecord } from '../entities/exportRecord.entity';
import type { CreateExportRecordInput } from './exportRecord.repository';
import { TypeOrmExportRecordRepository } from './typeormExportRecord.repository';

function makeExportRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return Object.assign(new ExportRecord(), {
    id: 'export-1',
    ownerUserId: 'owner-1',
    projectName: 'demo-export',
    themeId: 'theme-1',
    status: 'saving',
    layoutJson: { root: true },
    outputPath: null,
    errorMessage: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function createRepoMock(): jest.Mocked<Repository<ExportRecord>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<Repository<ExportRecord>>;
}

describe('TypeOrmExportRecordRepository', () => {
  describe('createSaving', () => {
    it('creates an entity with status "saving" and saves it', async () => {
      const repo = createRepoMock();
      const input: CreateExportRecordInput = {
        ownerUserId: 'owner-1',
        projectName: 'demo-export',
        themeId: 'theme-1',
        layoutJson: { root: true },
      };
      const created = makeExportRecord();
      const saved = makeExportRecord({ id: 'export-1' });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(saved);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.createSaving(input)).resolves.toBe(saved);

      expect(repo.create.mock.calls).toEqual([
        [
          {
            ownerUserId: 'owner-1',
            projectName: 'demo-export',
            themeId: 'theme-1',
            layoutJson: { root: true },
            status: 'saving',
          },
        ],
      ]);
      expect(repo.save.mock.calls).toEqual([[created]]);
    });
  });

  describe('markDone', () => {
    it('updates the record with status "done" and the output path', async () => {
      const repo = createRepoMock();
      repo.update.mockResolvedValue({} as never);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.markDone('export-1', '/tmp/out.zip')).resolves.toBeUndefined();

      expect(repo.update.mock.calls).toEqual([
        ['export-1', { status: 'done', outputPath: '/tmp/out.zip' }],
      ]);
    });
  });

  describe('markError', () => {
    it('updates the record with status "error" and the error message', async () => {
      const repo = createRepoMock();
      repo.update.mockResolvedValue({} as never);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.markError('export-1', 'boom')).resolves.toBeUndefined();

      expect(repo.update.mock.calls).toEqual([
        ['export-1', { status: 'error', errorMessage: 'boom' }],
      ]);
    });
  });

  describe('findForOwner', () => {
    it('queries findAndCount scoped to the owner and maps to { data, total }', async () => {
      const repo = createRepoMock();
      const record = makeExportRecord();
      repo.findAndCount.mockResolvedValue([[record], 1]);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.findForOwner('owner-1')).resolves.toEqual({
        data: [record],
        total: 1,
      });

      expect(repo.findAndCount.mock.calls).toEqual([
        [{ where: { ownerUserId: 'owner-1' }, order: { createdAt: 'DESC' } }],
      ]);
    });

    it('maps an empty result set', async () => {
      const repo = createRepoMock();
      repo.findAndCount.mockResolvedValue([[], 0]);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.findForOwner('owner-2')).resolves.toEqual({
        data: [],
        total: 0,
      });
    });
  });

  describe('findOneForOwner', () => {
    it('queries findOne scoped to both id and owner and returns the record', async () => {
      const repo = createRepoMock();
      const record = makeExportRecord();
      repo.findOne.mockResolvedValue(record);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.findOneForOwner('owner-1', 'export-1')).resolves.toBe(record);

      expect(repo.findOne.mock.calls).toEqual([
        [{ where: { id: 'export-1', ownerUserId: 'owner-1' } }],
      ]);
    });

    it('returns null when no record matches', async () => {
      const repo = createRepoMock();
      repo.findOne.mockResolvedValue(null);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.findOneForOwner('owner-1', 'missing')).resolves.toBeNull();

      expect(repo.findOne.mock.calls).toEqual([
        [{ where: { id: 'missing', ownerUserId: 'owner-1' } }],
      ]);
    });
  });

  describe('remove', () => {
    it('delegates to repo.remove with the given record', async () => {
      const repo = createRepoMock();
      const record = makeExportRecord();
      repo.remove.mockResolvedValue(record);

      const adapter = new TypeOrmExportRecordRepository(repo);

      await expect(adapter.remove(record)).resolves.toBeUndefined();

      expect(repo.remove.mock.calls).toEqual([[record]]);
    });
  });
});
