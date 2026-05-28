import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CORE_COMPONENTS } from '@shared/agent/fixtures/blankDocument';
import type { ThemeLayoutDocument } from '@shared/agent/types';
import { Repository } from 'typeorm';

import { Template } from '../templates/entities/template.entity';

// ─── Response Types ───────────────────────────────────────────────

export interface TemplateSummary {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  displayCategory?: string;
  accent: string;
  traits: string[];
  tags: string[];
}

export interface SearchTemplatesResult {
  status: 'ok';
  mode: 'search_templates';
  query: string;
  results: TemplateSummary[];
  total: number;
}

export interface CreateBlankTemplateResult {
  status: 'ok';
  mode: 'create_blank_template';
  query: string;
  schema: ThemeLayoutDocument;
}

export type SearchIntentResult = SearchTemplatesResult | CreateBlankTemplateResult;

// ─── Intent Classification ────────────────────────────────────────

const SEARCH_KEYWORDS = [
  '找', '搜索', '搜', '查', '看看', '有没有', '推荐', '哪些',
  'find', 'search', 'look', 'show', 'list', 'browse', 'recommend',
];

const CREATE_KEYWORDS = [
  '做', '创建', '生成', '制作', '搭建', '设计', '开发', '建', '写',
  'create', 'build', 'make', 'generate', 'design', 'develop', 'new',
];

type IntentMode = 'search_templates' | 'create_blank_template';

function classifyIntent(query: string): IntentMode {
  const lower = query.toLowerCase();

  let searchScore = 0;
  let createScore = 0;

  for (const kw of SEARCH_KEYWORDS) {
    if (lower.includes(kw)) {searchScore++;}
  }
  for (const kw of CREATE_KEYWORDS) {
    if (lower.includes(kw)) {createScore++;}
  }

  // If query mentions specific template-like nouns, lean toward search
  const templateNouns = ['模板', '模板库', '案例', '示例', '参考', 'template'];
  for (const noun of templateNouns) {
    if (lower.includes(noun)) {searchScore += 2;}
  }

  // If query mentions specific app types, lean toward create
  const appTypes = ['小程序', '网站', '网页', 'app', '应用', '页面', '系统', '平台'];
  for (const app of appTypes) {
    if (lower.includes(app)) {createScore++;}
  }

  // Default to search if ambiguous
  if (createScore > searchScore) {return 'create_blank_template';}
  return 'search_templates';
}

// ─── Category Keyword Mapping ─────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  commerce: ['电商', '商城', '购物', '商品', '订单', '支付', '店铺', 'shop', 'store', 'commerce'],
  social: ['社交', '社区', '论坛', '聊天', '消息', '关注', '粉丝', 'social', 'chat', 'community'],
  content: ['内容', '文章', '资讯', '新闻', '博客', '阅读', '知识', 'content', 'article', 'blog', 'news'],
  service: ['服务', '预约', '外卖', '餐饮', '到店', '家政', '维修', 'service', 'booking', 'food'],
  education: ['教育', '学习', '课程', '培训', '考试', '题库', 'education', 'learning', 'course'],
  health: ['健康', '医疗', '健身', '运动', '饮食', '养生', 'health', 'fitness', 'medical'],
  finance: ['金融', '理财', '记账', '财务', '银行', '投资', 'finance', 'accounting', 'money'],
  marketing: ['营销', '推广', '活动', '促销', '优惠', '券', 'marketing', 'promotion', 'event'],
  utility: ['工具', '计算器', '转换', '查询', '实用', 'utility', 'tool', 'calculator'],
  dashboard: ['仪表盘', '数据', '统计', '报表', '图表', 'dashboard', 'analytics', 'data'],
  profile: ['个人', '我的', '用户', '中心', '设置', 'profile', 'user', 'account', 'settings'],
};

function extractCategories(query: string): string[] {
  const lower = query.toLowerCase();
  const matched: string[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.push(category);
        break;
      }
    }
  }
  return matched;
}

function extractSearchKeywords(query: string): string[] {
  // Remove common stop words and extract meaningful keywords
  const stopWords = new Set([
    '的', '了', '是', '在', '有', '和', '与', '或', '一个', '一些',
    '我', '你', '他', '她', '它', '们', '想', '要', '能', '可以',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'from', 'by', 'as', 'into', 'about', 'like',
  ]);

  return query
    .split(/[\s,，.。!！?？、;；:：]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0 && !stopWords.has(w));
}

// ─── Blank Template Generator ─────────────────────────────────────

function generateBlankTemplate(query: string, _categories: string[]): ThemeLayoutDocument {
  const themeId = `user-${Date.now()}`;
  const pageTitle = query.slice(0, 30);

  const layout: ThemeLayoutDocument['pages'][0]['layout'] = {
    id: `${themeId}-screen`,
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title: pageTitle },
    children: [
      {
        id: `${themeId}-search`,
        alias: 'core.search',
        layout: { mode: 'flow', order: 1, width: '100%' },
        props: { placeholder: '搜索' },
      },
      {
        id: `${themeId}-title`,
        alias: 'core.text',
        layout: { mode: 'flow', order: 2, width: '100%' },
        props: { text: pageTitle, variant: 'heading' },
      },
      {
        id: `${themeId}-desc`,
        alias: 'core.text',
        layout: { mode: 'flow', order: 3, width: '100%' },
        props: { text: '开始编辑此模板', variant: 'body' },
      },
    ],
  };

  return {
    version: 1,
    themeId,
    themeName: pageTitle,
    pageName: pageTitle,
    description: `由搜索 "${query}" 创建的空白模板`,
    components: CORE_COMPONENTS,
    defaultPageId: 'home',
    pages: [{ id: 'home', name: pageTitle, layout }],
    layout,
  };
}

// ─── Search Service ───────────────────────────────────────────────

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
  ) {}

  async handleInput(
    _ownerUserId: string,
    query: string,
  ): Promise<SearchIntentResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('query is required');
    }

    const mode = classifyIntent(normalizedQuery);
    this.logger.log(`Search intent: mode=${mode}, query="${normalizedQuery}"`);

    if (mode === 'create_blank_template') {
      const categories = extractCategories(normalizedQuery);
      const schema = generateBlankTemplate(normalizedQuery, categories);
      return {
        status: 'ok',
        mode: 'create_blank_template',
        query: normalizedQuery,
        schema,
      };
    }

    // Search mode: find matching templates
    const results = await this.searchTemplates(normalizedQuery);
    return {
      status: 'ok',
      mode: 'search_templates',
      query: normalizedQuery,
      results: results.map((t) => this.toSummary(t)),
      total: results.length,
    };
  }

  private async searchTemplates(query: string): Promise<Template[]> {
    const keywords = extractSearchKeywords(query);
    const categories = extractCategories(query);

    const qb = this.templateRepo.createQueryBuilder('t')
      .where('t.isPublic = :isPublic', { isPublic: true });

    // Build OR conditions for keyword matching
    if (keywords.length > 0) {
      const conditions: string[] = [];
      const params: Record<string, string> = {};

      keywords.forEach((kw, i) => {
        const param = `kw${i}`;
        params[param] = `%${kw}%`;
        conditions.push(
          `(LOWER(t.name) LIKE :${param}`
          + ` OR LOWER(t.tagline) LIKE :${param}`
          + ` OR LOWER(t.searchText) LIKE :${param})`,
        );
      });

      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    // Boost results matching detected categories
    if (categories.length > 0) {
      qb.addSelect(
        `CASE WHEN t.displayCategory IN (:...cats) OR t.primaryFunctionalCategory IN (:...cats) THEN 0 ELSE 1 END`,
        'category_boost',
      );
      qb.setParameter('cats', categories);
      qb.orderBy('category_boost', 'ASC');
    } else {
      qb.orderBy('t.createdAt', 'DESC');
    }

    qb.limit(20);

    return qb.getMany();
  }

  private toSummary(template: Template): TemplateSummary {
    return {
      templateId: template.templateId,
      name: template.name,
      tagline: template.tagline,
      description: template.description,
      category: template.category,
      displayCategory: template.displayCategory,
      accent: template.accent,
      traits: template.traits,
      tags: template.tags,
    };
  }
}
