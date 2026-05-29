/// <reference types="jest" />

import type { EntityManager, Repository } from 'typeorm';
import { IsNull } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Template } from '../entities/template.entity';
import { TemplateAgentPermissions } from '../entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from '../entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from '../entities/template-evaluation-spec.entity';
import { TemplateProfileGenerated } from '../entities/template-profile-generated.entity';
import { TemplateProfileOverrideEntity } from '../entities/template-profile-override.entity';
import type {
  TemplateListFilters,
  TemplatePersistenceStore,
} from './template-persistence.repository';
import { TypeOrmTemplatePersistenceRepository } from './typeorm-template-persistence.repository';

interface RepoMock {
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  exists: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: { transaction: jest.Mock };
}

function makeRepoMock(): RepoMock {
  return {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
  };
}

interface QueryBuilderMock {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  getMany: jest.Mock;
}

function makeQueryBuilderMock(result: Template[]): QueryBuilderMock {
  const qb: QueryBuilderMock = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn(() => Promise.resolve(result)),
  };
  return qb;
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return Object.assign(new Template(), {
    id: 'row-1',
    templateId: 'tmpl-1',
    ownerUserId: null,
    sourceTemplateId: null,
    isPublic: true,
    name: 'Name',
    tagline: 'Tagline',
    description: 'Description',
    accent: '#000000',
    category: 'general',
    displayCategory: 'general',
    primaryFunctionalCategory: 'general',
    platformCategories: ['web'],
    functionalCategories: ['general'],
    traits: [],
    tags: [],
    searchText: '',
    cssVars: {},
    cssAnimations: null,
    componentTemplates: {},
    layoutDocument: {},
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

interface Harness {
  repository: TypeOrmTemplatePersistenceRepository;
  templateRepo: RepoMock;
  profileGeneratedRepo: RepoMock;
  profileOverrideRepo: RepoMock;
  assetManifestRepo: RepoMock;
  agentPermissionsRepo: RepoMock;
  evaluationSpecRepo: RepoMock;
  userRepo: RepoMock;
}

function createHarness(): Harness {
  const templateRepo = makeRepoMock();
  const profileGeneratedRepo = makeRepoMock();
  const profileOverrideRepo = makeRepoMock();
  const assetManifestRepo = makeRepoMock();
  const agentPermissionsRepo = makeRepoMock();
  const evaluationSpecRepo = makeRepoMock();
  const userRepo = makeRepoMock();

  const repository = new TypeOrmTemplatePersistenceRepository(
    templateRepo as unknown as Repository<Template>,
    profileGeneratedRepo as unknown as Repository<TemplateProfileGenerated>,
    profileOverrideRepo as unknown as Repository<TemplateProfileOverrideEntity>,
    assetManifestRepo as unknown as Repository<TemplateAssetManifest>,
    agentPermissionsRepo as unknown as Repository<TemplateAgentPermissions>,
    evaluationSpecRepo as unknown as Repository<TemplateEvaluationSpec>,
    userRepo as unknown as Repository<User>,
  );

  return {
    repository,
    templateRepo,
    profileGeneratedRepo,
    profileOverrideRepo,
    assetManifestRepo,
    agentPermissionsRepo,
    evaluationSpecRepo,
    userRepo,
  };
}

describe('TypeOrmTemplatePersistenceRepository', () => {
  describe('saveTemplate', () => {
    it('delegates to templateRepo.save and returns the saved entity', async () => {
      const h = createHarness();
      const template = makeTemplate();
      const saved = makeTemplate({ id: 'saved-row' });
      h.templateRepo.save.mockResolvedValue(saved);

      await expect(h.repository.saveTemplate(template)).resolves.toBe(saved);
      expect(h.templateRepo.save).toHaveBeenCalledWith(template);
    });
  });

  describe('findAgentConfig', () => {
    it('reads every sub-entity and maps nested fields, defaulting missing to null', async () => {
      const h = createHarness();
      h.profileGeneratedRepo.findOne.mockResolvedValue({ profile: { p: 1 } });
      h.profileOverrideRepo.findOne.mockResolvedValue({ override: { o: 2 } });
      h.assetManifestRepo.findOne.mockResolvedValue(null);
      h.agentPermissionsRepo.findOne.mockResolvedValue({ permissions: { allow: true } });
      h.evaluationSpecRepo.findOne.mockResolvedValue(null);

      const result = await h.repository.findAgentConfig('tmpl-1');

      expect(result).toEqual({
        profileGenerated: { p: 1 },
        profileOverride: { o: 2 },
        assets: null,
        permissions: { allow: true },
        evaluation: null,
      });
      const where = { where: { templateId: 'tmpl-1' } };
      expect(h.profileGeneratedRepo.findOne).toHaveBeenCalledWith(where);
      expect(h.profileOverrideRepo.findOne).toHaveBeenCalledWith(where);
      expect(h.assetManifestRepo.findOne).toHaveBeenCalledWith(where);
      expect(h.agentPermissionsRepo.findOne).toHaveBeenCalledWith(where);
      expect(h.evaluationSpecRepo.findOne).toHaveBeenCalledWith(where);
    });
  });

  describe('generatedProfileExists', () => {
    it('delegates to profileGeneratedRepo.exists', async () => {
      const h = createHarness();
      h.profileGeneratedRepo.exists.mockResolvedValue(true);

      await expect(h.repository.generatedProfileExists('tmpl-1')).resolves.toBe(true);
      expect(h.profileGeneratedRepo.exists).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1' },
      });
    });
  });

  describe('upsertAgentConfig', () => {
    it('upserts each provided record, stamping templateId and resolving versions', async () => {
      const h = createHarness();
      h.profileGeneratedRepo.findOne.mockResolvedValue(null);
      h.profileGeneratedRepo.create.mockImplementation((v: Record<string, unknown>) => ({ ...v }));
      h.profileGeneratedRepo.save.mockResolvedValue(undefined);
      h.profileOverrideRepo.findOne.mockResolvedValue(null);
      h.profileOverrideRepo.create.mockImplementation((v: Record<string, unknown>) => ({ ...v }));
      h.profileOverrideRepo.save.mockResolvedValue(undefined);
      h.assetManifestRepo.findOne.mockResolvedValue(null);
      h.assetManifestRepo.create.mockImplementation((v: Record<string, unknown>) => ({ ...v }));
      h.assetManifestRepo.save.mockResolvedValue(undefined);
      h.agentPermissionsRepo.findOne.mockResolvedValue(null);
      h.agentPermissionsRepo.create.mockImplementation((v: Record<string, unknown>) => ({ ...v }));
      h.agentPermissionsRepo.save.mockResolvedValue(undefined);
      h.evaluationSpecRepo.findOne.mockResolvedValue(null);
      h.evaluationSpecRepo.create.mockImplementation((v: Record<string, unknown>) => ({ ...v }));
      h.evaluationSpecRepo.save.mockResolvedValue(undefined);

      await h.repository.upsertAgentConfig('tmpl-9', {
        profileGenerated: { profileVersion: '2.0.0', templateVersion: '3.0.0', body: 'g' },
        profileOverride: { profileVersion: '4.0.0', body: 'o' },
        assets: { visualAssets: [] },
        permissions: { allow: true },
        evaluation: { cases: [] },
      });

      expect(h.profileGeneratedRepo.create).toHaveBeenCalledWith({ templateId: 'tmpl-9' });
      expect(h.profileGeneratedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tmpl-9',
          templateVersion: '3.0.0',
          profileVersion: '2.0.0',
          profile: {
            profileVersion: '2.0.0',
            templateVersion: '3.0.0',
            body: 'g',
            templateId: 'tmpl-9',
          },
        }),
      );
      expect(h.profileOverrideRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tmpl-9',
          profileVersion: '4.0.0',
          override: { profileVersion: '4.0.0', body: 'o', templateId: 'tmpl-9' },
        }),
      );
      expect(h.assetManifestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tmpl-9',
          manifest: { visualAssets: [], templateId: 'tmpl-9' },
        }),
      );
      expect(h.agentPermissionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tmpl-9',
          permissions: { allow: true, templateId: 'tmpl-9' },
        }),
      );
      expect(h.evaluationSpecRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tmpl-9',
          evaluation: { cases: [], templateId: 'tmpl-9' },
        }),
      );
    });

    it('defaults versions to 1.0.0 when not strings and merges into existing rows', async () => {
      const h = createHarness();
      const existing = { id: 'pg-row', templateId: 'tmpl-9' };
      h.profileGeneratedRepo.findOne.mockResolvedValue(existing);
      h.profileGeneratedRepo.save.mockResolvedValue(undefined);

      await h.repository.upsertAgentConfig('tmpl-9', {
        profileGenerated: { body: 'g' },
      });

      expect(h.profileGeneratedRepo.create).not.toHaveBeenCalled();
      expect(h.profileGeneratedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pg-row',
          templateId: 'tmpl-9',
          templateVersion: '1.0.0',
          profileVersion: '1.0.0',
        }),
      );
    });

    it('writes nothing when no records are provided', async () => {
      const h = createHarness();
      await h.repository.upsertAgentConfig('tmpl-9', {});
      expect(h.profileGeneratedRepo.save).not.toHaveBeenCalled();
      expect(h.profileOverrideRepo.save).not.toHaveBeenCalled();
      expect(h.assetManifestRepo.save).not.toHaveBeenCalled();
      expect(h.agentPermissionsRepo.save).not.toHaveBeenCalled();
      expect(h.evaluationSpecRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('createTemplate', () => {
    it('delegates to templateRepo.create', () => {
      const h = createHarness();
      const created = makeTemplate();
      h.templateRepo.create.mockReturnValue(created);

      expect(h.repository.createTemplate({ templateId: 'tmpl-1' })).toBe(created);
      expect(h.templateRepo.create).toHaveBeenCalledWith({ templateId: 'tmpl-1' });
    });
  });

  describe('upsertTemplates', () => {
    it('merges each template onto its existing row or a new one, saving in order', async () => {
      const h = createHarness();
      const incomingA = makeTemplate({ templateId: 'a', name: 'A new' });
      const incomingB = makeTemplate({ templateId: 'b', name: 'B new' });
      // Incoming rows from a seed/import carry no primary key.
      delete (incomingA as Partial<Template>).id;
      delete (incomingB as Partial<Template>).id;
      const existingA = makeTemplate({ id: 'existing-a-row', templateId: 'a', name: 'A old' });
      h.templateRepo.findOne.mockResolvedValueOnce(existingA).mockResolvedValueOnce(null);
      h.templateRepo.save.mockResolvedValue(undefined);

      await h.repository.upsertTemplates([incomingA, incomingB]);

      expect(h.templateRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { templateId: 'a' },
      });
      expect(h.templateRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { templateId: 'b' },
      });
      // Existing row reused → keeps its id but takes incoming fields.
      expect(h.templateRepo.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'existing-a-row', templateId: 'a', name: 'A new' }),
      );
      // No existing row → merged onto a fresh Template instance.
      expect(h.templateRepo.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ templateId: 'b', name: 'B new' }),
      );
      const saveCalls = h.templateRepo.save.mock.calls as [Template][];
      expect(saveCalls[1][0]).toBeInstanceOf(Template);
    });
  });

  describe('findMarketplace', () => {
    it('builds an ownerless public query, applies filters and orders ASC', async () => {
      const h = createHarness();
      const rows = [makeTemplate()];
      const qb = makeQueryBuilderMock(rows);
      h.templateRepo.createQueryBuilder.mockReturnValue(qb);

      const filters: TemplateListFilters = {
        category: 'commerce',
        displayCategory: 'shop',
        functionalCategory: 'cart',
        platformCategory: 'web',
        search: 'Coffee',
      };
      await expect(h.repository.findMarketplace(filters)).resolves.toBe(rows);

      expect(h.templateRepo.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(qb.where).toHaveBeenCalledWith('t.ownerUserId IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('t.isPublic = :isPublic', { isPublic: true });
      expect(qb.andWhere).toHaveBeenCalledWith('t.category = :category', { category: 'commerce' });
      expect(qb.andWhere).toHaveBeenCalledWith('t.displayCategory = :displayCategory', {
        displayCategory: 'shop',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t.primaryFunctionalCategory = :fc', { fc: 'cart' });
      expect(qb.andWhere).toHaveBeenCalledWith('t.platformCategories LIKE :pc', { pc: '%web%' });
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('LOWER(t.name) LIKE :q'), {
        q: '%coffee%',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'ASC');
      expect(qb.getMany).toHaveBeenCalledTimes(1);
    });

    it('applies no optional filters when none are present', async () => {
      const h = createHarness();
      const qb = makeQueryBuilderMock([]);
      h.templateRepo.createQueryBuilder.mockReturnValue(qb);

      await h.repository.findMarketplace({});

      // Only the two base andWhere calls (isPublic) — no filter branches taken.
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('t.isPublic = :isPublic', { isPublic: true });
    });
  });

  describe('findOwned', () => {
    it('scopes by owner, applies filters and orders by updatedAt DESC', async () => {
      const h = createHarness();
      const rows = [makeTemplate({ ownerUserId: 'owner-1' })];
      const qb = makeQueryBuilderMock(rows);
      h.templateRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(h.repository.findOwned('owner-1', { category: 'commerce' })).resolves.toBe(rows);

      expect(qb.where).toHaveBeenCalledWith('t.ownerUserId = :ownerUserId', {
        ownerUserId: 'owner-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t.category = :category', { category: 'commerce' });
      expect(qb.orderBy).toHaveBeenCalledWith('t.updatedAt', 'DESC');
      expect(qb.getMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findRecentOwned', () => {
    it('finds owned rows ordered by updatedAt DESC with a take limit', async () => {
      const h = createHarness();
      const rows = [makeTemplate({ ownerUserId: 'owner-1' })];
      h.templateRepo.find.mockResolvedValue(rows);

      await expect(h.repository.findRecentOwned('owner-1', 5)).resolves.toBe(rows);
      expect(h.templateRepo.find).toHaveBeenCalledWith({
        where: { ownerUserId: 'owner-1' },
        order: { updatedAt: 'DESC' },
        take: 5,
      });
    });
  });

  describe('findPublicByTemplateId', () => {
    it('finds an ownerless public template by templateId', async () => {
      const h = createHarness();
      const row = makeTemplate();
      h.templateRepo.findOne.mockResolvedValue(row);

      await expect(h.repository.findPublicByTemplateId('tmpl-1')).resolves.toBe(row);
      expect(h.templateRepo.findOne).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1', ownerUserId: IsNull(), isPublic: true },
      });
    });
  });

  describe('findOwnedByTemplateId', () => {
    it('finds a template scoped to its owner', async () => {
      const h = createHarness();
      const row = makeTemplate({ ownerUserId: 'owner-1' });
      h.templateRepo.findOne.mockResolvedValue(row);

      await expect(h.repository.findOwnedByTemplateId('owner-1', 'tmpl-1')).resolves.toBe(row);
      expect(h.templateRepo.findOne).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1', ownerUserId: 'owner-1' },
      });
    });
  });

  describe('findAccessibleByTemplateId', () => {
    it('matches either the owned row or an ownerless public row', async () => {
      const h = createHarness();
      const row = makeTemplate();
      h.templateRepo.findOne.mockResolvedValue(row);

      await expect(h.repository.findAccessibleByTemplateId('owner-1', 'tmpl-1')).resolves.toBe(row);
      expect(h.templateRepo.findOne).toHaveBeenCalledWith({
        where: [
          { templateId: 'tmpl-1', ownerUserId: 'owner-1' },
          { templateId: 'tmpl-1', ownerUserId: IsNull(), isPublic: true },
        ],
      });
    });
  });

  describe('findByTemplateId', () => {
    it('finds by templateId and returns null when absent', async () => {
      const h = createHarness();
      h.templateRepo.findOne.mockResolvedValue(null);

      await expect(h.repository.findByTemplateId('missing')).resolves.toBeNull();
      expect(h.templateRepo.findOne).toHaveBeenCalledWith({ where: { templateId: 'missing' } });
    });
  });

  describe('existsByTemplateId', () => {
    it('delegates to templateRepo.exists', async () => {
      const h = createHarness();
      h.templateRepo.exists.mockResolvedValue(false);

      await expect(h.repository.existsByTemplateId('tmpl-1')).resolves.toBe(false);
      expect(h.templateRepo.exists).toHaveBeenCalledWith({ where: { templateId: 'tmpl-1' } });
    });
  });

  describe('findAllTemplates', () => {
    it('returns all rows', async () => {
      const h = createHarness();
      const rows = [makeTemplate()];
      h.templateRepo.find.mockResolvedValue(rows);

      await expect(h.repository.findAllTemplates()).resolves.toBe(rows);
      expect(h.templateRepo.find).toHaveBeenCalledWith();
    });
  });

  describe('findExistingGeneratedProfileTemplateIds', () => {
    it('selects only templateId and maps to a string array', async () => {
      const h = createHarness();
      h.profileGeneratedRepo.find.mockResolvedValue([{ templateId: 'a' }, { templateId: 'b' }]);

      await expect(h.repository.findExistingGeneratedProfileTemplateIds()).resolves.toEqual([
        'a',
        'b',
      ]);
      expect(h.profileGeneratedRepo.find).toHaveBeenCalledWith({
        select: { templateId: true },
      });
    });
  });

  describe('findAllUserIds', () => {
    it('selects only id from the user repo and maps to a string array', async () => {
      const h = createHarness();
      h.userRepo.find.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      await expect(h.repository.findAllUserIds()).resolves.toEqual(['u1', 'u2']);
      expect(h.userRepo.find).toHaveBeenCalledWith({ select: { id: true } });
    });
  });

  describe('findPublicTemplateIds', () => {
    it('selects templateId of ownerless public templates and maps to a string array', async () => {
      const h = createHarness();
      h.templateRepo.find.mockResolvedValue([{ templateId: 'a' }]);

      await expect(h.repository.findPublicTemplateIds()).resolves.toEqual(['a']);
      expect(h.templateRepo.find).toHaveBeenCalledWith({
        where: { ownerUserId: IsNull(), isPublic: true },
        select: { templateId: true },
      });
    });
  });

  describe('findOwnerlessTemplates', () => {
    it('finds rows with a null ownerUserId', async () => {
      const h = createHarness();
      const rows = [makeTemplate()];
      h.templateRepo.find.mockResolvedValue(rows);

      await expect(h.repository.findOwnerlessTemplates()).resolves.toBe(rows);
      expect(h.templateRepo.find).toHaveBeenCalledWith({
        where: { ownerUserId: IsNull() },
      });
    });
  });

  describe('runInTransaction', () => {
    it('runs work against a transactional store and propagates the result', async () => {
      const h = createHarness();

      const txTemplateRepo = makeRepoMock();
      const txProfileGeneratedRepo = makeRepoMock();
      const savedInTx = makeTemplate({ id: 'tx-saved' });
      txTemplateRepo.save.mockResolvedValue(savedInTx);
      txProfileGeneratedRepo.exists.mockResolvedValue(true);

      const getRepository = jest.fn((entity: unknown) => {
        if (entity === Template) {
          return txTemplateRepo;
        }
        if (entity === TemplateProfileGenerated) {
          return txProfileGeneratedRepo;
        }
        return makeRepoMock();
      });
      const manager = { getRepository } as unknown as EntityManager;

      // dataSource.transaction lives on templateRepo.manager.transaction.
      h.templateRepo.manager.transaction.mockImplementation((cb: (m: EntityManager) => unknown) =>
        cb(manager),
      );

      let received: TemplatePersistenceStore | undefined;
      const work = jest.fn(async (store: TemplatePersistenceStore) => {
        received = store;
        const saved = await store.saveTemplate(makeTemplate());
        const exists = await store.generatedProfileExists('tmpl-1');
        return { saved, exists };
      });

      const result = await h.repository.runInTransaction(work);

      expect(h.templateRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(received).toBeDefined();
      // The store handed to work must be a fresh transactional store, not the repository itself.
      expect(received).not.toBe(h.repository);
      // getRepository was used to bind each entity to the tx manager.
      expect(getRepository).toHaveBeenCalledWith(Template);
      expect(getRepository).toHaveBeenCalledWith(TemplateProfileGenerated);
      // Store ops routed to the transactional repos, NOT the outer ones.
      expect(txTemplateRepo.save).toHaveBeenCalledTimes(1);
      expect(h.templateRepo.save).not.toHaveBeenCalled();
      expect(txProfileGeneratedRepo.exists).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-1' },
      });
      // Returned value propagates out of the transaction.
      expect(result).toEqual({ saved: savedInTx, exists: true });
    });
  });
});
