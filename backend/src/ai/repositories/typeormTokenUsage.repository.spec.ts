/// <reference types="jest" />

import { IsNull, Not, Repository } from 'typeorm';

import { AiTokenUsageEvent } from '../entities/aiTokenUsage.entity';
import type { CreateTokenUsageEventInput } from './tokenUsage.repository';
import { TypeOrmTokenUsageRepository } from './typeormTokenUsage.repository';

function createRepoMock(): jest.Mocked<Repository<AiTokenUsageEvent>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  } as unknown as jest.Mocked<Repository<AiTokenUsageEvent>>;
}

function makeEvent(overrides: Partial<AiTokenUsageEvent> = {}): AiTokenUsageEvent {
  return Object.assign(new AiTokenUsageEvent(), {
    id: 'event-1',
    ownerUserId: 'owner-1',
    endpoint: 'stream',
    provider: 'openai',
    model: 'gpt-4',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    cacheHitTokens: 5,
    cacheMissTokens: 5,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function makeInput(
  overrides: Partial<CreateTokenUsageEventInput> = {},
): CreateTokenUsageEventInput {
  return {
    ownerUserId: 'owner-1',
    endpoint: 'stream',
    provider: 'openai',
    model: 'gpt-4',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    cacheHitTokens: 5,
    cacheMissTokens: 5,
    ...overrides,
  };
}

describe('TypeOrmTokenUsageRepository', () => {
  describe('recordEvent', () => {
    it('creates an entity from the input, saves it, and returns the saved entity', async () => {
      const repo = createRepoMock();
      const input = makeInput();
      const created = makeEvent({ id: undefined as unknown as string });
      const saved = makeEvent();
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(saved);
      const adapter = new TypeOrmTokenUsageRepository(repo);

      await expect(adapter.recordEvent(input)).resolves.toBe(saved);

      expect(repo.create.mock.calls).toEqual([[input]]);
      expect(repo.save.mock.calls).toEqual([[created]]);
    });
  });

  describe('findForOwner', () => {
    it('queries by ownerUserId ordered by createdAt DESC and returns the rows', async () => {
      const repo = createRepoMock();
      const rows = [makeEvent({ id: 'event-1' }), makeEvent({ id: 'event-2' })];
      repo.find.mockResolvedValue(rows);
      const adapter = new TypeOrmTokenUsageRepository(repo);

      await expect(adapter.findForOwner('owner-1')).resolves.toBe(rows);

      expect(repo.find.mock.calls).toEqual([
        [
          {
            where: { ownerUserId: 'owner-1' },
            order: { createdAt: 'DESC' },
          },
        ],
      ]);
    });
  });

  describe('findCacheRecords', () => {
    it('filters non-null cacheHitTokens, orders DESC, limits, and returns the rows', async () => {
      const repo = createRepoMock();
      const rows = [makeEvent()];
      repo.find.mockResolvedValue(rows);
      const adapter = new TypeOrmTokenUsageRepository(repo);

      await expect(adapter.findCacheRecords('owner-1', 25)).resolves.toBe(rows);

      expect(repo.find.mock.calls).toHaveLength(1);
      const [options] = repo.find.mock.calls[0];
      expect(options).toEqual(
        expect.objectContaining({
          take: 25,
          order: { createdAt: 'DESC' },
        }),
      );
      const where = options?.where as { ownerUserId: string; cacheHitTokens: unknown };
      expect(where.ownerUserId).toBe('owner-1');
      expect(where.cacheHitTokens).toEqual(Not(IsNull()));
    });
  });
});
