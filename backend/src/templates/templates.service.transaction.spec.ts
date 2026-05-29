import { createBlankDocument } from '@shared/agent/runtime';
import { themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';

import { ConfigService } from '../config/config.service';
import { Template } from './entities/template.entity';
import type {
  TemplateAgentConfigInput,
  TemplateAgentConfigRecords,
  TemplateListFilters,
  TemplatePersistenceRepository,
  TemplatePersistenceStore,
} from './repositories';
import type { TemplateAgentKnowledgeRepository } from './repositories';
import { TemplateAssetService } from './template-asset.service';
import { TemplateCategoryRegistryService } from './template-category-registry.service';
import { TemplatesService } from './templates.service';

interface PersistenceHarness {
  repository: TemplatePersistenceRepository;
  runInTransaction: jest.Mock;
}

interface StoreHarness {
  store: TemplatePersistenceStore;
  saveTemplate: jest.Mock;
  findAgentConfig: jest.Mock;
  upsertAgentConfig: jest.Mock;
}

function createTemplate(templateId: string): Template {
  const template = new Template();
  template.id = `${templateId}-row`;
  template.templateId = templateId;
  template.ownerUserId = null;
  template.sourceTemplateId = null;
  template.isPublic = true;
  template.name = 'Market Template';
  template.tagline = 'Tagline';
  template.description = 'Description';
  template.accent = '#000000';
  template.category = 'general';
  template.displayCategory = 'general';
  template.primaryFunctionalCategory = 'general';
  template.platformCategories = ['web'];
  template.functionalCategories = ['general'];
  template.traits = [];
  template.tags = [];
  template.searchText = '';
  template.cssVars = {};
  template.cssAnimations = null;
  template.componentTemplates = {};
  template.layoutDocument = themeLayoutDocumentToRecord(createBlankDocument(templateId));
  template.createdAt = new Date('2026-05-29T00:00:00.000Z');
  template.updatedAt = new Date('2026-05-29T00:00:00.000Z');
  return template;
}

function emptyAgentConfig(): TemplateAgentConfigRecords {
  return {
    profileGenerated: null,
    profileOverride: null,
    assets: null,
    permissions: null,
    evaluation: null,
  };
}

function createPersistenceStore(): StoreHarness {
  const saveTemplate = jest.fn((template: Template) =>
    Promise.resolve(Object.assign(new Template(), template, { id: 'copy-row' })),
  );
  const findAgentConfig = jest.fn(() =>
    Promise.resolve({
      ...emptyAgentConfig(),
      assets: { templateId: 'market', visualAssets: [] },
    }),
  );
  const upsertAgentConfig = jest.fn(() => Promise.resolve());
  return {
    store: {
      saveTemplate,
      findAgentConfig,
      generatedProfileExists: jest.fn(() => Promise.resolve(false)),
      upsertAgentConfig,
    },
    saveTemplate,
    findAgentConfig,
    upsertAgentConfig,
  };
}

function createPersistenceRepository(
  sourceTemplate: Template,
  transactionStore: TemplatePersistenceStore,
): PersistenceHarness {
  const runInTransaction = jest.fn();
  const runTransaction = async <T>(
    work: (store: TemplatePersistenceStore) => Promise<T>,
  ): Promise<T> => {
    runInTransaction(work);
    return work(transactionStore);
  };
  return {
    repository: {
      ...createPersistenceStore().store,
      createTemplate: jest.fn((input: Partial<Template>) => Object.assign(new Template(), input)),
      upsertTemplates: jest.fn(() => Promise.resolve()),
      findMarketplace: jest.fn((_filters: TemplateListFilters) => Promise.resolve([])),
      findOwned: jest.fn((_ownerUserId: string, _filters: TemplateListFilters) =>
        Promise.resolve([]),
      ),
      findRecentOwned: jest.fn((_ownerUserId: string, _limit: number) => Promise.resolve([])),
      findPublicByTemplateId: jest.fn((templateId: string) =>
        Promise.resolve(templateId === sourceTemplate.templateId ? sourceTemplate : null),
      ),
      findOwnedByTemplateId: jest.fn(() => Promise.resolve(null)),
      findAccessibleByTemplateId: jest.fn(() => Promise.resolve(null)),
      findByTemplateId: jest.fn(() => Promise.resolve(null)),
      existsByTemplateId: jest.fn(() => Promise.resolve(false)),
      findAllTemplates: jest.fn(() => Promise.resolve([])),
      findExistingGeneratedProfileTemplateIds: jest.fn(() => Promise.resolve([])),
      findAllUserIds: jest.fn(() => Promise.resolve([])),
      findPublicTemplateIds: jest.fn(() => Promise.resolve([])),
      findOwnerlessTemplates: jest.fn(() => Promise.resolve([])),
      runInTransaction: runTransaction,
    },
    runInTransaction,
  };
}

function createAgentKnowledgeRepository(): TemplateAgentKnowledgeRepository {
  return {
    findForTemplate: jest.fn(() => Promise.resolve(emptyAgentConfig())),
  };
}

describe('TemplatesService transactions', () => {
  it('duplicates template row and agent config inside one transaction', async () => {
    const sourceTemplate = createTemplate('market');
    const transactionStore = createPersistenceStore();
    const persistence = createPersistenceRepository(sourceTemplate, transactionStore.store);
    const agentKnowledge = createAgentKnowledgeRepository();

    const categoryRegistry = Object.assign(
      Object.create(TemplateCategoryRegistryService.prototype) as TemplateCategoryRegistryService,
      {
        decorateTemplate: jest.fn((template: Template) => Promise.resolve(template)),
      },
    );
    const config = Object.create(ConfigService.prototype) as ConfigService;
    const templateAssetService = Object.create(
      TemplateAssetService.prototype,
    ) as TemplateAssetService;

    const service = new TemplatesService(
      persistence.repository,
      agentKnowledge,
      config,
      templateAssetService,
      categoryRegistry,
    );

    const result = await service.duplicateForUser('user-12345678', 'market');

    expect(result.templateId).toContain('market-copy-user1234');
    expect(persistence.runInTransaction).toHaveBeenCalledTimes(1);
    expect(transactionStore.saveTemplate).toHaveBeenCalledTimes(1);
    expect(transactionStore.findAgentConfig).toHaveBeenCalledWith('market');
    expect(transactionStore.upsertAgentConfig).toHaveBeenCalledWith(
      result.templateId,
      expect.objectContaining<TemplateAgentConfigInput>({
        assets: { templateId: 'market', visualAssets: [] },
      }),
    );
  });
});
