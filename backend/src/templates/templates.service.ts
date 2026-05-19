import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DatabaseFlushService } from '../database/database-flush.service';
import { Template } from './entities/template.entity';
import { TEMPLATE_SEED_DATA } from './seed/template-seed.data';

interface TemplateListOptions {
  category?: string;
  search?: string;
}

export interface UpdateOwnedTemplateInput {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
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
    private readonly databaseFlush: DatabaseFlushService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repo.upsert(
      TEMPLATE_SEED_DATA.map((data) =>
        this.repo.create({
          ownerUserId: null,
          sourceTemplateId: null,
          isPublic: true,
          tags: this.deriveTags(data),
          ...data,
        }),
      ) as never,
      { conflictPaths: ['templateId'], skipUpdateIfNoValuesChanged: true },
    );
    await this.databaseFlush.flush('template seed sync');
  }

  async findMarketplace(
    options: TemplateListOptions = {},
  ): Promise<{ data: Template[]; total: number; }> {
    const records = await this.repo.find({
      where: { isPublic: true },
      order: { createdAt: 'ASC' },
    });
    const data = this.filterTemplates(records, options);
    return { data, total: data.length };
  }

  async findOwned(
    ownerUserId: string,
    options: TemplateListOptions = {},
  ): Promise<{ data: Template[]; total: number; }> {
    const records = await this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
    const data = this.filterTemplates(records, options);
    return { data, total: data.length };
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
      where: { templateId, isPublic: true },
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
      traits: [...source.traits],
      tags: this.deriveTags(source),
      cssVars: { ...source.cssVars },
      cssAnimations: source.cssAnimations ? { ...source.cssAnimations } : null,
      componentTemplates: structuredClone(source.componentTemplates),
      layoutDocument: structuredClone(source.layoutDocument),
    });

    const saved = await this.repo.save(copy);
    await this.databaseFlush.flush('template duplication');
    return saved;
  }

  async updateOwned(
    ownerUserId: string,
    templateId: string,
    input: UpdateOwnedTemplateInput,
  ): Promise<Template> {
    const template = await this.findOwnedByTemplateId(ownerUserId, templateId);

    if (input.name !== undefined) { template.name = input.name; }
    if (input.tagline !== undefined) { template.tagline = input.tagline; }
    if (input.description !== undefined) {
      template.description = input.description;
    }
    if (input.category !== undefined) { template.category = input.category; }
    if (input.traits !== undefined) { template.traits = input.traits; }
    if (input.tags !== undefined) { template.tags = input.tags; }
    if (input.cssVars !== undefined) { template.cssVars = input.cssVars; }
    if (input.cssAnimations !== undefined) {
      template.cssAnimations = input.cssAnimations;
    }
    if (input.componentTemplates !== undefined) {
      template.componentTemplates = input.componentTemplates;
    }
    if (input.layoutDocument !== undefined) {
      template.layoutDocument = input.layoutDocument;
    }

    if (!template.tags.length) {
      template.tags = this.deriveTags(template);
    }

    const saved = await this.repo.save(template);
    await this.databaseFlush.flush('template update');
    return saved;
  }

  private filterTemplates(
    templates: Template[],
    options: TemplateListOptions,
  ): Template[] {
    const category = options.category?.trim();
    const query = options.search?.trim().toLowerCase();

    return templates.filter((template) => {
      if (category && template.category !== category) {
        return false;
      }
      if (!query) {
        return true;
      }

      return this.searchText(template).includes(query);
    });
  }

  private searchText(template: Pick<
    Template,
    | 'templateId'
    | 'name'
    | 'tagline'
    | 'description'
    | 'category'
    | 'traits'
    | 'tags'
  >): string {
    return [
      template.templateId,
      template.name,
      template.tagline,
      template.description,
      template.category,
      ...template.traits,
      ...template.tags,
    ].join(' ').toLowerCase();
  }

  private deriveTags(template: Pick<
    Template,
    'templateId' | 'name' | 'tagline' | 'description' | 'category' | 'traits'
  > & { tags?: string[]; }): string[] {
    const values = [
      template.templateId,
      template.name,
      template.tagline,
      template.description,
      template.category,
      ...template.traits,
      ...(template.tags ?? []),
    ];

    return [...new Set(
      values
        .flatMap((value) => String(value).split(/[\s,，、/|]+/))
        .map((value) => value.trim())
        .filter(Boolean),
    )];
  }

  private createUserTemplateId(sourceTemplateId: string, ownerUserId: string) {
    const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
    return `${sourceTemplateId}-copy-${ownerPrefix}-${Date.now().toString(36)}`;
  }
}
