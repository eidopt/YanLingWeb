import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { isRecord, isStringRecord } from '../shared/type-guards';

type CategoryKind = 'categories' | 'platformCategories' | 'functionalCategories';

export interface TemplateCategoryLabels {
  categoryLabel: string;
  platformCategoryLabels: Record<string, string>;
  functionalCategoryLabels: Record<string, string>;
}

export interface TemplateCategoryRegistrationInput {
  category?: string | null;
  categoryLabel?: string | null;
  categoryLabels?: Record<string, string> | null;
  platformCategories?: readonly string[] | null;
  platformCategoryLabels?: Record<string, string> | null;
  functionalCategories?: readonly string[] | null;
  functionalCategoryLabels?: Record<string, string> | null;
}

export interface TemplateCategoryRegistrationOptions {
  requireLabelsForUnknown?: boolean;
}

export interface TemplateCategoryRegistry {
  version: number;
  categories: Record<string, string>;
  platformCategories: Record<string, string>;
  functionalCategories: Record<string, string>;
}

const EMPTY_REGISTRY: TemplateCategoryRegistry = {
  version: 1,
  categories: {},
  platformCategories: {},
  functionalCategories: {},
};

@Injectable()
export class TemplateCategoryRegistryService {
  private readonly logger = new Logger(TemplateCategoryRegistryService.name);
  private registry: TemplateCategoryRegistry | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private get registryPath(): string {
    return path.resolve(process.cwd(), 'data', 'template-category-labels.json');
  }

  async decorateTemplate<T extends TemplateCategoryRegistrationInput>(
    template: T,
  ): Promise<T & TemplateCategoryLabels> {
    return Object.assign(template, await this.getLabels(template));
  }

  async getLabels(input: TemplateCategoryRegistrationInput): Promise<TemplateCategoryLabels> {
    const registry = await this.loadRegistry();
    const category = normalizeCategoryKey(input.category) || 'general';
    const platformCategories = normalizeArray(input.platformCategories);
    const functionalCategories = normalizeArray(input.functionalCategories);

    return {
      categoryLabel: this.labelFor(registry, 'categories', category),
      platformCategoryLabels: this.labelMapFor(
        registry,
        'platformCategories',
        platformCategories,
      ),
      functionalCategoryLabels: this.labelMapFor(
        registry,
        'functionalCategories',
        functionalCategories,
      ),
    };
  }

  async ensureTemplateCategories(
    input: TemplateCategoryRegistrationInput,
    options: TemplateCategoryRegistrationOptions = {},
  ): Promise<void> {
    const registry = await this.loadRegistry();
    let changed = false;
    const category = normalizeCategoryKey(input.category);
    if (category) {
      changed = this.ensureLabel(
        registry,
        'categories',
        category,
        pickExplicitLabel(input.categoryLabel, input.categoryLabels, category),
        options,
      ) || changed;
    }

    for (const platformCategory of normalizeArray(input.platformCategories)) {
      changed = this.ensureLabel(
        registry,
        'platformCategories',
        platformCategory,
        pickExplicitLabel(undefined, input.platformCategoryLabels, platformCategory),
        options,
      ) || changed;
    }

    for (const functionalCategory of normalizeArray(input.functionalCategories)) {
      const functionalLabel = pickExplicitLabel(
        undefined,
        input.functionalCategoryLabels,
        functionalCategory,
      ) ?? (
        functionalCategory === category
          ? pickExplicitLabel(input.categoryLabel, input.categoryLabels, functionalCategory)
          : undefined
      );
      changed = this.ensureLabel(
        registry,
        'functionalCategories',
        functionalCategory,
        functionalLabel,
        options,
      ) || changed;
      if (!category || category === functionalCategory) {
        changed = this.ensureLabel(
          registry,
          'categories',
          functionalCategory,
          pickExplicitLabel(input.categoryLabel, input.categoryLabels, functionalCategory)
            ?? functionalLabel,
          options,
        ) || changed;
      }
    }

    if (changed) {
      await this.saveRegistry(registry);
    }
  }

  private labelMapFor(
    registry: TemplateCategoryRegistry,
    kind: CategoryKind,
    keys: readonly string[],
  ): Record<string, string> {
    return Object.fromEntries(
      keys.map((key) => [key, this.labelFor(registry, kind, key)]),
    );
  }

  private labelFor(
    registry: TemplateCategoryRegistry,
    kind: CategoryKind,
    key: string,
  ): string {
    return registry[kind][key] ?? humanizeCategoryKey(key);
  }

  private ensureLabel(
    registry: TemplateCategoryRegistry,
    kind: CategoryKind,
    key: string,
    explicitLabel: string | undefined,
    options: TemplateCategoryRegistrationOptions,
  ): boolean {
    if (!isRegistryKey(key)) {
      return false;
    }
    if (!registry[kind][key] && !explicitLabel && options.requireLabelsForUnknown) {
      throw new BadRequestException(
        `${kind}.${key} requires a Chinese label before it can be registered.`,
      );
    }
    const label = explicitLabel ?? registry[kind][key] ?? humanizeCategoryKey(key);
    if (registry[kind][key] === label) {
      return false;
    }
    registry[kind][key] = label;
    return true;
  }

  private async loadRegistry(): Promise<TemplateCategoryRegistry> {
    if (this.registry) {
      return this.registry;
    }

    let fileRegistry: Partial<TemplateCategoryRegistry> = {};
    try {
      const parsed = JSON.parse(await fs.readFile(this.registryPath, 'utf8')) as unknown;
      if (isRecord(parsed)) {
        fileRegistry = {
          version: typeof parsed.version === 'number' ? parsed.version : undefined,
          categories: isStringRecord(parsed.categories) ? parsed.categories : undefined,
          platformCategories: isStringRecord(parsed.platformCategories)
            ? parsed.platformCategories
            : undefined,
          functionalCategories: isStringRecord(parsed.functionalCategories)
            ? parsed.functionalCategories
            : undefined,
        };
      }
    } catch (error) {
      if (!isFsErrorCode(error, 'ENOENT')) {
        this.logger.warn(
          `Could not read template category registry: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.registry = {
      version: fileRegistry.version ?? EMPTY_REGISTRY.version,
      categories: sanitizeRegistryMap(fileRegistry.categories),
      platformCategories: sanitizeRegistryMap(fileRegistry.platformCategories),
      functionalCategories: sanitizeRegistryMap(fileRegistry.functionalCategories),
    };
    await this.saveRegistry(this.registry);
    return this.registry;
  }

  private async saveRegistry(registry: TemplateCategoryRegistry): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
      await fs.writeFile(
        this.registryPath,
        `${JSON.stringify(registry, null, 2)}\n`,
        'utf8',
      );
    });
    await this.writeQueue;
  }
}

function pickExplicitLabel(
  directLabel: string | null | undefined,
  labelMap: Record<string, string> | null | undefined,
  key: string,
): string | undefined {
  return normalizeLabel(directLabel) ?? normalizeLabel(labelMap?.[key]);
}

function normalizeCategoryKey(value: string | null | undefined): string {
  const normalized = normalizeKey(value)
    .toLowerCase()
    .replace(/\s+/g, '-');
  return isRegistryKey(normalized) ? normalized : '';
}

function normalizeKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLabel(value: string | null | undefined): string | undefined {
  const normalized = normalizeKey(value);
  if (!normalized || /^\?+$/.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function normalizeArray(value: readonly string[] | null | undefined): string[] {
  return (value ?? [])
    .map((item) => normalizeCategoryKey(item))
    .filter(Boolean);
}

function sanitizeRegistryMap(
  value: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .map(([key, label]) => [normalizeCategoryKey(key), normalizeLabel(label)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  );
}

function isRegistryKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(key) && !/[\u4e00-\u9fff]/.test(key);
}

function humanizeCategoryKey(key: string): string {
  return key
    .split(/[-_\s]+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .filter(Boolean)
    .join(' ') || key;
}

function isFsErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code,
  );
}
