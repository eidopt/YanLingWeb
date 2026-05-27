export const homeWorkspaceContent = {
  sidebar: {
    workspace: '工作台',
    userSettings: '用户设置',
    items: [
      { id: 'home', label: '首页' },
      { id: 'templates', label: '模板' },
      { id: 'mine', label: '我的' },
    ],
  },
  search: {
    title: '今天要生产什么应用',
    placeholder: '搜索模板广场里的小程序、官网、后台、活动页模板；也可以直接写需求，例如：给本地咖啡店做一个可预约、可领券、可发布到微信的小程序首页',
  },
  actions: {
    market: '模板市场',
    mine: '我的模板',
  },
  mineOverview: {
    title: '我的模板',
    empty: '还没有自己的模板，从模板市场选择一个开始编辑。',
    viewAll: '查看全部',
  },
  mine: {
    title: '我的模板',
    empty: '当前关键词下没有匹配的我的模板。',
  },
  marketplace: {
    title: '模板广场',
    empty: '没有找到匹配的市场模板。',
    start: '开始编辑',
    preview: '预览',
  },
  category: {
    heading: '应用类别',
    all: '全部模板',
  },
  platform: {
    heading: '平台类型',
    all: '全部平台',
    items: [
      { key: 'mini-program', label: '微信小程序' },
      { key: 'mobile-app', label: '手机 App' },
      { key: 'tablet-app', label: '平板 App' },
      { key: 'web', label: '网页' },
    ],
  },
  meta: {
    templateId: '模板 ID',
    source: '来源',
    updated: '更新',
    tags: '标签',
    noUpdate: '暂无更新',
  },
  loading: '正在加载模板...',
  errorPrefix: '加载失败：',
} as const;
