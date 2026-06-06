/// <reference types="jest" />

import { NotFoundException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';

import { PublishedSite } from '../entities/publishedSite.entity';
import { PublishedSiteRevision } from '../entities/publishedSiteRevision.entity';
import type {
  PublishedSiteRevisionPayload,
  PublishNewSiteInput,
  RepublishSiteInput,
} from './publishedSite.repository';
import { TypeOrmPublishedSiteRepository } from './typeormPublishedSite.repository';

function makeSite(overrides: Partial<PublishedSite> = {}): PublishedSite {
  return Object.assign(new PublishedSite(), {
    id: 'site-1',
    ownerUserId: 'owner-1',
    templateId: 'template-1',
    subdomain: 'demo',
    status: 'active',
    activeRevisionId: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function makeRevision(overrides: Partial<PublishedSiteRevision> = {}): PublishedSiteRevision {
  return Object.assign(new PublishedSiteRevision(), {
    id: 'revision-1',
    siteId: 'site-1',
    templateId: 'template-1',
    schemaVersion: 1,
    runtimeVersion: '1.0.0',
    layoutJson: {},
    themeJson: {},
    dataJson: {},
    manifestJson: {},
    status: 'active',
    errorMessage: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function makePayload(
  overrides: Partial<PublishedSiteRevisionPayload> = {},
): PublishedSiteRevisionPayload {
  return {
    schemaVersion: 1,
    runtimeVersion: '1.0.0',
    layoutJson: { root: true },
    themeJson: { color: 'blue' },
    dataJson: { items: [] },
    manifestJson: { pages: 1 },
    ...overrides,
  };
}

interface SiteRepoMock {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  manager?: { transaction: jest.Mock };
}

interface RevisionRepoMock {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

interface Harness {
  adapter: TypeOrmPublishedSiteRepository;
  siteRepo: SiteRepoMock;
  revisionRepo: RevisionRepoMock;
  txSiteRepo: SiteRepoMock;
  txRevisionRepo: RevisionRepoMock;
  transaction: jest.Mock;
}

function createHarness(): Harness {
  // Per-entity repo mocks used inside the transaction callback.
  const txSiteRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  } as unknown as SiteRepoMock;
  const txRevisionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  } as unknown as RevisionRepoMock;

  // Fake EntityManager handed to the transaction callback: getRepository(Entity)
  // dispatches to the matching per-entity mock repo.
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === PublishedSite) {
        return txSiteRepo;
      }
      if (entity === PublishedSiteRevision) {
        return txRevisionRepo;
      }
      throw new Error('unexpected entity requested inside transaction');
    }),
  } as unknown as EntityManager;

  // transaction(cb) immediately invokes the callback with the fake manager.
  const transaction = jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager));

  // The injected siteRepo also owns `.manager.transaction`.
  const siteRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction },
  } as unknown as SiteRepoMock;
  const revisionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  } as unknown as RevisionRepoMock;

  const adapter = new TypeOrmPublishedSiteRepository(
    siteRepo as unknown as Repository<PublishedSite>,
    revisionRepo as unknown as Repository<PublishedSiteRevision>,
  );

  return { adapter, siteRepo, revisionRepo, txSiteRepo, txRevisionRepo, transaction };
}

describe('TypeOrmPublishedSiteRepository', () => {
  describe('publishNewSite', () => {
    it('creates a site and revision, links the active revision, returns the detail', async () => {
      const h = createHarness();
      const input: PublishNewSiteInput = {
        ownerUserId: 'owner-1',
        templateId: 'template-1',
        subdomain: 'demo',
        payload: makePayload(),
      };

      const createdSite = makeSite({ id: 'site-1', activeRevisionId: null });
      const savedSiteNoRevision = makeSite({ id: 'site-1', activeRevisionId: null });
      const createdRevision = makeRevision({ id: 'revision-1', siteId: 'site-1' });
      const savedRevision = makeRevision({ id: 'revision-1', siteId: 'site-1' });
      const savedSiteWithRevision = makeSite({ id: 'site-1', activeRevisionId: 'revision-1' });

      h.txSiteRepo.create.mockReturnValue(createdSite);
      h.txSiteRepo.save
        .mockResolvedValueOnce(savedSiteNoRevision)
        .mockResolvedValueOnce(savedSiteWithRevision);
      h.txRevisionRepo.create.mockReturnValue(createdRevision);
      h.txRevisionRepo.save.mockResolvedValue(savedRevision);

      const result = await h.adapter.publishNewSite(input);

      // Runs inside a transaction.
      expect(h.transaction).toHaveBeenCalledTimes(1);

      // Site is created with the initial (pre-revision) shape.
      expect(h.txSiteRepo.create).toHaveBeenCalledWith({
        ownerUserId: 'owner-1',
        templateId: 'template-1',
        subdomain: 'demo',
        status: 'active',
        activeRevisionId: null,
      });

      // Revision is created from the persisted site id + payload spread.
      expect(h.txRevisionRepo.create).toHaveBeenCalledWith({
        siteId: 'site-1',
        templateId: 'template-1',
        status: 'active',
        errorMessage: null,
        ...input.payload,
      });
      expect(h.txRevisionRepo.save).toHaveBeenCalledWith(createdRevision);

      // Site saved twice: once initially, once with the linked active revision id.
      expect(h.txSiteRepo.save).toHaveBeenCalledTimes(2);
      expect(savedSiteNoRevision.activeRevisionId).toBe('revision-1');

      expect(result).toEqual({ site: savedSiteWithRevision, activeRevision: savedRevision });
    });
  });

  describe('republishSite', () => {
    it('looks up the owned site, saves a new active revision, returns the detail', async () => {
      const h = createHarness();
      const input: RepublishSiteInput = {
        ownerUserId: 'owner-1',
        siteId: 'site-1',
        templateId: 'template-2',
        payload: makePayload({ schemaVersion: 2 }),
      };

      const existingSite = makeSite({ id: 'site-1', activeRevisionId: 'old-rev' });
      const createdRevision = makeRevision({
        id: 'revision-2',
        siteId: 'site-1',
        templateId: 'template-2',
      });
      const savedRevision = makeRevision({
        id: 'revision-2',
        siteId: 'site-1',
        templateId: 'template-2',
      });
      const savedSite = makeSite({ id: 'site-1', activeRevisionId: 'revision-2' });

      h.txSiteRepo.findOne.mockResolvedValue(existingSite);
      h.txRevisionRepo.create.mockReturnValue(createdRevision);
      h.txRevisionRepo.save.mockResolvedValue(savedRevision);
      h.txSiteRepo.save.mockResolvedValue(savedSite);

      const result = await h.adapter.republishSite(input);

      expect(h.transaction).toHaveBeenCalledTimes(1);
      expect(h.txSiteRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'site-1', ownerUserId: 'owner-1' },
      });
      expect(h.txRevisionRepo.create).toHaveBeenCalledWith({
        siteId: 'site-1',
        templateId: 'template-2',
        status: 'active',
        errorMessage: null,
        ...input.payload,
      });
      expect(h.txRevisionRepo.save).toHaveBeenCalledWith(createdRevision);
      expect(existingSite.activeRevisionId).toBe('revision-2');
      expect(h.txSiteRepo.save).toHaveBeenCalledWith(existingSite);
      expect(result).toEqual({ site: savedSite, activeRevision: savedRevision });
    });

    it('throws NotFoundException when the owned site does not exist', async () => {
      const h = createHarness();
      h.txSiteRepo.findOne.mockResolvedValue(null);

      await expect(
        h.adapter.republishSite({
          ownerUserId: 'owner-1',
          siteId: 'missing',
          templateId: 'template-1',
          payload: makePayload(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(h.txRevisionRepo.create).not.toHaveBeenCalled();
      expect(h.txSiteRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('activateRevision', () => {
    it('points the active revision at an existing revision and returns the detail', async () => {
      const h = createHarness();
      const existingSite = makeSite({ id: 'site-1', activeRevisionId: 'old-rev' });
      const targetRevision = makeRevision({ id: 'revision-9', siteId: 'site-1' });
      const savedSite = makeSite({ id: 'site-1', activeRevisionId: 'revision-9' });

      h.txSiteRepo.findOne.mockResolvedValue(existingSite);
      h.txRevisionRepo.findOne.mockResolvedValue(targetRevision);
      h.txSiteRepo.save.mockResolvedValue(savedSite);

      const result = await h.adapter.activateRevision({
        ownerUserId: 'owner-1',
        siteId: 'site-1',
        revisionId: 'revision-9',
      });

      expect(h.transaction).toHaveBeenCalledTimes(1);
      expect(h.txSiteRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'site-1', ownerUserId: 'owner-1' },
      });
      expect(h.txRevisionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'revision-9', siteId: 'site-1' },
      });
      expect(existingSite.activeRevisionId).toBe('revision-9');
      expect(h.txSiteRepo.save).toHaveBeenCalledWith(existingSite);
      expect(result).toEqual({ site: savedSite, activeRevision: targetRevision });
    });

    it('throws NotFoundException when the owned site is missing', async () => {
      const h = createHarness();
      h.txSiteRepo.findOne.mockResolvedValue(null);

      await expect(
        h.adapter.activateRevision({
          ownerUserId: 'owner-1',
          siteId: 'missing',
          revisionId: 'revision-9',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(h.txRevisionRepo.findOne).not.toHaveBeenCalled();
      expect(h.txSiteRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the revision is missing for the site', async () => {
      const h = createHarness();
      h.txSiteRepo.findOne.mockResolvedValue(makeSite());
      h.txRevisionRepo.findOne.mockResolvedValue(null);

      await expect(
        h.adapter.activateRevision({
          ownerUserId: 'owner-1',
          siteId: 'site-1',
          revisionId: 'missing-rev',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(h.txSiteRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findForOwner', () => {
    it('finds owner sites ordered by updatedAt DESC', async () => {
      const h = createHarness();
      const sites = [makeSite({ id: 'site-1' }), makeSite({ id: 'site-2' })];
      h.siteRepo.find.mockResolvedValue(sites);

      await expect(h.adapter.findForOwner('owner-1')).resolves.toBe(sites);
      expect(h.siteRepo.find).toHaveBeenCalledWith({
        where: { ownerUserId: 'owner-1' },
        order: { updatedAt: 'DESC' },
      });
    });
  });

  describe('findOwnedSite', () => {
    it('finds a single site scoped to id + owner', async () => {
      const h = createHarness();
      const site = makeSite();
      h.siteRepo.findOne.mockResolvedValue(site);

      await expect(h.adapter.findOwnedSite('owner-1', 'site-1')).resolves.toBe(site);
      expect(h.siteRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'site-1', ownerUserId: 'owner-1' },
      });
    });

    it('returns null when no owned site matches', async () => {
      const h = createHarness();
      h.siteRepo.findOne.mockResolvedValue(null);

      await expect(h.adapter.findOwnedSite('owner-1', 'missing')).resolves.toBeNull();
    });
  });

  describe('findBySubdomain', () => {
    it('finds a site by subdomain', async () => {
      const h = createHarness();
      const site = makeSite();
      h.siteRepo.findOne.mockResolvedValue(site);

      await expect(h.adapter.findBySubdomain('demo')).resolves.toBe(site);
      expect(h.siteRepo.findOne).toHaveBeenCalledWith({ where: { subdomain: 'demo' } });
    });
  });

  describe('findActiveBySubdomain', () => {
    it('finds an active site by subdomain', async () => {
      const h = createHarness();
      const site = makeSite();
      h.siteRepo.findOne.mockResolvedValue(site);

      await expect(h.adapter.findActiveBySubdomain('demo')).resolves.toBe(site);
      expect(h.siteRepo.findOne).toHaveBeenCalledWith({
        where: { subdomain: 'demo', status: 'active' },
      });
    });
  });

  describe('findRevision', () => {
    it('finds a revision scoped to id + siteId', async () => {
      const h = createHarness();
      const revision = makeRevision();
      h.revisionRepo.findOne.mockResolvedValue(revision);

      await expect(h.adapter.findRevision('site-1', 'revision-1')).resolves.toBe(revision);
      expect(h.revisionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'revision-1', siteId: 'site-1' },
      });
    });
  });

  describe('findRevisionsForSite', () => {
    it('lists revisions for a site ordered by createdAt DESC', async () => {
      const h = createHarness();
      const revisions = [makeRevision({ id: 'revision-2' }), makeRevision({ id: 'revision-1' })];
      h.revisionRepo.find.mockResolvedValue(revisions);

      await expect(h.adapter.findRevisionsForSite('site-1')).resolves.toBe(revisions);
      expect(h.revisionRepo.find).toHaveBeenCalledWith({
        where: { siteId: 'site-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
