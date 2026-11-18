export const exportDialogContent = {
  title: '导出与发布',
  close: '关闭',
  projectNameLabel: '项目名称',
  projectNamePlaceholder: '例如：我的应用',
  subdomainLabel: '公开子域名',
  subdomainPlaceholder: '例如：my-app-preview',

  publishOnline: {
    title: '在线发布',
    description: '已托管的应用请在言灵工作台内在线编辑并重新发布。',
    button: '在线发布',
    publishing: '发布中...',
    successMessage: (path: string) => `已发布至 ${path}`,
  },

  sourceExport: {
    title: '导出可维护的 React 工程',
    description: 'React 源码导出用于后续线下二次开发，不保证可反向导入回言灵工作台。',
    badge: '确定性构建',
    button: '导出 React 工程',
    building: '构建中...',
    successMessage: (path: string) => `已导出至 ${path}`,
    openFolder: '打开输出目录',
  },

  saveJson: {
    title: '下载布局 JSON',
    description: '保存标准布局文档，用于调试、备份或接入自定义工具链。',
    button: '下载 JSON',
    buttonElectron: '保存 JSON',
    successMessage: '已保存',
  },

  errors: {
    noCanvases: '当前没有可导出的画布。',
    missingToken: '请先登录后再进行在线发布。',
    publishFailed: (msg: string) => `发布失败：${msg}`,
    buildFailed: (msg: string) => `构建失败：${msg}`,
  },
} as const;
