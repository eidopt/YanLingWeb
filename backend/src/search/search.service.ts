import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { SearchIntentResponse, TemplateSummary } from '@shared/types/search.types';

import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
  type TemplateSearchRecord,
} from '../templates/repositories/template-read.repository';

type IntentMode = SearchIntentResponse['mode'];

@Injectable()
export class SearchService {
  private static readonly SEARCH_KEYWORDS = [
    '找',
    '搜索',
    '搜',
    '查',
    '看看',
    '有没有',
    '推荐',
    '哪些',
    'find',
    'search',
    'look',
    'show',
    'list',
    'browse',
    'recommend',
  ];

  private static readonly CREATE_KEYWORDS = [
    '做',
    '创建',
    '生成',
    '制作',
    '搭建',
    '设计',
    '开发',
    '建',
    '写',
    'create',
    'build',
    'make',
    'generate',
    'design',
    'develop',
    'new',
  ];

  private static readonly CATEGORY_KEYWORDS: Record<string, string[]> = {
    commerce: ['电商', '商城', '购物', '商品', '订单', '支付', '店铺', 'shop', 'store', 'commerce'],
    social: ['社交', '社区', '论坛', '聊天', '消息', '关注', '粉丝', 'social', 'chat', 'community'],
    content: [
      '内容',
      '文章',
      '资讯',
      '新闻',
      '博客',
      '阅读',
      '知识',
      'content',
      'article',
      'blog',
      'news',
    ],
    service: ['服务', '预约', '外卖', '餐饮', '到店', '家政', '维修', 'service', 'booking', 'food'],
    education: ['教育', '学习', '课程', '培训', '考试', '题库', 'education', 'learning', 'course'],
    health: ['健康', '医疗', '健身', '运动', '饮食', '养生', 'health', 'fitness', 'medical'],
    finance: ['金融', '理财', '记账', '财务', '银行', '投资', 'finance', 'accounting', 'money'],
    marketing: ['营销', '推广', '活动', '促销', '优惠', '券', 'marketing', 'promotion', 'event'],
    utility: ['工具', '计算器', '转换', '查询', '实用', 'utility', 'tool', 'calculator'],
    dashboard: ['仪表盘', '数据', '统计', '报表', '图表', 'dashboard', 'analytics', 'data'],
    profile: ['个人', '我的', '用户', '中心', '设置', 'profile', 'user', 'account', 'settings'],
  };

  private static readonly STOP_WORDS = new Set([
    '的',
    '了',
    '是',
    '在',
    '有',
    '和',
    '与',
    '或',
    '一个',
    '一些',
    '我',
    '你',
    '他',
    '她',
    '它',
    '们',
    '想',
    '要',
    '能',
    '可以',
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'me',
    'him',
    'my',
    'your',
    'his',
    'her',
    'its',
    'our',
    'their',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'from',
    'by',
    'as',
    'into',
    'about',
    'like',
  ]);

  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
  ) {}

  async handleInput(_ownerUserId: string, query: string): Promise<SearchIntentResponse> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new BadRequestException('query is required');
    }

    const mode = this.classifyIntent(normalizedQuery);
    this.logger.log(`Search intent: mode=${mode}, query="${normalizedQuery}"`);

    if (mode === 'create_with_ai') {
      return {
        status: 'ok',
        mode,
        query: normalizedQuery,
      };
    }

    // 搜索模式：查找匹配模板。
    const results = await this.searchTemplates(normalizedQuery);
    return {
      status: 'ok',
      mode: 'search_templates',
      query: normalizedQuery,
      results: results.map((t) => this.toSummary(t)),
      total: results.length,
    };
  }

  private async searchTemplates(query: string): Promise<TemplateSearchRecord[]> {
    const keywords = this.extractSearchKeywords(query);
    const categories = this.extractCategories(query);
    return this.templates.searchPublicTemplates({
      keywords,
      categories,
      limit: 20,
    });
  }

  private classifyIntent(query: string): IntentMode {
    const lower = query.toLowerCase();

    let searchScore = 0;
    let createScore = 0;

    for (const kw of SearchService.SEARCH_KEYWORDS) {
      if (lower.includes(kw)) {
        searchScore++;
      }
    }
    for (const kw of SearchService.CREATE_KEYWORDS) {
      if (lower.includes(kw)) {
        createScore++;
      }
    }

    // 如果提到模板类名词且没有创建关键词，倾向搜索。
    const templateNouns = ['模板', '模板库', '案例', '示例', '参考', 'template'];
    for (const noun of templateNouns) {
      if (lower.includes(noun) && createScore === 0) {
        searchScore += 2;
      }
    }

    // 如果提到具体应用类型，倾向创建。
    const appTypes = ['小程序', '网站', '网页', 'app', '应用', '页面', '系统', '平台'];
    for (const app of appTypes) {
      if (lower.includes(app)) {
        createScore++;
      }
    }

    // 含义不明确时默认搜索。
    if (createScore > searchScore) {
      return 'create_with_ai';
    }
    return 'search_templates';
  }

  private extractCategories(query: string): string[] {
    const lower = query.toLowerCase();
    const matched: string[] = [];
    for (const [category, keywords] of Object.entries(SearchService.CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          matched.push(category);
          break;
        }
      }
    }
    return matched;
  }

  private extractSearchKeywords(query: string): string[] {
    // 去掉常见停用词，只保留用于搜索的关键词。
    return query
      .split(/[\s,，.。!！?？、;；:：]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0 && !SearchService.STOP_WORDS.has(w));
  }

  private toSummary(template: TemplateSearchRecord): TemplateSummary {
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
