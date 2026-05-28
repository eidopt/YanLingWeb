import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Template } from '../templates/entities/template.entity';
import { SearchService } from './search.service';

// ─── Mock Data ────────────────────────────────────────────────────

const mockTemplates: Partial<Template>[] = [
  {
    templateId: 'commerce-shop',
    name: '电商商城',
    tagline: '综合电商平台模板',
    description: '适用于商品展示、购物车、订单管理的电商模板',
    category: 'commerce',
    primaryFunctionalCategory: 'commerce',
    tags: ['电商', '商城', '购物', '商品'],
    traits: ['现代', '简洁'],
    accent: '#FF4D4F',
    searchText: '电商商城 综合电商平台模板 适用于商品展示、购物车、订单管理的电商模板 commerce 电商 商城 购物 商品',
    isPublic: true,
    ownerUserId: null,
  },
  {
    templateId: 'food-delivery',
    name: '外卖点餐',
    tagline: '餐饮外卖平台',
    description: '餐厅菜单、在线点餐、配送追踪',
    category: 'service',
    primaryFunctionalCategory: 'service',
    tags: ['外卖', '餐饮', '点餐', '配送'],
    traits: ['活力', '食欲'],
    accent: '#FF6B35',
    searchText: '外卖点餐 餐饮外卖平台 餐厅菜单、在线点餐、配送追踪 service 外卖 餐饮 点餐 配送',
    isPublic: true,
    ownerUserId: null,
  },
  {
    templateId: 'social-feed',
    name: '社交动态',
    tagline: '社交媒体信息流',
    description: '朋友圈、动态发布、评论互动',
    category: 'social',
    primaryFunctionalCategory: 'social',
    tags: ['社交', '动态', '朋友圈', '互动'],
    traits: ['年轻', '活力'],
    accent: '#6C5CE7',
    searchText: '社交动态 社交媒体信息流 朋友圈、动态发布、评论互动 social 社交 动态 朋友圈 互动',
    isPublic: true,
    ownerUserId: null,
  },
];

// ─── Tests ────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;
  let templateRepo: Repository<Template>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(Template),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue(mockTemplates),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    templateRepo = module.get<Repository<Template>>(getRepositoryToken(Template));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('intent classification', () => {
    it('should classify search intent', async () => {
      const result = await service.handleInput('user1', '有没有电商类的模板');
      expect(result.mode).toBe('search_templates');
      expect(result.status).toBe('ok');
    });

    it('should classify create intent', async () => {
      const result = await service.handleInput('user1', '帮我做一个预约系统小程序');
      expect(result.mode).toBe('create_blank_template');
      expect(result.status).toBe('ok');
    });

    it('should throw on empty query', async () => {
      await expect(service.handleInput('user1', '')).rejects.toThrow('query is required');
      await expect(service.handleInput('user1', '   ')).rejects.toThrow('query is required');
    });
  });

  describe('search mode', () => {
    it('should return template summaries', async () => {
      const result = await service.handleInput('user1', '电商模板');
      if (result.mode === 'search_templates') {
        expect(result.results).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0]).toHaveProperty('templateId');
        expect(result.results[0]).toHaveProperty('name');
        expect(result.results[0]).toHaveProperty('category');
      }
    });

    it('should include total count', async () => {
      const result = await service.handleInput('user1', '搜索社交');
      if (result.mode === 'search_templates') {
        expect(result.total).toBeDefined();
        expect(result.total).toBe(result.results.length);
      }
    });
  });

  describe('create mode', () => {
    it('should generate a valid ThemeLayoutDocument', async () => {
      const result = await service.handleInput('user1', '做一个外卖点餐小程序');
      if (result.mode === 'create_blank_template') {
        expect(result.schema).toBeDefined();
        expect(result.schema.version).toBe(1);
        expect(result.schema.themeId).toBeDefined();
        expect(result.schema.pages).toBeDefined();
        expect(result.schema.pages.length).toBeGreaterThan(0);
        expect(result.schema.components).toBeDefined();
        expect(result.schema.defaultPageId).toBeDefined();
      }
    });

    it('should generate pages with core.screen root', async () => {
      const result = await service.handleInput('user1', '创建一个个人简历页面');
      if (result.mode === 'create_blank_template') {
        for (const page of result.schema.pages) {
          expect(page.layout.alias).toBe('core.screen');
        }
      }
    });

    it('should include search and text components', async () => {
      const result = await service.handleInput('user1', '做一个电商网站');
      if (result.mode === 'create_blank_template') {
        const page = result.schema.pages[0];
        const aliases = collectAliases(page.layout);
        expect(aliases).toContain('core.search');
        expect(aliases).toContain('core.text');
      }
    });
  });
});

// ─── Helpers ──────────────────────────────────────────────────────

function collectAliases(node: { alias: string; children?: { alias: string; children?: unknown[] }[] }): string[] {
  const aliases = [node.alias];
  if (node.children) {
    for (const child of node.children) {
      aliases.push(...collectAliases(child as { alias: string; children?: { alias: string; children?: unknown[] }[] }));
    }
  }
  return aliases;
}
