export const templatesPageContent = {
  allCategory: '全部',
  title: '模板库',
  subtitle: '选择一个模板，快速开始设计你的小程序页面。',
  searchPlaceholder: '搜索模板名称、标签、描述…',
  previewHint: '点击预览',
  emptyState: '没有找到符合条件的模板。',
  emptyStateHint: '试试调整筛选条件或清除搜索词。',
  emptyStateClearSearch: '清除搜索',
  loadingText: '加载模板中…',
  sortLabel: '排序',
  sortOptions: {
    default: '默认',
    'name-asc': '按名称排序',
    newest: '最新',
  },
  resultCount: (count: number) => `${count} 个模板`,
  searchShortcut: '快捷键 Ctrl+K',
} as const;
