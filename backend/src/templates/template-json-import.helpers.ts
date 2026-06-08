import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  applyTemplateProfileOverride,
  buildTemplateProfile,
  isTemplateProfile,
  validateTemplateProfile,
} from '@shared/agent/runtime';
import { objectToRecord } from '@shared/theme-layout/documentBoundary';

import { isCssVarRecord, isNonEmptyString, isRecord, isStringRecord } from '../shared/type-guards';
import type { TemplateAgentConfigInput } from './repositories';
import type { TemplateSeedException } from './seed/templateSeed.data';
import { isTemplateCategoryKey, resolveDisplayCategoryFromKey } from './template-category.helpers';

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

/**
 * 校验导入模板的 profile 配置并返回最终采用的 generatedProfile。
 * 校验失败时把错误写入 issues 并返回 null（与原 importTemplateJsonFile 行为一致）。
 */
export function validateImportedTemplateProfile(
  preparedLayoutDocument: ThemeLayoutDocument,
  agentConfig: TemplateAgentConfigInput,
  issues: string[],
): { generatedProfile: Record<string, unknown> } | null {
  const generatedProfile =
    agentConfig.profileGenerated ?? objectToRecord(buildTemplateProfile(preparedLayoutDocument));
  let effectiveProfile = generatedProfile;
  if (agentConfig.profileOverride) {
    if (!isTemplateProfile(generatedProfile)) {
      issues.push('template profile generated config is malformed');
      return null;
    }
    effectiveProfile = objectToRecord(
      applyTemplateProfileOverride(generatedProfile, agentConfig.profileOverride),
    );
  }
  if (!isTemplateProfile(effectiveProfile)) {
    issues.push('template profile effective config is malformed');
    return null;
  }
  const profileValidation = validateTemplateProfile(preparedLayoutDocument, effectiveProfile);
  if (!profileValidation.valid) {
    issues.push(
      ...profileValidation.errors.map(
        (error) => `template profile ${error.path}: ${error.message}`,
      ),
    );
    return null;
  }
  return { generatedProfile };
}

export async function resolveTemplateJsonDirectory(
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

export async function readTemplateAgentConfigForImport(
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
  const sidecarConfigDirectory = await firstExistingDirectory([
    sidecarDirectory,
    byTemplateIdDirectory,
  ]);
  const sidecarConfig = sidecarConfigDirectory
    ? await readTemplateAgentConfigDirectory(sidecarConfigDirectory, issues)
    : {};
  const centralizedConfig = await readTemplateAgentConfigDirectory(
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

export async function readTemplateAgentConfigDirectory(
  directory: string,
  issues: string[],
  flatPrefixes: readonly string[] = [],
): Promise<TemplateAgentConfigInput> {
  if (!(await isDirectory(directory))) {
    return {};
  }
  const generated = await readOptionalJsonRecord(
    configFileCandidates(directory, 'profile.generated.json', flatPrefixes, [
      'generated',
      'profile.generated',
      'profileGenerated',
    ]),
    issues,
    'profile.generated.json',
  );
  const override = await readOptionalJsonRecord(
    configFileCandidates(directory, 'profile.override.json', flatPrefixes, [
      'override',
      'profile.override',
      'profileOverride',
    ]),
    issues,
    'profile.override.json',
  );
  const assets = await readOptionalJsonRecord(
    configFileCandidates(directory, 'assets.json', flatPrefixes, ['assets']),
    issues,
    'assets.json',
  );
  const permissions = await readOptionalJsonRecord(
    configFileCandidates(directory, 'permissions.json', flatPrefixes, ['permissions']),
    issues,
    'permissions.json',
  );
  const evaluation = await readOptionalJsonRecord(
    configFileCandidates(directory, 'evaluation.json', flatPrefixes, ['evaluation']),
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

export function configFileCandidates(
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

export function extractTemplateCategoryLabels(parsed: unknown): {
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

export async function firstExistingDirectory(
  directories: readonly string[],
): Promise<string | null> {
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

export async function readOptionalJsonRecord(
  filePathOrCandidates: string | readonly string[],
  issues: string[],
  label: string,
): Promise<Record<string, unknown> | undefined> {
  const filePath = await firstExistingFile(
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

export async function firstExistingFile(filePaths: readonly string[]): Promise<string | null> {
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

export async function isDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directory);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export function parseTemplateJsonSeed(
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
    'displayCategory',
  ] as const;
  requiredStrings.forEach((key) => {
    if (!isNonEmptyString(value[key])) {
      issues.push(`${key} must be a non-empty string.`);
    }
  });

  const traits = parseStringArray(value.traits, 'traits', issues);
  const tags = value.tags === undefined ? undefined : parseStringArray(value.tags, 'tags', issues);
  const platformCategories = parseCategoryArray(
    value.platformCategories,
    'platformCategories',
    PLATFORM_CATEGORIES,
    issues,
  );
  const functionalCategories = parseCategoryArray(
    value.functionalCategories,
    'functionalCategories',
    FUNCTIONAL_CATEGORIES,
    issues,
    { strict: false },
  );
  const displayCategory = isNonEmptyString(value.displayCategory)
    ? String(value.displayCategory).trim()
    : resolveDisplayCategoryFromKey(isNonEmptyString(value.category) ? value.category : '');

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
  if (isNonEmptyString(value.category) && !isTemplateCategoryKey(value.category)) {
    issues.push('category must be an English slug key.');
  }
  if (isNonEmptyString(displayCategory) && !isTemplateCategoryKey(displayCategory)) {
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

export function parseStringArray(value: unknown, fieldName: string, issues: string[]): string[] {
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

export function parseCategoryArray(
  value: unknown,
  fieldName: string,
  allowedValues: Set<string>,
  issues: string[],
  options: { strict?: boolean } = {},
): string[] {
  const strings = parseStringArray(value, fieldName, issues);
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

export async function resolveImportedTemplateConfigPrefixes(filePath: string): Promise<string[]> {
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

export async function resolveImportedTemplateSidecarDirectories(
  filePath: string,
): Promise<string[]> {
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

export function isFsErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code,
  );
}

export async function writeTemplateValidationLog(
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
  await fs.writeFile(templateValidationLogPath(filePath), content, 'utf8');
}

export async function removeTemplateValidationLog(filePath: string): Promise<void> {
  try {
    await fs.unlink(templateValidationLogPath(filePath));
  } catch {
    // 没有旧校验日志需要删除。
  }
}

export function templateValidationLogPath(filePath: string): string {
  return path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}.validation.log`);
}

export async function deleteImportedTemplateSidecars(filePath: string): Promise<void> {
  await deleteImportedTemplateCentralizedConfigs(filePath);
  const directories = await resolveImportedTemplateSidecarDirectories(filePath);
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
        if (!isFsErrorCode(error, 'ENOENT')) {
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
      if (!isFsErrorCode(error, 'ENOENT') && !isFsErrorCode(error, 'ENOTEMPTY')) {
        console.warn(
          `[TemplatesService] Could not remove imported sidecar directory ${directory}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

export async function deleteImportedTemplateCentralizedConfigs(filePath: string): Promise<void> {
  const configDirectory = path.join(path.dirname(filePath), 'configs');
  const prefixes = await resolveImportedTemplateConfigPrefixes(filePath);
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
        if (!isFsErrorCode(error, 'ENOENT')) {
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
    if (!isFsErrorCode(error, 'ENOENT') && !isFsErrorCode(error, 'ENOTEMPTY')) {
      console.warn(
        `[TemplatesService] Could not remove imported config directory ${configDirectory}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
