/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createBlankDocument } from '@shared/agent/runtime';

import type {
  TemplateDiversitySummaryRecord,
  TemplatePublishSnapshot,
  TemplateReadRepository,
  TemplateSearchRecord,
} from '../templates/repositories/templateRead.repository';
import { PublishedSite } from './entities/publishedSite.entity';
import { PublishedSiteRevision } from './entities/publishedSiteRevision.entity';
import type {
  PublishedSiteDetailRecord,
  PublishedSiteRepository,
  PublishNewSiteInput,
  RepublishSiteInput,
} from './repositories';
import { SitesService } from './sites.service';

class FakePublishedSiteRepository implements PublishedSiteRepository {
  readonly sites = new Map<string, PublishedSite>();
  readonly revisions = new Map<string, PublishedSiteRevision>();
  findBySubdomainCalls: string[] = [];
  findRevisionsForSiteCalls: string[] = [];

  publishNewSite(input: PublishNewSiteInput): Promise<PublishedSiteDetailRecord> {
    const site = makeSite({
      id: `site-${this.sites.size + 1}`,
      ownerUserId: input.ownerUserId,
      templateId: input.templateId,
      subdomain: input.subdomain,
      activeRevisionId: null,
    });
    const revision = makeRevision({
      id: `rev-${this.revisions.size + 1}`,
      siteId: site.id,
      templateId: input.templateId,
      ...input.payload,
    });
    site.activeRevisionId = revision.id;
    this.sites.set(site.id, site);
    this.revisions.set(revision.id, revision);
    return Promise.resolve({ site, activeRevision: revision });
  }

  republishSite(input: RepublishSiteInput): Promise<PublishedSiteDetailRecord> {
    const site = this.sites.get(input.siteId);
    if (site?.ownerUserId !== input.ownerUserId) {
      throw new NotFoundException(`Site "${input.siteId}" not found`);
    }
    const revision = makeRevision({
      id: `rev-${this.revisions.size + 1}`,
      siteId: site.id,
      templateId: input.templateId,
      ...input.payload,
    });
    site.activeRevisionId = revision.id;
    this.revisions.set(revision.id, revision);
    return Promise.resolve({ site, activeRevision: revision });
  }

  activateRevision(input: {
    ownerUserId: string;
    siteId: string;
    revisionId: string;
  }): Promise<PublishedSiteDetailRecord> {
    const site = this.sites.get(input.siteId);
    const revision = this.revisions.get(input.revisionId) ?? null;
    if (site?.ownerUserId !== input.ownerUserId) {
      throw new NotFoundException(`Site "${input.siteId}" not found`);
    }
    if (revision?.siteId !== site.id) {
      throw new NotFoundException(`Revision "${input.revisionId}" not found`);
    }
    site.activeRevisionId = revision.id;
    return Promise.resolve({ site, activeRevision: revision });
  }

  findForOwner(ownerUserId: string): Promise<PublishedSite[]> {
    const sites = [...this.sites.values()]
      .filter((site) => site.ownerUserId === ownerUserId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    return Promise.resolve(sites);
  }

  findOwnedSite(ownerUserId: string, siteId: string): Promise<PublishedSite | null> {
    const site = this.sites.get(siteId);
    return Promise.resolve(site?.ownerUserId === ownerUserId ? site : null);
  }

  findBySubdomain(subdomain: string): Promise<PublishedSite | null> {
    this.findBySubdomainCalls.push(subdomain);
    return Promise.resolve(
      [...this.sites.values()].find((site) => site.subdomain === subdomain) ?? null,
    );
  }

  findActiveBySubdomain(subdomain: string): Promise<PublishedSite | null> {
    return Promise.resolve(
      [...this.sites.values()].find(
        (site) => site.subdomain === subdomain && site.status === 'active',
      ) ?? null,
    );
  }

  findRevision(siteId: string, revisionId: string): Promise<PublishedSiteRevision | null> {
    const revision = this.revisions.get(revisionId);
    return Promise.resolve(revision?.siteId === siteId ? revision : null);
  }

  findRevisionsForSite(siteId: string): Promise<PublishedSiteRevision[]> {
    this.findRevisionsForSiteCalls.push(siteId);
    const revisions = [...this.revisions.values()]
      .filter((revision) => revision.siteId === siteId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return Promise.resolve(revisions);
  }
}

class FakeTemplateReadRepository implements TemplateReadRepository {
  publishSnapshot: TemplatePublishSnapshot | null = null;

  searchPublicTemplates(): Promise<TemplateSearchRecord[]> {
    return Promise.resolve([]);
  }

  findDiversitySummaries(): Promise<TemplateDiversitySummaryRecord[]> {
    return Promise.resolve([]);
  }

  findOwnedPublishSnapshot(): Promise<TemplatePublishSnapshot | null> {
    return Promise.resolve(this.publishSnapshot);
  }

  findAccessibleIdentity(): Promise<null> {
    return Promise.resolve(null);
  }
}

function makeSite(overrides: Partial<PublishedSite> = {}): PublishedSite {
  return Object.assign(new PublishedSite(), {
    id: 'site-1',
    ownerUserId: 'owner-1',
    templateId: 'template-1',
    subdomain: 'demo',
    status: 'active',
    activeRevisionId: 'rev-2',
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T01:00:00.000Z'),
    ...overrides,
  });
}

function makeRevision(overrides: Partial<PublishedSiteRevision> = {}): PublishedSiteRevision {
  return Object.assign(new PublishedSiteRevision(), {
    id: 'rev-1',
    siteId: 'site-1',
    templateId: 'template-1',
    schemaVersion: 1,
    runtimeVersion: 'hosted-runtime@1',
    status: 'active',
    errorMessage: null,
    layoutJson: {},
    themeJson: {},
    dataJson: {},
    manifestJson: {},
    createdAt: new Date('2026-05-29T00:10:00.000Z'),
    ...overrides,
  });
}

function makeTemplateSnapshot(
  overrides: Partial<TemplatePublishSnapshot> = {},
): TemplatePublishSnapshot {
  return {
    templateId: 'template-1',
    name: 'Template',
    description: '',
    accent: '#1677ff',
    category: 'general',
    cssVars: {},
    cssAnimations: null,
    componentTemplates: {},
    layoutDocument: createBlankDocument('template-1'),
    ...overrides,
  };
}

function createService() {
  const sites = new FakePublishedSiteRepository();
  const templates = new FakeTemplateReadRepository();
  return {
    service: new SitesService(sites, templates),
    sites,
    templates,
  };
}

describe('SitesService revision queries', () => {
  it('lists owned site revisions and marks the active revision', async () => {
    const { service, sites } = createService();
    sites.sites.set('site-1', makeSite());
    sites.revisions.set(
      'rev-2',
      makeRevision({ id: 'rev-2', createdAt: new Date('2026-05-29T00:20:00.000Z') }),
    );
    sites.revisions.set(
      'rev-1',
      makeRevision({ id: 'rev-1', createdAt: new Date('2026-05-29T00:10:00.000Z') }),
    );

    await expect(service.listRevisions('owner-1', 'site-1')).resolves.toEqual({
      data: [
        expect.objectContaining({ id: 'rev-2', active: true }),
        expect.objectContaining({ id: 'rev-1', active: false }),
      ],
      total: 2,
    });
    expect(sites.findRevisionsForSiteCalls).toEqual(['site-1']);
  });

  it('compares two revisions with path-level JSON diff totals', async () => {
    const { service, sites } = createService();
    sites.sites.set('site-1', makeSite());
    sites.revisions.set(
      'rev-1',
      makeRevision({
        id: 'rev-1',
        layoutJson: {
          title: 'Old',
          nav: ['home'],
          removed: true,
        },
        themeJson: { cssVars: { '--accent': '#111' } },
      }),
    );
    sites.revisions.set(
      'rev-2',
      makeRevision({
        id: 'rev-2',
        layoutJson: {
          title: 'New',
          nav: ['home', 'about'],
          added: true,
        },
        themeJson: { cssVars: { '--accent': '#111' } },
      }),
    );

    const result = await service.diffRevisions('owner-1', 'site-1', {
      fromRevisionId: 'rev-1',
      toRevisionId: 'rev-2',
    });

    expect(result.diff.layoutJson.changed).toContain('$.title');
    expect(result.diff.layoutJson.added).toEqual(['$.added', '$.nav[1]']);
    expect(result.diff.layoutJson.removed).toEqual(['$.removed']);
    expect(result.diff.themeJson.unchanged).toBe(1);
    expect(result.diff.totals).toEqual({
      added: 2,
      removed: 1,
      changed: 1,
      unchanged: 4,
    });
  });

  it('requires both revision ids for diff', async () => {
    const { service } = createService();

    await expect(
      service.diffRevisions('owner-1', 'site-1', { fromRevisionId: 'rev-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects revisions outside the owned site', async () => {
    const { service, sites } = createService();
    sites.sites.set('site-1', makeSite());
    sites.revisions.set('rev-1', makeRevision());
    sites.revisions.set('other-site-rev', makeRevision({ id: 'other-site-rev', siteId: 'other' }));

    await expect(
      service.diffRevisions('owner-1', 'site-1', {
        fromRevisionId: 'rev-1',
        toRevisionId: 'other-site-rev',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SitesService publishing', () => {
  it('rejects reserved public subdomains before checking availability', async () => {
    const { service, sites, templates } = createService();
    templates.publishSnapshot = makeTemplateSnapshot();

    let caught: unknown;
    try {
      await service.publish('owner-1', { templateId: 'template-1', subdomain: 'api' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'reserved_subdomain',
    });
    expect(sites.findBySubdomainCalls).toEqual([]);
  });

  it('publishes through the repository port after validating template ownership', async () => {
    const { service, sites, templates } = createService();
    templates.publishSnapshot = makeTemplateSnapshot();

    await expect(
      service.publish('owner-1', { templateId: 'template-1', subdomain: 'demo' }),
    ).resolves.toMatchObject({
      site: {
        ownerUserId: 'owner-1',
        templateId: 'template-1',
        subdomain: 'demo',
      },
      activeRevision: {
        templateId: 'template-1',
        runtimeVersion: 'hosted-runtime@1',
      },
    });

    expect(sites.findBySubdomainCalls).toEqual(['demo']);
    expect([...sites.sites.values()]).toHaveLength(1);
    expect([...sites.revisions.values()]).toHaveLength(1);
  });
});
