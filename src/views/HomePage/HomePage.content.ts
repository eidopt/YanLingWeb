export const homePageContent = {
  hero: {
    eyebrow: 'AI 驱动 · 全平台可视化生产工作台',
    titleWords: ['把一个想法', '生产成可编辑应用', '再发布到各平台'],
    sub: '从需求拆解、页面生成、模板匹配、可视化编辑到发布准备，' + '把 AI 起稿和人工精修放进同一个生产工作台。',
    ctaPrimary: '打开 AI 工作台',
    ctaSecondary: '查看生产模板',
    hint: '生成后可继续编辑 · 保存为自己的项目资产',
  },

  stats: [
    { value: '3 分钟', label: '生成首版页面' },
    { value: '50+', label: '模板广场版式' },
    { value: '0 代码', label: '创建与编辑' },
    { value: '一键', label: '代发布上线' },
  ],

  heroStudio: {
    promptTitle: 'AI 正在编辑',
    prompt: '把首页改成适合健身私教获客的小程序，加课程卡片、预约按钮和会员权益。',
    chips: ['生成 Hero', '添加预约区', '优化移动端'],
    canvasTitle: '健身私教小程序',
    canvasPages: ['首页', '课程', '预约'],
    editorTitle: '属性面板',
    layers: ['Hero 首屏', '课程卡片', '预约 CTA', '会员权益'],
    sidebarTitle: '组件库',
    sidebarItems: ['Hero', '卡片', '表单', '价格'],
    inspectorItems: [
      { label: '主题色', value: '品牌色 token' },
      { label: '圆角', value: '2x baseUnit' },
      { label: '间距', value: '舒适' },
    ],
    statusItems: [
      { label: 'AI 解析需求', value: '完成' },
      { label: '拖入预约组件', value: '进行中' },
      { label: '响应式排版', value: '自动适配' },
    ],
  },

  creationModes: {
    eyebrow: '创建方式',
    title: '想快就用模板，想特别就自由创建',
    sub: '从模板开始、从一句话开始，或在可视化画布里直接调整，三种方式都能进入同一个编辑器。',
    items: [
      {
        icon: '🏛️',
        color: 'var(--app-color-primary)',
        title: '模板广场起步',
        desc: '从餐饮、电商、预约、作品集、SaaS 等场景中挑选成熟排版，替换内容即可上线。',
        meta: '最快路径',
      },
      {
        icon: '✨',
        color: 'var(--app-color-rose)',
        title: '自由描述生成',
        desc: '用自然语言描述目标用户、业务场景和页面结构，AI 自动生成首版网页或 APP 界面。',
        meta: '从 0 到 1',
      },
      {
        icon: '🧩',
        color: 'var(--app-color-success)',
        title: '可视化手动编辑',
        desc: 'AI 结果不满意时，直接拖拽区块、调整样式、替换文案和图片，细节完全可控。',
        meta: '精修细节',
      },
    ],
  },

  studio: {
    eyebrow: '在线工作台',
    title: 'AI 生成不是终点，真正的产品要能继续编辑',
    sub: '在同一个界面中完成提示词生成、模板替换、响应式预览、区块编辑、保存版本和发布准备。',
    bullets: [
      '左侧输入业务想法，AI 拆解页面结构、组件层级和文案',
      '中间实时预览网页、H5 或小程序布局，支持桌面和移动端切换',
      '右侧手动编辑颜色、间距、组件顺序和发布配置',
      '保存后形成自己的项目资产，后续可继续迭代或复制新版本',
    ],
    cta: '进入编辑器',
  },

  publishFlow: {
    eyebrow: '代发布能力',
    title: '不止生成页面，还帮你走到上线',
    sub: '从构建、部署、审核到后续更新，把复杂发布流程收进一个按钮里。',
    items: [
      {
        title: '保存项目',
        desc: '生成结果沉淀为可编辑项目，保留页面结构、主题、素材和发布配置。',
      },
      {
        title: '自动构建',
        desc: '按目标平台生成网页、小程序或移动端包，并自动完成基础性能优化。',
      },
      {
        title: '代理提交',
        desc: '代处理网页部署和微信小程序提交审核，减少账号、配置、审核材料的操作成本。',
      },
      {
        title: '持续更新',
        desc: '上线后继续编辑内容或布局，一键生成新版本并推送到对应平台。',
      },
    ],
  },

  platforms: {
    eyebrow: '全平台输出',
    title: '设计一次，覆盖所有端',
    sub: '无论用户在哪里，你的应用都能找到他们',
    items: [
      {
        icon: '🌐',
        title: '网页 / H5',
        badge: '即时访问',
        color: 'var(--app-color-primary)',
        desc: '生成标准 HTML/CSS/JS，支持响应式布局，一键部署上线，无需安装，随改随发。',
        tags: ['响应式', 'SEO 友好', '跨浏览器'],
      },
      {
        icon: '💬',
        title: '微信小程序',
        badge: '10 亿用户',
        color: 'var(--app-color-wechat)',
        desc: '输出符合微信规范的代码，代理完成审核提交，无需开发者账号操作经验即可上线。',
        tags: ['代理发布', '微信生态', '一键审核'],
      },
      {
        icon: '📱',
        title: 'iOS & Android',
        badge: '原生体验',
        color: 'var(--app-color-rose)',
        desc: '一键打包为原生 App 安装包，代理完成 App Store / Google Play 上架申请全流程。',
        tags: ['一键打包', '双端覆盖', '代理上架'],
      },
      {
        icon: '🖥️',
        title: '桌面端软件',
        badge: 'Electron',
        color: 'var(--app-color-amber)',
        desc: '打包为 .exe / .dmg 安装程序，一键生成可分发安装包，离线可用，随版本迭代更新。',
        tags: ['Win / macOS', '离线可用', '版本管理'],
      },
    ],
  },

  aiFeatures: {
    eyebrow: '设计细节',
    title: 'AI 负责起稿，你保留最终控制权',
    sub: '这里聚焦生成后的细节调整，避免重复讲模板、保存和发布。',
    items: [
      { icon: '🎨', title: '智能配色', desc: '上传品牌色，AI 自动生成协调完整的色彩系统' },
      {
        icon: '📐',
        title: '自适应布局',
        desc: '根据内容密度自动推导桌面和移动端排版，减少断点适配成本',
      },
      {
        icon: '🧱',
        title: '组件变体',
        desc: '为表单、卡片、导航、列表等常见模块生成多种视觉方案',
      },
      { icon: '✍️', title: '文案补全', desc: '根据页面目标生成标题、卖点、按钮文案和空状态提示' },
      { icon: '🖱️', title: '交互状态', desc: '补齐 hover、loading、empty、success 等真实产品状态' },
      { icon: '🔍', title: '可读性检查', desc: '检查层级、对比度和信息密度，让生成页面更像成熟产品' },
    ],
  },

  templates: {
    eyebrow: '模板广场',
    title: '不知道从哪里开始？',
    sub: '覆盖主流业务场景的精选模板，改改文字就能上线',
    useBtn: '使用此模板',
    editBtn: '在编辑器中打开',
    moreBtn: '查看全部模板 →',
  },

  aiFeaturesCta: '立即体验',

  chat: {
    fabTitle: 'AI 助手',
    panelTitle: 'AI 设计助手',
    onlineLabel: '在线',
    placeholder: '描述你想要的应用...',
    sendBtn: '发送',
    greeting: '你好！告诉我你想设计什么类型的应用，我来帮你快速出方案 ✨',
    fallbackReply: 'AI 对话功能正在接入中，敬请期待 🚀',
  },
} as const;
