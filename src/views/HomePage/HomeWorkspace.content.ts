export const homeWorkspaceContent = {
  sidebar: {
    workspace: '工作台',
    userSettings: '用户设置',
    items: [
      { id: 'marketplace', label: '模板' },
      { id: 'mine', label: '我的' },
    ],
  },
  search: {
    title: '今天想创建什么应用？',
    placeholder: '搜索模板、行业、场景、标签或自己的项目',
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
    title: '模板市场',
    empty: '没有找到匹配的市场模板。',
    start: '开始编辑',
    preview: '预览',
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
