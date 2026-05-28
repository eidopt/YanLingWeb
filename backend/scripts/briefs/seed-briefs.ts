import type { TemplateSeed } from '../../src/ai-templates/orchestrator/pipeline.types';

/**
 * 批量预生成的业务种子。
 *
 * 设计原则：
 *  - 每条只声明业务关键词 + 平台 + displayCategory，archetype/heroMode 由 Designer 自选
 *  - 同 displayCategory 内布满不同业务，让 Diversity Critic 有事可做
 *  - 不写文案 mock — agent 自己根据 prompt 编合理的中文内容
 *
 * 总数控制在 ~20 个，覆盖 README §15 的 5 个 archetype × §16 的 8 个 heroMode 大部分组合。
 * 真正多样性由流水线在生成时决定，这里只是种子。
 */
export const SEED_BRIEFS: TemplateSeed[] = [
  // commerce — 4 个
  { prompt: '生鲜配送小程序：水果蔬菜肉禽即时到家', platform: 'mini-program', displayCategory: 'commerce' },
  { prompt: '街头潮牌服饰电商：卫衣鞋履个性单品', platform: 'mobile-app', displayCategory: 'commerce' },
  { prompt: '社区团购拼单：邻里共享生鲜尾货特价', platform: 'mini-program', displayCategory: 'commerce' },
  { prompt: '二手交易平台：闲置商品快速出手', platform: 'mobile-app', displayCategory: 'commerce' },

  // service — 3 个
  { prompt: '美容美发预约：理发师项目档期选择', platform: 'mini-program', displayCategory: 'service' },
  { prompt: '上门家政服务：保洁月嫂师傅时段预定', platform: 'mobile-app', displayCategory: 'service' },
  { prompt: '宠物上门洗护：到家美容驱虫疫苗', platform: 'mini-program', displayCategory: 'service' },

  // content — 2 个
  { prompt: '深度阅读专栏：长文章作者专题订阅', platform: 'mobile-app', displayCategory: 'content' },
  { prompt: '本地资讯日报：城市新闻活动指南', platform: 'mini-program', displayCategory: 'content' },

  // education — 2 个
  { prompt: '在线课程学习：视频课时进度跟踪', platform: 'mobile-app', displayCategory: 'education' },
  { prompt: '少儿编程练习：闯关刷题等级勋章', platform: 'mini-program', displayCategory: 'education' },

  // health — 2 个
  { prompt: '健身计划追踪：训练日打卡饮食记录', platform: 'mobile-app', displayCategory: 'health' },
  { prompt: '冥想睡眠助手：白噪音呼吸节律引导', platform: 'mobile-app', displayCategory: 'health' },

  // social — 2 个
  { prompt: '兴趣小组社区：话题动态点赞评论', platform: 'mobile-app', displayCategory: 'social' },
  { prompt: '宠物日常分享：晒娃打卡邻友圈', platform: 'mini-program', displayCategory: 'social' },

  // finance — 1 个
  { prompt: '记账理财工具：账单分类资产趋势', platform: 'mobile-app', displayCategory: 'finance' },

  // marketing — 1 个
  { prompt: '品牌活动落地页：限时抽奖参与有礼', platform: 'web', displayCategory: 'marketing' },

  // utility — 2 个
  { prompt: '极简日程清单：今日任务番茄钟', platform: 'mobile-app', displayCategory: 'utility' },
  { prompt: '团队工具箱：投票占卜计时器集合', platform: 'mini-program', displayCategory: 'utility' },

  // dashboard — 1 个
  { prompt: '销售数据看板：实时订单趋势漏斗', platform: 'web', displayCategory: 'dashboard' },
];
