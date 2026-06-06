import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  applyTemplateProfileOverride,
  buildTemplateProfile,
  isTemplateProfile,
} from '@shared/agent/runtime';
import { objectToRecord, themeLayoutDocumentToRecord } from '@shared/theme-layout/documentBoundary';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';

import { deriveTags } from '../shared/deriveTags';
import type { Template } from './entities/template.entity';
import type { TemplateAgentConfigInput } from './repositories';
import { assertTemplateCategoryKey, buildTemplateSearchText } from './templateCategory.helpers';

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

export interface TemplateAgentConfigDto {
  profileGenerated: Record<string, unknown> | null;
  profileOverride: Record<string, unknown> | null;
  effectiveProfile: Record<string, unknown> | null;
  assets: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
}

interface TemplateAgentConfigRecords {
  profileGenerated?: Record<string, unknown> | null;
  profileOverride?: Record<string, unknown> | null;
  assets?: Record<string, unknown> | null;
  permissions?: Record<string, unknown> | null;
  evaluation?: Record<string, unknown> | null;
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

export function templateLayoutDocument(
  template: Pick<Template, 'layoutDocument'>,
): ThemeLayoutDocument {
  return migrateThemeLayoutDocument(template.layoutDocument);
}

/**
 * 从持久化的 agent 配置记录构建对外的 DTO，包含派生的 effectiveProfile。
 */
export function buildTemplateAgentConfigDto(
  records: TemplateAgentConfigRecords,
  layoutDocument: ThemeLayoutDocument,
): TemplateAgentConfigDto {
  const generatedProfile =
    records.profileGenerated ?? objectToRecord(buildTemplateProfile(layoutDocument));
  const profileOverrideRecord = records.profileOverride ?? null;
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
    assets: records.assets ?? null,
    permissions: records.permissions ?? null,
    evaluation: records.evaluation ?? null,
  };
}

/**
 * 构建复制模板时写入目标模板的 agent 配置载荷（仅保留存在的字段）。
 */
export function buildCopiedAgentConfigInput(
  records: TemplateAgentConfigRecords,
): TemplateAgentConfigInput {
  return {
    ...(records.profileGenerated && { profileGenerated: records.profileGenerated }),
    ...(records.profileOverride && { profileOverride: records.profileOverride }),
    ...(records.assets && { assets: records.assets }),
    ...(records.permissions && { permissions: records.permissions }),
    ...(records.evaluation && { evaluation: records.evaluation }),
  };
}

export function buildGeneratedProfileInput(
  layoutDocument: ThemeLayoutDocument,
): TemplateAgentConfigInput {
  return { profileGenerated: objectToRecord(buildTemplateProfile(layoutDocument)) };
}

/**
 * 将生成模板的输入应用到 Template 实体上（行为与原 applyGeneratedTemplateInput 一致）。
 */
export function applyGeneratedTemplateInput(
  template: Template,
  input: SaveGeneratedTemplateInput,
): void {
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
  template.searchText = buildTemplateSearchText(template);
  template.cssVars = input.cssVars;
  template.cssAnimations = input.cssAnimations ?? null;
  template.componentTemplates = input.componentTemplates;
  template.layoutDocument = withThemeLayoutStyleManifest(input.layoutDocument, input.cssVars);
  template.ownerUserId ??= null;
  template.sourceTemplateId ??= null;
  template.isPublic = false;
}

/**
 * 将 UpdateOwnedTemplateInput 中存在的字段应用到 Template 实体上，并校验分类键。
 * 行为与原 updateOwned 内联赋值逻辑一致。
 */
export function applyOwnedTemplateUpdate(
  template: Template,
  input: UpdateOwnedTemplateInput,
  preparedLayoutDocument: ThemeLayoutDocument | null,
): void {
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
    assertTemplateCategoryKey(input.category, 'category');
    template.category = input.category;
  }
  if (input.displayCategory !== undefined) {
    assertTemplateCategoryKey(input.displayCategory, 'displayCategory');
    template.displayCategory = input.displayCategory;
  }
  if (input.platformCategories !== undefined) {
    input.platformCategories.forEach((category) =>
      assertTemplateCategoryKey(category, 'platformCategories'),
    );
    template.platformCategories = [...input.platformCategories];
  }
  if (input.functionalCategories !== undefined) {
    input.functionalCategories.forEach((category) =>
      assertTemplateCategoryKey(category, 'functionalCategories'),
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

  template.searchText = buildTemplateSearchText(template);
}

export async function createAvailableGeneratedTemplateId(
  baseTemplateId: string,
  ownerUserId: string,
  existsByTemplateId: (templateId: string) => Promise<boolean>,
): Promise<string> {
  const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
  const base = baseTemplateId.trim() || 'ai-template';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}${
      attempt ? `-${attempt}` : ''
    }`;
    const exists = await existsByTemplateId(candidate);
    if (!exists) {
      return candidate;
    }
  }

  return `${base}-ai-${ownerPrefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
