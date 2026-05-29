# AI App (YanLingWeb)

AI 驱动的全平台可视化 UI 搭建平台。用户通过自然语言对话生成完整的多页面应用/网站布局，在可视化编辑器中拖拽编辑，并可建模小程序 UI/提交流程（不是实际小程序导出）。

## 技术栈

| 层     | 技术                                                           |
| ------ | -------------------------------------------------------------- |
| 前端   | Next.js 15 (App Router) + React 19 + TypeScript 6              |
| 后端   | NestJS 10 + TypeORM + SQLite (better-sqlite3)                  |
| 共享   | TypeScript 类型和验证逻辑                                      |
| 桌面   | Electron 36 + electron-builder                                 |
| AI     | OpenAI SDK v6 (Responses API) / OpenAI 兼容 (Chat Completions) |
| 样式   | PostCSS + CSS Modules + CSS 自定义属性（无 Tailwind）          |
| 包管理 | pnpm (monorepo)                                                |

## 目录结构

```
YanLingWeb/
├── src/                    # Next.js 前端
│   ├── app/                # App Router 页面和 API 路由
│   │   ├── page.tsx              # 首页
│   │   ├── layout.tsx            # 根布局
│   │   ├── editor/page.tsx       # 可视化编辑器页面
│   │   ├── templates/page.tsx    # 模板广场页面
│   │   ├── sites/[subdomain]/    # 已发布站点渲染（静态导出 + 后端 fallback）
│   │   ├── api/ai/stream/        # AI 流式代理 (SSE)
│   │   ├── api/ai/editor/        # AI 编辑器流式代理
│   │   ├── api/proxy/[...path]/  # 通用后端代理
│   │   └── api/export/           # 导出 API (JSON, 构建, 打开目录)
│   │   └── _components/          # AppShell, ThemeBody（主题切换）
│   ├── ai/                 # AI 代理系统 (前端侧)
│   │   ├── agents/              # Agent 实现 (模板生成, 编辑器)
│   │   ├── core/                # 核心引擎 (QueryLoop, Providers, Compact)
│   │   ├── tools/               # 工具定义 (generate_template, editor_edit)
│   │   ├── planning/            # 意图路由 (ui-intent-router)
│   │   └── adapters/            # 适配器 (模板存储, 编辑器应用)
│   ├── ui/renderer/        # 动态主题渲染器
│   │   ├── DynamicThemeRenderer.tsx  # 主渲染器
│   │   ├── coreAliases.tsx           # core.* 组件别名映射
│   │   ├── renderTree.tsx            # 递归渲染树
│   │   ├── styleResolvers.ts         # 布局 → CSS 解析
│   │   ├── templateInterpreter.tsx   # 组件模板解释器
│   │   ├── useDependencyLoader.ts    # ESM 依赖动态加载
│   │   └── components/              # 18 个核心组件节点
│   ├── components/          # 共享 UI 组件
│   ├── views/               # 页面视图
│   ├── hooks/               # 自定义 Hooks（含 useTheme 暗色/亮色主题切换）
│   ├── lib/                 # 工具库
│   ├── services/            # 业务服务 (Auth, Template, Search, Export...)
│   ├── stores/              # 状态管理
│   └── types/               # 类型定义
├── backend/                # NestJS 后端
│   ├── src/
│   │   ├── main.ts              # 入口点
│   │   ├── app.module.ts        # 根模块
│   │   ├── ai/                  # AI 模块 (控制器, 服务, 工具, 核心引擎)
│   │   ├── search/              # 搜索意图路由
│   │   ├── templates/           # 模板 CRUD
│   │   ├── themes/              # 主题管理
│   │   ├── sites/               # 发布站点管理
│   │   ├── users/               # 用户认证 (JWT + OAuth)
│   │   ├── exports/             # 项目导出记录
│   │   ├── auth/                # JWT 守卫
│   │   ├── config/              # 环境配置工厂
│   │   └── database/            # 数据库模块 (better-sqlite3)
│   └── data/                    # SQLite 数据库文件 (运行时)
├── shared/                 # 前后端共享代码
│   ├── agent/                   # AI 代理共享
│   │   ├── types.ts             # 核心类型 (ThemeLayoutDocument 等)
│   │   ├── prompts/             # 系统提示词
│   │   ├── validation/          # 验证器 (布局, 语义, Widget 安全, Diff)
│   │   ├── fixtures/            # 测试夹具
│   │   ├── context/             # 上下文构建
│   │   └── editor/              # 编辑器操作定义
│   └── types/                   # 共享业务类型
├── electron/               # Electron 桌面应用
│   ├── main.ts                  # 主进程 (窗口, IPC, 导出, 端口管理)
│   └── preload.ts               # 预加载脚本 (contextBridge)
├── scripts/                # 构建/测试/评估脚本
└── .claude/                # Claude Code 配置
    ├── settings.local.json      # 权限和钩子
    └── skills/                  # 自定义技能
```

## 核心概念

### ThemeLayoutDocument — 通用数据格式

整个平台围绕 `ThemeLayoutDocument` 运转，这是一个声明式 JSON 树，描述多页面 UI 的结构、样式和交互：

```typescript
{
  version, themeId, themeName, description,
  components: ThemeComponentDescriptor[],   // 可用组件目录
  pages: ThemeLayoutPage[],                 // 多页面
  defaultPageId: string,
  layout: ThemeLayoutNode,                  // 当前页渲染树 (resp.)
  componentTemplates: Record<string, ComponentTemplate>,  // 可复用模板
  dependencies: ThemeLibraryDependency[],    // ESM 库 URL
  cssVars: Record<string, string>,          // CSS 自定义属性
  cssAnimations: Record<string, string>,    // @keyframes
  style: ThemeLayoutStyleManifest
}
```

每个 `ThemeLayoutNode` 表示一个可视组件：`{ id, alias, slot?, layout, frame?, props?, interactions?, children? }`

### 两种 AI Agent 模式

**模式 1 — 模板生成 (Template Generation)**

- 触发位置：模板广场页面
- 唯一工具：`generate_template` — 一次性生成完整的多页面 `ThemeLayoutDocument`
- 运行位置：前端，通过 `BackendProxyProvider` 流式传输到后端

**模式 2 — 编辑器编辑 (Editor Edit)**

- 触发位置：可视化编辑器画布
- 10 个精确工具：`editor_create_page`, `editor_delete_page`, `editor_insert_node`, `editor_update_props`, `editor_delete_node`, `editor_set_layout`, `editor_set_frame`, `editor_move_node`, `editor_update_interactions`, `editor_sync_navigation`
- 运行位置：前端或后端均可

### core.\* UI 组件（注册表共 54 个 alias / 55 个组件目录）

> 渲染器实际注册 **54 个 `core.*` alias**（`src/ui/renderer/components/registry.tsx`，可用 `pnpm renderer:registry:check` 核对）。下表是最常用的 18 个基础组件；其余为扩展 alias（navbar、tabbar、list、table、timeline、form、carousel、dialog、drawer 等）。

| 别名            | 组件             | 关键 Props                                                                                    |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `core.screen`   | 页面根容器       | title, statusTime, headerActionLabel                                                          |
| `core.stack`    | 垂直弹性容器     | gap, alignItems                                                                               |
| `core.row`      | 水平弹性容器     | gap, wrap, justify, align, tone                                                               |
| `core.grid`     | CSS Grid 容器    | gap, columns                                                                                  |
| `core.panel`    | 带样式卡片       | gap, tone (default/accent/promo/warm/soft/member/highlight)                                   |
| `core.text`     | 文本             | text, variant (display/heading/subheading/body/caption/price/overline/eyebrow/title/subtitle) |
| `core.button`   | 按钮             | label, variant (primary/secondary/link), disabled                                             |
| `core.image`    | 图片占位符       | —                                                                                             |
| `core.progress` | 进度条           | value, max, tone (neutral/accent/success/warning/info)                                        |
| `core.tag`      | 状态徽章         | label, tone (neutral/success/warning/info/hot/new/deal/member)                                |
| `core.divider`  | 分隔线           | —                                                                                             |
| `core.spacer`   | 空白间距         | size                                                                                          |
| `core.input`    | 文本输入框       | placeholder, label                                                                            |
| `core.tabs`     | 标签栏           | activeTab                                                                                     |
| `core.search`   | 搜索栏           | placeholder, value                                                                            |
| `core.notice`   | 通知横幅         | text, tone                                                                                    |
| `core.html`     | 原始 HTML 包装器 | tag, style                                                                                    |
| `core.widget`   | 安全三方 Widget  | library, renderer, data                                                                       |

### Widget 系统 (core.widget)

支持 4 种安全的三方渲染器，从 esm.sh 动态加载：

| 库         | 渲染器  | 用途        |
| ---------- | ------- | ----------- |
| echarts    | echarts | 交互式图表  |
| chart.js   | chartjs | 图表        |
| lottie-web | lottie  | 矢量动画    |
| mermaid    | mermaid | 图表/流程图 |

安全性通过 `widgetSafety.ts` 强制执行：仅允许 esm.sh URL，白名单包名，禁止脚本/代码注入属性名。

### 交互系统

节点可以有 `interactions`：`{ onClick, onActionClick, onTabClick }`。目前仅支持 `{ type: 'navigate', targetPageId }` 导航操作。无自定义脚本或逻辑。

### 布局系统

- **Flow** — 基于弹性盒子：`order`, `width`, `minHeight`
- **Grid** — CSS Grid：`gridColumn`, `gridRow`, `columns`
- **Absolute** — 通过 frame 定位：`x`, `y`, `width`, `height`, `zIndex`

### AI 意图路由

在任意 agent 运行之前，`planUiIntent()` 分析用户提示：

- 将意图分类（marketing_site、web_app、mobile_app 等）
- 识别支持/不支持的能力（18 项能力，标记为 native/composed/unsupported）
- 选择生成策略（standard_layout_document、compose_existing_components、requires_dynamic_module、clarify_before_generation）
- 在用户提示之前注入提示指导

### 数据持久化

- **前端侧** — `BrowserTemplateStore` 适配器调用后端 API
- **后端** — TypeORM + SQLite（通过 better-sqlite3 + WAL 模式），实体：`Template`, `Theme`, `PublishedSite`, `PublishedSiteRevision`, `User`, `ExportRecord`, `EditorAiConversation`, `AiTokenUsage`
- **API 代理** — Next.js 路由处理器将 `/api/proxy/*` → `http://localhost:4000/api/*`

### 前端 ↔ 后端通信

```
浏览器 → Next.js API 路由 → NestJS 后端 (localhost:4000)
         /api/proxy/[...path]  →  通用 CRUD
         /api/ai/stream        →  AI 流式 (SSE)
         /api/ai/editor        →  AI 编辑器流式
         /api/search           →  搜索意图路由
```

前端永远看不到 API 密钥 — 它们只存在于后端。

### 暗色/亮色主题

`useTheme` hook（`src/hooks/useTheme.tsx`）通过 React Context + localStorage 提供暗色/亮色切换。`<head>` 内联脚本在页面渲染前读取 localStorage 并设置 `data-app-theme` 属性，避免主题闪烁。`ThemeBody` 组件包裹整个应用子树。

### 已发布站点静态导出

`/sites/[subdomain]` 页面使用 `dynamic = 'force-static'`，`generateStaticParams()` 返回 `_placeholder`。当后端不可用时（如静态构建），渲染前端内置的预览占位页面，确保构建不因 API 不可用而失败。正常运行时从后端 `/api/public/sites/:subdomain` 拉取数据。

## 开发命令

```bash
pnpm dev                   # 仅前端 (localhost:3000)
pnpm dev:backend           # 仅后端 (localhost:4000)
pnpm dev:all               # 并行前端 + 后端
pnpm dev:electron          # Electron 桌面应用
pnpm lint                  # ESLint 整个项目
pnpm lint:backend          # ESLint 后端
pnpm build                 # Next.js 生产构建
pnpm test:integration      # 集成测试
pnpm agent:evaluate        # AI agent 评估
```

## 代码约定

- 所有面向用户的文本使用中文
- `@shared/` 别名指向 `shared/` 目录
- 后端使用 CommonJS 模块 (NestJS)，前端使用 ESM
- TypeScript 严格模式；ESLint v9 扁平配置
- 首选通过 `core.*` 组件进行声明式 UI 组合，而非自定义 HTML/脚本
- 永远不要提交包含明文 API 密钥的 `.env.dev.local`
