/**
 * Commerce Template Patterns
 *
 * 8 unique e-commerce template patterns with distinct content, layout,
 * page structure, and design. Each template represents a completely
 * different commerce vertical — NOT just color swaps.
 *
 * Usage: import { COMMERCE_TEMPLATES } from './templates-commerce';
 */

// ─── Types ────────────────────────────────────────────────────────

export interface TemplatePattern {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  functionalCategory: string;
  tags: string[];
  traits: string[];
  accent: string;
  platform: 'mini-program' | 'mobile-app' | 'web';
  chrome: 'wechat' | 'app' | 'none';
  pages: { name: string; title: string }[];
  cssVars: Record<string, string>;
  content: {
    products?: { name: string; price: string; desc: string; tag: string }[];
    categories?: string[];
    notices?: string[];
    features?: { title: string; desc: string }[];
  };
}

// ─── Templates ────────────────────────────────────────────────────

export const COMMERCE_TEMPLATES: TemplatePattern[] = [
  // ── 1. 生鲜配送 ────────────────────────────────────────────────
  {
    id: 'commerce-fresh-delivery',
    name: '生鲜配送',
    tagline: '产地直发 新鲜到家',
    description: '水果、蔬菜、肉禽、海鲜等生鲜食材的在线选购与即时配送服务',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['生鲜', '配送', '食材', '果蔬', '买菜'],
    traits: ['新鲜', '便捷', '健康', '快速'],
    accent: '#2E7D32',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: '首页', title: '新鲜到家' },
      { name: '分类', title: '食材分类' },
      { name: '购物车', title: '购物车' },
      { name: '我的', title: '个人中心' },
    ],
    cssVars: {
      '--color-primary': '#2E7D32',
      '--color-primary-light': '#E8F5E9',
      '--color-bg': '#F1F8E9',
      '--color-card': '#FFFFFF',
      '--color-price': '#D32F2F',
      '--color-accent': '#FF8F00',
    },
    content: {
      products: [
        { name: '智利车厘子', price: '29.9', desc: 'JJ级大果 2斤装 甜度爆表', tag: '当季热卖' },
        { name: '阳光玫瑰葡萄', price: '15.8', desc: '云南直发 脆甜无籽 1斤装', tag: '时令鲜果' },
        { name: '有机菠菜', price: '6.5', desc: '崇明基地 当日采摘 300g/份', tag: '有机认证' },
        { name: '澳洲谷饲牛腱', price: '45', desc: '原切进口 炖煮卤拌皆宜 500g', tag: '进口优选' },
        { name: '厄瓜多尔白虾', price: '39.9', desc: '冰鲜到手 净重1斤 个大饱满', tag: '海鲜直供' },
        { name: '鲜牛奶', price: '12.8', desc: '本地牧场 当日配送 950ml', tag: '每日鲜送' },
      ],
      categories: ['水果', '蔬菜', '肉禽', '海鲜', '乳品', '粮油'],
      notices: [
        '今日下单 2小时极速送达',
        '新人专享 首单立减15元',
        '周末特惠 车厘子第二件半价',
      ],
      features: [
        { title: '产地直采', desc: '跳过中间商 从田间到餐桌仅24小时' },
        { title: '冷链配送', desc: '全程温控保鲜 品质有保障' },
        { title: '无忧退换', desc: '不新鲜包退 48小时内售后无忧' },
      ],
    },
  },

  // ── 2. 潮牌服饰 ────────────────────────────────────────────────
  {
    id: 'commerce-streetwear',
    name: '潮牌服饰',
    tagline: '穿出态度 定义风格',
    description: '街头潮流品牌集合店，涵盖卫衣、裤装、鞋履与配饰',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['潮牌', '街头', '服饰', '穿搭', '潮流'],
    traits: ['潮流', '个性', '暗黑', '年轻'],
    accent: '#1A1A2E',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: '首页', title: '潮流前线' },
      { name: '新品', title: '上新速递' },
      { name: '搭配', title: '穿搭灵感' },
      { name: '购物车', title: '购物车' },
      { name: '我的', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#1A1A2E',
      '--color-primary-light': '#E8E8F0',
      '--color-bg': '#0D0D1A',
      '--color-card': '#1A1A2E',
      '--color-price': '#00E5FF',
      '--color-accent': '#FF4081',
      '--color-neon': '#00FF88',
    },
    content: {
      products: [
        { name: 'Oversized 水洗卫衣', price: '299', desc: '落肩设计 做旧水洗 厚实380g纯棉', tag: '爆款返场' },
        { name: '多口袋工装裤', price: '189', desc: '束脚版型 防泼水面料 四季百搭', tag: 'TOP3热卖' },
        { name: '刺绣棒球帽', price: '89', desc: '立体刺绣 可调节帽围 硬顶挺括', tag: '新品首发' },
        { name: '古巴链银饰项链', price: '159', desc: '925纯银 钛钢不褪色 潮人必备', tag: '博主同款' },
        { name: '复古德训鞋', price: '369', desc: '做旧皮面 橡胶大底 百搭经典', tag: '限量发售' },
      ],
      categories: ['上装', '下装', '配饰', '鞋履'],
      notices: [
        '新品发售 每周三晚8点上新',
        '满499包邮 顺丰速递',
        '穿搭打卡 分享返现20元',
      ],
      features: [
        { title: '独家设计', desc: '签约独立设计师 每款限量不撞衫' },
        { title: '穿搭社区', desc: '真实买家秀 告别选择困难' },
        { title: '无忧换码', desc: '尺码不合 7天内免费换货' },
      ],
    },
  },

  // ── 3. 数码极客 ────────────────────────────────────────────────
  {
    id: 'commerce-tech-gadgets',
    name: '数码极客',
    tagline: '硬核装备 极客之选',
    description: '键盘外设、耳机音频、充电配件等数码产品的专业评测与购买平台',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['数码', '外设', '极客', '科技', '评测'],
    traits: ['科技', '专业', '硬核', '深色'],
    accent: '#0D47A1',
    platform: 'web',
    chrome: 'none',
    pages: [
      { name: '首页', title: '极客装备库' },
      { name: '产品', title: '全部产品' },
      { name: '评测', title: '深度评测' },
      { name: '购物车', title: '购物车' },
    ],
    cssVars: {
      '--color-primary': '#0D47A1',
      '--color-primary-light': '#E3F2FD',
      '--color-bg': '#0A0E1A',
      '--color-card': '#111827',
      '--color-price': '#00E676',
      '--color-accent': '#7C4DFF',
      '--color-code': '#64FFDA',
    },
    content: {
      products: [
        { name: '客制化机械键盘', price: '399', desc: 'Gasket结构 热插拔 PCB 三模连接', tag: '编辑推荐' },
        { name: '主动降噪头戴耳机', price: '899', desc: '40dB深度降噪 LDAC无损 60h续航', tag: '音质标杆' },
        { name: '20000mAh 充电宝', price: '129', desc: '65W快充 可充笔记本 仅重320g', tag: '出行必备' },
        { name: '100W 快充数据线套装', price: '39', desc: '编织线材 C-to-C 3A电流 2m长度', tag: '好评如潮' },
        { name: '4K 便携显示器', price: '1299', desc: '15.6英寸 100%sRGB Type-C一线连', tag: '新品首发' },
        { name: '迷你桌面音箱', price: '259', desc: 'Hi-Res认证 蓝牙5.3 12h续航', tag: '口碑之作' },
      ],
      categories: ['外设', '音频', '配件', '智能设备'],
      notices: [
        '全场满300减30 叠加优惠券更划算',
        '极客会员享专属折扣 低至8折',
        '新品首发前100名送定制周边',
      ],
      features: [
        { title: '深度评测', desc: '每款产品均有拆解级专业评测报告' },
        { title: '参数对比', desc: '同类产品横向对比 选购不再纠结' },
        { title: '以旧换新', desc: '旧设备抵扣 最高抵现50%' },
      ],
    },
  },

  // ── 4. 母婴商城 ────────────────────────────────────────────────
  {
    id: 'commerce-baby-maternity',
    name: '母婴商城',
    tagline: '科学育儿 呵护成长',
    description: '婴儿推车、喂养用品、纸尿裤、辅食等母婴用品的一站式购物与育儿指南',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['母婴', '婴儿', '育儿', '孕妇', '宝宝'],
    traits: ['温馨', '安全', '柔软', '呵护'],
    accent: '#E91E63',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: '首页', title: '宝贝优选' },
      { name: '分类', title: '母婴分类' },
      { name: '育儿', title: '育儿百科' },
      { name: '购物车', title: '购物车' },
      { name: '我的', title: '妈妈中心' },
    ],
    cssVars: {
      '--color-primary': '#E91E63',
      '--color-primary-light': '#FCE4EC',
      '--color-bg': '#FFF5F7',
      '--color-card': '#FFFFFF',
      '--color-price': '#D81B60',
      '--color-accent': '#FFB74D',
    },
    content: {
      products: [
        { name: '轻便折叠婴儿推车', price: '1299', desc: '一键收车 仅重5.8kg 可上飞机', tag: '明星单品' },
        { name: '超薄透气纸尿裤', price: '89', desc: 'L码56片 3D蜂巢透气层 12h干爽', tag: '囤货首选' },
        { name: 'PPSU 防胀气奶瓶', price: '69', desc: '240ml 医学级材质 防呛防胀气', tag: '月销过万' },
        { name: '有机高铁米粉', price: '35', desc: '强化铁锌钙 无添加糖盐 250g/罐', tag: '辅食入门' },
        { name: '婴儿洗护礼盒', price: '168', desc: '洗发沐浴润肤三件套 植物配方', tag: '礼盒特惠' },
      ],
      categories: ['喂养', '洗护', '服饰', '玩具', '出行'],
      notices: [
        '孕妈注册即送199元新人礼包',
        '大牌纸尿裤 第二件半价',
        '育儿专家在线答疑 每周三直播',
      ],
      features: [
        { title: '安心品质', desc: '每件商品均通过国家安全检测认证' },
        { title: '育儿顾问', desc: '持证母婴顾问 1对1在线解答喂养难题' },
        { title: '会员积分', desc: '购物攒积分 兑换玩具和辅食' },
      ],
    },
  },

  // ── 5. 宠物用品 ────────────────────────────────────────────────
  {
    id: 'commerce-pet-supplies',
    name: '宠物用品',
    tagline: '毛孩子的好物清单',
    description: '猫粮狗粮、宠物玩具、窝垫、猫砂等宠物用品及生活服务',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['宠物', '猫粮', '狗粮', '萌宠', '铲屎官'],
    traits: ['温暖', '可爱', '活力', '陪伴'],
    accent: '#FF6D00',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: '首页', title: '萌宠乐园' },
      { name: '分类', title: '宠物分类' },
      { name: '购物车', title: '购物车' },
      { name: '我的宠物', title: '宠物档案' },
    ],
    cssVars: {
      '--color-primary': '#FF6D00',
      '--color-primary-light': '#FFF3E0',
      '--color-bg': '#FFF8F0',
      '--color-card': '#FFFFFF',
      '--color-price': '#E65100',
      '--color-accent': '#66BB6A',
    },
    content: {
      products: [
        { name: '全价冻干猫粮', price: '128', desc: '鸡肉三文鱼配方 含肉量80% 1.5kg', tag: '猫咪最爱' },
        { name: '耐咬磨牙狗玩具', price: '39', desc: '天然橡胶 可藏零食 中大型犬适用', tag: '拆家克星' },
        { name: '四季通用宠物窝', price: '159', desc: '可拆洗 保暖透气 M/L/XL三码', tag: '回购爆款' },
        { name: '混合猫砂', price: '45', desc: '豆腐膨润土混合 强力结团 除臭6L', tag: '月销2万' },
        { name: '自动喂食器', price: '259', desc: '4L大容量 APP远程控制 定时定量', tag: '出差必备' },
        { name: '宠物益生菌', price: '68', desc: '调理肠胃 便臭改善 猫狗通用 30包', tag: '健康常备' },
      ],
      categories: ['猫咪', '狗狗', '水族', '小宠'],
      notices: [
        '铲屎官专属 首单满99减20',
        '进口猫粮囤货季 第3件0元',
        '晒宠有礼 分享宠物日常赢好礼',
      ],
      features: [
        { title: '宠物档案', desc: '记录疫苗驱虫体重 智能提醒不遗漏' },
        { title: '成分透明', desc: '每款宠粮均可查看完整配料表与检测报告' },
        { title: '专家问诊', desc: '执业兽医师在线解答 守护毛孩子健康' },
      ],
    },
  },

  // ── 6. 文创好物 ────────────────────────────────────────────────
  {
    id: 'commerce-creative-goods',
    name: '文创好物',
    tagline: '把生活写成诗',
    description: '手账文具、香薰蜡烛、创意家居装饰等文艺生活方式好物精选',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['文创', '手账', '文具', '香薰', '生活方式'],
    traits: ['文艺', '简约', '质感', '治愈'],
    accent: '#8D6E63',
    platform: 'web',
    chrome: 'none',
    pages: [
      { name: '首页', title: '好物志' },
      { name: '灵感', title: '灵感集' },
      { name: '购物车', title: '购物袋' },
      { name: '收藏', title: '我的收藏' },
    ],
    cssVars: {
      '--color-primary': '#8D6E63',
      '--color-primary-light': '#EFEBE9',
      '--color-bg': '#FDFAF6',
      '--color-card': '#FFFFFF',
      '--color-price': '#5D4037',
      '--color-accent': '#A1887F',
    },
    content: {
      products: [
        { name: '方格手账本', price: '45', desc: 'A5活页设计 160g无酸纸 可摊平书写', tag: '编辑之选' },
        { name: '钢尖钢笔礼盒', price: '128', desc: 'EF细尖 紫檀木笔杆 含墨水一瓶', tag: '书写仪式感' },
        { name: '黄铜书签套装', price: '28', desc: '复古植物主题 4枚装 书页夹式设计', tag: '好评返图' },
        { name: '大豆蜡香薰蜡烛', price: '68', desc: '英国梨小苍兰香型 燃烧40h+ 200g', tag: '氛围感满分' },
        { name: '手工陶瓷花瓶', price: '159', desc: '景德镇手作 哑光釉面 高15cm', tag: '孤品限定' },
      ],
      categories: ['文具', '生活', '香氛', '装饰'],
      notices: [
        '灵感集投稿入选 即赠50元无门槛券',
        '满199元赠手写明信片套装',
        '每周五上新 关注不错过好物',
      ],
      features: [
        { title: '灵感社区', desc: '手账达人分享排版灵感 好物使用心得' },
        { title: '匠人故事', desc: '每件文创好物背后都有手作匠人的温度' },
        { title: '礼品包装', desc: '免费手写贺卡 代寄送礼一步到位' },
      ],
    },
  },

  // ── 7. 运动装备 ────────────────────────────────────────────────
  {
    id: 'commerce-sports-gear',
    name: '运动装备',
    tagline: '每一次突破 都值得好装备',
    description: '跑鞋、健身器材、运动营养、智能穿戴等运动装备选购与训练计划平台',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['运动', '健身', '跑步', '装备', '训练'],
    traits: ['活力', '专业', '热血', '力量'],
    accent: '#D50000',
    platform: 'mobile-app',
    chrome: 'app',
    pages: [
      { name: '首页', title: '运动装备站' },
      { name: '装备', title: '装备库' },
      { name: '计划', title: '训练计划' },
      { name: '购物车', title: '购物车' },
      { name: '我的', title: '运动中心' },
    ],
    cssVars: {
      '--color-primary': '#D50000',
      '--color-primary-light': '#FFEBEE',
      '--color-bg': '#121212',
      '--color-card': '#1E1E1E',
      '--color-price': '#FF5252',
      '--color-accent': '#FFD740',
    },
    content: {
      products: [
        { name: '碳板竞速跑鞋', price: '599', desc: '全掌碳板 ZoomX泡棉 马拉松PB利器', tag: '跑者必入' },
        { name: '天然橡胶瑜伽垫', price: '89', desc: '6mm厚度 防滑干湿双防 送绑带网兜', tag: '瑜伽首选' },
        { name: '分离乳清蛋白粉', price: '259', desc: '巧克力味 2磅装 每份26g蛋白质', tag: '增肌搭档' },
        { name: 'GPS运动手表', price: '1299', desc: '双频定位 血氧心率监测 14天续航', tag: '数据控最爱' },
        { name: '可调节哑铃套装', price: '459', desc: '2-20kg自由调节 单手快换 居家健身', tag: '家用神器' },
        { name: '速干压缩衣', price: '149', desc: '四面弹力 压缩支撑 透气速干面料', tag: '训练必备' },
      ],
      categories: ['跑步', '健身', '瑜伽', '户外'],
      notices: [
        '训练打卡满30天 解锁专属装备折扣',
        '满500减60 运动装备专场',
        '新品测评招募 免费体验新装备',
      ],
      features: [
        { title: '训练计划', desc: '根据目标定制跑步力量瑜伽等个性化方案' },
        { title: '装备评测', desc: '专业运动员实测 数据说话 不交智商税' },
        { title: '运动社区', desc: '打卡记录 互相激励 和百万运动达人一起' },
      ],
    },
  },

  // ── 8. 鲜花礼品 ────────────────────────────────────────────────
  {
    id: 'commerce-flowers-gifts',
    name: '鲜花礼品',
    tagline: '用花传情 以礼达意',
    description: '鲜花花束、永生花、绿植盆栽、节日礼盒的在线选购与定制配送',
    category: 'commerce',
    functionalCategory: 'commerce',
    tags: ['鲜花', '礼品', '花束', '绿植', '送礼'],
    traits: ['优雅', '浪漫', '精致', '清新'],
    accent: '#C2185B',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: '首页', title: '花间密语' },
      { name: '分类', title: '花卉分类' },
      { name: '定制', title: '花束定制' },
      { name: '购物车', title: '购物车' },
    ],
    cssVars: {
      '--color-primary': '#C2185B',
      '--color-primary-light': '#FCE4EC',
      '--color-bg': '#FFF0F3',
      '--color-card': '#FFFFFF',
      '--color-price': '#AD1457',
      '--color-accent': '#4CAF50',
    },
    content: {
      products: [
        { name: '卡罗拉红玫瑰花束', price: '99', desc: '11朵红玫瑰 满天星搭配 含精美包装', tag: '表白首选' },
        { name: '永生花玻璃罩礼盒', price: '199', desc: '厄瓜多尔玫瑰 保存3-5年 附灯串', tag: '纪念日之选' },
        { name: '节日礼盒套装', price: '299', desc: '花束+巧克力+贺卡 三合一精装礼盒', tag: '送礼万能' },
        { name: '龟背竹绿植盆栽', price: '59', desc: '水培养护 好养活 净化空气 高约30cm', tag: '办公室伴侣' },
        { name: '向日葵混搭花束', price: '129', desc: '6朵向日葵+尤加利叶 阳光治愈系', tag: '毕业季特供' },
        { name: '干花相框摆件', price: '79', desc: '手工压花 A4实木相框 可定制姓名', tag: '手工定制' },
      ],
      categories: ['鲜花', '永生花', '绿植', '礼盒'],
      notices: [
        '当日达 11点前下单 下午送到',
        '生日当月下单 赠送手写贺卡',
        '教师节特惠 全场满199减30',
      ],
      features: [
        { title: '花束定制', desc: '自选花材颜色包装 打造独一无二的心意' },
        { title: '定时配送', desc: '预约指定日期时段配送 惊喜准时送达' },
        { title: '养花指南', desc: '附赠养护说明 延长鲜花观赏期' },
      ],
    },
  },
];
