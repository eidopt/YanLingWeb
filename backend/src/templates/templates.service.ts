import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildTemplateProfile } from '@shared/agent/template/buildTemplateProfile';
import { applyTemplateProfileOverride } from '@shared/agent/template/templateProfileOverride';
import type { TemplateProfile } from '@shared/agent/template/templateProfile';
import { validateTemplateProfile } from '@shared/agent/template/validateTemplateProfile';
import type { ThemeLayoutDocument } from '@shared/agent/types';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { IsNull, Repository } from 'typeorm';

import { ConfigService } from '../config/config.service';
import { deriveTags } from '../shared/derive-tags';
import {
  isCssVarRecord,
  isNonEmptyString,
  isRecord,
  isStringRecord,
} from '../shared/type-guards';
import { User } from '../users/entities/user.entity';
import { TemplateAgentPermissions } from './entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from './entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from './entities/template-evaluation-spec.entity';
import { Template } from './entities/template.entity';
import { TemplateProfileGenerated } from './entities/template-profile-generated.entity';
import { TemplateProfileOverrideEntity } from './entities/template-profile-override.entity';
import { TEMPLATE_SEED_DATA, type TemplateSeedException } from './seed/template-seed.data';
import { TemplateCategoryRegistryService } from './template-category-registry.service';
import { prepareTemplateLayoutForPersistence } from './template-layout-validation';

interface TemplateListOptions {
  category?: string;
  functionalCategory?: string;
  search?: string;
}

const PLATFORM_CATEGORIES = new Set([
  'mini-program',
  'mobile-app',
  'tablet-app',
  'web',
]);

const FUNCTIONAL_CATEGORIES = new Set([
  'commerce',
  'social',
  'content',
  'service',
  'education',
  'health',
  'finance',
  'marketing',
  'utility',
  'dashboard',
  'profile',
]);

export interface UpdateOwnedTemplateInput {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits?: string[];
  tags?: string[];
  layoutDocument?: Record<string, unknown>;
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
}

export interface TemplateAgentConfigDto {
  profileGenerated: Record<string, unknown> | null;
  profileOverride: Record<string, unknown> | null;
  effectiveProfile: Record<string, unknown> | null;
  assets: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
}

export type TemplateWithAgentConfig = Template & {
  agentConfig?: TemplateAgentConfigDto;
};

interface TemplateAgentConfigInput {
  profileGenerated?: Record<string, unknown>;
  profileOverride?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
}

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(Template)
    private readonly repo: Repository<Template>,
    @InjectRepository(TemplateProfileGenerated)
    private readonly profileGeneratedRepo: Repository<TemplateProfileGenerated>,
    @InjectRepository(TemplateProfileOverrideEntity)
    private readonly profileOverrideRepo: Repository<TemplateProfileOverrideEntity>,
    @InjectRepository(TemplateAssetManifest)
    private readonly assetManifestRepo: Repository<TemplateAssetManifest>,
    @InjectRepository(TemplateAgentPermissions)
    private readonly agentPermissionsRepo: Repository<TemplateAgentPermissions>,
    @InjectRepository(TemplateEvaluationSpec)
    private readonly evaluationSpecRepo: Repository<TemplateEvaluationSpec>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly categoryRegistry: TemplateCategoryRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(
      TEMPLATE_SEED_DATA.map((data) =>
        this.categoryRegistry.ensureTemplateCategories(data)),
    );
    await this.repo.upsert(
      TEMPLATE_SEED_DATA.map((data) =>
        this.repo.create({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
          tags: deriveTags(data),
          ...data,
          layoutDocument: withThemeLayoutStyleManifest(
            data.layoutDocument,
            data.cssVars,
          ),
        }),
      ) as never,
      { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
    );
    await Promise.all(TEMPLATE_SEED_DATA.map((data) => this.upsertTemplateAgentConfig(
      data.templateId,
      {
        profileGenerated: buildTemplateProfile(
          withThemeLayoutStyleManifest(
            data.layoutDocument,
            data.cssVars,
          ) as unknown as ThemeLayoutDocument,
        ) as unknown as Record<string, unknown>,
      },
    )));
    const importedTemplateFiles = await this.importTemplateJsonDirectory();
    await this.repairLegacyOwnedCopies();
    await this.repairTemplateCategoryKeys();
    await this.ensureGeneratedProfilesForExistingTemplates();
    await this.deleteImportedTemplateJsonFiles(importedTemplateFiles);
  }

  async findMarketplace(
    options: TemplateListOptions = {},
  ): Promise<{ data: Template[]; total: number; }> {
    const qb = this.repo.createQueryBuilder('t')
      .where('t.ownerUserId IS NULL')
      .andWhere('t.isPublic = :isPublic', { isPublic: true });

    if (options.category) {
      qb.andWhere('t.category = :category', { category: options.category });
    }
    if (options.functionalCategory) {
      qb.andWhere('t.primaryFunctionalCategory = :fc', { fc: options.functionalCategory });
    }
    if (options.search) {
      const q = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.name) LIKE :q OR LOWER(t.tagline) LIKE :q OR LOWER(t.description) LIKE :q)',
        { q },
      );
    }

    qb.orderBy('t.createdAt', 'ASC');
    const [data, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(data.map((template) =>
        this.categoryRegistry.decorateTemplate(template))),
      total,
    };
  }

  async findOwned(
    ownerUserId: string,
    options: TemplateListOptions = {},
  ): Promise<{ data: Template[]; total: number; }> {
    const qb = this.repo.createQueryBuilder('t')
      .where('t.ownerUserId = :ownerUserId', { ownerUserId });

    if (options.category) {
      qb.andWhere('t.category = :category', { category: options.category });
    }
    if (options.functionalCategory) {
      qb.andWhere('t.primaryFunctionalCategory = :fc', { fc: options.functionalCategory });
    }
    if (options.search) {
      const q = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.name) LIKE :q OR LOWER(t.tagline) LIKE :q OR LOWER(t.description) LIKE :q)',
        { q },
      );
    }

    qb.orderBy('t.updatedAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(data.map((template) =>
        this.categoryRegistry.decorateTemplate(template))),
      total,
    };
  }

  async findRecentOwned(
    ownerUserId: string,
    limit = 6,
  ): Promise<Template[]> {
    const templates = await this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    return Promise.all(templates.map((template) =>
      this.categoryRegistry.decorateTemplate(template)));
  }

  async findByTemplateId(templateId: string): Promise<TemplateWithAgentConfig> {
    const template = await this.repo.findOne({
      where: { templateId, ownerUserId: IsNull(), isPublic: true },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return this.attachAgentConfig(template);
  }

  async findOwnedByTemplateId(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateWithAgentConfig> {
    const template = await this.repo.findOne({
      where: { templateId, ownerUserId },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return this.attachAgentConfig(template);
  }

  async duplicateForUser(
    ownerUserId: string,
    sourceTemplateId: string,
  ): Promise<Template> {
    const source = await this.findByTemplateId(sourceTemplateId);
    const copyTemplateId = this.createUserTemplateId(source.templateId, ownerUserId);
    const copy = this.repo.create({
      templateId: copyTemplateId,
      ownerUserId,
      sourceTemplateId: source.templateId,
      isPublic: false,
      name: `${source.name} 副本`,
      tagline: source.tagline,
      description: source.description,
      accent: source.accent,
      category: source.category,
      primaryFunctionalCategory: source.functionalCategories?.[0] ?? null,
      platformCategories: [...(source.platformCategories ?? [])],
      functionalCategories: [...(source.functionalCategories ?? [])],
      traits: [...source.traits],
      tags: deriveTags(source),
      cssVars: { ...source.cssVars },
      cssAnimations: source.cssAnimations ? { ...source.cssAnimations } : null,
      componentTemplates: structuredClone(source.componentTemplates),
      layoutDocument: structuredClone(source.layoutDocument),
    });

    const saved = await this.repo.save(copy);
    await this.copyTemplateAgentConfig(source.templateId, saved.templateId);
    return this.attachAgentConfig(saved);
  }

  async updateOwned(
    ownerUserId: string,
    templateId: string,
    input: UpdateOwnedTemplateInput,
  ): Promise<Template> {
    const template = await this.findOwnedByTemplateId(ownerUserId, templateId);
    const shouldPrepareLayout =
      input.layoutDocument !== undefined ||
      input.componentTemplates !== undefined ||
      input.cssVars !== undefined;
    const preparedLayoutDocument = shouldPrepareLayout
      ? prepareTemplateLayoutForPersistence({
        layoutDocument: input.layoutDocument ?? template.layoutDocument,
        componentTemplates: input.componentTemplates ?? template.componentTemplates,
        cssVars: input.cssVars ?? template.cssVars,
      })
      : null;

    if (input.name !== undefined) { template.name = input.name; }
    if (input.tagline !== undefined) { template.tagline = input.tagline; }
    if (input.description !== undefined) {
      template.description = input.description;
    }
    if (input.category !== undefined) {
      this.assertTemplateCategoryKey(input.category, 'category');
      template.category = input.category;
    }
    if (input.platformCategories !== undefined) {
      input.platformCategories.forEach((category) =>
        this.assertTemplateCategoryKey(category, 'platformCategories'));
      template.platformCategories = [...input.platformCategories];
    }
    if (input.functionalCategories !== undefined) {
      input.functionalCategories.forEach((category) =>
        this.assertTemplateCategoryKey(category, 'functionalCategories'));
      template.functionalCategories = [...input.functionalCategories];
      template.primaryFunctionalCategory = input.functionalCategories[0] ?? null;
    }
    if (input.traits !== undefined) { template.traits = input.traits; }
    if (input.tags !== undefined) { template.tags = input.tags; }
    if (input.cssVars !== undefined) { template.cssVars = input.cssVars; }
    if (input.cssAnimations !== undefined) {
      template.cssAnimations = input.cssAnimations;
    }
    if (input.componentTemplates !== undefined) {
      template.componentTemplates = input.componentTemplates;
    }
    if (preparedLayoutDocument) {
      template.layoutDocument = preparedLayoutDocument as unknown as Record<string, unknown>;
    }

    if (!template.tags.length) {
      template.tags = deriveTags(template);
    }

    await this.categoryRegistry.ensureTemplateCategories(template);
    const saved = await this.repo.save(template);
    if (shouldPrepareLayout) {
      await this.saveGeneratedProfileForTemplate(saved, true);
    }
    return this.attachAgentConfig(saved);
  }

  async getTemplateAgentConfig(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateAgentConfigDto> {
    const template = await this.repo.findOne({
      where: [
        { templateId, ownerUserId },
        { templateId, ownerUserId: IsNull(), isPublic: true },
      ],
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return this.loadTemplateAgentConfig(template);
  }

  private async attachAgentConfig<T extends Template>(
    template: T,
  ): Promise<T & { agentConfig: TemplateAgentConfigDto }> {
    const decorated = await this.categoryRegistry.decorateTemplate(template);
    return Object.assign(decorated, {
      agentConfig: await this.loadTemplateAgentConfig(template),
    });
  }

  private async loadTemplateAgentConfig(
    template: Template,
  ): Promise<TemplateAgentConfigDto> {
    const fallbackTemplateId = template.sourceTemplateId ?? undefined;
    const [
      profileGenerated,
      profileOverride,
      assets,
      permissions,
      evaluation,
    ] = await Promise.all([
      this.findConfigByTemplateId(
        this.profileGeneratedRepo,
        template.templateId,
        fallbackTemplateId,
      ),
      this.findConfigByTemplateId(
        this.profileOverrideRepo,
        template.templateId,
        fallbackTemplateId,
      ),
      this.findConfigByTemplateId(
        this.assetManifestRepo,
        template.templateId,
        fallbackTemplateId,
      ),
      this.findConfigByTemplateId(
        this.agentPermissionsRepo,
        template.templateId,
        fallbackTemplateId,
      ),
      this.findConfigByTemplateId(
        this.evaluationSpecRepo,
        template.templateId,
        fallbackTemplateId,
      ),
    ]);
    const generatedProfile = profileGenerated?.profile
      ?? buildTemplateProfile(template.layoutDocument as unknown as ThemeLayoutDocument) as unknown as Record<string, unknown>;
    const profileOverrideRecord = profileOverride?.override ?? null;
    let effectiveProfile = generatedProfile;

    if (profileOverrideRecord) {
      try {
        effectiveProfile = applyTemplateProfileOverride(
          generatedProfile as unknown as TemplateProfile,
          profileOverrideRecord as never,
        ) as unknown as Record<string, unknown>;
      } catch {
        effectiveProfile = generatedProfile;
      }
    }

    return {
      profileGenerated: generatedProfile,
      profileOverride: profileOverrideRecord,
      effectiveProfile,
      assets: assets?.manifest ?? null,
      permissions: permissions?.permissions ?? null,
      evaluation: evaluation?.evaluation ?? null,
    };
  }

  private async findConfigByTemplateId<T extends { templateId: string }>(
    repo: Repository<T>,
    templateId: string,
    fallbackTemplateId?: string,
  ): Promise<T | null> {
    const current = await repo.findOne({ where: { templateId } as never });
    if (current || !fallbackTemplateId) {
      return current;
    }
    return repo.findOne({ where: { templateId: fallbackTemplateId } as never });
  }

  private async saveGeneratedProfileForTemplate(
    template: Template,
    overwrite: boolean,
  ): Promise<void> {
    if (!overwrite) {
      const exists = await this.profileGeneratedRepo.exists({
        where: { templateId: template.templateId },
      });
      if (exists) {
        return;
      }
    }

    const profile = buildTemplateProfile(
      template.layoutDocument as unknown as ThemeLayoutDocument,
    ) as unknown as Record<string, unknown>;
    await this.upsertTemplateAgentConfig(template.templateId, { profileGenerated: profile });
  }

  private async ensureGeneratedProfilesForExistingTemplates(): Promise<void> {
    const templates = await this.repo.find();
    const existing = new Set(
      (await this.profileGeneratedRepo.find({ select: { templateId: true } }))
        .map((profile) => profile.templateId),
    );

    for (const template of templates) {
      if (existing.has(template.templateId)) {
        continue;
      }
      await this.saveGeneratedProfileForTemplate(template, false);
    }
  }

  private async copyTemplateAgentConfig(
    sourceTemplateId: string,
    targetTemplateId: string,
  ): Promise<void> {
    const [
      profileGenerated,
      profileOverride,
      assets,
      permissions,
      evaluation,
    ] = await Promise.all([
      this.profileGeneratedRepo.findOne({ where: { templateId: sourceTemplateId } }),
      this.profileOverrideRepo.findOne({ where: { templateId: sourceTemplateId } }),
      this.assetManifestRepo.findOne({ where: { templateId: sourceTemplateId } }),
      this.agentPermissionsRepo.findOne({ where: { templateId: sourceTemplateId } }),
      this.evaluationSpecRepo.findOne({ where: { templateId: sourceTemplateId } }),
    ]);

    await this.upsertTemplateAgentConfig(targetTemplateId, {
      ...(profileGenerated && {
        profileGenerated: this.withTemplateId(profileGenerated.profile, targetTemplateId),
      }),
      ...(profileOverride && {
        profileOverride: this.withTemplateId(profileOverride.override, targetTemplateId),
      }),
      ...(assets && { assets: this.withTemplateId(assets.manifest, targetTemplateId) }),
      ...(permissions && {
        permissions: this.withTemplateId(permissions.permissions, targetTemplateId),
      }),
      ...(evaluation && {
        evaluation: this.withTemplateId(evaluation.evaluation, targetTemplateId),
      }),
    });
  }

  private withTemplateId(
    value: Record<string, unknown>,
    templateId: string,
  ): Record<string, unknown> {
    return { ...structuredClone(value), templateId };
  }

  private async upsertTemplateAgentConfig(
    templateId: string,
    input: TemplateAgentConfigInput,
  ): Promise<void> {
    const operations: Promise<unknown>[] = [];
    if (input.profileGenerated) {
      const profileVersion = typeof input.profileGenerated.profileVersion === 'string'
        ? input.profileGenerated.profileVersion
        : '1.0.0';
      const templateVersion = typeof input.profileGenerated.templateVersion === 'string'
        ? input.profileGenerated.templateVersion
        : '1.0.0';
      operations.push(this.profileGeneratedRepo.upsert(
        this.profileGeneratedRepo.create({
          templateId,
          templateVersion,
          profileVersion,
          profile: this.withTemplateId(input.profileGenerated, templateId),
        }) as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      ));
    }
    if (input.profileOverride) {
      const profileVersion = typeof input.profileOverride.profileVersion === 'string'
        ? input.profileOverride.profileVersion
        : '1.0.0';
      operations.push(this.profileOverrideRepo.upsert(
        this.profileOverrideRepo.create({
          templateId,
          profileVersion,
          override: this.withTemplateId(input.profileOverride, templateId),
        }) as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      ));
    }
    if (input.assets) {
      operations.push(this.assetManifestRepo.upsert(
        this.assetManifestRepo.create({
          templateId,
          manifest: this.withTemplateId(input.assets, templateId),
        }) as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      ));
    }
    if (input.permissions) {
      operations.push(this.agentPermissionsRepo.upsert(
        this.agentPermissionsRepo.create({
          templateId,
          permissions: this.withTemplateId(input.permissions, templateId),
        }) as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      ));
    }
    if (input.evaluation) {
      operations.push(this.evaluationSpecRepo.upsert(
        this.evaluationSpecRepo.create({
          templateId,
          evaluation: this.withTemplateId(input.evaluation, templateId),
        }) as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      ));
    }

    await Promise.all(operations);
  }

  private createUserTemplateId(sourceTemplateId: string, ownerUserId: string) {
    const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
    return `${sourceTemplateId}-copy-${ownerPrefix}-${Date.now().toString(36)}`;
  }

  private async repairLegacyOwnedCopies(): Promise<void> {
    const users = await this.userRepo.find();
    if (!users.length) {
      return;
    }

    const ownerPrefixToUserId = new Map<string, string | null>();
    for (const user of users) {
      const prefix = user.id.replace(/-/g, '').slice(0, 8);
      ownerPrefixToUserId.set(
        prefix,
        ownerPrefixToUserId.has(prefix) ? null : user.id,
      );
    }

    const publicSourceIds = new Set(
      (await this.repo.find({
        where: { ownerUserId: IsNull(), isPublic: true },
        select: { templateId: true },
      })).map((template) => template.templateId),
    );

    const legacyCopies = await this.repo.find({
      where: { ownerUserId: IsNull() },
    });
    let repaired = false;

    for (const template of legacyCopies) {
      const match = /^(?<source>.+)-copy-(?<ownerPrefix>[a-f0-9]{8})-[a-z0-9]+$/i
        .exec(template.templateId);
      const sourceTemplateId = match?.groups?.source;
      const ownerPrefix = match?.groups?.ownerPrefix;
      if (!sourceTemplateId || !ownerPrefix) {
        continue;
      }

      const ownerUserId = ownerPrefixToUserId.get(ownerPrefix.toLowerCase());
      if (!ownerUserId || !publicSourceIds.has(sourceTemplateId)) {
        continue;
      }

      template.ownerUserId = ownerUserId;
      template.sourceTemplateId = sourceTemplateId;
      template.isPublic = false;
      if (!template.tags.length) {
        template.tags = deriveTags(template);
      }
      await this.repo.save(template);
      repaired = true;
    }
  }

  private async repairTemplateCategoryKeys(): Promise<void> {
    const templates = await this.repo.find();
    for (const template of templates) {
      let changed = false;
      const normalizedCategory = this.resolveTemplateCategoryKey(
        template.category,
        template.functionalCategories,
      );

      if (normalizedCategory && normalizedCategory !== template.category) {
        template.category = normalizedCategory;
        changed = true;
      }

      const primaryFunctionalCategory = template.functionalCategories?.[0] ?? null;
      if (template.primaryFunctionalCategory !== primaryFunctionalCategory) {
        template.primaryFunctionalCategory = primaryFunctionalCategory;
        changed = true;
      }

      await this.categoryRegistry.ensureTemplateCategories(template);
      if (changed) {
        await this.repo.save(template);
      }
    }
  }

  private resolveTemplateCategoryKey(
    category: string | null | undefined,
    functionalCategories: readonly string[] | null | undefined,
  ): string {
    const current = typeof category === 'string' ? category.trim() : '';
    const primaryFunctionalCategory = functionalCategories?.[0]?.trim() ?? '';
    if (
      hasCjkText(current) &&
      primaryFunctionalCategory &&
      !hasCjkText(primaryFunctionalCategory)
    ) {
      return primaryFunctionalCategory;
    }
    return current;
  }

  private assertTemplateCategoryKey(value: string, fieldName: string): void {
    if (!isTemplateCategoryKey(value)) {
      throw new BadRequestException(`${fieldName} must be an English slug key.`);
    }
  }

  private async importTemplateJsonDirectory(): Promise<string[]> {
    const importConfig = this.config.templates.jsonImport;
    if (!importConfig.enabled) {
      return [];
    }

    const directory = await this.resolveTemplateJsonDirectory(importConfig.directory);
    if (!directory) {
      return [];
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
      .sort();

    const importedFiles: string[] = [];
    for (const filePath of jsonFiles) {
      const imported = await this.importTemplateJsonFile(filePath);
      if (imported) {
        importedFiles.push(filePath);
      }
    }

    return importedFiles;
  }

  private async resolveTemplateJsonDirectory(
    configuredDirectory: string | undefined,
  ): Promise<string | null> {
    const candidates = configuredDirectory
      ? [configuredDirectory]
      : [
        path.resolve(process.cwd(), 'templates_json'),
        path.resolve(process.cwd(), '..', 'templates_json'),
      ];

    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      try {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          return resolved;
        }
      } catch {
        // Missing directory means there are no pending template JSON imports.
      }
    }

    return null;
  }

  private async importTemplateJsonFile(filePath: string): Promise<boolean> {
    const issues: string[] = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      issues.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      await this.writeTemplateValidationLog(filePath, issues);
      return false;
    }

    const data = this.parseTemplateJsonSeed(parsed, issues);
    if (!data) {
      await this.writeTemplateValidationLog(filePath, issues);
      return false;
    }
    const agentConfig = await this.readTemplateAgentConfigForImport(
      filePath,
      data.templateId,
      parsed,
      issues,
    );
    if (issues.length) {
      await this.writeTemplateValidationLog(filePath, issues);
      return false;
    }

    try {
      await this.categoryRegistry.ensureTemplateCategories(
        {
          ...data,
          ...this.extractTemplateCategoryLabels(parsed),
        },
        { requireLabelsForUnknown: true },
      );
      const layoutDocument = prepareTemplateLayoutForPersistence({
        layoutDocument: data.layoutDocument,
        componentTemplates: data.componentTemplates,
        cssVars: data.cssVars,
        requireGeneratedTemplateQuality: true,
      }) as unknown as Record<string, unknown>;
      const generatedProfile = agentConfig.profileGenerated
        ?? buildTemplateProfile(layoutDocument as unknown as ThemeLayoutDocument) as unknown as Record<string, unknown>;
      const effectiveProfile = agentConfig.profileOverride
        ? applyTemplateProfileOverride(
          generatedProfile as unknown as TemplateProfile,
          agentConfig.profileOverride as never,
        )
        : generatedProfile;
      const profileValidation = validateTemplateProfile(
        layoutDocument as unknown as ThemeLayoutDocument,
        effectiveProfile as unknown as TemplateProfile,
      );
      if (!profileValidation.valid) {
        issues.push(
          ...profileValidation.errors.map((error) =>
            `template profile ${error.path}: ${error.message}`),
        );
        await this.writeTemplateValidationLog(filePath, issues);
        return false;
      }
      await this.repo.upsert(
        [this.repo.create({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
          tags: deriveTags(data),
          ...data,
          layoutDocument,
        })] as never,
        { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
      );
      await this.upsertTemplateAgentConfig(data.templateId, {
        ...agentConfig,
        profileGenerated: generatedProfile,
      });
      await this.removeTemplateValidationLog(filePath);
      return true;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      await this.writeTemplateValidationLog(filePath, issues);
      return false;
    }
  }

  private async readTemplateAgentConfigForImport(
    filePath: string,
    templateId: string,
    parsed: unknown,
    issues: string[],
  ): Promise<TemplateAgentConfigInput> {
    const parsedRecord = isRecord(parsed) ? parsed : {};
    const embedded: TemplateAgentConfigInput = {
      ...(isRecord(parsedRecord.templateProfile) && {
        profileGenerated: parsedRecord.templateProfile,
      }),
      ...(isRecord(parsedRecord.profileGenerated) && {
        profileGenerated: parsedRecord.profileGenerated,
      }),
      ...(isRecord(parsedRecord.profileOverride) && {
        profileOverride: parsedRecord.profileOverride,
      }),
      ...(isRecord(parsedRecord.assets) && { assets: parsedRecord.assets }),
      ...(isRecord(parsedRecord.permissions) && {
        permissions: parsedRecord.permissions,
      }),
      ...(isRecord(parsedRecord.evaluation) && {
        evaluation: parsedRecord.evaluation,
      }),
    };

    const sidecarDirectory = path.join(
      path.dirname(filePath),
      path.basename(filePath, '.json'),
    );
    const byTemplateIdDirectory = path.join(path.dirname(filePath), templateId);
    const sidecarConfigDirectory = await this.firstExistingDirectory([
      sidecarDirectory,
      byTemplateIdDirectory,
    ]);
    const sidecarConfig = sidecarConfigDirectory
      ? await this.readTemplateAgentConfigDirectory(sidecarConfigDirectory, issues)
      : {};
    const centralizedConfig = await this.readTemplateAgentConfigDirectory(
      path.join(path.dirname(filePath), 'configs'),
      issues,
      [
        path.basename(filePath, '.json'),
        templateId,
      ],
    );

    return {
      ...embedded,
      ...sidecarConfig,
      ...centralizedConfig,
    };
  }

  private async readTemplateAgentConfigDirectory(
    directory: string,
    issues: string[],
    flatPrefixes: readonly string[] = [],
  ): Promise<TemplateAgentConfigInput> {
    if (!(await this.isDirectory(directory))) {
      return {};
    }
    const generated = await this.readOptionalJsonRecord(
      this.configFileCandidates(directory, 'profile.generated.json', flatPrefixes, [
        'generated',
        'profile.generated',
        'profileGenerated',
      ]),
      issues,
      'profile.generated.json',
    );
    const override = await this.readOptionalJsonRecord(
      this.configFileCandidates(directory, 'profile.override.json', flatPrefixes, [
        'override',
        'profile.override',
        'profileOverride',
      ]),
      issues,
      'profile.override.json',
    );
    const assets = await this.readOptionalJsonRecord(
      this.configFileCandidates(directory, 'assets.json', flatPrefixes, ['assets']),
      issues,
      'assets.json',
    );
    const permissions = await this.readOptionalJsonRecord(
      this.configFileCandidates(directory, 'permissions.json', flatPrefixes, ['permissions']),
      issues,
      'permissions.json',
    );
    const evaluation = await this.readOptionalJsonRecord(
      this.configFileCandidates(directory, 'evaluation.json', flatPrefixes, ['evaluation']),
      issues,
      'evaluation.json',
    );

    return {
      ...(generated && { profileGenerated: generated }),
      ...(override && { profileOverride: override }),
      ...(assets && { assets }),
      ...(permissions && { permissions }),
      ...(evaluation && { evaluation }),
    };
  }

  private configFileCandidates(
    directory: string,
    legacyFileName: string,
    flatPrefixes: readonly string[],
    flatSuffixes: readonly string[],
  ): string[] {
    return [
      path.join(directory, legacyFileName),
      ...[...new Set(flatPrefixes)]
        .flatMap((prefix) => flatSuffixes.map((suffix) =>
          path.join(directory, `${prefix}.${suffix}.json`))),
    ];
  }

  private extractTemplateCategoryLabels(
    parsed: unknown,
  ): {
    categoryLabel?: string;
    categoryLabels?: Record<string, string>;
    platformCategoryLabels?: Record<string, string>;
    functionalCategoryLabels?: Record<string, string>;
  } {
    const record = isRecord(parsed) ? parsed : {};
    return {
      ...(isNonEmptyString(record.categoryLabel) && {
        categoryLabel: record.categoryLabel,
      }),
      ...(isStringRecord(record.categoryLabels) && {
        categoryLabels: record.categoryLabels,
      }),
      ...(isStringRecord(record.platformCategoryLabels) && {
        platformCategoryLabels: record.platformCategoryLabels,
      }),
      ...(isStringRecord(record.functionalCategoryLabels) && {
        functionalCategoryLabels: record.functionalCategoryLabels,
      }),
    };
  }

  private async firstExistingDirectory(
    directories: readonly string[],
  ): Promise<string | null> {
    for (const directory of directories) {
      try {
        const stat = await fs.stat(directory);
        if (stat.isDirectory()) {
          return directory;
        }
      } catch {
        // Ignore missing optional sidecar directory.
      }
    }
    return null;
  }

  private async readOptionalJsonRecord(
    filePathOrCandidates: string | readonly string[],
    issues: string[],
    label: string,
  ): Promise<Record<string, unknown> | undefined> {
    const filePath = await this.firstExistingFile(
      Array.isArray(filePathOrCandidates)
        ? filePathOrCandidates
        : [filePathOrCandidates],
    );
    if (!filePath) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      if (!isRecord(parsed)) {
        issues.push(`${label} must be a JSON object.`);
        return undefined;
      }
      return parsed;
    } catch (error) {
      issues.push(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private async firstExistingFile(
    filePaths: readonly string[],
  ): Promise<string | null> {
    for (const filePath of filePaths) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          return filePath;
        }
      } catch {
        // Missing optional config files are fine.
      }
    }
    return null;
  }

  private async isDirectory(directory: string): Promise<boolean> {
    try {
      const stat = await fs.stat(directory);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private parseTemplateJsonSeed(
    value: unknown,
    issues: string[],
  ): TemplateSeedException | null {
    if (!isRecord(value)) {
      issues.push('Template must be an object.');
      return null;
    }

    const requiredStrings = [
      'templateId',
      'name',
      'tagline',
      'description',
      'accent',
      'category',
    ] as const;
    requiredStrings.forEach((key) => {
      if (!isNonEmptyString(value[key])) {
        issues.push(`${key} must be a non-empty string.`);
      }
    });

    const traits = this.parseStringArray(value.traits, 'traits', issues);
    const tags = value.tags === undefined
      ? undefined
      : this.parseStringArray(value.tags, 'tags', issues);
    const platformCategories = this.parseCategoryArray(
      value.platformCategories,
      'platformCategories',
      PLATFORM_CATEGORIES,
      issues,
    );
    const functionalCategories = this.parseCategoryArray(
      value.functionalCategories,
      'functionalCategories',
      FUNCTIONAL_CATEGORIES,
      issues,
      { strict: false },
    );

    if (
      functionalCategories.length > 0 &&
      value.category !== functionalCategories[0]
    ) {
      issues.push('category must match functionalCategories[0].');
    }
    if (!isCssVarRecord(value.cssVars)) {
      issues.push('cssVars must be an object with --prefixed string values.');
    }
    if (!isRecord(value.componentTemplates)) {
      issues.push('componentTemplates must be an object.');
    }
    if (!isRecord(value.layoutDocument)) {
      issues.push('layoutDocument must be an object.');
    }
    if (isNonEmptyString(value.category) && !isTemplateCategoryKey(value.category)) {
      issues.push('category must be an English slug key.');
    }

    if (issues.length) {
      return null;
    }

    return {
      templateId: String(value.templateId),
      name: String(value.name),
      tagline: String(value.tagline),
      description: String(value.description),
      accent: String(value.accent),
      category: String(value.category),
      platformCategories,
      functionalCategories,
      traits,
      ...(tags ? { tags } : {}),
      cssVars: value.cssVars as Record<string, string>,
      cssAnimations: isStringRecord(value.cssAnimations)
        ? value.cssAnimations
        : undefined,
      componentTemplates: value.componentTemplates as Record<string, unknown>,
      layoutDocument: value.layoutDocument as Record<string, unknown>,
    };
  }

  private parseStringArray(
    value: unknown,
    fieldName: string,
    issues: string[],
  ): string[] {
    if (!Array.isArray(value) || !value.length) {
      issues.push(`${fieldName} must be a non-empty string array.`);
      return [];
    }
    const strings = value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
    if (strings.length !== value.length) {
      issues.push(`${fieldName} must contain only non-empty strings.`);
    }
    return strings;
  }

  private parseCategoryArray(
    value: unknown,
    fieldName: string,
    allowedValues: Set<string>,
    issues: string[],
    options: { strict?: boolean } = {},
  ): string[] {
    const strings = this.parseStringArray(value, fieldName, issues);
    strings.forEach((item) => {
      if (!isTemplateCategoryKey(item)) {
        issues.push(`${fieldName} must contain only English slug keys: ${item}.`);
      }
      if (options.strict !== false && !allowedValues.has(item)) {
        issues.push(`${fieldName} contains unsupported value: ${item}.`);
      }
    });
    return strings;
  }

  private async deleteImportedTemplateJsonFiles(filePaths: string[]): Promise<void> {
    if (!this.config.templates.jsonImport.deleteAfterImport) {
      return;
    }
    for (const filePath of filePaths) {
      try {
        await this.deleteImportedTemplateSidecars(filePath);
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(
          `[TemplatesService] Imported template JSON but could not delete ${filePath}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async deleteImportedTemplateSidecars(filePath: string): Promise<void> {
    await this.deleteImportedTemplateCentralizedConfigs(filePath);
    const directories = await this.resolveImportedTemplateSidecarDirectories(filePath);
    const sidecarFiles = [
      'profile.generated.json',
      'profile.override.json',
      'assets.json',
      'permissions.json',
      'evaluation.json',
    ];

    for (const directory of directories) {
      for (const fileName of sidecarFiles) {
        try {
          await fs.unlink(path.join(directory, fileName));
        } catch (error) {
          if (!this.isFsErrorCode(error, 'ENOENT')) {
            console.warn(
              `[TemplatesService] Could not delete imported sidecar ${fileName}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
      }

      try {
        await fs.rmdir(directory);
      } catch (error) {
        if (
          !this.isFsErrorCode(error, 'ENOENT') &&
          !this.isFsErrorCode(error, 'ENOTEMPTY')
        ) {
          console.warn(
            `[TemplatesService] Could not remove imported sidecar directory ${directory}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }
  }

  private async deleteImportedTemplateCentralizedConfigs(filePath: string): Promise<void> {
    const configDirectory = path.join(path.dirname(filePath), 'configs');
    const prefixes = await this.resolveImportedTemplateConfigPrefixes(filePath);
    const suffixes = [
      'generated',
      'profile.generated',
      'profileGenerated',
      'override',
      'profile.override',
      'profileOverride',
      'assets',
      'permissions',
      'evaluation',
    ];

    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const configPath = path.join(configDirectory, `${prefix}.${suffix}.json`);
        try {
          await fs.unlink(configPath);
        } catch (error) {
          if (!this.isFsErrorCode(error, 'ENOENT')) {
            console.warn(
              `[TemplatesService] Could not delete imported config ${configPath}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
      }
    }

    try {
      await fs.rmdir(configDirectory);
    } catch (error) {
      if (
        !this.isFsErrorCode(error, 'ENOENT') &&
        !this.isFsErrorCode(error, 'ENOTEMPTY')
      ) {
        console.warn(
          `[TemplatesService] Could not remove imported config directory ${configDirectory}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async resolveImportedTemplateConfigPrefixes(filePath: string): Promise<string[]> {
    const prefixes = [path.basename(filePath, '.json')];
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      if (isRecord(parsed) && isNonEmptyString(parsed.templateId)) {
        prefixes.push(parsed.templateId);
      }
    } catch {
      // The root template was already imported successfully; this fallback is best effort.
    }
    return [...new Set(prefixes)];
  }

  private async resolveImportedTemplateSidecarDirectories(
    filePath: string,
  ): Promise<string[]> {
    const directories = [
      path.join(path.dirname(filePath), path.basename(filePath, '.json')),
    ];
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      if (isRecord(parsed) && isNonEmptyString(parsed.templateId)) {
        directories.push(path.join(path.dirname(filePath), parsed.templateId));
      }
    } catch {
      // The root template was already imported successfully; this fallback is best effort.
    }
    return [...new Set(directories)];
  }

  private isFsErrorCode(error: unknown, code: string): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
    );
  }

  private async writeTemplateValidationLog(
    filePath: string,
    issues: string[],
  ): Promise<void> {
    const content = [
      `Template JSON import failed for ${path.basename(filePath)}`,
      `Generated at ${new Date().toISOString()}`,
      '',
      ...issues.map((issue) => `- ${issue}`),
      '',
    ].join('\n');
    await fs.writeFile(this.templateValidationLogPath(filePath), content, 'utf8');
  }

  private async removeTemplateValidationLog(filePath: string): Promise<void> {
    try {
      await fs.unlink(this.templateValidationLogPath(filePath));
    } catch {
      // No previous validation log to remove.
    }
  }

  private templateValidationLogPath(filePath: string): string {
    return path.join(
      path.dirname(filePath),
      `${path.basename(filePath, '.json')}.validation.log`,
    );
  }
}

function hasCjkText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function isTemplateCategoryKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value) && !hasCjkText(value);
}
