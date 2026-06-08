/// <reference types="jest" />

import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import type { Repository } from 'typeorm';
import { IsNull } from 'typeorm';

import { Template } from '../entities/template.entity';
import { TypeOrmTemplateReadRepository } from './typeormTemplateRead.repository';

// Mock shapes expose only the methods the adapter touches, each typed as a plain
// `jest.Mock`. Typing them as bare jest mocks (rather than the bound TypeORM
// class methods) keeps `expect(fn).toHaveBeenCalledWith(...)` assertions free of
// the `@typescript-eslint/unbound-method` rule.
interface QueryBuilderMock {
  where: jest.Mock;
  andWhere: jest.Mock;
  addSelect: jest.Mock;
  setParameter: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  getMany: jest.Mock;
}

interface RepoMock {
  createQueryBuilder: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
}

/**
 * Builds a chainable query-builder mock. Every fluent builder method returns the
 * same builder instance so the adapter's chains resolve, and the terminal
 * `getMany` is a jest mock the test drives. The method list mirrors exactly what
 * `searchPublicTemplates` invokes: where/andWhere/addSelect/setParameter/orderBy/
 * limit/getMany.
 */
function createQueryBuilderMock(): QueryBuilderMock {
  const qb = {} as QueryBuilderMock;
  qb.where = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.addSelect = jest.fn(() => qb);
  qb.setParameter = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.limit = jest.fn(() => qb);
  qb.getMany = jest.fn();
  return qb;
}

function createRepoMock(qb: QueryBuilderMock): RepoMock {
  return {
    createQueryBuilder: jest.fn(() => qb),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

function asRepository(repo: RepoMock): Repository<Template> {
  return repo as unknown as Repository<Template>;
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return Object.assign(new Template(), {
    id: 'row-1',
    templateId: 'commerce-market',
    ownerUserId: null,
    sourceTemplateId: null,
    isPublic: true,
    name: '电商市场',
    tagline: '快速搭建商城',
    description: '一个完整的电商模板',
    accent: '#ff0000',
    category: 'commerce',
    displayCategory: 'shopping',
    primaryFunctionalCategory: 'storefront',
    platformCategories: [],
    functionalCategories: ['storefront'],
    traits: ['modern', 'bold'],
    tags: ['shop', 'retail'],
    searchText: '电商市场 快速搭建商城',
    cssVars: { '--accent': '#ff0000' },
    cssAnimations: { fade: '@keyframes fade {}' },
    componentTemplates: { card: { alias: 'core.panel' } },
    layoutDocument: {
      version: 1,
      themeId: 'commerce-market',
      layout: { id: 'page-1', alias: 'core.screen' },
    },
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  } satisfies Partial<Template>);
}

describe('TypeOrmTemplateReadRepository', () => {
  describe('searchPublicTemplates', () => {
    it('filters by public flag, keywords and category boost, then maps rows', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      const row = makeTemplate();
      qb.getMany.mockResolvedValue([row]);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      const result = await adapter.searchPublicTemplates({
        keywords: ['shop', 'retail'],
        categories: ['shopping'],
        limit: 5,
      });

      // Builder bootstrapped from the Template repository with the public filter.
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(qb.where).toHaveBeenCalledWith('t.isPublic = :isPublic', {
        isPublic: true,
      });

      // One andWhere holding the OR-joined keyword conditions with bound params.
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      const [keywordClause, keywordParams] = qb.andWhere.mock.calls[0] as [
        string,
        Record<string, string>,
      ];
      expect(keywordClause).toContain(':kw0');
      expect(keywordClause).toContain(':kw1');
      expect(keywordParams).toEqual({ kw0: '%shop%', kw1: '%retail%' });

      // Category branch adds a boost select + param and orders by it.
      expect(qb.addSelect).toHaveBeenCalledTimes(1);
      const [boostExpr, boostAlias] = qb.addSelect.mock.calls[0] as [string, string];
      expect(boostExpr).toContain('t.displayCategory IN (:...cats)');
      expect(boostExpr).toContain('t.primaryFunctionalCategory IN (:...cats)');
      expect(boostAlias).toBe('category_boost');
      expect(qb.setParameter).toHaveBeenCalledWith('cats', ['shopping']);
      expect(qb.orderBy).toHaveBeenCalledWith('category_boost', 'ASC');

      // Limit is applied before the terminal getMany.
      expect(qb.limit).toHaveBeenCalledWith(5);
      expect(qb.getMany).toHaveBeenCalledTimes(1);

      // Rows are passed straight through (entity already matches the record shape).
      expect(result).toEqual([row]);
    });

    it('skips keyword andWhere and orders by createdAt when no keywords/categories', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      qb.getMany.mockResolvedValue([]);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      const result = await adapter.searchPublicTemplates({
        keywords: [],
        categories: [],
        limit: 10,
      });

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.addSelect).not.toHaveBeenCalled();
      expect(qb.setParameter).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual([]);
    });
  });

  describe('findDiversitySummaries', () => {
    it('queries public templates ordered by updatedAt and maps to summary DTOs', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      const row = makeTemplate();
      repo.find.mockResolvedValue([row]);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      const result = await adapter.findDiversitySummaries({ limit: 3 });

      expect(repo.find).toHaveBeenCalledWith({
        where: { isPublic: true },
        take: 3,
        order: { updatedAt: 'DESC' },
      });
      expect(result).toEqual([
        {
          templateId: row.templateId,
          name: row.name,
          displayCategory: row.displayCategory,
          traits: row.traits,
          componentTemplates: row.componentTemplates,
          cssVars: row.cssVars,
          accent: row.accent,
        },
      ]);
    });

    it('adds the displayCategory filter when provided', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      repo.find.mockResolvedValue([]);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      await adapter.findDiversitySummaries({
        displayCategory: 'shopping',
        limit: 7,
      });

      expect(repo.find).toHaveBeenCalledWith({
        where: { isPublic: true, displayCategory: 'shopping' },
        take: 7,
        order: { updatedAt: 'DESC' },
      });
    });
  });

  describe('findOwnedPublishSnapshot', () => {
    it('looks up by owner + template and maps with a migrated layout document', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      const row = makeTemplate({ ownerUserId: 'owner-1' });
      repo.findOne.mockResolvedValue(row);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      const result = await adapter.findOwnedPublishSnapshot('owner-1', 'commerce-market');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { ownerUserId: 'owner-1', templateId: 'commerce-market' },
      });
      expect(result).toEqual({
        templateId: row.templateId,
        name: row.name,
        description: row.description,
        accent: row.accent,
        category: row.category,
        cssVars: row.cssVars,
        cssAnimations: row.cssAnimations,
        componentTemplates: row.componentTemplates,
        layoutDocument: migrateThemeLayoutDocument(row.layoutDocument),
      });
    });

    it('returns null when no owned template matches', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      repo.findOne.mockResolvedValue(null);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      await expect(adapter.findOwnedPublishSnapshot('owner-1', 'missing')).resolves.toBeNull();
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { ownerUserId: 'owner-1', templateId: 'missing' },
      });
    });
  });

  describe('findAccessibleIdentity', () => {
    it('matches owned OR public marketplace template and selects identity fields', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      const row = makeTemplate({ sourceTemplateId: 'origin-template' });
      repo.findOne.mockResolvedValue(row);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      const result = await adapter.findAccessibleIdentity('owner-1', 'commerce-market');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: [
          { templateId: 'commerce-market', ownerUserId: 'owner-1' },
          {
            templateId: 'commerce-market',
            ownerUserId: IsNull(),
            isPublic: true,
          },
        ],
        select: {
          templateId: true,
          sourceTemplateId: true,
        },
      });
      expect(result).toEqual({
        templateId: 'commerce-market',
        sourceTemplateId: 'origin-template',
      });
    });

    it('returns null when neither owned nor public template matches', async () => {
      const qb = createQueryBuilderMock();
      const repo = createRepoMock(qb);
      repo.findOne.mockResolvedValue(null);
      const adapter = new TypeOrmTemplateReadRepository(asRepository(repo));

      await expect(adapter.findAccessibleIdentity('owner-1', 'missing')).resolves.toBeNull();
    });
  });
});
