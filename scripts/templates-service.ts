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
    services?: { name: string; price: string; desc: string; duration?: string }[];
    categories?: string[];
    features?: { title: string; desc: string }[];
    testimonials?: { name: string; text: string; rating: number }[];
  };
}

export const SERVICE_TEMPLATES: TemplatePattern[] = [
  // ───────────────────────────────────────────────
  // 1. 家政保洁 — Home Cleaning
  // ───────────────────────────────────────────────
  {
    id: 'service-home-cleaning',
    name: '家政保洁',
    tagline: '专业保洁，焕然一新',
    description: '面向家政保洁公司的微信小程序模板，主打日常保洁、深度清洁等服务的在线预约与订单管理，界面清新简洁，适合快速上线。',
    category: 'service',
    functionalCategory: 'local-life',
    tags: ['家政', '保洁', '清洁', '预约', '小程序'],
    traits: ['清新', '实用', '简洁'],
    accent: '#2196F3',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'services', title: '服务' },
      { name: 'booking', title: '预约' },
      { name: 'orders', title: '订单' },
      { name: 'profile', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#2196F3',
      '--color-primary-light': '#BBDEFB',
      '--color-primary-dark': '#1565C0',
      '--color-accent': '#42A5F5',
      '--color-bg': '#F5F9FC',
      '--color-surface': '#FFFFFF',
      '--color-text': '#1A1A2E',
      '--color-text-secondary': '#6B7280',
      '--color-border': '#E3EBF2',
      '--color-success': '#4CAF50',
      '--color-warning': '#FF9800',
      '--radius-card': '12px',
      '--radius-button': '8px',
      '--shadow-card': '0 2px 12px rgba(33,150,243,0.08)',
    },
    content: {
      services: [
        { name: '日常保洁', price: '¥50/时', desc: '日常家庭清洁，包含地面、厨房、卫生间基础打扫', duration: '2-3小时' },
        { name: '深度清洁', price: '¥200/次', desc: '全屋深度清洁，包含死角除尘、油烟机清洗等', duration: '4-6小时' },
        { name: '开荒保洁', price: '¥500/次', desc: '新房装修后首次清洁，处理建筑垃圾与粉尘', duration: '6-8小时' },
        { name: '家电清洗', price: '¥80/台', desc: '空调、洗衣机、冰箱等家电的专业拆机清洗', duration: '1-2小时' },
        { name: '地毯清洗', price: '¥15/平米', desc: '地毯深层去污杀菌，恢复蓬松质感', duration: '按面积' },
      ],
      categories: ['日常保洁', '深度清洁', '开荒保洁', '家电清洗', '地毯清洗'],
      features: [
        { title: '持证上岗', desc: '所有保洁人员均经过专业培训并持有健康证' },
        { title: '放心保障', desc: '服务全程上险，物品损坏照价赔偿' },
        { title: '随时预约', desc: '支持当天预约，最快2小时上门' },
      ],
      testimonials: [
        { name: '王女士', text: '预约了深度清洁，师傅非常专业，油烟机洗得跟新的一样，下次还会回购！', rating: 5 },
        { name: '李先生', text: '新房开荒做了整整一天，效果很好，角角落落都打扫得很干净。', rating: 5 },
        { name: '张阿姨', text: '每周预约日常保洁，阿姨很准时也很细心，家里一直保持整洁。', rating: 4 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 2. 宠物医院 — Pet Hospital
  // ───────────────────────────────────────────────
  {
    id: 'service-pet-hospital',
    name: '宠物医院',
    tagline: '用心守护，毛孩健康',
    description: '宠物医院小程序模板，涵盖体检、疫苗、诊疗等服务在线预约，支持宠物档案管理，温暖治愈的绿色系设计风格。',
    category: 'service',
    functionalCategory: 'local-life',
    tags: ['宠物', '医院', '兽医', '疫苗', '小程序'],
    traits: ['温暖', '治愈', '专业'],
    accent: '#4CAF50',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'departments', title: '科室' },
      { name: 'booking', title: '预约' },
      { name: 'pets', title: '我的宠物' },
    ],
    cssVars: {
      '--color-primary': '#4CAF50',
      '--color-primary-light': '#C8E6C9',
      '--color-primary-dark': '#2E7D32',
      '--color-accent': '#81C784',
      '--color-bg': '#F1F8E9',
      '--color-surface': '#FFFFFF',
      '--color-text': '#1B2A1B',
      '--color-text-secondary': '#5F7A5F',
      '--color-border': '#D7E8D0',
      '--color-success': '#66BB6A',
      '--color-warning': '#FFA726',
      '--radius-card': '16px',
      '--radius-button': '20px',
      '--shadow-card': '0 4px 16px rgba(76,175,80,0.1)',
    },
    content: {
      services: [
        { name: '体检套餐', price: '¥120', desc: '血常规、生化、B超等全面体检，及时发现潜在健康问题' },
        { name: '疫苗接种', price: '¥80', desc: '犬猫核心疫苗接种，包含狂犬、猫三联、犬四联等' },
        { name: '绝育手术', price: '¥500', desc: '微创绝育手术，术前检查+麻醉+术后护理一站式' },
        { name: '洗澡美容', price: '¥60', desc: '专业洗护，包含药浴、修剪指甲、清洁耳朵等' },
      ],
      categories: ['体检', '疫苗', '手术', '洗护', '内科', '骨科'],
      features: [
        { title: '24小时急诊', desc: '全年无休急诊服务，深夜突发状况也能及时处理' },
        { title: '在线问诊', desc: '图文/视频在线咨询，专业兽医在线解答疑问' },
        { title: '上门服务', desc: '支持上门打疫苗、体检等轻量级服务' },
      ],
      testimonials: [
        { name: '猫咪妈妈', text: '带我家布偶来打疫苗，医生非常温柔有耐心，猫猫一点都不害怕，强烈推荐！', rating: 5 },
        { name: '柴犬爸爸', text: '半夜狗狗突然呕吐，多亏有24小时急诊，处理得很及时，非常感谢。', rating: 5 },
        { name: '仓鼠主人', text: '在线问诊很方便，医生回复很快，小问题不用跑一趟医院了。', rating: 4 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 3. 汽车维修 — Auto Repair
  // ───────────────────────────────────────────────
  {
    id: 'service-auto-repair',
    name: '汽车维修',
    tagline: '专业养车，一路畅行',
    description: '汽车维修保养小程序模板，支持保养、钣金、轮胎等服务在线下单，暗色系搭配橙色点缀，体现专业与信赖感。',
    category: 'service',
    functionalCategory: 'local-life',
    tags: ['汽车', '维修', '保养', '车险', '小程序'],
    traits: ['专业', '稳重', '可靠'],
    accent: '#FF6D00',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'services', title: '服务' },
      { name: 'booking', title: '预约' },
      { name: 'orders', title: '订单' },
      { name: 'mycar', title: '我的车' },
    ],
    cssVars: {
      '--color-primary': '#FF6D00',
      '--color-primary-light': '#FFE0B2',
      '--color-primary-dark': '#E65100',
      '--color-accent': '#FF9100',
      '--color-bg': '#1A1A1A',
      '--color-surface': '#2A2A2A',
      '--color-text': '#F5F5F5',
      '--color-text-secondary': '#9E9E9E',
      '--color-border': '#3A3A3A',
      '--color-success': '#66BB6A',
      '--color-warning': '#FFB74D',
      '--radius-card': '8px',
      '--radius-button': '6px',
      '--shadow-card': '0 2px 8px rgba(0,0,0,0.3)',
    },
    content: {
      services: [
        { name: '常规保养', price: '¥299', desc: '机油、机滤更换，全车油液检查，30项安全检测', duration: '约1小时' },
        { name: '钣金喷漆', price: '¥500起', desc: '车身钣金修复、局部/全车喷漆，原厂色号调配', duration: '1-3天' },
        { name: '轮胎更换', price: '¥300/条', desc: '四轮定位+动平衡，品牌轮胎质保3年', duration: '约40分钟' },
        { name: '年检代办', price: '¥200', desc: '全程代办年检，无需车主到场，省时省心', duration: '1个工作日' },
        { name: '空调维修', price: '¥150起', desc: '空调不制冷、异味等问题检测与维修', duration: '约1.5小时' },
      ],
      categories: ['常规保养', '钣金喷漆', '轮胎服务', '年检代办', '空调维修', '电器维修'],
      features: [
        { title: '透明报价', desc: '所有维修项目明码标价，维修前确认报价，杜绝隐形消费' },
        { title: '正品配件', desc: '全部使用品牌正品配件，支持溯源查验' },
        { title: '质保无忧', desc: '维修项目享6个月质保，保养项目享3个月质保' },
      ],
      testimonials: [
        { name: '陈先生', text: '保养服务很专业，价格透明，全程可以通过小程序查看维修进度，放心！', rating: 5 },
        { name: '刘女士', text: '钣金喷漆效果很好，完全看不出修过的痕迹，三天就取车了。', rating: 5 },
        { name: '赵先生', text: '年检代办太方便了，提交资料后全程不用管，第二天就搞定了。', rating: 4 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 4. 摄影写真 — Photography Studio
  // ───────────────────────────────────────────────
  {
    id: 'service-photography',
    name: '摄影写真',
    tagline: '定格美好，留住时光',
    description: '摄影工作室小程序模板，展示作品集与套餐详情，支持在线预约拍摄，艺术感紫色调设计，突出视觉美学。',
    category: 'service',
    functionalCategory: 'local-life',
    tags: ['摄影', '写真', '证件照', '婚纱', '小程序'],
    traits: ['艺术', '精致', '浪漫'],
    accent: '#9C27B0',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'portfolio', title: '作品' },
      { name: 'packages', title: '套餐' },
      { name: 'booking', title: '预约' },
      { name: 'profile', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#9C27B0',
      '--color-primary-light': '#E1BEE7',
      '--color-primary-dark': '#6A1B9A',
      '--color-accent': '#CE93D8',
      '--color-bg': '#FAF5FC',
      '--color-surface': '#FFFFFF',
      '--color-text': '#2D1B33',
      '--color-text-secondary': '#7B6B80',
      '--color-border': '#E8D8EE',
      '--color-success': '#66BB6A',
      '--color-warning': '#FFB74D',
      '--radius-card': '14px',
      '--radius-button': '24px',
      '--shadow-card': '0 4px 20px rgba(156,39,176,0.08)',
    },
    content: {
      services: [
        { name: '证件照', price: '¥59', desc: '一寸/二寸证件照拍摄+精修，含电子版与打印版', duration: '约30分钟' },
        { name: '个人写真', price: '¥699', desc: '2套服装+精修15张+原片全送，含妆造', duration: '约3小时' },
        { name: '情侣写真', price: '¥999', desc: '3套服装+精修20张+原片全送，含双人妆造', duration: '约4小时' },
        { name: '全家福', price: '¥1299', desc: '4套服装+精修25张+相册一本，含全家妆造', duration: '约5小时' },
        { name: '毕业写真', price: '¥599', desc: '学士服+便装2套+精修12张，记录珍贵时刻', duration: '约2.5小时' },
      ],
      categories: ['证件照', '个人写真', '情侣写真', '全家福', '毕业写真', '商业拍摄'],
      features: [
        { title: '资深团队', desc: '摄影师均拥有5年以上商业拍摄经验，审美在线' },
        { title: '妆造一体', desc: '专业化妆师驻场，根据风格定制妆面与发型' },
        { title: '精修保障', desc: '不满意可免费重修，直到满意为止' },
      ],
      testimonials: [
        { name: '小美', text: '拍的个人写真太好看了！摄影师很会引导，全程轻松愉快，出片效果超出预期。', rating: 5 },
        { name: '阿杰&小慧', text: '情侣写真拍得很自然，不是那种尬摆的，抓拍到了很多甜蜜瞬间。', rating: 5 },
        { name: '王家', text: '全家福拍得很温馨，爷爷奶奶也很开心，摄影师特别有耐心。', rating: 5 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 5. 法律咨询 — Legal Consultation
  // ───────────────────────────────────────────────
  {
    id: 'service-legal',
    name: '法律咨询',
    tagline: '专业法律，为您护航',
    description: '法律咨询服务网站模板，展示律师团队与服务项目，支持在线咨询预约，深蓝色专业设计，传递权威与信赖。',
    category: 'service',
    functionalCategory: 'professional',
    tags: ['法律', '律师', '咨询', '合同', 'web'],
    traits: ['专业', '权威', '严谨'],
    accent: '#1A237E',
    platform: 'web',
    chrome: 'none',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'services', title: '服务' },
      { name: 'lawyers', title: '律师' },
      { name: 'consult', title: '咨询' },
      { name: 'profile', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#1A237E',
      '--color-primary-light': '#C5CAE9',
      '--color-primary-dark': '#0D1642',
      '--color-accent': '#3949AB',
      '--color-bg': '#F4F6FA',
      '--color-surface': '#FFFFFF',
      '--color-text': '#111827',
      '--color-text-secondary': '#6B7280',
      '--color-border': '#D1D5DB',
      '--color-success': '#059669',
      '--color-warning': '#D97706',
      '--radius-card': '6px',
      '--radius-button': '4px',
      '--shadow-card': '0 1px 6px rgba(26,35,126,0.06)',
    },
    content: {
      services: [
        { name: '婚姻家事', price: '¥200/次', desc: '离婚诉讼、财产分割、子女抚养权、遗产继承等', duration: '60分钟' },
        { name: '劳动纠纷', price: '¥300/次', desc: '劳动仲裁、工伤赔偿、违法辞退、加班费追讨等', duration: '60分钟' },
        { name: '合同审查', price: '¥500/次', desc: '各类合同条款审查、风险提示、修改建议', duration: '1-3个工作日' },
        { name: '知识产权', price: '¥800/次', desc: '商标注册、专利申请、著作权保护、侵权维权', duration: '60分钟' },
        { name: '刑事辩护', price: '¥1500/次', desc: '刑事案件法律咨询、取保候审、辩护代理', duration: '90分钟' },
      ],
      categories: ['婚姻家事', '劳动纠纷', '合同审查', '知识产权', '刑事辩护', '房产纠纷'],
      features: [
        { title: '资深律师', desc: '所有律师均具备5年以上执业经验，专注各自领域' },
        { title: '隐私保护', desc: '严格遵守律师保密义务，所有咨询内容绝不外泄' },
        { title: '高效响应', desc: '提交咨询后30分钟内律师回复，紧急情况即时对接' },
      ],
      testimonials: [
        { name: '张先生', text: '劳动仲裁咨询非常专业，律师帮我理清了思路，最终拿到了应得的赔偿。', rating: 5 },
        { name: '刘女士', text: '离婚财产分割问题困扰了我很久，律师的分析很透彻，让我心里有了底。', rating: 5 },
        { name: '王总', text: '公司合同审查做得很细致，指出了好几个风险条款，避免了潜在损失。', rating: 5 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 6. 健身私教 — Personal Training
  // ───────────────────────────────────────────────
  {
    id: 'service-personal-training',
    name: '健身私教',
    tagline: '科学健身，遇见更好的自己',
    description: '健身私教APP模板，展示教练团队与课程体系，支持体能评估与课程预约，充满活力的红色设计，激发运动热情。',
    category: 'service',
    functionalCategory: 'health-fitness',
    tags: ['健身', '私教', '运动', '减肥', 'APP'],
    traits: ['活力', '动感', '专业'],
    accent: '#E53935',
    platform: 'mobile-app',
    chrome: 'app',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'courses', title: '课程' },
      { name: 'coaches', title: '教练' },
      { name: 'booking', title: '预约' },
      { name: 'profile', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#E53935',
      '--color-primary-light': '#FFCDD2',
      '--color-primary-dark': '#B71C1C',
      '--color-accent': '#FF5252',
      '--color-bg': '#FFF5F5',
      '--color-surface': '#FFFFFF',
      '--color-text': '#1A1A1A',
      '--color-text-secondary': '#757575',
      '--color-border': '#E0E0E0',
      '--color-success': '#4CAF50',
      '--color-warning': '#FF9800',
      '--radius-card': '12px',
      '--radius-button': '8px',
      '--shadow-card': '0 2px 12px rgba(229,57,53,0.08)',
    },
    content: {
      services: [
        { name: '体能评估', price: '¥99', desc: '体脂率、肌肉量、柔韧性、心肺功能全面测评', duration: '约45分钟' },
        { name: '私教课程', price: '¥300/节', desc: '一对一专属训练计划，针对性提升体能与体型', duration: '60分钟' },
        { name: '团体课程', price: '¥80/节', desc: '小班授课，包含搏击操、瑜伽、动感单车等', duration: '45-60分钟' },
        { name: '营养方案', price: '¥199', desc: '根据体测数据定制饮食计划，配合训练效果最大化' },
        { name: '拉伸放松', price: '¥120/次', desc: '专业运动康复师辅助拉伸，缓解肌肉酸痛', duration: '30分钟' },
      ],
      categories: ['力量训练', '减脂塑形', '体态矫正', '产后恢复', '搏击格斗', '瑜伽普拉提'],
      features: [
        { title: '科学评估', desc: '通过InBody等专业设备进行体测，用数据制定训练计划' },
        { title: '签约教练', desc: '所有教练持有ACE/NSCA等国际认证，实战经验丰富' },
        { title: '效果追踪', desc: '定期体测复测，可视化训练成果，动态调整计划' },
      ],
      testimonials: [
        { name: '小林', text: '跟教练练了3个月，体脂从28%降到了20%，效果非常明显，教练很专业也很负责！', rating: 5 },
        { name: '阿伟', text: '之前自己练总是受伤，私教帮我纠正了动作，现在训练安全又高效。', rating: 5 },
        { name: '小雨', text: '团课氛围很好，搏击操特别解压，每次上完课心情都很好。', rating: 4 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 7. 鲜花配送 — Flower Delivery
  // ───────────────────────────────────────────────
  {
    id: 'service-flower-delivery',
    name: '鲜花配送',
    tagline: '以花传情，让爱绽放',
    description: '鲜花配送小程序模板，展示花束分类与定制服务，支持在线下单与配送追踪，柔美粉色系设计，营造浪漫温馨氛围。',
    category: 'service',
    functionalCategory: 'e-commerce',
    tags: ['鲜花', '花束', '配送', '定制', '小程序'],
    traits: ['浪漫', '精致', '柔美'],
    accent: '#EC407A',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'categories', title: '分类' },
      { name: 'custom', title: '定制' },
      { name: 'orders', title: '订单' },
    ],
    cssVars: {
      '--color-primary': '#EC407A',
      '--color-primary-light': '#FCE4EC',
      '--color-primary-dark': '#C2185B',
      '--color-accent': '#F48FB1',
      '--color-bg': '#FFF0F5',
      '--color-surface': '#FFFFFF',
      '--color-text': '#3E2723',
      '--color-text-secondary': '#8D6E63',
      '--color-border': '#F3E0E7',
      '--color-success': '#66BB6A',
      '--color-warning': '#FFB74D',
      '--radius-card': '16px',
      '--radius-button': '24px',
      '--shadow-card': '0 4px 20px rgba(236,64,122,0.08)',
    },
    content: {
      services: [
        { name: '日常花束', price: '¥99', desc: '精选时令花材，日常表达心意的首选', duration: '2小时送达' },
        { name: '周花订阅', price: '¥299/月', desc: '每周一束新鲜花材，为生活注入仪式感', duration: '每周配送' },
        { name: '婚礼花艺', price: '¥2999起', desc: '婚礼现场花艺布置，含手捧花、胸花、拱门等', duration: '提前7天预约' },
        { name: '商务花篮', price: '¥399', desc: '开业庆典、活动祝贺等商务用花，高端大气', duration: '3小时送达' },
        { name: '永生花礼', price: '¥259', desc: '进口永生花礼盒，可保存3-5年，送礼佳选' },
        { name: '花艺课程', price: '¥168/次', desc: '亲手制作花束，专业花艺师手把手教学', duration: '约2小时' },
      ],
      categories: ['日常花束', '爱情系列', '生日系列', '探望慰问', '商务用花', '永生花'],
      features: [
        { title: '当日达', desc: '下单后2小时内极速配送，新鲜直达' },
        { title: '花艺师设计', desc: '每束花均由专业花艺师手工制作，拒绝流水线' },
        { title: '保鲜承诺', desc: '鲜花7天凋谢免费补送，永生花1年质保' },
      ],
      testimonials: [
        { name: '匿名用户', text: '给女朋友订的生日花束，她非常喜欢！花材新鲜，包装也很精美。', rating: 5 },
        { name: '陈经理', text: '公司开业订了6个花篮，准时送达，摆放效果很好，客户都夸好看。', rating: 5 },
        { name: '花花', text: '周花订阅太棒了，每周收到不同的花，家里总有花香，心情好极了。', rating: 5 },
      ],
    },
  },

  // ───────────────────────────────────────────────
  // 8. 家电维修 — Appliance Repair
  // ───────────────────────────────────────────────
  {
    id: 'service-appliance-repair',
    name: '家电维修',
    tagline: '家电故障，快速上门',
    description: '家电维修小程序模板，覆盖空调、洗衣机、冰箱等常见家电的维修服务，实用灰蓝配色，突出高效与可靠。',
    category: 'service',
    functionalCategory: 'local-life',
    tags: ['家电', '维修', '上门', '售后', '小程序'],
    traits: ['实用', '可靠', '高效'],
    accent: '#546E7A',
    platform: 'mini-program',
    chrome: 'wechat',
    pages: [
      { name: 'home', title: '首页' },
      { name: 'services', title: '服务' },
      { name: 'booking', title: '预约' },
      { name: 'orders', title: '订单' },
      { name: 'profile', title: '我的' },
    ],
    cssVars: {
      '--color-primary': '#546E7A',
      '--color-primary-light': '#CFD8DC',
      '--color-primary-dark': '#37474F',
      '--color-accent': '#78909C',
      '--color-bg': '#F5F7F9',
      '--color-surface': '#FFFFFF',
      '--color-text': '#263238',
      '--color-text-secondary': '#78909C',
      '--color-border': '#E0E4E8',
      '--color-success': '#43A047',
      '--color-warning': '#FB8C00',
      '--radius-card': '8px',
      '--radius-button': '6px',
      '--shadow-card': '0 1px 8px rgba(84,110,122,0.08)',
    },
    content: {
      services: [
        { name: '空调维修', price: '¥80起', desc: '不制冷、漏水、异响等故障检测与维修', duration: '约1小时' },
        { name: '洗衣机维修', price: '¥100起', desc: '不脱水、不进水、异响、门锁故障等维修', duration: '约1小时' },
        { name: '冰箱维修', price: '¥120起', desc: '不制冷、结冰严重、压缩机故障等维修', duration: '约1.5小时' },
        { name: '热水器维修', price: '¥90起', desc: '不加热、漏水、温度不稳等故障维修', duration: '约1小时' },
        { name: '油烟机维修', price: '¥70起', desc: '不吸烟、噪音大、按键失灵等维修', duration: '约40分钟' },
      ],
      categories: ['空调', '洗衣机', '冰箱', '热水器', '油烟机', '电视'],
      features: [
        { title: '快速上门', desc: '下单后最快30分钟上门，减少等待时间' },
        { title: '明码标价', desc: '维修费+配件费分开报价，先报价后维修' },
        { title: '质保服务', desc: '维修后享90天质保，同一故障免费返修' },
      ],
      testimonials: [
        { name: '李大爷', text: '空调不制冷，师傅来了检查后发现是缺氟，加了氟利昂就好了，收费合理。', rating: 5 },
        { name: '周女士', text: '洗衣机不脱水，师傅上门很快，换了个零件就修好了，还教我怎么保养。', rating: 5 },
        { name: '何先生', text: '冰箱结冰严重，师傅清理后还帮我检查了密封条，服务很贴心。', rating: 4 },
      ],
    },
  },
];
