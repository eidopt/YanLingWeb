import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';

import {
  TEMPLATE_READ_REPOSITORY,
  type TemplatePublishSnapshot,
  type TemplateReadRepository,
} from '../templates/repositories/template-read.repository';
import { prepareTemplateLayoutForPersistence } from '../templates/template-layout-validation';
import { PublishedSite } from './entities/published-site.entity';
import { PublishedSiteRevision } from './entities/published-site-revision.entity';
import {
  PUBLISHED_SITE_REPOSITORY,
  type PublishedSiteRepository,
  type PublishedSiteRevisionPayload,
} from './repositories';

const HOSTED_RUNTIME_VERSION = 'hosted-runtime@1';
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'cdn',
  'dashboard',
  'docs',
  'ftp',
  'help',
  'localhost',
  'login',
  'mail',
  'static',
  'support',
  'www',
]);

export interface PublishSiteInput {
  templateId?: string;
  subdomain?: string;
}

export interface RollbackSiteInput {
  revisionId?: string;
}

export interface DiffSiteRevisionsInput {
  fromRevisionId?: string;
  toRevisionId?: string;
}

interface JsonSectionDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

@Injectable()
export class SitesService {
  constructor(
    @Inject(PUBLISHED_SITE_REPOSITORY)
    private readonly sites: PublishedSiteRepository,
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
  ) {}

  async publish(ownerUserId: string, input: PublishSiteInput) {
    const templateId = this.requireTemplateId(input.templateId);
    const template = await this.findOwnedTemplate(ownerUserId, templateId);
    const subdomain = this.resolveSubdomain(input.subdomain, template, ownerUserId);
    await this.assertSubdomainAvailable(subdomain);
    const payload = this.buildRevisionPayload(template, subdomain);

    const result = await this.sites.publishNewSite({
      ownerUserId,
      templateId: template.templateId,
      subdomain,
      payload,
    });
    return this.toSiteDetail(result.site, result.activeRevision);
  }

  async republish(ownerUserId: string, siteId: string) {
    const site = await this.findOwnedSite(ownerUserId, siteId);
    const template = await this.findOwnedTemplate(ownerUserId, site.templateId);
    const payload = this.buildRevisionPayload(template, site.subdomain);

    const result = await this.sites.republishSite({
      ownerUserId,
      siteId: site.id,
      templateId: template.templateId,
      payload,
    });
    return this.toSiteDetail(result.site, result.activeRevision);
  }

  async findMine(ownerUserId: string) {
    const sites = await this.sites.findForOwner(ownerUserId);
    return { data: sites.map((site) => this.toSiteSummary(site)), total: sites.length };
  }

  async getOwned(ownerUserId: string, siteId: string) {
    const site = await this.findOwnedSite(ownerUserId, siteId);
    const revision = site.activeRevisionId
      ? await this.sites.findRevision(site.id, site.activeRevisionId)
      : null;
    return this.toSiteDetail(site, revision);
  }

  async listRevisions(ownerUserId: string, siteId: string) {
    const site = await this.findOwnedSite(ownerUserId, siteId);
    const revisions = await this.sites.findRevisionsForSite(site.id);

    return {
      data: revisions.map((revision) => ({
        ...this.toRevisionSummary(revision),
        active: revision.id === site.activeRevisionId,
      })),
      total: revisions.length,
    };
  }

  async diffRevisions(ownerUserId: string, siteId: string, input: DiffSiteRevisionsInput) {
    const fromRevisionId = input.fromRevisionId?.trim();
    const toRevisionId = input.toRevisionId?.trim();

    if (!fromRevisionId || !toRevisionId) {
      throw new BadRequestException({
        message: 'from and to revision ids are required',
        code: 'revision_diff_ids_required',
      });
    }

    const site = await this.findOwnedSite(ownerUserId, siteId);
    const [fromRevision, toRevision] = await Promise.all([
      this.findSiteRevision(site.id, fromRevisionId),
      this.findSiteRevision(site.id, toRevisionId),
    ]);

    return {
      site: this.toSiteSummary(site),
      fromRevision: this.toRevisionSummary(fromRevision),
      toRevision: this.toRevisionSummary(toRevision),
      diff: this.diffRevisionPayloads(fromRevision, toRevision),
    };
  }

  async rollback(ownerUserId: string, siteId: string, input: RollbackSiteInput) {
    const revisionId = input.revisionId?.trim();
    if (!revisionId) {
      throw new BadRequestException({
        message: 'revisionId is required',
        code: 'revision_id_required',
      });
    }

    const site = await this.findOwnedSite(ownerUserId, siteId);
    const revision = await this.findSiteRevision(site.id, revisionId);
    const result = await this.sites.activateRevision({
      ownerUserId,
      siteId: site.id,
      revisionId: revision.id,
    });
    return this.toSiteDetail(result.site, result.activeRevision);
  }

  async resolvePublic(subdomain: string) {
    const normalizedSubdomain = this.normalizeSubdomain(subdomain);
    const site = await this.sites.findActiveBySubdomain(normalizedSubdomain);
    if (!site?.activeRevisionId) {
      throw new NotFoundException(`Published site "${subdomain}" not found`);
    }

    const revision = await this.sites.findRevision(site.id, site.activeRevisionId);
    if (!revision) {
      throw new NotFoundException(`Active revision for "${subdomain}" not found`);
    }

    return this.toPublicConfig(site, revision);
  }

  private requireTemplateId(templateId: string | undefined): string {
    const value = templateId?.trim();
    if (!value) {
      throw new BadRequestException({
        message: 'templateId is required',
        code: 'template_id_required',
      });
    }
    return value;
  }

  private async findOwnedTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplatePublishSnapshot> {
    const template = await this.templates.findOwnedPublishSnapshot(ownerUserId, templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return template;
  }

  private async findOwnedSite(ownerUserId: string, siteId: string): Promise<PublishedSite> {
    const site = await this.sites.findOwnedSite(ownerUserId, siteId);
    if (!site) {
      throw new NotFoundException(`Site "${siteId}" not found`);
    }
    return site;
  }

  private async findSiteRevision(
    siteId: string,
    revisionId: string,
  ): Promise<PublishedSiteRevision> {
    const revision = await this.sites.findRevision(siteId, revisionId);
    if (!revision) {
      throw new NotFoundException(`Revision "${revisionId}" not found`);
    }
    return revision;
  }

  private buildRevisionPayload(
    template: TemplatePublishSnapshot,
    subdomain: string,
  ): PublishedSiteRevisionPayload {
    const layoutDocument = prepareTemplateLayoutForPersistence({
      layoutDocument: template.layoutDocument,
      componentTemplates: template.componentTemplates,
      cssVars: template.cssVars,
    });

    const schemaVersion = layoutDocument.schemaVersion ?? layoutDocument.version;
    const publishedAt = new Date().toISOString();
    const themeJson = {
      id: template.templateId,
      name: template.name,
      accent: template.accent,
      category: template.category,
      cssVars: template.cssVars,
      cssAnimations: template.cssAnimations,
      componentTemplates: template.componentTemplates,
    };
    const manifestJson = {
      name: template.name,
      description: template.description,
      templateId: template.templateId,
      subdomain,
      publishedAt,
    };

    return {
      schemaVersion,
      runtimeVersion: HOSTED_RUNTIME_VERSION,
      layoutJson: themeLayoutDocumentToRecord(layoutDocument),
      themeJson,
      dataJson: {},
      manifestJson,
    };
  }

  private resolveSubdomain(
    requestedSubdomain: string | undefined,
    template: TemplatePublishSnapshot,
    ownerUserId: string,
  ): string {
    if (requestedSubdomain?.trim()) {
      return this.normalizeSubdomain(requestedSubdomain);
    }
    return this.normalizeSubdomain(
      `${template.templateId}-${ownerUserId.replace(/-/g, '').slice(0, 8)}-${Date.now().toString(36)}`,
    );
  }

  private normalizeSubdomain(input: string): string {
    const subdomain = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 63)
      .replace(/-+$/g, '');
    if (!SUBDOMAIN_PATTERN.test(subdomain)) {
      throw new BadRequestException({
        message: 'subdomain must be 3-63 characters of lowercase letters, numbers, or hyphens',
        code: 'invalid_subdomain',
      });
    }
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      throw new BadRequestException({
        message: `Subdomain "${subdomain}" is reserved`,
        code: 'reserved_subdomain',
      });
    }
    return subdomain;
  }

  private async assertSubdomainAvailable(subdomain: string): Promise<void> {
    const existing = await this.sites.findBySubdomain(subdomain);
    if (existing) {
      throw new ConflictException({
        message: `Subdomain "${subdomain}" is already published`,
        code: 'subdomain_conflict',
      });
    }
  }

  private toSiteSummary(site: PublishedSite) {
    return {
      id: site.id,
      ownerUserId: site.ownerUserId,
      templateId: site.templateId,
      subdomain: site.subdomain,
      status: site.status,
      activeRevisionId: site.activeRevisionId,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  private toRevisionSummary(revision: PublishedSiteRevision | null) {
    if (!revision) {
      return null;
    }
    return {
      id: revision.id,
      siteId: revision.siteId,
      templateId: revision.templateId,
      schemaVersion: revision.schemaVersion,
      runtimeVersion: revision.runtimeVersion,
      status: revision.status,
      errorMessage: revision.errorMessage,
      createdAt: revision.createdAt.toISOString(),
    };
  }

  private toSiteDetail(site: PublishedSite, activeRevision: PublishedSiteRevision | null) {
    return {
      site: this.toSiteSummary(site),
      activeRevision: this.toRevisionSummary(activeRevision),
    };
  }

  private toPublicConfig(site: PublishedSite, revision: PublishedSiteRevision) {
    const themeJson = revision.themeJson as {
      cssVars?: Record<string, string>;
      cssAnimations?: Record<string, string> | null;
      componentTemplates?: Record<string, unknown>;
    };
    return {
      site: this.toSiteSummary(site),
      revision: this.toRevisionSummary(revision),
      layoutDocument: migrateThemeLayoutDocument(revision.layoutJson),
      runtime: {
        id: site.templateId,
        cssVars: themeJson.cssVars ?? {},
        componentTemplates: themeJson.componentTemplates ?? {},
        ...(themeJson.cssAnimations && { cssAnimations: themeJson.cssAnimations }),
      },
      data: revision.dataJson,
      manifest: revision.manifestJson,
    };
  }

  private diffRevisionPayloads(
    fromRevision: PublishedSiteRevision,
    toRevision: PublishedSiteRevision,
  ) {
    const layoutJson = this.diffJsonSection(fromRevision.layoutJson, toRevision.layoutJson);
    const themeJson = this.diffJsonSection(fromRevision.themeJson, toRevision.themeJson);
    const dataJson = this.diffJsonSection(fromRevision.dataJson, toRevision.dataJson);
    const manifestJson = this.diffJsonSection(fromRevision.manifestJson, toRevision.manifestJson);

    return {
      layoutJson,
      themeJson,
      dataJson,
      manifestJson,
      totals: this.sumDiffTotals([layoutJson, themeJson, dataJson, manifestJson]),
    };
  }

  private sumDiffTotals(sections: JsonSectionDiff[]) {
    return sections.reduce(
      (totals, section) => ({
        added: totals.added + section.added.length,
        removed: totals.removed + section.removed.length,
        changed: totals.changed + section.changed.length,
        unchanged: totals.unchanged + section.unchanged,
      }),
      { added: 0, removed: 0, changed: 0, unchanged: 0 },
    );
  }

  private diffJsonSection(fromValue: unknown, toValue: unknown): JsonSectionDiff {
    const fromLeaves = this.flattenJsonLeaves(fromValue);
    const toLeaves = this.flattenJsonLeaves(toValue);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    let unchanged = 0;

    for (const [path, fromLeaf] of fromLeaves) {
      if (!toLeaves.has(path)) {
        removed.push(path);
        continue;
      }

      if (toLeaves.get(path) === fromLeaf) {
        unchanged += 1;
      } else {
        changed.push(path);
      }
    }

    for (const path of toLeaves.keys()) {
      if (!fromLeaves.has(path)) {
        added.push(path);
      }
    }

    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
      unchanged,
    };
  }

  private flattenJsonLeaves(value: unknown): Map<string, string> {
    const leaves = new Map<string, string>();
    this.collectJsonLeaves(value, '$', leaves);
    return leaves;
  }

  private collectJsonLeaves(value: unknown, path: string, leaves: Map<string, string>): void {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        leaves.set(path, '[]');
        return;
      }

      value.forEach((item, index) => {
        this.collectJsonLeaves(item, `${path}[${index}]`, leaves);
      });
      return;
    }

    if (this.isPlainRecord(value)) {
      const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
      if (entries.length === 0) {
        leaves.set(path, '{}');
        return;
      }

      entries.forEach(([key, childValue]) => {
        this.collectJsonLeaves(childValue, this.joinJsonPath(path, key), leaves);
      });
      return;
    }

    leaves.set(path, JSON.stringify(value));
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private joinJsonPath(basePath: string, key: string): string {
    const segment = /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    return `${basePath}${segment}`;
  }
}
