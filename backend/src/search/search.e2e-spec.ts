import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Template } from '../templates/entities/template.entity';
import { SearchModule } from './search.module';
import { AuthModule } from '../auth/auth.module';

// ─── Mock Data ────────────────────────────────────────────────────

const mockTemplates = [
  {
    templateId: 'shop-fashion',
    name: '时尚商城',
    tagline: '潮流服饰购物平台',
    description: '服装、鞋帽、配饰等时尚商品的展示与购买',
    category: 'commerce',
    primaryFunctionalCategory: 'commerce',
    tags: ['电商', '时尚', '服饰'],
    traits: ['时尚', '高端'],
    accent: '#E91E63',
    searchText: '时尚商城 潮流服饰购物平台 commerce 电商 时尚 服饰',
    isPublic: true,
    ownerUserId: null,
  },
  {
    templateId: 'food-restaurant',
    name: '餐厅点餐',
    tagline: '美味一键送达',
    description: '餐厅菜单展示、在线点餐、外卖配送',
    category: 'service',
    primaryFunctionalCategory: 'service',
    tags: ['餐饮', '外卖', '点餐'],
    traits: ['食欲', '活力'],
    accent: '#FF5722',
    searchText: '餐厅点餐 美味一键送达 service 餐饮 外卖 点餐',
    isPublic: true,
    ownerUserId: null,
  },
];

// ─── E2E Tests ────────────────────────────────────────────────────

describe('Search (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SearchModule, AuthModule],
    })
      .overrideProvider(getRepositoryToken(Template))
      .useValue({
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          setParameter: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(mockTemplates),
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get auth token (mock)
    authToken = 'test-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /search', () => {
    it('should return 401 without auth token', () => {
      return request(app.getHttpServer())
        .post('/search')
        .send({ query: '电商' })
        .expect(401);
    });

    it('should return 400 with empty query', () => {
      return request(app.getHttpServer())
        .post('/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: '' })
        .expect(400);
    });

    it('should return search results for search intent', () => {
      return request(app.getHttpServer())
        .post('/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: '有没有电商模板' })
        .expect(200)
        .expect((res) => {
          expect(res.body.mode).toBe('search_templates');
          expect(res.body.results).toBeDefined();
          expect(Array.isArray(res.body.results)).toBe(true);
        });
    });

    it('should return create result for create intent', () => {
      return request(app.getHttpServer())
        .post('/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: '帮我做一个预约系统小程序' })
        .expect(200)
        .expect((res) => {
          expect(res.body.mode).toBe('create_blank_template');
          expect(res.body.schema).toBeDefined();
          expect(res.body.schema.version).toBe(1);
          expect(res.body.schema.pages).toBeDefined();
        });
    });

    it('should return valid template summaries', () => {
      return request(app.getHttpServer())
        .post('/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: '搜索电商模板' })
        .expect(200)
        .expect((res) => {
          if (res.body.mode === 'search_templates') {
            for (const result of res.body.results) {
              expect(result).toHaveProperty('templateId');
              expect(result).toHaveProperty('name');
              expect(result).toHaveProperty('category');
              expect(result).toHaveProperty('tags');
            }
          }
        });
    });

    it('should handle create intent with category detection', () => {
      return request(app.getHttpServer())
        .post('/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: '做一个外卖点餐小程序' })
        .expect(200)
        .expect((res) => {
          expect(res.body.mode).toBe('create_blank_template');
          expect(res.body.schema).toBeDefined();
          expect(res.body.schema.components).toBeDefined();
        });
    });
  });
});
