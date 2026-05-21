import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/types';
import { CURRENT_THEME_LAYOUT_SCHEMA_VERSION } from '@shared/theme-layout/migrations';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DatabaseFlushService } from '../database/database-flush.service';
import { Template } from '../templates/entities/template.entity';
import { prepareTemplateLayoutForPersistence } from '../templates/template-layout-validation';
import { PublishedSiteRevision } from './entities/published-site-revision.entity';
import { PublishedSite } from './entities/published-site.entity';

const HOSTED_RUNTIME_VERSION = 'hosted-runtime@1';
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export interface PublishSiteInput {
  templateId?: string;
  subdomain?: string;
}

export interface RollbackSiteInput {
  revisionId?: string;
}

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(PublishedSite)
    private readonly siteRepo: Repository<PublishedSite>,
    @InjectRepository(PublishedSiteRevision)
    private readonly revisionRepo: Repository<PublishedSiteRevision>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly databaseFlush: DatabaseFlushService,
  ) {}

  async publish(ownerUserId: string, input: PublishSiteInput) {
    const templateId = this.requireTemplateId(input.templateId);
    const template = await this.findOwnedTemplate(ownerUserId, templateId);
    const subdomain = this.resolveSubdomain(input.subdomain, template, ownerUserId);
    await this.assertSubdomainAvailable(subdomain);
    const payload = this.buildRevisionPayload(template, subdomain);

    let site = this.siteRepo.create({
      ownerUserId,
      templateId: template.templateId,
      subdomain,
      status: 'active',
      activeRevisionId: null,
    });
    site = await this.siteRepo.save(site);

    const revision = await this.revisionRepo.save(
      this.revisionRepo.create({
        siteId: site.id,
        templateId: template.templateId,
        status: 'active',
        errorMessage: null,
        ...payload,
      }),
    );

    site.activeRevisionId = revision.id;
    site = await this.siteRepo.save(site);
    await this.databaseFlush.flush('site publish');
    return this.toSiteDetail(site, revision);
  }

  async republish(ownerUserId: string, siteId: string) {
    const site = await this.findOwnedSite(ownerUserId, siteId);
    const template = await this.findOwnedTemplate(ownerUserId, site.templateId);
    const payload = this.buildRevisionPayload(template, site.subdomain);

    const revision = await this.revisionRepo.save(
      this.revisionRepo.create({
        siteId: site.id,
        templateId: template.templateId,
        status: 'active',
        errorMessage: null,
        ...payload,
      }),
    );

    site.activeRevisionId = revision.id;
    const savedSite = await this.siteRepo.save(site);
    await this.databaseFlush.flush('site republish');
    return this.toSiteDetail(savedSite, revision);
  }

  async findMine(ownerUserId: string) {
    const sites = await this.siteRepo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
    return { data: sites.map((site) => this.toSiteSummary(site)), total: sites.length };
  }

  async getOwned(ownerUserId: string, siteId: string) {
    const site = await this.findOwnedSite(ownerUserId, siteId);
    const revision = site.activeRevisionId
      ? await this.revisionRepo.findOne({ where: { id: site.activeRevisionId } })
      : null;
    return this.toSiteDetail(site, revision);
  }

  async rollback(
    ownerUserId: string,
    siteId: string,
    input: RollbackSiteInput,
  ) {
    const revisionId = input.revisionId?.trim();
    if (!revisionId) {
      throw new BadRequestException({
        message: 'revisionId is required',
        code: 'revision_id_required',
      });
    }

    const site = await this.findOwnedSite(ownerUserId, siteId);
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId, siteId: site.id },
    });
    if (!revision) {
      throw new NotFoundException(`Revision "${revisionId}" not found`);
    }

    site.activeRevisionId = revision.id;
    const savedSite = await this.siteRepo.save(site);
    await this.databaseFlush.flush('site rollback');
    return this.toSiteDetail(savedSite, revision);
  }

  async resolvePublic(subdomain: string) {
    const normalizedSubdomain = this.normalizeSubdomain(subdomain);
    const site = await this.siteRepo.findOne({
      where: { subdomain: normalizedSubdomain, status: 'active' },
    });
    if (!site?.activeRevisionId) {
      throw new NotFoundException(`Published site "${subdomain}" not found`);
    }

    const revision = await this.revisionRepo.findOne({
      where: { id: site.activeRevisionId, siteId: site.id },
    });
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
  ): Promise<Template> {
    const template = await this.templateRepo.findOne({
      where: { ownerUserId, templateId },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return template;
  }

  private async findOwnedSite(
    ownerUserId: string,
    siteId: string,
  ): Promise<PublishedSite> {
    const site = await this.siteRepo.findOne({ where: { id: siteId, ownerUserId } });
    if (!site) {
      throw new NotFoundException(`Site "${siteId}" not found`);
    }
    return site;
  }

  private buildRevisionPayload(template: Template, subdomain: string) {
    const layoutDocument = prepareTemplateLayoutForPersistence({
      layoutDocument: template.layoutDocument,
      componentTemplates: template.componentTemplates,
      cssVars: template.cssVars,
    });
    if (this.containsDisabledWidget(layoutDocument) ||
      this.containsDisabledWidget(template.componentTemplates)
    ) {
      throw new BadRequestException({
        message: 'core.widget is disabled for hosted runtime publishing',
        code: 'hosted_runtime_widget_disabled',
      });
    }

    const schemaVersion =
      layoutDocument.schemaVersion ??
      layoutDocument.version ??
      CURRENT_THEME_LAYOUT_SCHEMA_VERSION;
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
      layoutJson: layoutDocument as unknown as Record<string, unknown>,
      themeJson,
      dataJson: {},
      manifestJson,
    };
  }

  private containsDisabledWidget(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) => this.containsDisabledWidget(item));
    }
    if (!value || typeof value !== 'object') {
      return false;
    }
    const record = value as Record<string, unknown>;
    if (record.alias === 'core.widget') {
      return true;
    }
    return Object.values(record).some((item) => this.containsDisabledWidget(item));
  }

  private resolveSubdomain(
    requestedSubdomain: string | undefined,
    template: Template,
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
    return subdomain;
  }

  private async assertSubdomainAvailable(subdomain: string): Promise<void> {
    const existing = await this.siteRepo.findOne({ where: { subdomain } });
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

  private toSiteDetail(
    site: PublishedSite,
    activeRevision: PublishedSiteRevision | null,
  ) {
    return {
      site: this.toSiteSummary(site),
      activeRevision: this.toRevisionSummary(activeRevision),
    };
  }

  private toPublicConfig(
    site: PublishedSite,
    revision: PublishedSiteRevision,
  ) {
    const themeJson = revision.themeJson as {
      cssVars?: Record<string, string>;
      cssAnimations?: Record<string, string> | null;
      componentTemplates?: Record<string, unknown>;
    };
    return {
      site: this.toSiteSummary(site),
      revision: this.toRevisionSummary(revision),
      layoutDocument: revision.layoutJson as unknown as ThemeLayoutDocument,
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
}
