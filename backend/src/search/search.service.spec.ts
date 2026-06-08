import { Test, TestingModule } from '@nestjs/testing';

import type {
  TemplateReadRepository,
  TemplateSearchRecord,
} from '../templates/repositories/templateRead.repository';
import { TEMPLATE_READ_REPOSITORY } from '../templates/repositories/templateRead.repository';
import { SearchService } from './search.service';

// ─── Mock Data ────────────────────────────────────────────────────

const mockTemplates: TemplateSearchRecord[] = [
  {
    templateId: 'commerce-shop',
    name: '电商商城',
    tagline: '综合电商平台模板',
    description: '适用于商品展示、购物车、订单管理的电商模板',
    category: 'commerce',
    tags: ['电商', '商城', '购物', '商品'],
    traits: ['现代', '简洁'],
    accent: '#FF4D4F',
  },
  {
    templateId: 'food-delivery',
    name: '外卖点餐',
    tagline: '餐饮外卖平台',
    description: '餐厅菜单、在线点餐、配送追踪',
    category: 'service',
    tags: ['外卖', '餐饮', '点餐', '配送'],
    traits: ['活力', '食欲'],
    accent: '#FF6B35',
  },
  {
    templateId: 'social-feed',
    name: '社交动态',
    tagline: '社交媒体信息流',
    description: '朋友圈、动态发布、评论互动',
    category: 'social',
    tags: ['社交', '动态', '朋友圈', '互动'],
    traits: ['年轻', '活力'],
    accent: '#6C5CE7',
  },
];

// ─── Tests ────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;
  let searchPublicTemplates: jest.MockedFunction<TemplateReadRepository['searchPublicTemplates']>;

  beforeEach(async () => {
    searchPublicTemplates = jest.fn().mockResolvedValue(mockTemplates);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: TEMPLATE_READ_REPOSITORY,
          useValue: {
            searchPublicTemplates,
            findDiversitySummaries: jest.fn(),
            findOwnedPublishSnapshot: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
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
      expect(result.mode).toBe('create_with_ai');
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
      expect(searchPublicTemplates).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
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
    it('should return a create-with-ai intent', async () => {
      const result = await service.handleInput('user1', '做一个外卖点餐小程序');
      expect(result).toEqual({
        status: 'ok',
        mode: 'create_with_ai',
        query: '做一个外卖点餐小程序',
      });
    });
  });
});
