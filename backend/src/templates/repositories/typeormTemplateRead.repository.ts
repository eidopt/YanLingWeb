import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { IsNull, Repository } from 'typeorm';

import { Template } from '../entities/template.entity';
import type {
  TemplateAccessibleIdentity,
  TemplateDiversitySummaryRecord,
  TemplatePublishSnapshot,
  TemplateReadRepository,
  TemplateSearchRecord,
} from './templateRead.repository';

@Injectable()
export class TypeOrmTemplateReadRepository implements TemplateReadRepository {
  constructor(
    @InjectRepository(Template)
    private readonly repo: Repository<Template>,
  ) {}

  async searchPublicTemplates(input: {
    keywords: string[];
    categories: string[];
    limit: number;
  }): Promise<TemplateSearchRecord[]> {
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.isPublic = :isPublic', { isPublic: true });

    if (input.keywords.length > 0) {
      const conditions: string[] = [];
      const params: Record<string, string> = {};

      input.keywords.forEach((kw, i) => {
        const param = `kw${i}`;
        params[param] = `%${kw}%`;
        conditions.push(
          `(LOWER(t.name) LIKE :${param}` +
            ` OR LOWER(t.tagline) LIKE :${param}` +
            ` OR LOWER(t.searchText) LIKE :${param})`,
        );
      });

      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    if (input.categories.length > 0) {
      qb.addSelect(
        [
          'CASE WHEN t.displayCategory IN (:...cats)',
          'OR t.primaryFunctionalCategory IN (:...cats)',
          'THEN 0 ELSE 1 END',
        ].join(' '),
        'category_boost',
      );
      qb.setParameter('cats', input.categories);
      qb.orderBy('category_boost', 'ASC');
    } else {
      qb.orderBy('t.createdAt', 'DESC');
    }

    return qb.limit(input.limit).getMany();
  }

  async findDiversitySummaries(input: {
    displayCategory?: string;
    limit: number;
  }): Promise<TemplateDiversitySummaryRecord[]> {
    const where: Record<string, unknown> = { isPublic: true };
    if (input.displayCategory) {
      where.displayCategory = input.displayCategory;
    }
    const templates = await this.repo.find({
      where,
      take: input.limit,
      order: { updatedAt: 'DESC' },
    });
    return templates.map((template) => ({
      templateId: template.templateId,
      name: template.name,
      displayCategory: template.displayCategory,
      traits: template.traits,
      componentTemplates: template.componentTemplates,
      cssVars: template.cssVars,
      accent: template.accent,
    }));
  }

  async findOwnedPublishSnapshot(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplatePublishSnapshot | null> {
    const template = await this.repo.findOne({
      where: { ownerUserId, templateId },
    });
    if (!template) {
      return null;
    }
    return {
      templateId: template.templateId,
      name: template.name,
      description: template.description,
      accent: template.accent,
      category: template.category,
      cssVars: template.cssVars,
      cssAnimations: template.cssAnimations,
      componentTemplates: template.componentTemplates,
      layoutDocument: migrateThemeLayoutDocument(template.layoutDocument),
    };
  }

  async findAccessibleIdentity(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateAccessibleIdentity | null> {
    const template = await this.repo.findOne({
      where: [
        { templateId, ownerUserId },
        { templateId, ownerUserId: IsNull(), isPublic: true },
      ],
      select: {
        templateId: true,
        sourceTemplateId: true,
      },
    });
    if (!template) {
      return null;
    }
    return {
      templateId: template.templateId,
      sourceTemplateId: template.sourceTemplateId,
    };
  }
}
