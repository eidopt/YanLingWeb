import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  applyTemplateProfileOverride,
  buildTemplateProfile,
  isTemplateProfile,
  validateTemplateProfile,
} from '@shared/agent/runtime';
import { objectToRecord, themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';
import { mergeVisualAssetsIntoManifest } from '@shared/theme-layout/visualAssets';

import { ConfigService } from '../config/config.service';
import { deriveTags } from '../shared/derive-tags';
import { isCssVarRecord, isNonEmptyString, isRecord, isStringRecord } from '../shared/type-guards';
import { Template } from './entities/template.entity';
import {
  TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY,
  TEMPLATE_PERSISTENCE_REPOSITORY,
  type TemplateAgentConfigInput,
  type TemplateAgentKnowledgeRepository,
  type TemplateListFilters,
  type TemplatePersistenceRepository,
  type TemplatePersistenceStore,
} from './repositories';
import { TEMPLATE_SEED_DATA, type TemplateSeedException } from './seed/template-seed.data';
import { TemplateAssetService } from './template-asset.service';
import { TemplateCategoryRegistryService } from './template-category-registry.service';
import { prepareTemplateLayoutForPersistence } from './template-layout-validation';

const PLATFORM_CATEGORIES = new Set(['mini-program', 'mobile-app', 'tablet-app', 'web']);

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

const DISPLAY_CATEGORIES = new Set([
  'commerce',
  'service',
  'content',
  'education',
  'health',
  'social',
  'finance',
  'marketing',
  'utility',
  'dashboard',
  'profile',
  'other',
  'general',
]);

export interface UpdateOwnedTemplateInput {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  displayCategory?: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits?: string[];
  tags?: string[];
  layoutDocument?: Record<string, unknown>;
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  visualAssets?: unknown[];
}

export interface SaveGeneratedTemplateInput {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  categoryLabel?: string;
  categoryLabels?: Record<string, string>;
  displayCategory?: string;
  displayCategoryLabel?: string;
  displayCategoryLabels?: Record<string, string>;
  platformCategories?: string[];
  platformCategoryLabels?: Record<string, string>;
  functionalCategories?: string[];
  functionalCategoryLabels?: Record<string, string>;
  accent: string;
  traits: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string>;
  visualAssets?: unknown[];
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
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

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    @Inject(TEMPLATE_PERSISTENCE_REPOSITORY)
    private readonly templates: TemplatePersistenceRepository,
    @Inject(TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY)
    private readonly agentKnowledge: TemplateAgentKnowledgeRepository,
    private readonly config: ConfigService,
    private readonly templateAssetService: TemplateAssetService,
    private readonly categoryRegistry: TemplateCategoryRegistryService,
  ) {}

  /**
   * 构建反规范化搜索文本，用于避免查询时解析 JSON。
   */
  private buildSearchText(template: {
    name?: string;
    tagline?: string;
    description?: string;
    tags?: string[];
    category?: string;
    displayCategory?: string;
    functionalCategories?: string[];
    traits?: string[];
  }): string {
    const parts = [
      template.name ?? '',
      template.tagline ?? '',
      template.description ?? '',
      template.category ?? '',
      template.displayCategory ?? '',
      ...(template.tags ?? []),
      ...(template.functionalCategories ?? []),
      ...(template.traits ?? []),
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      TEMPLATE_SEED_DATA.map((data) => this.categoryRegistry.ensureTemplateCategories(data)),
    );
    await this.templates.upsertTemplates(
      TEMPLATE_SEED_DATA.map((data) => {
        const displayCategory =
          data.displayCategory ?? this.resolveDisplayCategoryFromKey(data.category);
        const tags = deriveTags(data);
        const layoutDocument = prepareTemplateLayoutForPersistence({
          layoutDocument: data.layoutDocument,
          componentTemplates: data.componentTemplates,
          cssVars: data.cssVars,
        });
        return this.templates.createTemplate({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
          displayCategory,
          tags,
          searchText: this.buildSearchText({ ...data, displayCategory, tags }),
          ...data,
          layoutDocument: themeLayoutDocumentToRecord(layoutDocument),
        });
      }),
    );
    await Promise.all(
      TEMPLATE_SEED_DATA.map((data) =>
        this.upsertTemplateAgentConfig(data.templateId, {
          profileGenerated: objectToRecord(
            buildTemplateProfile(
              prepareTemplateLayoutForPersistence({
                layoutDocument: data.layoutDocument,
                componentTemplates: data.componentTemplates,
                cssVars: data.cssVars,
              }),
            ),
          ),
        }),
      ),
    );
    const importedTemplateFiles = await this.importTemplateJsonDirectory();
    await this.repairLegacyOwnedCopies();
    await this.repairTemplateCategoryKeys();
    await this.ensureGeneratedProfilesForExistingTemplates();
    await this.deleteImportedTemplateJsonFiles(importedTemplateFiles);
  }

  async findMarketplace(
    options: TemplateListFilters = {},
  ): Promise<{ data: Template[]; total: number }> {
    const data = await this.templates.findMarketplace(options);
    return {
      data: await Promise.all(
        data.map((template) => this.categoryRegistry.decorateTemplate(template)),
      ),
      total: data.length,
    };
  }

  async findOwned(
    ownerUserId: string,
    options: TemplateListFilters = {},
  ): Promise<{ data: Template[]; total: number }> {
    const data = await this.templates.findOwned(ownerUserId, options);
    return {
      data: await Promise.all(
        data.map((template) => this.categoryRegistry.decorateTemplate(template)),
      ),
      total: data.length,
    };
  }

  private filterByPlatformCategory(templates: Template[], platformCategory?: string): Template[] {
    const normalizedCategory = platformCategory?.trim();
    if (!normalizedCategory) {
      return templates;
    }
    return templates.filter((template) => template.platformCategories.includes(normalizedCategory));
  }

  async findRecentOwned(ownerUserId: string, limit = 6): Promise<Template[]> {
    const templates = await this.templates.findRecentOwned(ownerUserId, limit);
    return Promise.all(
      templates.map((template) => this.categoryRegistry.decorateTemplate(template)),
    );
  }

  async findByTemplateId(templateId: string): Promise<TemplateWithAgentConfig> {
    const template = await this.templates.findPublicByTemplateId(templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return this.attachAgentConfig(template);
  }

  async findOwnedByTemplateId(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateWithAgentConfig> {
    const template = await this.templates.findOwnedByTemplateId(ownerUserId, templateId);
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return this.attachAgentConfig(template);
  }

  async duplicateForUser(ownerUserId: string, sourceTemplateId: string): Promise<Template> {
    const source = await this.findByTemplateId(sourceTemplateId);
    const copyTemplateId = this.createUserTemplateId(source.templateId, ownerUserId);
    const copy = this.templates.createTemplate({
      templateId: copyTemplateId,
      ownerUserId,
      sourceTemplateId: source.templateId,
      isPublic: false,
      name: `${source.name} 副本`,
      tagline: source.tagline,
      description: source.description,
      accent: source.accent,
      category: source.category,
      displayCategory: source.displayCategory,
      primaryFunctionalCategory: source.functionalCategories[0] ?? null,
      platformCategories: [...source.platformCategories],
      functionalCategories: [...source.functionalCategories],
      traits: [...source.traits],
      tags: deriveTags(source),
      cssVars: { ...source.cssVars },
      cssAnimations: source.cssAnimations ? { ...source.cssAnimations } : null,
      componentTemplates: structuredClone(source.componentTemplates),
      layoutDocument: structuredClone(source.layoutDocument),
    });

    const saved = await this.templates.runInTransaction(async (store) => {
      const savedCopy = await store.saveTemplate(copy);
      await this.copyTemplateAgentConfig(source.templateId, savedCopy.templateId, store);
      return savedCopy;
    });
    return this.attachAgentConfig(saved);
  }

  async updateOwned(
    ownerUserId: string,
    templateId: string,
    input: UpdateOwnedTemplateInput,
  ): Promise<Template> {
    const template = await this.findOwnedByTemplateId(ownerUserId, templateId);
    const assetResolution =
      input.visualAssets !== undefined
        ? await this.templateAssetService.resolveVisualAssetsForTemplate(
            template.templateId,
            input.layoutDocument ?? template.layoutDocument,
            input.visualAssets,
          )
        : null;
    const layoutDocumentSource =
      assetResolution?.layoutDocument ?? input.layoutDocument ?? template.layoutDocument;
    const shouldPrepareLayout =
      input.layoutDocument !== undefined ||
      input.componentTemplates !== undefined ||
      input.cssVars !== undefined ||
      input.visualAssets !== undefined;
    const preparedLayoutDocument = shouldPrepareLayout
      ? prepareTemplateLayoutForPersistence({
          layoutDocument: layoutDocumentSource,
          componentTemplates: input.componentTemplates ?? template.componentTemplates,
          cssVars: input.cssVars ?? template.cssVars,
        })
      : null;

    if (input.name !== undefined) {
      template.name = input.name;
    }
    if (input.tagline !== undefined) {
      template.tagline = input.tagline;
    }
    if (input.description !== undefined) {
      template.description = input.description;
    }
    if (input.category !== undefined) {
      this.assertTemplateCategoryKey(input.category, 'category');
      template.category = input.category;
    }
    if (input.displayCategory !== undefined) {
      this.assertTemplateCategoryKey(input.displayCategory, 'displayCategory');
      template.displayCategory = input.displayCategory;
    }
    if (input.platformCategories !== undefined) {
      input.platformCategories.forEach((category) =>
        this.assertTemplateCategoryKey(category, 'platformCategories'),
      );
      template.platformCategories = [...input.platformCategories];
    }
    if (input.functionalCategories !== undefined) {
      input.functionalCategories.forEach((category) =>
        this.assertTemplateCategoryKey(category, 'functionalCategories'),
      );
      template.functionalCategories = [...input.functionalCategories];
      template.primaryFunctionalCategory = input.functionalCategories[0] ?? null;
    }
    if (input.traits !== undefined) {
      template.traits = input.traits;
    }
    if (input.tags !== undefined) {
      template.tags = input.tags;
    }
    if (input.cssVars !== undefined) {
      template.cssVars = input.cssVars;
    }
    if (input.cssAnimations !== undefined) {
      template.cssAnimations = input.cssAnimations;
    }
    if (input.componentTemplates !== undefined) {
      template.componentTemplates = input.componentTemplates;
    }
    if (preparedLayoutDocument) {
      template.layoutDocument = themeLayoutDocumentToRecord(preparedLayoutDocument);
    }

    if (!template.tags.length) {
      template.tags = deriveTags(template);
    }

    template.searchText = this.buildSearchText(template);
    await this.categoryRegistry.ensureTemplateCategories(template);
    const saved = await this.templates.runInTransaction(async (store) => {
      const savedTemplate = await store.saveTemplate(template);
      if (shouldPrepareLayout) {
        await this.saveGeneratedProfileForTemplate(savedTemplate, true, store);
      }
      if (assetResolution?.manifest) {
        await this.upsertTemplateAgentConfig(
          savedTemplate.templateId,
          {
            assets: objectToRecord(assetResolution.manifest),
          },
          store,
        );
      }
      return savedTemplate;
    });
    return this.attachAgentConfig(saved);
  }

  async saveGeneratedTemplate(
    ownerUserId: string,
    input: SaveGeneratedTemplateInput,
  ): Promise<{ templateId: string; action: 'created' | 'updated' }> {
    const preparedLayout = prepareTemplateLayoutForPersistence({
      layoutDocument: input.layoutDocument,
      componentTemplates: input.componentTemplates,
      cssVars: input.cssVars,
      requireGeneratedTemplateQuality: true,
    });
    this.assertGeneratedTemplateCategoryKeys(input);

    const existing = await this.templates.findByTemplateId(input.templateId);
    const targetTemplateId = existing
      ? existing.ownerUserId === ownerUserId
        ? existing.templateId
        : await this.createAvailableGeneratedTemplateId(input.templateId, ownerUserId)
      : input.templateId;
    const assetResolution = await this.templateAssetService.resolveVisualAssetsForTemplate(
      targetTemplateId,
      themeLayoutDocumentToRecord(preparedLayout),
      input.visualAssets,
    );
    const layoutDocument = prepareTemplateLayoutForPersistence({
      layoutDocument: assetResolution.layoutDocument,
      componentTemplates: input.componentTemplates,
      cssVars: input.cssVars,
      requireGeneratedTemplateQuality: true,
    });
    const preparedInput: SaveGeneratedTemplateInput = {
      ...input,
      templateId: targetTemplateId,
      layoutDocument: themeLayoutDocumentToRecord(layoutDocument),
      ...(assetResolution.visualAssets.length > 0
        ? { visualAssets: assetResolution.visualAssets }
        : {}),
    };
    await this.categoryRegistry.ensureTemplateCategories(preparedInput, {
      requireLabelsForUnknown: true,
    });

    const target =
      existing?.ownerUserId === ownerUserId
        ? existing
        : this.templates.createTemplate({
            templateId: targetTemplateId,
            ownerUserId,
            sourceTemplateId: null,
            isPublic: false,
          });

    this.applyGeneratedTemplateInput(target, preparedInput);
    const saved = await this.templates.runInTransaction(async (store) => {
      const savedTemplate = await store.saveTemplate(target);
      await this.saveGeneratedProfileForTemplate(savedTemplate, true, store);
      if (assetResolution.manifest) {
        await this.upsertTemplateAgentConfig(
          savedTemplate.templateId,
          {
            assets: objectToRecord(assetResolution.manifest),
          },
          store,
        );
      }
      return savedTemplate;
    });
    return {
      templateId: saved.templateId,
      action: existing?.ownerUserId === ownerUserId ? 'updated' : 'created',
    };
  }

  async getTemplateAgentConfig(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateAgentConfigDto> {
    const template = await this.templates.findAccessibleByTemplateId(ownerUserId, templateId);
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

  private async loadTemplateAgentConfig(template: Template): Promise<TemplateAgentConfigDto> {
    const fallbackTemplateId = template.sourceTemplateId ?? undefined;
    const records = await this.agentKnowledge.findForTemplate(
      template.templateId,
      fallbackTemplateId,
    );
    const layoutDocument = this.templateLayoutDocument(template);
    const generatedProfile =
      records.profileGenerated ?? objectToRecord(buildTemplateProfile(layoutDocument));
    const profileOverrideRecord = records.profileOverride;
    let effectiveProfile = generatedProfile;

    if (profileOverrideRecord) {
      if (isTemplateProfile(generatedProfile)) {
        try {
          effectiveProfile = objectToRecord(
            applyTemplateProfileOverride(generatedProfile, profileOverrideRecord),
          );
        } catch {
          effectiveProfile = generatedProfile;
        }
      }
    }

    return {
      profileGenerated: generatedProfile,
      profileOverride: profileOverrideRecord,
      effectiveProfile,
      assets: records.assets,
      permissions: records.permissions,
      evaluation: records.evaluation,
    };
  }

  private async saveGeneratedProfileForTemplate(
    template: Template,
    overwrite: boolean,
    store: TemplatePersistenceStore = this.templates,
  ): Promise<void> {
    if (!overwrite) {
      const exists = await store.generatedProfileExists(template.templateId);
      if (exists) {
        return;
      }
    }

    const profile = objectToRecord(buildTemplateProfile(this.templateLayoutDocument(template)));
    await this.upsertTemplateAgentConfig(template.templateId, { profileGenerated: profile }, store);
  }

  private async ensureGeneratedProfilesForExistingTemplates(): Promise<void> {
    const templates = await this.templates.findAllTemplates();
    const existing = new Set(await this.templates.findExistingGeneratedProfileTemplateIds());

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
    store: TemplatePersistenceStore = this.templates,
  ): Promise<void> {
    const records = await store.findAgentConfig(sourceTemplateId);

    await this.upsertTemplateAgentConfig(
      targetTemplateId,
      {
        ...(records.profileGenerated && { profileGenerated: records.profileGenerated }),
        ...(records.profileOverride && { profileOverride: records.profileOverride }),
        ...(records.assets && { assets: records.assets }),
        ...(records.permissions && { permissions: records.permissions }),
        ...(records.evaluation && { evaluation: records.evaluation }),
      },
      store,
    );
  }

  private templateLayoutDocument(template: Pick<Template, 'layoutDocument'>): ThemeLayoutDocument {
    return migrateThemeLayoutDocument(template.layoutDocument);
  }

  private async upsertTemplateAgentConfig(
    templateId: string,
    input: TemplateAgentConfigInput,
    store: TemplatePersistenceStore = this.templates,
  ): Promise<void> {
    await store.upsertAgentConfig(templateId, input);
  }

  private createUserTemplateId(sourceTemplateId: string, ownerUserId: string) {
    const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
    return `${sourceTemplateId}-copy-${ownerPrefix}-${Date.now().toString(36)}`;
  }

  private async createAvailableGeneratedTemplateId(
    baseTemplateId: string,
    ownerUserId: string,
  ): Promise<string> {
    const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
    const base = baseTemplateId.trim() || 'ai-template';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}${
        attempt ? `-${attempt}` : ''
      }`;
      const exists = await this.templates.existsByTemplateId(candidate);
      if (!exists) {
        return candidate;
      }
    }

    return `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  private applyGeneratedTemplateInput(template: Template, input: SaveGeneratedTemplateInput): void {
    template.name = input.name;
    template.tagline = input.tagline;
    template.description = input.description;
    template.category = input.category;
    template.displayCategory = input.displayCategory ?? input.category;
    template.platformCategories = [...(input.platformCategories ?? [])];
    template.functionalCategories = input.functionalCategories?.length
      ? [...input.functionalCategories]
      : [input.category];
    template.primaryFunctionalCategory = template.functionalCategories[0] ?? null;
    template.accent = input.accent;
    template.traits = input.traits;
    template.tags = deriveTags({
      ...input,
      templateId: template.templateId,
      displayCategory: template.displayCategory,
    });
    template.searchText = this.buildSearchText(template);
    template.cssVars = input.cssVars;
    template.cssAnimations = input.cssAnimations ?? null;
    template.componentTemplates = input.componentTemplates;
    template.layoutDocument = withThemeLayoutStyleManifest(input.layoutDocument, input.cssVars);
    template.ownerUserId ??= null;
    template.sourceTemplateId ??= null;
    template.isPublic = false;
  }

  private assertGeneratedTemplateCategoryKeys(input: SaveGeneratedTemplateInput): void {
    this.assertTemplateCategoryKey(input.category, 'category');
    if (input.displayCategory) {
      this.assertTemplateCategoryKey(input.displayCategory, 'displayCategory');
    }
    input.platformCategories?.forEach((category) =>
      this.assertTemplateCategoryKey(category, 'platformCategories'),
    );
    input.functionalCategories?.forEach((category) =>
      this.assertTemplateCategoryKey(category, 'functionalCategories'),
    );
  }

  private async repairLegacyOwnedCopies(): Promise<void> {
    const userIds = await this.templates.findAllUserIds();
    if (!userIds.length) {
      return;
    }

    const ownerPrefixToUserId = new Map<string, string | null>();
    for (const userId of userIds) {
      const prefix = userId.replace(/-/g, '').slice(0, 8);
      ownerPrefixToUserId.set(prefix, ownerPrefixToUserId.has(prefix) ? null : userId);
    }

    const publicSourceIds = new Set(await this.templates.findPublicTemplateIds());

    const legacyCopies = await this.templates.findOwnerlessTemplates();

    for (const template of legacyCopies) {
      const match = /^(?<source>.+)-copy-(?<ownerPrefix>[a-f0-9]{8})-[a-z0-9]+$/i.exec(
        template.templateId,
      );
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
      await this.templates.saveTemplate(template);
    }
  }

  private async repairTemplateCategoryKeys(): Promise<void> {
    const templates = await this.templates.findAllTemplates();
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

      const normalizedDisplayCategory = this.resolveTemplateDisplayCategoryKey(
        template.displayCategory,
        template.category,
        template.functionalCategories,
      );
      if (normalizedDisplayCategory && normalizedDisplayCategory !== template.displayCategory) {
        template.displayCategory = normalizedDisplayCategory;
        changed = true;
      }

      const primaryFunctionalCategory = template.functionalCategories[0] ?? null;
      if (template.primaryFunctionalCategory !== primaryFunctionalCategory) {
        template.primaryFunctionalCategory = primaryFunctionalCategory;
        changed = true;
      }

      await this.categoryRegistry.ensureTemplateCategories(template);
      if (changed) {
        await this.templates.saveTemplate(template);
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
      this.hasCjkText(current) &&
      primaryFunctionalCategory &&
      !this.hasCjkText(primaryFunctionalCategory)
    ) {
      return primaryFunctionalCategory;
    }
    return current;
  }

  private resolveTemplateDisplayCategoryKey(
    displayCategory: string | null | undefined,
    category: string | null | undefined,
    functionalCategories: readonly string[] | null | undefined,
  ): string {
    const current = typeof displayCategory === 'string' ? displayCategory.trim() : '';
    const primaryFunctionalCategory = functionalCategories?.[0]?.trim() ?? '';
    if (current && !this.hasCjkText(current)) {
      if (current !== category && current !== primaryFunctionalCategory) {
        return current;
      }
    }
    const fallbackCategory =
      primaryFunctionalCategory.length > 0
        ? primaryFunctionalCategory
        : typeof category === 'string' && category.length > 0
          ? category
          : current.length > 0
            ? current
            : 'general';
    return this.resolveDisplayCategoryFromKey(fallbackCategory);
  }

  private assertTemplateCategoryKey(value: string, fieldName: string): void {
    if (!this.isTemplateCategoryKey(value)) {
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
    let jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
      .sort();

    // 跳过 import-skip-list.json 中列出的模板。
    const skipListPath = path.join(directory, 'import-skip-list.json');
    try {
      const skipContent = await fs.readFile(skipListPath, 'utf8');
      const skipIds = JSON.parse(skipContent) as unknown;
      if (Array.isArray(skipIds) && skipIds.length > 0) {
        const skipBasenames = new Set(
          skipIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => path.basename(id) + '.json'),
        );
        jsonFiles = jsonFiles.filter((f) => !skipBasenames.has(path.basename(f)));
      }
    } catch {
      // 没有跳过列表时处理全部模板。
    }

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
        // 目录不存在表示没有待导入的模板 JSON。
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
      const assetResolution = await this.templateAssetService.resolveVisualAssetsForTemplate(
        data.templateId,
        data.layoutDocument,
        isRecord(parsed) ? parsed.visualAssets : undefined,
      );
      const assetManifest = mergeVisualAssetsIntoManifest(
        data.templateId,
        agentConfig.assets,
        assetResolution.visualAssets,
      );
      const preparedLayoutDocument = prepareTemplateLayoutForPersistence({
        layoutDocument: assetResolution.layoutDocument,
        componentTemplates: data.componentTemplates,
        cssVars: data.cssVars,
        requireGeneratedTemplateQuality: true,
      });
      const layoutDocument = themeLayoutDocumentToRecord(preparedLayoutDocument);
      const generatedProfile =
        agentConfig.profileGenerated ??
        objectToRecord(buildTemplateProfile(preparedLayoutDocument));
      let effectiveProfile = generatedProfile;
      if (agentConfig.profileOverride) {
        if (!isTemplateProfile(generatedProfile)) {
          issues.push('template profile generated config is malformed');
          await this.writeTemplateValidationLog(filePath, issues);
          return false;
        }
        effectiveProfile = objectToRecord(
          applyTemplateProfileOverride(generatedProfile, agentConfig.profileOverride),
        );
      }
      if (!isTemplateProfile(effectiveProfile)) {
        issues.push('template profile effective config is malformed');
        await this.writeTemplateValidationLog(filePath, issues);
        return false;
      }
      const profileValidation = validateTemplateProfile(preparedLayoutDocument, effectiveProfile);
      if (!profileValidation.valid) {
        issues.push(
          ...profileValidation.errors.map(
            (error) => `template profile ${error.path}: ${error.message}`,
          ),
        );
        await this.writeTemplateValidationLog(filePath, issues);
        return false;
      }
      const tags = deriveTags(data);
      await this.templates.upsertTemplates([
        this.templates.createTemplate({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
          tags,
          searchText: this.buildSearchText({ ...data, tags }),
          ...data,
          layoutDocument,
        }),
      ]);
      await this.upsertTemplateAgentConfig(data.templateId, {
        ...agentConfig,
        ...(assetManifest ? { assets: assetManifest } : {}),
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

    const sidecarDirectory = path.join(path.dirname(filePath), path.basename(filePath, '.json'));
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
      [path.basename(filePath, '.json'), templateId],
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
      ...[...new Set(flatPrefixes)].flatMap((prefix) =>
        flatSuffixes.map((suffix) => path.join(directory, `${prefix}.${suffix}.json`)),
      ),
    ];
  }

  private extractTemplateCategoryLabels(parsed: unknown): {
    categoryLabel?: string;
    categoryLabels?: Record<string, string>;
    displayCategoryLabel?: string;
    displayCategoryLabels?: Record<string, string>;
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
      ...(isNonEmptyString(record.displayCategoryLabel) && {
        displayCategoryLabel: record.displayCategoryLabel,
      }),
      ...(isStringRecord(record.displayCategoryLabels) && {
        displayCategoryLabels: record.displayCategoryLabels,
      }),
      ...(isStringRecord(record.platformCategoryLabels) && {
        platformCategoryLabels: record.platformCategoryLabels,
      }),
      ...(isStringRecord(record.functionalCategoryLabels) && {
        functionalCategoryLabels: record.functionalCategoryLabels,
      }),
    };
  }

  private async firstExistingDirectory(directories: readonly string[]): Promise<string | null> {
    for (const directory of directories) {
      try {
        const stat = await fs.stat(directory);
        if (stat.isDirectory()) {
          return directory;
        }
      } catch {
        // 可选 sidecar 目录不存在时忽略。
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
      Array.isArray(filePathOrCandidates) ? filePathOrCandidates : [filePathOrCandidates],
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
      issues.push(
        `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async firstExistingFile(filePaths: readonly string[]): Promise<string | null> {
    for (const filePath of filePaths) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          return filePath;
        }
      } catch {
        // 可选配置文件不存在时忽略。
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

  private parseTemplateJsonSeed(value: unknown, issues: string[]): TemplateSeedException | null {
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
      'displayCategory',
    ] as const;
    requiredStrings.forEach((key) => {
      if (!isNonEmptyString(value[key])) {
        issues.push(`${key} must be a non-empty string.`);
      }
    });

    const traits = this.parseStringArray(value.traits, 'traits', issues);
    const tags =
      value.tags === undefined ? undefined : this.parseStringArray(value.tags, 'tags', issues);
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
    const displayCategory = isNonEmptyString(value.displayCategory)
      ? String(value.displayCategory).trim()
      : this.resolveDisplayCategoryFromKey(isNonEmptyString(value.category) ? value.category : '');

    if (functionalCategories.length > 0 && value.category !== functionalCategories[0]) {
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
    if (isNonEmptyString(value.category) && !this.isTemplateCategoryKey(value.category)) {
      issues.push('category must be an English slug key.');
    }
    if (isNonEmptyString(displayCategory) && !this.isTemplateCategoryKey(displayCategory)) {
      issues.push('displayCategory must be an English slug key.');
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
      displayCategory,
      platformCategories,
      functionalCategories,
      traits,
      ...(tags ? { tags } : {}),
      cssVars: value.cssVars as Record<string, string>,
      cssAnimations: isStringRecord(value.cssAnimations) ? value.cssAnimations : undefined,
      componentTemplates: value.componentTemplates as Record<string, unknown>,
      layoutDocument: value.layoutDocument as Record<string, unknown>,
    };
  }

  private parseStringArray(value: unknown, fieldName: string, issues: string[]): string[] {
    if (!Array.isArray(value) || !value.length) {
      issues.push(`${fieldName} must be a non-empty string array.`);
      return [];
    }
    const strings = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
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
      if (!this.isTemplateCategoryKey(item)) {
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
        if (!this.isFsErrorCode(error, 'ENOENT') && !this.isFsErrorCode(error, 'ENOTEMPTY')) {
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
      if (!this.isFsErrorCode(error, 'ENOENT') && !this.isFsErrorCode(error, 'ENOTEMPTY')) {
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
      // 根模板已成功导入；这里的回退清理只尽力执行。
    }
    return [...new Set(prefixes)];
  }

  private async resolveImportedTemplateSidecarDirectories(filePath: string): Promise<string[]> {
    const directories = [path.join(path.dirname(filePath), path.basename(filePath, '.json'))];
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      if (isRecord(parsed) && isNonEmptyString(parsed.templateId)) {
        directories.push(path.join(path.dirname(filePath), parsed.templateId));
      }
    } catch {
      // 根模板已成功导入；这里的回退清理只尽力执行。
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

  private async writeTemplateValidationLog(filePath: string, issues: string[]): Promise<void> {
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
      // 没有旧校验日志需要删除。
    }
  }

  private templateValidationLogPath(filePath: string): string {
    return path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}.validation.log`);
  }

  private hasCjkText(value: string): boolean {
    return /[\u4e00-\u9fff]/.test(value);
  }

  private resolveDisplayCategoryFromKey(key: string | null | undefined): string {
    const normalized = typeof key === 'string' ? key.trim().toLowerCase() : '';
    if (!normalized) {
      return 'general';
    }
    if (DISPLAY_CATEGORIES.has(normalized)) {
      return normalized;
    }
    const prefix = normalized.split('-')[0];
    if (prefix === 'edu') {
      return 'education';
    }
    if (DISPLAY_CATEGORIES.has(prefix)) {
      return prefix;
    }
    if (normalized.includes('booking') || normalized.includes('food-ordering')) {
      return 'service';
    }
    if (normalized.includes('reader') || normalized.includes('news')) {
      return 'content';
    }
    if (normalized.includes('event')) {
      return 'marketing';
    }
    if (normalized.includes('wellness') || normalized.includes('fitness')) {
      return 'health';
    }
    if (normalized.includes('tools')) {
      return 'utility';
    }
    if (normalized.includes('center')) {
      return 'profile';
    }
    return 'other';
  }

  private isTemplateCategoryKey(value: string): boolean {
    return /^[a-z0-9][a-z0-9._-]*$/i.test(value) && !this.hasCjkText(value);
  }
}
