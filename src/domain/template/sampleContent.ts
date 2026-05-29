/**
 * Hardcoded per-theme Chinese sample text used when seeding default prop values
 * for newly created nodes. Keyed by themeId, then by component alias, then by
 * prop name. Pure data — no logic.
 */
export const SAMPLE_PROP_OVERRIDES: Record<
  string,
  Record<string, Record<string, string | boolean>>
> = {
  'service-center': {
    'core.search': { placeholder: '搜索家政、维修、缴费服务' },
    'core.notice': {
      text: '样例提示：拖动左侧例子组件到画布，中文示例文案会一起带入。',
    },
    'core.panel': { tone: 'accent', gap: '12' },
    'core.stack': { gap: '10' },
    'svc-text': {
      variant: 'body',
      text: '附近好店今日可约，拖入后可以继续改成你的业务文案。',
      as: 'p',
    },
    'svc-button': { label: '立即预约', variant: 'primary' },
    'svc-action-card': {
      title: '家电清洗',
      subtitle: '最快 30 分钟上门',
      caption: '新人立减 20 元',
      iconColor: 'var(--app-color-wechat)',
    },
    'svc-info-card': {
      overline: '限时推荐',
      title: '保洁次卡已上线',
      body: '拖入后可直接修改服务介绍、配色和布局参数。',
      tone: 'highlight',
    },
    'svc-order-cell': {
      title: '空调清洗预约',
      subtitle: '今天 14:00 上门 · 2 位技师',
      statusLabel: '待服务',
    },
    'svc-section-header': { title: '热门服务', actionLabel: '查看全部' },
    'svc-tag': { label: '最快上门', tone: 'success' },
    'svc-bottom-bar': { activeTab: '首页', disabledTabs: '消息' },
  },
  'commerce-market': {
    'core.search': { placeholder: '搜索水果零食、家清百货' },
    'core.notice': {
      text: '样例提示：把这个例子拖进画布，中文商品文案会一起创建。',
    },
    'core.panel': { tone: 'accent', gap: '12' },
    'core.stack': { gap: '10' },
    'com-text': {
      variant: 'body',
      text: '今日爆款正在热卖，拖入后可继续替换成你的商品介绍。',
      as: 'p',
    },
    'com-button': { label: '马上抢', variant: 'primary' },
    'com-info-card': {
      overline: '会员精选',
      title: '加价购专区',
      body: '把这张信息卡拖进画布，继续编辑活动利益点和风格。',
      tone: 'member',
    },
    'com-pill': { label: '新品上架', active: true },
    'com-product-card': {
      overline: '24h 达',
      title: '云南蓝莓 125g',
      body: '现摘冷链发货，酸甜平衡，适合早餐酸奶杯。',
      price: '¥19.9',
      badgeLabel: '限时',
      actionLabel: '加入购物车',
    },
    'com-promo-card': {
      overline: '今日特惠',
      title: '晚餐食材 1 小时达',
      body: '拖入后会保留这段中文样例，方便你继续替换成自己的活动文案。',
      actionLabel: '去凑单',
    },
    'com-tag': { label: '满减', tone: 'deal' },
    'com-bottom-tabs': { activeTab: '首页', disabledTabs: '分类' },
  },
};
