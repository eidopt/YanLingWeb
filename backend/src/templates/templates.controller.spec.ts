import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import { ConfigService } from '../config/config.service';
import { Template } from './entities/template.entity';
import type {
  TemplateAgentKnowledgeRepository,
  TemplateListFilters,
  TemplatePersistenceRepository,
} from './repositories';
import { TemplateAssetService } from './templateAsset.service';
import { TemplateCategoryRegistryService } from './templateCategoryRegistry.service';
import { TemplatesController } from './templates.controller';
import {
  TemplatesService,
  type TemplateWithAgentConfig,
  type UpdateOwnedTemplateInput,
} from './templates.service';

type MarketplaceResult = Awaited<ReturnType<TemplatesService['findMarketplace']>>;
type OwnedResult = Awaited<ReturnType<TemplatesService['findOwned']>>;

interface TemplatesHarness {
  controller: TemplatesController;
  service: MockTemplatesService;
}

const unusedTemplates: TemplatePersistenceRepository = {
  saveTemplate: () => Promise.reject(new Error('unused repository')),
  findAgentConfig: () => Promise.reject(new Error('unused repository')),
  generatedProfileExists: () => Promise.reject(new Error('unused repository')),
  upsertAgentConfig: () => Promise.reject(new Error('unused repository')),
  createTemplate: () => {
    throw new Error('unused repository');
  },
  upsertTemplates: () => Promise.reject(new Error('unused repository')),
  findMarketplace: () => Promise.reject(new Error('unused repository')),
  findOwned: () => Promise.reject(new Error('unused repository')),
  findRecentOwned: () => Promise.reject(new Error('unused repository')),
  findPublicByTemplateId: () => Promise.reject(new Error('unused repository')),
  findOwnedByTemplateId: () => Promise.reject(new Error('unused repository')),
  findAccessibleByTemplateId: () => Promise.reject(new Error('unused repository')),
  findByTemplateId: () => Promise.reject(new Error('unused repository')),
  existsByTemplateId: () => Promise.reject(new Error('unused repository')),
  findAllTemplates: () => Promise.reject(new Error('unused repository')),
  findExistingGeneratedProfileTemplateIds: () => Promise.reject(new Error('unused repository')),
  findAllUserIds: () => Promise.reject(new Error('unused repository')),
  findPublicTemplateIds: () => Promise.reject(new Error('unused repository')),
  findOwnerlessTemplates: () => Promise.reject(new Error('unused repository')),
  runInTransaction: () => Promise.reject(new Error('unused repository')),
};

const unusedAgentKnowledge: TemplateAgentKnowledgeRepository = {
  findForTemplate: () => Promise.reject(new Error('unused repository')),
};

class MockTemplatesService extends TemplatesService {
  readonly findMarketplaceMock = jest.fn<Promise<MarketplaceResult>, [TemplateListFilters]>();
  readonly findOwnedMock = jest.fn<Promise<OwnedResult>, [string, TemplateListFilters]>();
  readonly findRecentOwnedMock = jest.fn<Promise<Template[]>, [string]>();
  readonly findOwnedByTemplateIdMock = jest.fn<
    Promise<TemplateWithAgentConfig>,
    [string, string]
  >();
  readonly updateOwnedMock = jest.fn<
    Promise<Template>,
    [string, string, UpdateOwnedTemplateInput]
  >();
  readonly duplicateForUserMock = jest.fn<Promise<Template>, [string, string]>();
  readonly findByTemplateIdMock = jest.fn<Promise<TemplateWithAgentConfig>, [string]>();

  constructor() {
    super(
      unusedTemplates,
      unusedAgentKnowledge,
      Object.create(ConfigService.prototype) as ConfigService,
      Object.create(TemplateAssetService.prototype) as TemplateAssetService,
      Object.create(TemplateCategoryRegistryService.prototype) as TemplateCategoryRegistryService,
    );
  }

  override findMarketplace(options: TemplateListFilters = {}): Promise<MarketplaceResult> {
    return this.findMarketplaceMock(options);
  }

  override findOwned(ownerUserId: string, options: TemplateListFilters = {}): Promise<OwnedResult> {
    return this.findOwnedMock(ownerUserId, options);
  }

  override findRecentOwned(ownerUserId: string): Promise<Template[]> {
    return this.findRecentOwnedMock(ownerUserId);
  }

  override findOwnedByTemplateId(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateWithAgentConfig> {
    return this.findOwnedByTemplateIdMock(ownerUserId, templateId);
  }

  override updateOwned(
    ownerUserId: string,
    templateId: string,
    input: UpdateOwnedTemplateInput,
  ): Promise<Template> {
    return this.updateOwnedMock(ownerUserId, templateId, input);
  }

  override duplicateForUser(ownerUserId: string, sourceTemplateId: string): Promise<Template> {
    return this.duplicateForUserMock(ownerUserId, sourceTemplateId);
  }

  override findByTemplateId(templateId: string): Promise<TemplateWithAgentConfig> {
    return this.findByTemplateIdMock(templateId);
  }
}

function createTemplate(overrides: Partial<Template> = {}): Template {
  return Object.assign(new Template(), {
    id: 'template-row-1',
    templateId: 'commerce-market',
    ownerUserId: null,
    sourceTemplateId: null,
    isPublic: true,
    name: 'Commerce Market',
    tagline: 'Tagline',
    description: 'Description',
    accent: '#000000',
    category: 'commerce',
    displayCategory: 'commerce',
    primaryFunctionalCategory: 'commerce',
    platformCategories: ['web'],
    functionalCategories: ['commerce'],
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

function createRequest(userId = 'user-1'): AuthenticatedRequest {
  return { user: { sub: userId, username: 'alice' } } as AuthenticatedRequest;
}

function createHarness(): TemplatesHarness {
  const service = new MockTemplatesService();
  return { controller: new TemplatesController(service), service };
}

describe('TemplatesController', () => {
  it('lists marketplace templates with normalized query filters', async () => {
    const { controller, service } = createHarness();
    const result: MarketplaceResult = { data: [createTemplate()], total: 1 };
    service.findMarketplaceMock.mockResolvedValue(result);

    await expect(
      controller.findAll('shoes', 'commerce', 'commerce', 'web', 'commerce'),
    ).resolves.toBe(result);

    expect(service.findMarketplaceMock).toHaveBeenCalledWith({
      search: 'shoes',
      category: 'commerce',
      displayCategory: 'commerce',
      platformCategory: 'web',
      functionalCategory: 'commerce',
    });
  });

  it('passes undefined filters through to the marketplace query', async () => {
    const { controller, service } = createHarness();
    const result: MarketplaceResult = { data: [], total: 0 };
    service.findMarketplaceMock.mockResolvedValue(result);

    await expect(controller.findAll()).resolves.toBe(result);

    expect(service.findMarketplaceMock).toHaveBeenCalledWith({
      search: undefined,
      category: undefined,
      displayCategory: undefined,
      platformCategory: undefined,
      functionalCategory: undefined,
    });
  });

  it('lists owned templates scoped to the authenticated user', async () => {
    const { controller, service } = createHarness();
    const result: OwnedResult = { data: [createTemplate({ ownerUserId: 'user-1' })], total: 1 };
    service.findOwnedMock.mockResolvedValue(result);

    await expect(
      controller.findMine(createRequest(), 'shoes', 'commerce', 'commerce', 'web', 'commerce'),
    ).resolves.toBe(result);

    expect(service.findOwnedMock).toHaveBeenCalledWith('user-1', {
      search: 'shoes',
      category: 'commerce',
      displayCategory: 'commerce',
      platformCategory: 'web',
      functionalCategory: 'commerce',
    });
  });

  it('lists recently updated templates for the authenticated user', async () => {
    const { controller, service } = createHarness();
    const templates = [createTemplate({ ownerUserId: 'user-1' })];
    service.findRecentOwnedMock.mockResolvedValue(templates);

    await expect(controller.recent(createRequest())).resolves.toBe(templates);

    expect(service.findRecentOwnedMock).toHaveBeenCalledWith('user-1');
  });

  it('finds one owned template by templateId for the authenticated user', async () => {
    const { controller, service } = createHarness();
    const template = createTemplate({
      ownerUserId: 'user-1',
    }) as TemplateWithAgentConfig;
    service.findOwnedByTemplateIdMock.mockResolvedValue(template);

    await expect(controller.findOwnedOne(createRequest(), 'commerce-market')).resolves.toBe(
      template,
    );

    expect(service.findOwnedByTemplateIdMock).toHaveBeenCalledWith('user-1', 'commerce-market');
  });

  it('updates an owned template draft and forwards the owner id and body', async () => {
    const { controller, service } = createHarness();
    const body: UpdateOwnedTemplateInput = { name: 'Updated Name' };
    const updated = createTemplate({ ownerUserId: 'user-1', name: 'Updated Name' });
    service.updateOwnedMock.mockResolvedValue(updated);

    await expect(controller.updateOwned(createRequest(), 'commerce-market', body)).resolves.toBe(
      updated,
    );

    expect(service.updateOwnedMock).toHaveBeenCalledWith('user-1', 'commerce-market', body);
  });

  it('duplicates a marketplace template for the authenticated user', async () => {
    const { controller, service } = createHarness();
    const copy = createTemplate({
      templateId: 'commerce-market-copy-user1234-abc',
      ownerUserId: 'user-1',
      isPublic: false,
    });
    service.duplicateForUserMock.mockResolvedValue(copy);

    await expect(controller.duplicate(createRequest(), 'commerce-market')).resolves.toBe(copy);

    expect(service.duplicateForUserMock).toHaveBeenCalledWith('user-1', 'commerce-market');
  });

  it('finds a marketplace template by templateId without auth scoping', async () => {
    const { controller, service } = createHarness();
    const template = createTemplate() as TemplateWithAgentConfig;
    service.findByTemplateIdMock.mockResolvedValue(template);

    await expect(controller.findOne('commerce-market')).resolves.toBe(template);

    expect(service.findByTemplateIdMock).toHaveBeenCalledWith('commerce-market');
  });
});
