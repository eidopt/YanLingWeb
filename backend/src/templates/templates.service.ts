import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { Template } from './entities/template.entity';
import { TEMPLATE_SEED_DATA, type TemplateSeedException } from './seed/template-seed.data';
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

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(Template)
    private readonly repo: Repository<Template>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
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
    const importedTemplateFiles = await this.importTemplateJsonDirectory();
    await this.repairLegacyOwnedCopies();
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
    return { data, total };
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
    return { data, total };
  }

  async findRecentOwned(
    ownerUserId: string,
    limit = 6,
  ): Promise<Template[]> {
    return this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  async findByTemplateId(templateId: string): Promise<Template> {
    const template = await this.repo.findOne({
      where: { templateId, ownerUserId: IsNull(), isPublic: true },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return template;
  }

  async findOwnedByTemplateId(
    ownerUserId: string,
    templateId: string,
  ): Promise<Template> {
    const template = await this.repo.findOne({
      where: { templateId, ownerUserId },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateId}" not found`);
    }
    return template;
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

    return this.repo.save(copy);
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
    if (input.category !== undefined) { template.category = input.category; }
    if (input.platformCategories !== undefined) {
      template.platformCategories = [...input.platformCategories];
    }
    if (input.functionalCategories !== undefined) {
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

    return this.repo.save(template);
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

    try {
      const layoutDocument = prepareTemplateLayoutForPersistence({
        layoutDocument: data.layoutDocument,
        componentTemplates: data.componentTemplates,
        cssVars: data.cssVars,
      }) as unknown as Record<string, unknown>;
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
      await this.removeTemplateValidationLog(filePath);
      return true;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      await this.writeTemplateValidationLog(filePath, issues);
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
  ): string[] {
    const strings = this.parseStringArray(value, fieldName, issues);
    strings.forEach((item) => {
      if (!allowedValues.has(item)) {
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
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(
          `[TemplatesService] Imported template JSON but could not delete ${filePath}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
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
