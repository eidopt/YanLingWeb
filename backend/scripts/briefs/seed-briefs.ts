import type { TemplateSeed } from '../../src/ai-templates/orchestrator/pipeline.types';

/**
 * 批量预生成的业务种子。
 *
 * 设计原则：
 *  - 每条声明业务关键词 + 平台 + displayCategory
 *  - **每条显式指定 forceArchetype + forceHeroMode**，在 5 个 archetype × 8 个
 *    heroMode 矩阵里轮转铺开，保证整批模板视觉风格互不相同（解决"生成的主题总是
 *    一样"）。同一 displayCategory 内的 archetype 和 heroMode 都两两不同；整批覆盖
 *    全部 5 个 archetype 与全部 8 个 heroMode。
 *  - 组合按业务语义挑选（如预约类用 date-strip、限时活动用 timer-banner、
 *    看板用 metric-dashboard），避免硬轮转出不合理的搭配。
 *  - 不写文案 mock — agent 自己根据 prompt 编合理的中文内容
 *
 * Designer 收到 forceArchetype/forceHeroMode 后必须严格采用（见 stageDesigner 提示）。
 * Diversity Critic 仍会对照已有公开模板做最终把关。
 */
export const SEED_BRIEFS: TemplateSeed[] = [
  // commerce — 4 个
  {
    prompt: '生鲜配送小程序：水果蔬菜肉禽即时到家',
    platform: 'mini-program',
    displayCategory: 'commerce',
    forceArchetype: 'fresh',
    forceHeroMode: 'search-filter',
  },
  {
    prompt: '街头潮牌服饰电商：卫衣鞋履个性单品',
    platform: 'mobile-app',
    displayCategory: 'commerce',
    forceArchetype: 'vibrant',
    forceHeroMode: 'cover-story',
  },
  {
    prompt: '社区团购拼单：邻里共享生鲜尾货特价',
    platform: 'mini-program',
    displayCategory: 'commerce',
    forceArchetype: 'editorial',
    forceHeroMode: 'dual-column',
  },
  {
    prompt: '二手交易平台：闲置商品快速出手',
    platform: 'mobile-app',
    displayCategory: 'commerce',
    forceArchetype: 'immersive',
    forceHeroMode: 'story-ring',
  },

  // service — 3 个
  {
    prompt: '美容美发预约：理发师项目档期选择',
    platform: 'mini-program',
    displayCategory: 'service',
    forceArchetype: 'vibrant',
    forceHeroMode: 'date-strip',
  },
  {
    prompt: '上门家政服务：保洁月嫂师傅时段预定',
    platform: 'mobile-app',
    displayCategory: 'service',
    forceArchetype: 'fresh',
    forceHeroMode: 'dual-column',
  },
  {
    prompt: '宠物上门洗护：到家美容驱虫疫苗',
    platform: 'mini-program',
    displayCategory: 'service',
    forceArchetype: 'editorial',
    forceHeroMode: 'search-filter',
  },

  // content — 2 个
  {
    prompt: '深度阅读专栏：长文章作者专题订阅',
    platform: 'mobile-app',
    displayCategory: 'content',
    forceArchetype: 'editorial',
    forceHeroMode: 'cover-story',
  },
  {
    prompt: '本地资讯日报：城市新闻活动指南',
    platform: 'mini-program',
    displayCategory: 'content',
    forceArchetype: 'fresh',
    forceHeroMode: 'dual-column',
  },

  // education — 2 个
  {
    prompt: '在线课程学习：视频课时进度跟踪',
    platform: 'mobile-app',
    displayCategory: 'education',
    forceArchetype: 'immersive',
    forceHeroMode: 'cover-story',
  },
  {
    prompt: '少儿编程练习：闯关刷题等级勋章',
    platform: 'mini-program',
    displayCategory: 'education',
    forceArchetype: 'vibrant',
    forceHeroMode: 'story-ring',
  },

  // health — 2 个
  {
    prompt: '健身计划追踪：训练日打卡饮食记录',
    platform: 'mobile-app',
    displayCategory: 'health',
    forceArchetype: 'dark-pro',
    forceHeroMode: 'metric-dashboard',
  },
  {
    prompt: '冥想睡眠助手：白噪音呼吸节律引导',
    platform: 'mobile-app',
    displayCategory: 'health',
    forceArchetype: 'immersive',
    forceHeroMode: 'timer-banner',
  },

  // social — 2 个
  {
    prompt: '兴趣小组社区：话题动态点赞评论',
    platform: 'mobile-app',
    displayCategory: 'social',
    forceArchetype: 'vibrant',
    forceHeroMode: 'story-ring',
  },
  {
    prompt: '宠物日常分享：晒娃打卡邻友圈',
    platform: 'mini-program',
    displayCategory: 'social',
    forceArchetype: 'fresh',
    forceHeroMode: 'dual-column',
  },

  // finance — 1 个
  {
    prompt: '记账理财工具：账单分类资产趋势',
    platform: 'mobile-app',
    displayCategory: 'finance',
    forceArchetype: 'dark-pro',
    forceHeroMode: 'metric-dashboard',
  },

  // marketing — 1 个
  {
    prompt: '品牌活动落地页：限时抽奖参与有礼',
    platform: 'web',
    displayCategory: 'marketing',
    forceArchetype: 'vibrant',
    forceHeroMode: 'timer-banner',
  },

  // utility — 2 个
  {
    prompt: '极简日程清单：今日任务番茄钟',
    platform: 'mobile-app',
    displayCategory: 'utility',
    forceArchetype: 'editorial',
    forceHeroMode: 'date-strip',
  },
  {
    prompt: '团队工具箱：投票占卜计时器集合',
    platform: 'mini-program',
    displayCategory: 'utility',
    forceArchetype: 'fresh',
    forceHeroMode: 'function-grid',
  },

  // dashboard — 1 个
  {
    prompt: '销售数据看板：实时订单趋势漏斗',
    platform: 'web',
    displayCategory: 'dashboard',
    forceArchetype: 'dark-pro',
    forceHeroMode: 'metric-dashboard',
  },
];
