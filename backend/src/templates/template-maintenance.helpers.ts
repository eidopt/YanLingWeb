import { themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';

import { deriveTags } from '../shared/derive-tags';
import type { Template } from './entities/template.entity';
import type { TemplatePersistenceRepository, TemplatePersistenceStore } from './repositories';
import { TEMPLATE_SEED_DATA } from './seed/template-seed.data';
import { buildGeneratedProfileInput } from './template-agent-config.helpers';
import {
  buildTemplateSearchText,
  resolveDisplayCategoryFromKey,
  resolveTemplateCategoryKey,
  resolveTemplateDisplayCategoryKey,
} from './template-category.helpers';
import { TemplateCategoryRegistryService } from './template-category-registry.service';
import { prepareTemplateLayoutForPersistence } from './template-layout-validation';

/**
 * 写入内置种子模板（分类、模板实体、生成 profile）。行为与原 onModuleInit 一致。
 */
export async function seedBuiltinTemplates(
  templates: TemplatePersistenceRepository,
  categoryRegistry: TemplateCategoryRegistryService,
  upsertAgentConfig: (
    templateId: string,
    input: ReturnType<typeof buildGeneratedProfileInput>,
  ) => Promise<void>,
): Promise<void> {
  await Promise.all(
    TEMPLATE_SEED_DATA.map((data) => categoryRegistry.ensureTemplateCategories(data)),
  );
  await templates.upsertTemplates(
    TEMPLATE_SEED_DATA.map((data) => {
      const displayCategory = data.displayCategory ?? resolveDisplayCategoryFromKey(data.category);
      const tags = deriveTags(data);
      const layoutDocument = prepareTemplateLayoutForPersistence({
        layoutDocument: data.layoutDocument,
        componentTemplates: data.componentTemplates,
        cssVars: data.cssVars,
      });
      return templates.createTemplate({
        ownerUserId: null,
        sourceTemplateId: null,
        isPublic: true,
        primaryFunctionalCategory: data.functionalCategories?.[0] ?? null,
        displayCategory,
        tags,
        searchText: buildTemplateSearchText({ ...data, displayCategory, tags }),
        ...data,
        layoutDocument: themeLayoutDocumentToRecord(layoutDocument),
      });
    }),
  );
  await Promise.all(
    TEMPLATE_SEED_DATA.map((data) =>
      upsertAgentConfig(
        data.templateId,
        buildGeneratedProfileInput(
          prepareTemplateLayoutForPersistence({
            layoutDocument: data.layoutDocument,
            componentTemplates: data.componentTemplates,
            cssVars: data.cssVars,
          }),
        ),
      ),
    ),
  );
}

/**
 * 把历史遗留的、无 owner 的复制模板重新关联到对应用户。
 */
export async function repairLegacyOwnedCopies(
  templates: TemplatePersistenceRepository,
): Promise<void> {
  const userIds = await templates.findAllUserIds();
  if (!userIds.length) {
    return;
  }

  const ownerPrefixToUserId = new Map<string, string | null>();
  for (const userId of userIds) {
    const prefix = userId.replace(/-/g, '').slice(0, 8);
    ownerPrefixToUserId.set(prefix, ownerPrefixToUserId.has(prefix) ? null : userId);
  }

  const publicSourceIds = new Set(await templates.findPublicTemplateIds());

  const legacyCopies = await templates.findOwnerlessTemplates();

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
    await templates.saveTemplate(template);
  }
}

/**
 * 规范化模板分类键，并确保分类注册表里有对应条目。
 */
export async function repairTemplateCategoryKeys(
  templates: TemplatePersistenceRepository,
  categoryRegistry: TemplateCategoryRegistryService,
): Promise<void> {
  const allTemplates = await templates.findAllTemplates();
  for (const template of allTemplates) {
    let changed = false;
    const normalizedCategory = resolveTemplateCategoryKey(
      template.category,
      template.functionalCategories,
    );

    if (normalizedCategory && normalizedCategory !== template.category) {
      template.category = normalizedCategory;
      changed = true;
    }

    const normalizedDisplayCategory = resolveTemplateDisplayCategoryKey(
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

    await categoryRegistry.ensureTemplateCategories(template);
    if (changed) {
      await templates.saveTemplate(template);
    }
  }
}

/**
 * 为缺少生成 profile 的现有模板补齐 profile。
 */
export async function ensureGeneratedProfilesForExistingTemplates(
  templates: TemplatePersistenceRepository,
  saveGeneratedProfile: (
    template: Template,
    overwrite: boolean,
    store?: TemplatePersistenceStore,
  ) => Promise<void>,
): Promise<void> {
  const allTemplates = await templates.findAllTemplates();
  const existing = new Set(await templates.findExistingGeneratedProfileTemplateIds());

  for (const template of allTemplates) {
    if (existing.has(template.templateId)) {
      continue;
    }
    await saveGeneratedProfile(template, false);
  }
}
