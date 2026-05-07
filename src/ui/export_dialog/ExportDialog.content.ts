export const exportDialogContent = {
  title: '导出项目',
  close: '关闭',
  projectNameLabel: '项目名称',
  projectNamePlaceholder: '例如 my-app',

  saveJson: {
    title: '保存布局 JSON',
    description: '将当前所有画布的布局结构保存为 layout.json，可在任意环境中重新导入。',
    button: '下载 JSON',
    buttonElectron: '保存 JSON',
    successMessage: '已保存',
  },

  buildProject: {
    title: '编译输出',
    description: '生成独立的 Web 项目脚手架并自动编译，输出可直接部署的静态页面。',
    badge: '仅 Electron',
    button: '一键构建',
    building: '构建中…',
    successMessage: (path: string) => `已输出到 ${path}`,
    openFolder: '打开输出目录',
    webUnsupported: '在网页版中不可用，请使用 Electron 桌面版运行此功能。',
  },

  errors: {
    noCanvases: '没有可导出的画布内容。',
    unknownTheme: '当前主题暂不支持导出，请检查主题注册。',
    buildFailed: (msg: string) => `构建失败：${msg}`,
  },
} as const;
