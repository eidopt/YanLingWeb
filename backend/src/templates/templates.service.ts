import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { objectToRecord, themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';
import { mergeVisualAssetsIntoManifest } from '@shared/theme-layout/visualAssets';

import { ConfigService } from '../config/config.service';
import { deriveTags } from '../shared/deriveTags';
import { isRecord } from '../shared/typeGuards';
import { UserQuotaService } from '../users/services/userQuota.service';
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
import {
  applyGeneratedTemplateInput,
  applyOwnedTemplateUpdate,
  buildCopiedAgentConfigInput,
  buildGeneratedProfileInput,
  buildTemplateAgentConfigDto,
  createAvailableGeneratedTemplateId,
  type SaveGeneratedTemplateInput,
  type TemplateAgentConfigDto,
  templateLayoutDocument,
  type UpdateOwnedTemplateInput,
} from './templateAgentConfig.helpers';
import { TemplateAssetService } from './templateAsset.service';
import {
  assertTemplateCategoryKey,
  buildTemplateSearchText,
  createUserTemplateId,
} from './templateCategory.helpers';
import { TemplateCategoryRegistryService } from './templateCategoryRegistry.service';
import {
  deleteImportedTemplateSidecars,
  extractTemplateCategoryLabels,
  isPersistentTemplateJsonImportPath,
  parseTemplateJsonSeed,
  readTemplateAgentConfigForImport,
  removeTemplateValidationLog,
  resolveTemplateJsonDirectories,
  validateImportedTemplateProfile,
  writeTemplateValidationLog,
} from './templateJsonImport.helpers';
import { prepareTemplateLayoutForPersistence } from './templateLayoutValidation';
import {
  ensureGeneratedProfilesForExistingTemplates,
  repairLegacyOwnedCopies,
  repairTemplateCategoryKeys,
  seedBuiltinTemplates,
} from './templateMaintenance.helpers';

export type { SaveGeneratedTemplateInput, TemplateAgentConfigDto, UpdateOwnedTemplateInput };

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
    @Optional() private readonly userQuota?: UserQuotaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await seedBuiltinTemplates(this.templates, this.categoryRegistry, (templateId, input) =>
      this.upsertTemplateAgentConfig(templateId, input),
    );
    const importedTemplateFiles = await this.importTemplateJsonDirectory();
    await repairLegacyOwnedCopies(this.templates);
    await repairTemplateCategoryKeys(this.templates, this.categoryRegistry);
    await ensureGeneratedProfilesForExistingTemplates(
      this.templates,
      (template, overwrite, store) =>
        this.saveGeneratedProfileForTemplate(template, overwrite, store),
    );
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
        ? await this.resolveOwnedVisualAssets(ownerUserId, template.templateId, input, template)
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

    applyOwnedTemplateUpdate(template, input, preparedLayoutDocument);
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

    const allocation = await this.allocateGeneratedTemplateId(ownerUserId, input.templateId);
    const existing = allocation.existing;
    const targetTemplateId = allocation.templateId;
    await this.assertImageSpendAllowed(ownerUserId);
    const assetResolution = await this.templateAssetService.resolveVisualAssetsForTemplate(
      targetTemplateId,
      themeLayoutDocumentToRecord(preparedLayout),
      input.visualAssets,
      { signUrls: true },
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
      const current = await store.findByTemplateId(target.templateId);
      if (current && current.ownerUserId !== ownerUserId) {
        throw new ConflictException('模板 ID 已被占用，请重试');
      }
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

  private async resolveOwnedVisualAssets(
    ownerUserId: string,
    templateId: string,
    input: UpdateOwnedTemplateInput,
    template: Template,
  ) {
    await this.assertImageSpendAllowed(ownerUserId);
    return this.templateAssetService.resolveVisualAssetsForTemplate(
      templateId,
      input.layoutDocument ?? template.layoutDocument,
      input.visualAssets,
      { signUrls: template.isPublic !== true },
    );
  }

  private async assertImageSpendAllowed(ownerUserId: string): Promise<void> {
    if (!this.config.ai.imageGenerationEnabled || !this.config.ai.materializeImages) {
      return;
    }
    await this.userQuota?.assertTokenBalance(ownerUserId);
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
    return buildTemplateAgentConfigDto(records, templateLayoutDocument(template));
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

    await this.upsertTemplateAgentConfig(
      template.templateId,
      buildGeneratedProfileInput(templateLayoutDocument(template)),
      store,
    );
  }

  private async copyTemplateAgentConfig(
    sourceTemplateId: string,
    targetTemplateId: string,
    store: TemplatePersistenceStore = this.templates,
  ): Promise<void> {
    const records = await store.findAgentConfig(sourceTemplateId);
    await this.upsertTemplateAgentConfig(
      targetTemplateId,
      buildCopiedAgentConfigInput(records),
      store,
    );
  }

  private async upsertTemplateAgentConfig(
    templateId: string,
    input: TemplateAgentConfigInput,
    store: TemplatePersistenceStore = this.templates,
  ): Promise<void> {
    await store.upsertAgentConfig(templateId, input);
  }

  private createUserTemplateId(sourceTemplateId: string, ownerUserId: string) {
    return createUserTemplateId(sourceTemplateId, ownerUserId);
  }

  private async allocateGeneratedTemplateId(
    ownerUserId: string,
    requestedId: string,
  ): Promise<{ templateId: string; existing: Template | null }> {
    return this.templates.runInTransaction(async (store) => {
      const existing = await store.findByTemplateId(requestedId);
      if (!existing || existing.ownerUserId === ownerUserId) {
        return { templateId: existing?.templateId ?? requestedId, existing };
      }
      const templateId = await createAvailableGeneratedTemplateId(
        requestedId,
        ownerUserId,
        (candidate) => store.existsByTemplateId(candidate),
      );
      return { templateId, existing: null };
    });
  }

  private async createAvailableGeneratedTemplateId(
    baseTemplateId: string,
    ownerUserId: string,
  ): Promise<string> {
    return createAvailableGeneratedTemplateId(baseTemplateId, ownerUserId, (templateId) =>
      this.templates.existsByTemplateId(templateId),
    );
  }

  private applyGeneratedTemplateInput(template: Template, input: SaveGeneratedTemplateInput): void {
    applyGeneratedTemplateInput(template, input);
  }

  private assertGeneratedTemplateCategoryKeys(input: SaveGeneratedTemplateInput): void {
    assertTemplateCategoryKey(input.category, 'category');
    if (input.displayCategory) {
      assertTemplateCategoryKey(input.displayCategory, 'displayCategory');
    }
    input.platformCategories?.forEach((category) =>
      assertTemplateCategoryKey(category, 'platformCategories'),
    );
    input.functionalCategories?.forEach((category) =>
      assertTemplateCategoryKey(category, 'functionalCategories'),
    );
  }

  private async importTemplateJsonDirectory(): Promise<string[]> {
    const importConfig = this.config.templates.jsonImport;
    if (!importConfig.enabled) {
      return [];
    }

    const directories = await resolveTemplateJsonDirectories(importConfig.directory);
    if (!directories.length) {
      return [];
    }

    const importedFiles: string[] = [];
    for (const directory of directories) {
      importedFiles.push(...(await this.importTemplateJsonFilesFromDirectory(directory)));
    }

    return importedFiles;
  }

  private async importTemplateJsonFilesFromDirectory(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    let jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .filter(
        (entry) =>
          !entry.name.endsWith('.validation.log') &&
          entry.name !== 'importSkipList.json' &&
          entry.name !== 'import-skip-list.json',
      )
      .map((entry) => path.join(directory, entry.name))
      .sort();

    const skipListPath = path.join(directory, 'importSkipList.json');
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

  private async importTemplateJsonFile(filePath: string): Promise<boolean> {
    const issues: string[] = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      issues.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      await writeTemplateValidationLog(filePath, issues);
      return false;
    }

    const data = parseTemplateJsonSeed(parsed, issues);
    if (!data) {
      await writeTemplateValidationLog(filePath, issues);
      return false;
    }
    const agentConfig = await readTemplateAgentConfigForImport(
      filePath,
      data.templateId,
      parsed,
      issues,
    );
    if (issues.length) {
      await writeTemplateValidationLog(filePath, issues);
      return false;
    }

    try {
      await this.categoryRegistry.ensureTemplateCategories(
        {
          ...data,
          ...extractTemplateCategoryLabels(parsed),
        },
        { requireLabelsForUnknown: true },
      );
      // visualAssets 既可能在 JSON 顶层（旧约定），也可能嵌在 layoutDocument 内
      // （ThemeLayoutDocument 模型 + CLI buildOutputJson 的位置）。两处都兜底读取，
      // 否则导入时拿不到 visualAssets → core.image 不会被补 src/iconColor → 全是灰占位。
      const topLevelVisualAssets = isRecord(parsed) ? parsed.visualAssets : undefined;
      const nestedVisualAssets = (data.layoutDocument as { visualAssets?: unknown }).visualAssets;
      const assetResolution = await this.templateAssetService.resolveVisualAssetsForTemplate(
        data.templateId,
        data.layoutDocument,
        topLevelVisualAssets ?? nestedVisualAssets,
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
      const profileResult = validateImportedTemplateProfile(
        preparedLayoutDocument,
        agentConfig,
        issues,
      );
      if (!profileResult) {
        await writeTemplateValidationLog(filePath, issues);
        return false;
      }
      const { generatedProfile } = profileResult;
      const tags = deriveTags(data);
      await this.templates.upsertTemplates([
        this.templates.createTemplate({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
          tags,
          searchText: buildTemplateSearchText({ ...data, tags }),
          ...data,
          layoutDocument,
        }),
      ]);
      await this.upsertTemplateAgentConfig(data.templateId, {
        ...agentConfig,
        ...(assetManifest ? { assets: assetManifest } : {}),
        profileGenerated: generatedProfile,
      });
      await removeTemplateValidationLog(filePath);
      return true;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      await writeTemplateValidationLog(filePath, issues);
      return false;
    }
  }

  private async deleteImportedTemplateJsonFiles(filePaths: string[]): Promise<void> {
    if (!this.config.templates.jsonImport.deleteAfterImport) {
      return;
    }
    for (const filePath of filePaths) {
      if (isPersistentTemplateJsonImportPath(filePath)) {
        continue;
      }
      try {
        await deleteImportedTemplateSidecars(filePath);
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(
          `[TemplatesService] Imported template JSON but could not delete ${filePath}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}
