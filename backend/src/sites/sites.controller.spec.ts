import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import type { TemplateReadRepository } from '../templates/repositories/templateRead.repository';
import type { PublishedSiteRepository } from './repositories';
import { SitesController } from './sites.controller';
import {
  type DiffSiteRevisionsInput,
  type PublishSiteInput,
  type RollbackSiteInput,
  SitesService,
} from './sites.service';

type PublishResult = Awaited<ReturnType<SitesService['publish']>>;
type RepublishResult = Awaited<ReturnType<SitesService['republish']>>;
type FindMineResult = Awaited<ReturnType<SitesService['findMine']>>;
type GetOwnedResult = Awaited<ReturnType<SitesService['getOwned']>>;
type RollbackResult = Awaited<ReturnType<SitesService['rollback']>>;
type ListRevisionsResult = Awaited<ReturnType<SitesService['listRevisions']>>;
type DiffRevisionsResult = Awaited<ReturnType<SitesService['diffRevisions']>>;
type ResolvePublicResult = Awaited<ReturnType<SitesService['resolvePublic']>>;

interface SitesHarness {
  controller: SitesController;
  service: MockSitesService;
}

const unusedSites: PublishedSiteRepository = {
  publishNewSite: () => Promise.reject(new Error('unused repository')),
  republishSite: () => Promise.reject(new Error('unused repository')),
  activateRevision: () => Promise.reject(new Error('unused repository')),
  findForOwner: () => Promise.reject(new Error('unused repository')),
  findOwnedSite: () => Promise.reject(new Error('unused repository')),
  findBySubdomain: () => Promise.reject(new Error('unused repository')),
  findActiveBySubdomain: () => Promise.reject(new Error('unused repository')),
  findRevision: () => Promise.reject(new Error('unused repository')),
  findRevisionsForSite: () => Promise.reject(new Error('unused repository')),
};

const unusedTemplates: TemplateReadRepository = {
  searchPublicTemplates: () => Promise.reject(new Error('unused repository')),
  findDiversitySummaries: () => Promise.reject(new Error('unused repository')),
  findOwnedPublishSnapshot: () => Promise.reject(new Error('unused repository')),
  findAccessibleIdentity: () => Promise.reject(new Error('unused repository')),
};

class MockSitesService extends SitesService {
  readonly publishMock = jest.fn<Promise<PublishResult>, [string, PublishSiteInput]>();
  readonly republishMock = jest.fn<Promise<RepublishResult>, [string, string]>();
  readonly findMineMock = jest.fn<Promise<FindMineResult>, [string]>();
  readonly getOwnedMock = jest.fn<Promise<GetOwnedResult>, [string, string]>();
  readonly rollbackMock = jest.fn<Promise<RollbackResult>, [string, string, RollbackSiteInput]>();
  readonly listRevisionsMock = jest.fn<Promise<ListRevisionsResult>, [string, string]>();
  readonly diffRevisionsMock = jest.fn<
    Promise<DiffRevisionsResult>,
    [string, string, DiffSiteRevisionsInput]
  >();
  readonly resolvePublicMock = jest.fn<Promise<ResolvePublicResult>, [string]>();

  constructor() {
    super(unusedSites, unusedTemplates);
  }

  override publish(ownerUserId: string, input: PublishSiteInput): Promise<PublishResult> {
    return this.publishMock(ownerUserId, input);
  }

  override republish(ownerUserId: string, siteId: string): Promise<RepublishResult> {
    return this.republishMock(ownerUserId, siteId);
  }

  override findMine(ownerUserId: string): Promise<FindMineResult> {
    return this.findMineMock(ownerUserId);
  }

  override getOwned(ownerUserId: string, siteId: string): Promise<GetOwnedResult> {
    return this.getOwnedMock(ownerUserId, siteId);
  }

  override rollback(
    ownerUserId: string,
    siteId: string,
    input: RollbackSiteInput,
  ): Promise<RollbackResult> {
    return this.rollbackMock(ownerUserId, siteId, input);
  }

  override listRevisions(ownerUserId: string, siteId: string): Promise<ListRevisionsResult> {
    return this.listRevisionsMock(ownerUserId, siteId);
  }

  override diffRevisions(
    ownerUserId: string,
    siteId: string,
    input: DiffSiteRevisionsInput,
  ): Promise<DiffRevisionsResult> {
    return this.diffRevisionsMock(ownerUserId, siteId, input);
  }

  override resolvePublic(subdomain: string): Promise<ResolvePublicResult> {
    return this.resolvePublicMock(subdomain);
  }
}

function createRequest(userId = 'user-1'): AuthenticatedRequest {
  return { user: { sub: userId, username: 'alice' } } as AuthenticatedRequest;
}

function createHarness(): SitesHarness {
  const service = new MockSitesService();
  return { controller: new SitesController(service), service };
}

describe('SitesController', () => {
  it('publishes a site for the authenticated owner', async () => {
    const { controller, service } = createHarness();
    const body: PublishSiteInput = { templateId: 'template-1', subdomain: 'demo' };
    const result = { site: { id: 'site-1' } } as PublishResult;
    service.publishMock.mockResolvedValue(result);

    await expect(controller.publish(createRequest(), body)).resolves.toBe(result);

    expect(service.publishMock).toHaveBeenCalledWith('user-1', body);
  });

  it('republishes an owned site by id', async () => {
    const { controller, service } = createHarness();
    const result = { site: { id: 'site-1' } } as RepublishResult;
    service.republishMock.mockResolvedValue(result);

    await expect(controller.republish(createRequest(), 'site-1')).resolves.toBe(result);

    expect(service.republishMock).toHaveBeenCalledWith('user-1', 'site-1');
  });

  it('lists hosted sites owned by the authenticated user', async () => {
    const { controller, service } = createHarness();
    const result = { data: [], total: 0 } as FindMineResult;
    service.findMineMock.mockResolvedValue(result);

    await expect(controller.findMine(createRequest())).resolves.toBe(result);

    expect(service.findMineMock).toHaveBeenCalledWith('user-1');
  });

  it('gets a single owned site scoped to the authenticated user', async () => {
    const { controller, service } = createHarness();
    const result = { site: { id: 'site-1' } } as GetOwnedResult;
    service.getOwnedMock.mockResolvedValue(result);

    await expect(controller.getOwned(createRequest(), 'site-1')).resolves.toBe(result);

    expect(service.getOwnedMock).toHaveBeenCalledWith('user-1', 'site-1');
  });

  it('rolls back an owned site forwarding the rollback body', async () => {
    const { controller, service } = createHarness();
    const body: RollbackSiteInput = { revisionId: 'rev-1' };
    const result = { site: { id: 'site-1' } } as RollbackResult;
    service.rollbackMock.mockResolvedValue(result);

    await expect(controller.rollback(createRequest(), 'site-1', body)).resolves.toBe(result);

    expect(service.rollbackMock).toHaveBeenCalledWith('user-1', 'site-1', body);
  });

  it('lists revisions for an owned site', async () => {
    const { controller, service } = createHarness();
    const result = { data: [], total: 0 } as ListRevisionsResult;
    service.listRevisionsMock.mockResolvedValue(result);

    await expect(controller.listRevisions(createRequest(), 'site-1')).resolves.toBe(result);

    expect(service.listRevisionsMock).toHaveBeenCalledWith('user-1', 'site-1');
  });

  it('diffs two revisions forwarding the from/to query params', async () => {
    const { controller, service } = createHarness();
    const result = { diff: {} } as DiffRevisionsResult;
    service.diffRevisionsMock.mockResolvedValue(result);

    await expect(
      controller.diffRevisions(createRequest(), 'site-1', 'rev-1', 'rev-2'),
    ).resolves.toBe(result);

    expect(service.diffRevisionsMock).toHaveBeenCalledWith('user-1', 'site-1', {
      fromRevisionId: 'rev-1',
      toRevisionId: 'rev-2',
    });
  });

  it('forwards undefined diff query params when omitted', async () => {
    const { controller, service } = createHarness();
    const result = { diff: {} } as DiffRevisionsResult;
    service.diffRevisionsMock.mockResolvedValue(result);

    await expect(controller.diffRevisions(createRequest(), 'site-1')).resolves.toBe(result);

    expect(service.diffRevisionsMock).toHaveBeenCalledWith('user-1', 'site-1', {
      fromRevisionId: undefined,
      toRevisionId: undefined,
    });
  });

  it('resolves a public site by subdomain without an authenticated owner', async () => {
    const { controller, service } = createHarness();
    const result = { site: { id: 'site-1' } } as ResolvePublicResult;
    service.resolvePublicMock.mockResolvedValue(result);

    await expect(controller.resolvePublic('demo')).resolves.toBe(result);

    expect(service.resolvePublicMock).toHaveBeenCalledWith('demo');
  });
});
