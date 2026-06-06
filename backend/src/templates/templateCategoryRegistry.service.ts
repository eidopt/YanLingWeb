import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { isRecord, isStringRecord } from '../shared/typeGuards';

type CategoryKind =
  | 'categories'
  | 'displayCategories'
  | 'platformCategories'
  | 'functionalCategories';

export interface TemplateCategoryLabels {
  categoryLabel: string;
  displayCategoryLabel: string;
  platformCategoryLabels: Record<string, string>;
  functionalCategoryLabels: Record<string, string>;
}

export interface TemplateCategoryRegistrationInput {
  category?: string | null;
  categoryLabel?: string | null;
  categoryLabels?: Record<string, string> | null;
  displayCategory?: string | null;
  displayCategoryLabel?: string | null;
  displayCategoryLabels?: Record<string, string> | null;
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
  displayCategories: Record<string, string>;
  platformCategories: Record<string, string>;
  functionalCategories: Record<string, string>;
}

const EMPTY_REGISTRY: TemplateCategoryRegistry = {
  version: 1,
  categories: {},
  displayCategories: {},
  platformCategories: {},
  functionalCategories: {},
};

@Injectable()
export class TemplateCategoryRegistryService {
  private readonly logger = new Logger(TemplateCategoryRegistryService.name);
  private registry: TemplateCategoryRegistry | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private get registryPath(): string {
    return path.resolve(process.cwd(), 'data', 'templateCategoryLabels.json');
  }

  async decorateTemplate<T extends TemplateCategoryRegistrationInput>(
    template: T,
  ): Promise<T & TemplateCategoryLabels> {
    return Object.assign(template, await this.getLabels(template));
  }

  async getLabels(input: TemplateCategoryRegistrationInput): Promise<TemplateCategoryLabels> {
    const registry = await this.loadRegistry();
    const category = this.normalizeCategoryKey(input.category) || 'general';
    const displayCategory =
      this.normalizeCategoryKey(input.displayCategory) || category || 'general';
    const platformCategories = this.normalizeArray(input.platformCategories);
    const functionalCategories = this.normalizeArray(input.functionalCategories);

    return {
      categoryLabel: this.labelFor(registry, 'categories', category),
      displayCategoryLabel: this.labelFor(registry, 'displayCategories', displayCategory),
      platformCategoryLabels: this.labelMapFor(registry, 'platformCategories', platformCategories),
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
    const category = this.normalizeCategoryKey(input.category);
    if (category) {
      changed =
        this.ensureLabel(
          registry,
          'categories',
          category,
          this.pickExplicitLabel(input.categoryLabel, input.categoryLabels, category),
          options,
        ) || changed;
    }

    const displayCategory = this.normalizeCategoryKey(input.displayCategory);
    if (displayCategory) {
      changed =
        this.ensureLabel(
          registry,
          'displayCategories',
          displayCategory,
          this.pickExplicitLabel(
            input.displayCategoryLabel,
            input.displayCategoryLabels,
            displayCategory,
          ),
          options,
        ) || changed;
    }

    for (const platformCategory of this.normalizeArray(input.platformCategories)) {
      changed =
        this.ensureLabel(
          registry,
          'platformCategories',
          platformCategory,
          this.pickExplicitLabel(undefined, input.platformCategoryLabels, platformCategory),
          options,
        ) || changed;
    }

    for (const functionalCategory of this.normalizeArray(input.functionalCategories)) {
      const functionalLabel =
        this.pickExplicitLabel(undefined, input.functionalCategoryLabels, functionalCategory) ??
        (functionalCategory === category
          ? this.pickExplicitLabel(input.categoryLabel, input.categoryLabels, functionalCategory)
          : undefined);
      changed =
        this.ensureLabel(
          registry,
          'functionalCategories',
          functionalCategory,
          functionalLabel,
          options,
        ) || changed;
      if (!category || category === functionalCategory) {
        changed =
          this.ensureLabel(
            registry,
            'categories',
            functionalCategory,
            this.pickExplicitLabel(input.categoryLabel, input.categoryLabels, functionalCategory) ??
              functionalLabel,
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
    return Object.fromEntries(keys.map((key) => [key, this.labelFor(registry, kind, key)]));
  }

  private labelFor(registry: TemplateCategoryRegistry, kind: CategoryKind, key: string): string {
    return registry[kind][key] ?? this.humanizeCategoryKey(key);
  }

  private ensureLabel(
    registry: TemplateCategoryRegistry,
    kind: CategoryKind,
    key: string,
    explicitLabel: string | undefined,
    options: TemplateCategoryRegistrationOptions,
  ): boolean {
    if (!this.isRegistryKey(key)) {
      return false;
    }
    const existingLabel = Object.prototype.hasOwnProperty.call(registry[kind], key)
      ? registry[kind][key]
      : undefined;
    if (!existingLabel && !explicitLabel && options.requireLabelsForUnknown) {
      throw new BadRequestException(
        `${kind}.${key} requires a Chinese label before it can be registered.`,
      );
    }
    const label = explicitLabel ?? existingLabel ?? this.humanizeCategoryKey(key);
    if (existingLabel === label) {
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
          displayCategories: isStringRecord(parsed.displayCategories)
            ? parsed.displayCategories
            : undefined,
          platformCategories: isStringRecord(parsed.platformCategories)
            ? parsed.platformCategories
            : undefined,
          functionalCategories: isStringRecord(parsed.functionalCategories)
            ? parsed.functionalCategories
            : undefined,
        };
      }
    } catch (error) {
      if (!this.isFsErrorCode(error, 'ENOENT')) {
        this.logger.warn(
          `Could not read template category registry: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.registry = {
      version: fileRegistry.version ?? EMPTY_REGISTRY.version,
      categories: this.sanitizeRegistryMap(fileRegistry.categories),
      displayCategories: this.sanitizeRegistryMap(fileRegistry.displayCategories),
      platformCategories: this.sanitizeRegistryMap(fileRegistry.platformCategories),
      functionalCategories: this.sanitizeRegistryMap(fileRegistry.functionalCategories),
    };
    await this.saveRegistry(this.registry);
    return this.registry;
  }

  private async saveRegistry(registry: TemplateCategoryRegistry): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
      await fs.writeFile(this.registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    });
    await this.writeQueue;
  }

  private pickExplicitLabel(
    directLabel: string | null | undefined,
    labelMap: Record<string, string> | null | undefined,
    key: string,
  ): string | undefined {
    return this.normalizeLabel(directLabel) ?? this.normalizeLabel(labelMap?.[key]);
  }

  private normalizeCategoryKey(value: string | null | undefined): string {
    const normalized = this.normalizeKey(value).toLowerCase().replace(/\s+/g, '-');
    return this.isRegistryKey(normalized) ? normalized : '';
  }

  private normalizeKey(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeLabel(value: string | null | undefined): string | undefined {
    const normalized = this.normalizeKey(value);
    if (!normalized || /^\?+$/.test(normalized)) {
      return undefined;
    }
    return normalized;
  }

  private normalizeArray(value: readonly string[] | null | undefined): string[] {
    return (value ?? []).map((item) => this.normalizeCategoryKey(item)).filter(Boolean);
  }

  private sanitizeRegistryMap(value: Record<string, string> | undefined): Record<string, string> {
    return Object.fromEntries(
      Object.entries(value ?? {})
        .map(
          ([key, label]) => [this.normalizeCategoryKey(key), this.normalizeLabel(label)] as const,
        )
        .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
    );
  }

  private isRegistryKey(key: string): boolean {
    return /^[a-z0-9][a-z0-9._-]*$/i.test(key) && !/[\u4e00-\u9fff]/.test(key);
  }

  private humanizeCategoryKey(key: string): string {
    return (
      key
        .split(/[-_\s]+/)
        .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ''))
        .filter(Boolean)
        .join(' ') || key
    );
  }

  private isFsErrorCode(error: unknown, code: string): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
    );
  }
}
