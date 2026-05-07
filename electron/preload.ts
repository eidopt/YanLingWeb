import type { ElectronBridge } from '../src/electron';
import type { ExportBuildPayload } from '../src/types/export.types';
import { contextBridge, ipcRenderer } from 'electron';

// ─── 安全桥接层 ────────────────────────────────────────────────────────────────
// 渲染进程（src/）绝对不能直接 import 'electron'。
// 所有 Electron 能力都通过这里的 contextBridge 暴露为 window.electronBridge，
// 主进程在 electron/main.ts 里通过 ipcMain.handle() 实现对应的处理逻辑。
// ──────────────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronBridge', {
  platform: 'electron' as const,

  // ── 导出 / 编译输出管道 ────────────────────────────────────────────────────
  //
  // 数据流：
  //   渲染进程序列化当前画布 → 调用下方方法 → 主进程写文件 / 调用 vite build
  //   → 返回输出路径 → 渲染进程显示成功状态 + "打开目录"按钮
  //
  // 对应的 main.ts 处理器见 ipcMain.handle('export:*') 部分。

  /**
   * 将 layout.json 内容写入 output/<projectName>.json（开发态）
   * 或 ~/Documents/ai-app-exports/<projectName>.json（生产包）。
   * 返回写入后的绝对路径。
   */
  exportSaveJson: (filename: string, content: string): Promise<string> =>
    ipcRenderer.invoke('export:saveJson', filename, content),

  /**
   * 一键编译输出：
   *   1. 在 output/<projectName>/ 写入脚手架文件
   *      （layout.json、index.html、src/main.tsx、src/App.tsx、
   *        vite.config.ts、tsconfig.json）
   *   2. 使用主项目的 vite 二进制编译脚手架
   *   3. 返回编译产物目录的绝对路径（output/<projectName>/dist/）
   */
  exportBuildProject: (payload: ExportBuildPayload): Promise<string> =>
    ipcRenderer.invoke('export:buildProject', payload),

  /**
   * 在 Finder / Explorer 中打开指定目录。
   */
  exportOpenFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('export:openFolder', folderPath),

  // ── 动态 UI 组件管道（待实现）────────────────────────────────────────────
  //
  // 目标：AI 对话生成的 TSX 组件代码能够实时编译、加载，并注册进 ThemeRuntime，
  //       使编辑器画布立即渲染新组件，不依赖任何浏览器端编译器。
  //
  // 完整数据流：
  //
  //   AI 输出 TSX 代码字符串
  //        │
  //        │  renderer 调用 compileComponent()
  //        ▼
  //   main process 收到 'component:compile' IPC
  //        │  使用原生 esbuild（Node.js），将 TSX 编译为 ESM bundle
  //        │  · 将 react / react-dom 标记为 external（渲染层已有实例）
  //        │  · 输出写入临时目录，例如：
  //        │    ~/.ai-app/components/<alias>-<hash>.js
  //        ▼
  //   main process 通过自定义协议 app:// 提供编译产物
  //        │  protocol.registerFileProtocol('app', handler)
  //        │  renderer 可用 import('app://components/<alias>.js') 加载
  //        ▼
  //   renderer 收到编译后的模块 URL
  //        │  动态 import() 加载模块，取得默认导出的 React 组件
  //        │  调用 activeRuntime.registerAlias(alias, Component)
  //        ▼
  //   ThemeRuntime 更新，DynamicThemeRenderer 重渲染
  //        └── 画布中新 alias 对应的节点立即显示为真实组件
  //
  // 实现时在此处添加：
  //
  //   compileComponent: (alias: string, tsxCode: string) =>
  //     ipcRenderer.invoke('component:compile', alias, tsxCode),
  //     // 返回值：{ url: string } — 可直接传给 import() 的 app:// URL
  //
  //   removeComponent: (alias: string) =>
  //     ipcRenderer.invoke('component:remove', alias),
  //
  // 对应的 main.ts 实现骨架（见文件内注释）。
  // ─────────────────────────────────────────────────────────────────────────────

} satisfies ElectronBridge);

// ElectronBridge 类型定义位于 src/electron.d.ts，供渲染层（src/）和本文件共用。
