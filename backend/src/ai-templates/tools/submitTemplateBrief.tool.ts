import type { ProviderTool } from '@shared/agent/contracts/provider';

const ARCHETYPE_ENUM = ['fresh', 'immersive', 'editorial', 'vibrant', 'dark-pro'] as const;
const VARIANT_ENUM = [
  'standard',
  'compact',
  'spacious',
  'borderless',
  'waterfall',
  'overlap',
  'gradient-mask',
  'float-card',
  'split-diagonal',
  'layered-stack',
] as const;
const HERO_MODE_ENUM = [
  'date-strip',
  'function-grid',
  'cover-story',
  'metric-dashboard',
  'story-ring',
  'dual-column',
  'timer-banner',
  'search-filter',
] as const;

export const SUBMIT_TEMPLATE_BRIEF_TOOL: ProviderTool = {
  name: 'submit_template_brief',
  description:
    '提交一份完整的设计 brief。这是 Stage 1 Designer 的唯一输出方式 —— ' +
    '不要输出 markdown 解释文字。所有字段都是必填。',
  parameters: {
    type: 'object',
    required: [
      'templateId',
      'name',
      'tagline',
      'archetype',
      'variant',
      'heroMode',
      'platform',
      'chrome',
      'scenario',
      'audience',
      'pages',
      'cssVars',
      'bottomTabs',
      'category',
      'displayCategory',
      'whyArchetype',
      'whyHeroMode',
      'diversitySignature',
    ],
    properties: {
      templateId: {
        type: 'string',
        description: '英文 slug，例如 "fresh-grocery-delivery"',
      },
      name: { type: 'string', description: '简体中文模板名' },
      tagline: { type: 'string', description: '简体中文一句话定位' },
      archetype: { type: 'string', enum: [...ARCHETYPE_ENUM] },
      variant: {
        type: 'string',
        enum: [...VARIANT_ENUM],
        description:
          'archetype 的子变体，影响渲染树骨架。' +
          'standard=标准，compact=紧凑卡片，spacious=宽间距，borderless=无边卡片，' +
          'waterfall=瀑布流，overlap=叠加交错，gradient-mask=渐变蒙版，' +
          'float-card=浮动卡片，split-diagonal=斜切分割，layered-stack=层级堆叠',
      },
      heroMode: { type: 'string', enum: [...HERO_MODE_ENUM] },
      platform: { type: 'string', enum: ['mini-program', 'mobile-app', 'web'] },
      chrome: { type: 'string', enum: ['wechat', 'app', 'none'] },
      scenario: {
        type: 'string',
        description: '一句话锚定业务场景（英文）',
      },
      audience: {
        type: 'string',
        description: '一句话目标用户画像（英文）',
      },
      pages: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          required: ['id', 'name', 'kind', 'userTask'],
          properties: {
            id: { type: 'string', description: '英文 slug 页面 id' },
            name: { type: 'string', description: '简体中文页面名' },
            kind: {
              type: 'string',
              description: 'home|category|list|detail|order|profile|form|dashboard',
            },
            userTask: {
              type: 'string',
              description: '该页用户任务一句话（英文）',
            },
            primaryAction: {
              type: 'string',
              description: '简体中文主操作按钮文案（非阅读页必填）',
            },
          },
        },
      },
      cssVars: {
        type: 'object',
        description: [
          '主题色契约 token（全部必填，合法 CSS 颜色值）：--accent, --surface, --surface-muted,',
          '--text-heading-color, --text-body-color, --text-muted-color,',
          '--panel-bg, --panel-border, --border-color；',
          '可补充 --color-primary / --hero-bg / --metric-card-bg / --radius-card 等扩展 token',
        ].join(' '),
      },
      componentTemplatesDraft: {
        type: 'array',
        minItems: 0,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['alias', 'role', 'description'],
          properties: {
            alias: {
              type: 'string',
              description: 'biz-* 前缀的英文 slug',
            },
            role: {
              type: 'string',
              description: '这个组件在模板中的角色（hero / card / section）',
            },
            description: {
              type: 'string',
              description: '简体中文一句话说明',
            },
          },
        },
        description: '可选；纯用 core.* 组件拼装页面时可传 []，仅在需要语义化复用卡片时声明 biz-*',
      },
      bottomTabs: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['targetPageId', 'label'],
          properties: {
            targetPageId: { type: 'string' },
            label: { type: 'string', description: '简体中文 tab 标签' },
          },
        },
      },
      category: {
        type: 'string',
        description: '英文 slug，必须等于 functionalCategories[0]',
      },
      displayCategory: {
        type: 'string',
        enum: [
          'commerce',
          'service',
          'content',
          'education',
          'health',
          'social',
          'finance',
          'marketing',
          'utility',
          'dashboard',
          'profile',
          'other',
        ],
      },
      whyArchetype: {
        type: 'string',
        description: '为什么这个 archetype 适配这个业务（不可空，可英可中）',
      },
      whyHeroMode: {
        type: 'string',
        description: '为什么这个 heroMode 适配这个业务（不可空，可英可中）',
      },
      diversitySignature: {
        type: 'string',
        description: '一行字描述视觉签名，例如 "深色霓虹仪表盘 + 圆环进度"',
      },
    },
  },
};
