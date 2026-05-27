# YanLingWeb 项目知识库

> **项目名**: AI App（YanLingWeb） — AI 驱动的主题/模板编辑器 + 网站生成器
> **技术栈**: Next.js 15 (React 19) + NestJS 10 + TypeORM + SQLite (better-sqlite3)
> **运行方式**: `npm run dev:all`（前后端同时启动）
> **最后更新**: 2026-05-27 (全面审计更新)

---

## 一、项目总体架构

```
┌──────────────────────────────────────────────────────┐
│            Frontend (Next.js 15 + React 19)          │
│  src/app/          → 路由页面 (editor, templates)     │
│  src/views/        → 页面级组件 (Home, Editor, etc)   │
│  src/ui/renderer/  → 模板渲染引擎 (DSL → React)       │
│  src/ui/editor/    → 可视化编辑器 (Canvas + Inspector)│
│  src/ai/           → AI 生成 & 编辑服务 (客户端)       │
│  src/services/     → API 服务层 (Auth, Template, etc) │
│  src/hooks/        → React Hooks (useTemplates, etc)  │
│  shared/agent/     → 共享 AI 类型、提示词、校验、fixtures│
└──────────────┬───────────────────────────────────────┘
               │ HTTP REST / SSE (Server-Sent Events)
┌──────────────┴───────────────────────────────────────┐
│            Backend (NestJS 10)                        │
│  1. 路由代理层: /api/proxy/* → 转发到后端 (Next.js)   │
│  2. 核心 API: /api/ai /api/templates /api/themes      │
│              /api/exports /api/sites /api/users ...   │
│  3. Swagger 文档: /api/docs                           │
│  4. OpenAPI 导出: shared/openapi.json                 │
│  5. ThrottlerModule: 全局速率限制 120 req/min         │
└──────────────┬───────────────────────────────────────┘
               │ TypeORM + better-sqlite3
┌──────────────┴───────────────────────────────────────┐
│    SQLite 单文件 (backend/data/*.db) + WAL mode       │
│    13 张表:                                           │
│      users | templates | themes | export_records      │
│      editor_ai_conversations | ai_token_usage_events  │
│      published_sites | published_site_revisions       │
│      template_profile_generated | template_profile_overrides │
│      template_asset_manifests | template_agent_permissions   │
│      template_evaluation_specs                         │
└──────────────────────────────────────────────────────┘
```

**Electron 桌面版**: `electron/main.ts` + `electron/preload.ts`，用 `npm run dev:electron` 启动。

---

## 二、后端模块一览

```
backend/src/
├── main.ts                    # 启动入口，CORS / Swagger / OpenAPI 导出
├── app.module.ts              # 根模块，9 个本地模块 + Nest ConfigModule + ThrottlerModule
├── ai/                        # AI 代理 & 编辑器 Copilot
│   ├── ai.service.ts          # QueryLoop + 流式代理 + 速率限制
│   ├── ai.controller.ts       # /api/ai/* 路由
│   ├── agent-eval.controller.ts   # /api/ai/agent-eval/* (mock + live)
│   ├── agent-runner.service.ts    # Agent 评估运行器
│   ├── editor-clarification.ts    # 编辑器澄清逻辑
│   ├── core/query-loop.ts     # 从 @shared/agent/runtime/queryLoop 重导出
│   ├── core/providers/        # OpenAI / OpenAI-Compatible 适配器
│   ├── core/compact/          # 对话压缩 (autoCompact)
│   ├── core/utils/            # 共享工具
│   ├── tools/                 # AI function tools 注册
│   │   ├── editor-edit.tool.ts        # 编辑器语义工具 + 低级编辑工具
│   │   └── generate-template.tool.ts  # generate_template
│   ├── semantic-targets.config.ts     # 8 个语义目标 (底部栏/顶部栏/搜索框...)
│   └── entities/
│       ├── editor-ai-conversation.entity.ts
│       └── ai-token-usage.entity.ts   # Token 用量埋点
├── auth/                      # 登录注册 / OAuth / JWT 鉴权
│   ├── auth.controller.ts     # /api/users/auth/*, register, login, oauth/*
│   ├── auth.service.ts
│   ├── jwt-auth.guard.ts
│   └── dto/
├── config/                    # 环境配置 (.env.dev / .env.prod)
│   ├── config.factory.ts
│   └── config.module.ts
├── database/                  # 数据库模块 (better-sqlite3)
│   ├── database.module.ts
│   ├── database-options.factory.ts
│   ├── data-source.ts
│   └── migrations/
├── templates/                 # 模板 CRUD + Agent profile/config
│   ├── templates.service.ts
│   ├── templates.controller.ts
│   ├── entities/template.entity.ts
│   ├── entities/template-profile-generated.entity.ts
│   ├── entities/template-profile-override.entity.ts
│   ├── entities/template-asset-manifest.entity.ts
│   ├── entities/template-agent-permissions.entity.ts
│   ├── entities/template-evaluation-spec.entity.ts
│   ├── template-category-registry.service.ts
│   └── seed/                  # 初始种子数据
├── themes/                    # 主题 CRUD (结构与 templates 相同)
├── users/                     # 用户模块 (本地登录 + 微信/QQ OAuth)
│   ├── users.service.ts
│   ├── users.controller.ts    # me, token-usage, 用户资料 CRUD
│   └── entities/user.entity.ts
├── exports/                   # 导出模块
│   ├── exports.service.ts
│   ├── exports.controller.ts
│   └── entities/export-record.entity.ts
├── sites/                     # 站点模块 (发布 + 修订 + 公开访问)
│   ├── sites.controller.ts
│   └── entities/
│       ├── published-site.entity.ts
│       └── published-site-revision.entity.ts
└── shared/                    # 后端共享工具 (非 NestJS 模块)
    ├── derive-tags.ts
    └── type-guards.ts
```

---

## 三、API 路由全表

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/api/themes` | — | 列出所有主题 |
| `POST` | `/api/themes` | — | 创建主题 |
| `GET` | `/api/themes/:id` | — | 按 id 获取主题 |
| `PUT` | `/api/themes/:id` | — | 更新主题 |
| `DELETE` | `/api/themes/:id` | — | 删除主题 |
| `GET` | `/api/templates` | — | 市场模板列表 (公开) |
| `GET` | `/api/templates/:templateId` | — | 获取市场模板详情 |
| `GET` | `/api/templates/mine` | JWT | 我的模板列表 |
| `GET` | `/api/templates/mine/:templateId` | JWT | 我的某个模板 |
| `PUT` | `/api/templates/mine/:templateId` | JWT | 更新模板草稿 |
| `GET` | `/api/templates/recent` | JWT | 最近使用的模板 (6 条) |
| `POST` | `/api/templates/:templateId/duplicate` | JWT | 复制市场模板到我的 |
| `GET` | `/api/users/me` | JWT | 当前用户信息 |
| `GET` | `/api/users/auth/challenge` | — | 登录 challenge |
| `POST` | `/api/users/register` | — | 注册 |
| `POST` | `/api/users/login` | — | 本地登录 |
| `GET` | `/api/users/oauth/qrcode` | — | 微信/QQ OAuth 二维码 |
| `POST` | `/api/users/oauth/callback` | — | OAuth 回调 |
| `GET` | `/api/users/:id/token-usage` | JWT | 用户 token 用量 |
| `GET/PUT/DELETE` | `/api/users/:id` | JWT | 用户 CRUD |
| `GET` | `/api/exports` | JWT | 导出记录列表 |
| `POST` | `/api/exports` | JWT | 创建导出 |
| `GET` | `/api/exports/:id` | JWT | 单条导出详情 |
| `DELETE` | `/api/exports/:id` | JWT | 删除导出记录 |
| `GET` | `/api/ai/config` | JWT | AI 提供商配置 (provider + model) |
| `GET` | `/api/ai/cache-stats` | JWT | LLM cache 统计 |
| `POST` | `/api/ai/stream` | JWT | 通用 LLM 代理 (SSE 流) |
| `POST` | `/api/ai/editor` | JWT | 编辑器 AI Copilot (SSE 流) |
| `GET` | `/api/ai/editor-conversations/:templateId` | JWT | 获取历史对话 |
| `PUT` | `/api/ai/editor-conversations/:templateId` | JWT | 保存历史对话 |
| `POST` | `/api/ai/templates` | JWT | 保存 AI 生成的模板 |
| `POST` | `/api/ai/agent-eval/mock` | JWT | Agent 评估 (mock 模式) |
| `POST` | `/api/ai/agent-eval/live` | JWT | Agent 评估 (live 模式) |
| `POST` | `/api/sites` | JWT | 发布站点 |
| `GET` | `/api/sites/mine` | JWT | 我的发布站点列表 |
| `GET` | `/api/sites/:id` | JWT | 单个站点 |
| `POST` | `/api/sites/:id/revisions` | JWT | 新增站点修订版 |
| `POST` | `/api/sites/:id/rollback` | JWT | 回滚到指定修订版 |
| `GET` | `/api/public/sites/:subdomain` | — | 通过 subdomain 公开访问站点 |
| `POST` | `/api/export/save-json` | — | 前端侧: 保存 layout JSON 到本地文件 |
| `POST` | `/api/export/build-project` | — | 前端侧: 编译导出 React/Vite 项目并 build |
| `POST` | `/api/export/open-folder` | — | 前端侧: 在 Finder/Explorer 中打开目录 |

模板列表接口支持 `category` 和 `functionalCategory` query；后端会用英文 slug 过滤，并返回 `categoryLabel`、`platformCategoryLabels`、`functionalCategoryLabels` 供前端展示中文文案。

**前端代理层**:
- `/api/proxy/*` → Next.js Route Handler → `http://localhost:4000/api/*`（通用 REST 代理）
- `/api/ai/stream` → Next.js SSE 代理 → `http://localhost:4000/api/ai/stream`（LLM 流式代理）
- `/api/ai/editor` → Next.js SSE 代理 → `http://localhost:4000/api/ai/editor`（编辑器 AI 流式代理）
- `/api/export/*` → 前端侧本地导出处理（不经过后端）

---

## 四、数据库表结构

### 1. `users` — 用户
```sql
id (uuid PK), username (unique), email (unique nullable), phone (nullable),
passwordHash (bcrypt nullable), wechatOpenId, qqOpenId,
linkedLogins (JSON array: 'local'|'wechat'|'qq'),
tokensUsed (bigint), tokensBalance (int), balanceCents (int),
isActive (boolean), lastLoginAt (datetime nullable),
createdAt, updatedAt
```

### 2. `templates` — 模板 (核心表)
```
id (uuid PK), templateId (string UNIQUE, 语义标记, 如 "commerce-market"),
ownerUserId (nullable → 公开模板 = null), sourceTemplateId (副本来源),
isPublic (boolean, default: true),
name, tagline, description, category, accent,
traits (JSON string[]), tags (JSON string[]),
cssVars (JSON object), cssAnimations (JSON object nullable),
componentTemplates (JSON object), layoutDocument (JSON object),
createdAt, updatedAt
```

### 3. `themes` — 主题
```
结构与 templates 几乎相同，但无 ownerUserId/sourceTemplateId/isPublic 字段。
作为一种更轻量的"基础皮肤"存在。
```

### 4. `export_records` — 导出记录
```
id (uuid PK), projectName, themeId, status ('idle'|'saving'|'building'|'done'|'error'),
layoutJson (JSON), outputPath (nullable), errorMessage (nullable),
createdAt, updatedAt
```

### 5. `editor_ai_conversations` — AI 编辑器对话历史
```
id (uuid PK), ownerUserId, templateId (unique 联合约束),
messages (JSON array: [{role, content}]),
createdAt, updatedAt
```

### 6. `ai_token_usage_events` — AI Token 用量埋点
```
id (uuid PK), ownerUserId,
endpoint ('stream'|'editor'), provider, model,
inputTokens, outputTokens, totalTokens,
cacheHitTokens (nullable), cacheMissTokens (nullable),
createdAt
索引: (ownerUserId, createdAt), (provider, model)
```

### 7. `published_sites` — 已发布站点
```
id (uuid PK), ownerUserId, templateId,
subdomain (unique, 公开访问 key),
status ('active'|'disabled', default 'active'),
activeRevisionId (nullable, 指向当前生效版本),
createdAt, updatedAt
索引: (ownerUserId, updatedAt), (templateId), (subdomain unique)
```

### 8. `published_site_revisions` — 站点修订版
```
id (uuid PK), siteId, templateId,
schemaVersion (int), runtimeVersion (string),
layoutJson, themeJson, dataJson (default {}), manifestJson — 均为 simple-json,
status ('active'),
errorMessage (nullable),
createdAt
索引: (siteId, createdAt), (templateId)
```

### 9. `template_profile_generated` — 自动生成的模板语义 Profile
```
id (uuid PK), templateId (unique),
templateVersion, profileVersion,
profile (simple-json: TemplateProfile),
createdAt, updatedAt
```

### 10. `template_profile_overrides` — 人工覆盖的模板语义 Profile
```
id (uuid PK), templateId (unique),
profileVersion,
override (simple-json: TemplateProfileOverride),
createdAt, updatedAt
```

### 11. `template_asset_manifests` — 模板素材清单
```
id (uuid PK), templateId (unique),
manifest (simple-json),
createdAt, updatedAt
```

### 12. `template_agent_permissions` — 模板级 Agent 权限
```
id (uuid PK), templateId (unique),
permissions (simple-json),
createdAt, updatedAt
```

### 13. `template_evaluation_specs` — 模板级评测配置
```
id (uuid PK), templateId (unique),
evaluation (simple-json),
createdAt, updatedAt
```

**关键设计决策**:
- SQLite 单文件，用 TypeORM 的 `better-sqlite3` 驱动 + WAL 模式（journal_mode=WAL），**极简部署**且支持并发读
- 模板/Template 内容全存 `simple-json` 列；写入 owned template 和 hosted site revision 前会执行迁移、`validateThemeLayoutDocument(failOnUnknownProps:true)` 和 render smoke，但数据库层本身无约束
- 模板 Agent 配置拆到独立表：generated profile、profile override、assets、permissions、evaluation 都按 `templateId` 唯一存储；`TemplatesService` 返回 `agentConfig.effectiveProfile` 给前端和 agent 使用。
- `themes` 表仍直接保存 DTO，没有走 template layout validator；`templates` 和 `themes` 有代码冗余，themes 像历史遗留

---

## 五、前端 UI 渲染核心

### 模板 DSL 系统 (18 个 core.* 组件 + 声明式自定义组件)

```
容器类:
  core.screen  ── 页面根节点 (props: title, statusTime, headerActionLabel)
  core.stack   ── 垂直堆叠容器 (props: gap, alignItems)
  core.row     ── 水平行容器 (props: gap, wrap, justify, align, tone)
  core.grid    ── 网格容器 (props: gap, columns)
  core.panel   ── 样式化卡片 (props: gap, tone: default|accent|promo|warm|soft...)

内容类:
  core.text    ── 文本 (props: text, variant: display|heading|subheading|body|caption|price...)
  core.button  ── 按钮 (props: label, variant: primary|secondary|link|pill, disabled, active, icon)
  core.tag     ── 状态标签 (props: label, tone: neutral|success|warning|info|hot|new|deal|member)
  core.image   ── 图片 (props: src, alt, title, iconColor, objectFit: cover|contain|fill)
  core.progress ── 进度条 (props: value, max, tone: neutral|accent|success|warning|info)
  core.tabs    ── 标签栏 (props: tabs, activeTab)
  core.search  ── 搜索框 (props: placeholder, value)
  core.input   ── 输入框 (props: placeholder, label, type, value, disabled)
  core.notice  ── 提示/通知条 (props: text, tone: info|warning|error|success|neutral)
  core.spacer  ── 空白 (props: size: xs|sm|md|lg|xl)
  core.divider ── 分隔线

特殊:
  core.html    ── 原始 HTML 注入
  core.widget  ── 第三方库动态内容 (依赖/renderer allowlist；除非 NEXT_PUBLIC_ENABLE_AI_WIDGETS=false，否则运行时启用)
```

### layoutDocument JSON 结构

```typescript
{
  version: number,
  schemaVersion?: number,
  themeId: string,
  themeName: string,
  pageName?: string,
  description: string,
  defaultPageId: string,
  pages: ThemeLayoutPage[],
  layout: ThemeLayoutNode,       // 默认根树
  components: ThemeComponentDescriptor[],
  dependencies?: { name, url }[],
  cssVars?: Record<string, string>,
  style?: { cssVars?: Record<string, string> }
}

// ThemeLayoutNode:
{
  id: string,           // kebab-case, e.g. "hero-section"
  alias: string,        // 组件名: "core.screen" | "core.panel" | ...
  slot?: string,        // "body" | "footer"
  layout: { mode: "flow"|"grid"|"absolute", order?: number, width?: string, ... },
  frame?: { x, y, width, height },  // 仅 absolute mode
  props?: Record<string, unknown>,
  interactions?: { onClick, onTabClick, onActionClick, onStatusClick },
  children?: ThemeLayoutNode[]
}
```

### 渲染流程

```
layoutDocument JSON
  ↓
DynamicThemeRenderer.tsx (useInjectAnimations → useDependencyLoader)
  ↓
renderThemeNodeTree(runtime, state) — 递归遍历 ThemeLayoutNode
  ├── resolveNodeStyle(node, parentAlias) — 计算 CSS
  ├── node.alias.startsWith("core.") → renderCoreAlias() → 18 个 React 组件
  │     └── coreAliases.tsx 会把安全的 props.style 合并进布局样式
  └── else → templateInterpreter.renderComponentTemplate() → $bind 绑定
```

### ComponentTemplate 系统

```typescript
// 组件模板定义
componentTemplates: {
  "hero-card": {
    displayName: "Hero Card",
    root: { alias: "core.panel", props: { tone: "accent" }, children: [...] }
  }
}

// $bind 动态属性：
{ $bind: "productName" }  // 从 outerProps 中取 productName
```

---

## 六、AI Pipeline 双轨

### 轨道 1: 模板生成 (AI → JSON → DB → Renderer)

```
用户 prompt: "做一个健身 App 的首页"
  ↓
TemplateAiService.generate()
  ├── planUiIntent(prompt) → intent_plan (UI 意图分类)
  ├── QueryLoop (最多 10 次迭代)
  │     ├── 系统提示词: 18 个 core.* DSL 规范 + componentTemplates 业务组件规则
  │     └── 最终调用 generate_template tool
  │           └── { templateId, layoutDocument, componentTemplates, cssVars, ... }
  ↓
POST /api/ai/templates → templates 表 (templates 表, isPublic: true)
  ↓
用户进入编辑器
```

### 轨道 2: 编辑器 AI Copilot (增量编辑)

```
用户在编辑器中操作:
  ├── 当前 Canvas Outline (所有节点 id + alias + props + layout)
  ├── Available catalog (model.ts 中的全部组件)
  ├── Selected node 详情
  ├── Semantic targets (8 个语义锚点: 底部栏 / 顶部栏 / 搜索框 / 主按钮 ...)
  ├── Pages 列表
  └── 对话历史 (最近 12 条 × 4K 字符, 来自 editor_ai_conversations 表)
  ↓
EditorAiService.editCanvas()
  ├── intentPlan → QueryLoop (最多 96 次迭代, 通过 EDITOR_AGENT_MAX_ITERATIONS 环境变量配置)
  ├── LLM 优先调用语义工具
  │     ├── editor_submit_page_spec
  │     ├── editor_update_slot
  │     ├── editor_fill_pattern
  │     ├── editor_create_page_from_page_kind
  │     └── editor_replace_section
  ├── semanticInstructionCompiler
  │     └── TemplateProfile -> resolve pageKind/slotKey/patternKey/regionKey
  ├── 编译为低级 editor operations
  └── 前端 applyInstructions() 执行 DOM 树变换
```

### 语义低代码 MVP 链路

```
自然语言
  → PageSpec / EditSpec
  → TemplateProfile / TemplateProfileOverride
  → semanticInstructionCompiler
  → EditorAiEditInstruction[]
  → applyEditorAiEditInstructions()
```

关键文件:

```
shared/agent/template/templateProfile.ts          # TemplateProfile / TemplateStyleProfile 类型
shared/agent/template/buildTemplateProfile.ts     # 从 ThemeLayoutDocument 扫描 page/region/slot/pattern
shared/agent/template/validateTemplateProfile.ts  # 校验 slot/node/component/prop/pattern
shared/agent/template/templateProfileResolver.ts  # resolvePageByKind/Slot/Pattern/Region
shared/agent/template/templateProfileOverride.ts  # 合并人工 override
shared/agent/specs/pageSpec.ts                    # create_page/update_page 高层 spec
shared/agent/specs/editSpec.ts                    # update_slot/fill_pattern/replace_section spec
shared/agent/compiler/semanticInstructionCompiler.ts
shared/agent/errors/agentErrors.ts                # 结构化 recoverable error
```

### 编辑器语义工具和低级操作

语义工具:

```
editor_submit_page_spec / editor_update_slot / editor_fill_pattern /
editor_create_page_from_page_kind / editor_replace_section
```

低级操作:

```
create_page_from_reference / create_page / delete_page / insert_node / update_props / set_layout /
set_frame / move_node / delete_node / update_interactions /
sync_page_navigation / sync_footer_tabs / clone_pattern_items
```

### 8 个语义目标 (Semantic Targets)

```
page_footer_nav   → 底部导航
page_header       → 页面顶部栏
page_title        → 页面标题
primary_cta       → 主按钮/CTA
search_box        → 搜索框
main_content      → 主内容区
section_header    → 区块标题
selected_node     → 当前选中组件
```

---

## 七、前端目录速查

### `src/app/` — Next.js App Router
```
/api/ai/stream/route.ts → 通用 AI SSE 代理
/api/ai/editor/route.ts → 编辑器 AI SSE 代理
/api/proxy/[...path]    → 普通后端 API 转发 (Route Handler)
/api/export/*           → 本地 JSON / React 源码导出 API
/auth/callback/wechat   → 微信 OAuth 回调页
/editor/page.tsx        → 编辑器主页面
/sites/[subdomain]      → Hosted Runtime 公开站点渲染页 (含静态构建 fallback)
/templates/page.tsx     → 模板市场页面
/page.tsx               → 首页
/layout.tsx             → 根布局 (AppShell)
```

### `src/views/` — 页面级组件
```
HomePage/       → 首页 (Hero, Templates, AIFeatures, Platforms...)
EditorPage/     → 编辑器页面 (ThemeLayoutBuilder 容器)
TemplatesPage/  → 模板市场/列表
```

### `src/base/` — 基础工具
```
classname/index.ts           → CSS 类名工具
preconditions/precondition.ts → 前置条件校验
```

### `src/exporters/` — 源码导出引擎
```
react-source/
  ├── compileDocumentToReactProject.ts → 文档 → React/Vite 项目编译入口
  ├── compilePage.ts                   → 页面级编译
  ├── compileNode.ts                   → 节点级编译 (core.* → React JSX)
  ├── componentNamer.ts                → 组件命名工具
  ├── styleCompiler.ts                 → 样式编译 (DSL → CSS)
  └── templates/
      ├── project.ts                   → 项目脚手架模板 (package.json, vite.config, index.html)
      └── components.ts                → 组件模板
```

### `src/ui/renderer/` — 渲染引擎
```
DynamicThemeRenderer.tsx     → 顶层渲染器 (注入动画 + 依赖加载)
renderTree.tsx               → 递归节点渲染 (resolveNodeStyle → renderCoreAlias)
coreAliases.tsx              → 18 个 core.* → React 组件映射，并合并安全 props.style
templateInterpreter.tsx      → ComponentTemplate 解释器 ($bind 绑定)
state.ts                     → 渲染状态管理 (页面切换/导航)
styleResolvers.ts            → CSS 样式计算 (layout + frame → CSSProperties)
valueResolvers.ts            → 值解析
screenPresets.ts              → 屏幕预设 (mobile/tablet/desktop 三段式)
types.ts                      → DynamicThemeScreenPreset 等运行时类型
useDependencyLoader.ts       → ESM 动态依赖加载
useInjectAnimations.ts       → CSS @keyframes 注入
```

### `src/ui/editor/` — 可视化编辑器
```
ThemeLayoutBuilder.tsx       → 编辑器主容器 (Canvas 画布 + 面板)
components/                  → 编辑器 UI 组件 (Library/AI Panel/Inspector...)
  PreviewModeSwitch.tsx      → 预览模式切换 (mobile/tablet/desktop 三档)
icons/DeviceIcons.tsx        → DesktopIcon, MobileIcon, TabletIcon 组件
controllers/                 → 编辑器状态控制器
services/                    → 编辑器业务逻辑
  ├── layoutBuilderService.ts      → 节点树的增删改查 (1139 行)
  ├── aiEditInstructions.ts        → AI 编辑指令解析执行 (1143 行)
  └── semanticTargets.ts           → 语义目标解析
```

### `src/ai/` — 客户端 AI 服务
```
template-ai.service.ts       → 模板生成 (TemplateAiService)
editor-ai.service.ts         → 编辑器 Copilot (EditorAiService)
agents/                      → Agent 实现 (templateGenerationAgent, editorEditAgent, agentEventRecorder)
core/                        → 与 backend/ai/core/ 共享的循环引擎
  ├── query-loop.ts          → Agent 循环 (同后端等价逻辑)
  ├── compact/               → 对话压缩 (microCompact, autoCompact)
  └── providers/             → LLM 提供者适配 (backend-proxy.provider)
planning/ui-intent-router.ts → UI 意图分类 (用户 prompt → intent plan)
tools/                       → 前端工具定义
  ├── editor-edit.tool.ts
  └── generate-template.tool.ts
adapters/                    → 适配器 (browserTemplateStore, browserEditorApplyAdapter)
```

### `shared/agent/` — 共享 Agent 合约
```
types.ts                     → Agent / ThemeLayout 共享类型
prompts/                     → templateDesignerPrompt / editorCopilotPrompt
validation/                  → ThemeLayoutDocument validator、semantic assertions、widget safety、templateDiff
compiler/                    → semanticInstructionCompiler (语义工具 -> 低级编辑操作)
specs/                       → PageSpec / EditSpec
template/                    → TemplateProfile、扫描器、resolver、override、profile cache、安全过滤
runtime/                     → QueryLoop 类、provider 类型定义 (前后端共享)
errors/                      → AgentEditError / AgentEditResult / MVP retry config
editor/                      → editor operations 定义与 applyEditorInstructions()，含 create_page_from_reference、clone_pattern_items、atomic/concurrency helpers
context/                     → editor/context plan 生成工具，包含 profile capabilities
fixtures/                    → blank/seed documents
tools/                       → editorEditTools 工具定义
testing/mockProvider.ts      → Agent eval mock provider
testing/semantic-lowcode/    → semantic low-code smoke test 数据
```

---

## 八、关键设计模式

### 1. Agent QueryLoop 模式
```
后端 + 前端共用 shared/agent/runtime/queryLoop.ts 中的 QueryLoop 类：
  messages → provider.stream()
    → text_delta? → 推送文本
    → tool_call?  → 执行工具 → tool_result 塞回 messages
    → max_tokens? → 自动继续 (最多 3 次)
    → error?      → 自动重试 (最多 3 次)
    → 相同 tool 重复 3 次? → 注入"换个方法"提示
    → context too long? → autoCompact
    → 超过 maxIterations → 终止
```

### 2. 编辑器操作的"信任但验证"模式
```
LLM 生成 operations → 前端应用前:
  1. 校验 nodeId 是否存在于当前 Canvas
  2. 校验 alias 是否在 CONTAINER_ALIASES 中 (用于插入子节点)
  3. 解析 semanticTarget → 查找真实 nodeId
  4. 校验操作类型是否符合组件描述 (叶子节点不接受子节点)
  5. 应用操作 → 返回错误列表 (不中断整体流程)
```

### 3. 语义 Profile + 编译器模式
```
LLM 不应直接猜真实 nodeId。
  1. 模板导入/读取时生成 TemplateProfile
  2. 优先使用 generated profile；人工 override 只用于少量明确维护的模板，不要保留批量生成模板的陈旧 override
  3. agent 通过 pageKind/slotKey/patternKey/regionKey 表达目标
  4. semanticInstructionCompiler 编译为 update_props/create_page_from_reference/clone_pattern_items
  5. apply 层再做节点、组件、prop、文档 validator 校验
```

`AgentEditError` 使用结构化错误码，例如 `slot_not_found`、`pattern_not_found`、`page_kind_not_found`、`invalid_props`、`version_conflict`，可恢复错误会携带候选项供 agent 重试。

### 4. 模板的"市场 + 个人副本"模式
```
Template 表通过 ownerUserId 区分:
  - ownerUserId = null  → 市场模板 (isPublic: true, 只读)
  - ownerUserId != null  → 用户副本 (isPublic: false, 可编辑)
  
工作流: 用户从市场选择模板 → POST /duplicate → 生成副本 (sourceTemplateId 记录来源)
```

复制模板时也会复制对应的 Agent config：generated profile、override、assets、permissions、evaluation，并把内部 `templateId` 更新为副本 ID。

### 5. 前端 BFF 代理模式
```
浏览器 → Next.js /api/proxy/* → Route Handler → NestJS /api/*
             ↑                        ↑
       (无跨域问题)            (实际端口 4000)
```

---

## 九、前端关键服务

| 服务 | 路径 | 作用 |
|------|------|------|
| `AuthService` | `src/services/AuthService.ts` | JWT token 管理, 登录/注册/微信OAuth |
| `TemplateService` | `src/services/TemplateService.ts` | 模板 CRUD API 封装 |
| `ExportService` | `src/services/ExportService.ts` | 导出 API |
| `UserService` | `src/services/UserService.ts` | 用户信息 |
| `TemplateAiService` | `src/ai/template-ai.service.ts` | AI 模板生成 (前端侧) |
| `EditorAiService` | `src/ai/editor-ai.service.ts` | AI 编辑器 Copilot (前端侧) |
| `AppServicesProvider` | `src/services/AppServicesContext.tsx` | React Context 注入所有服务 |

### Hooks

| Hook | 路径 | 作用 |
|------|------|------|
| `useAppServices` | `src/hooks/useAppServices.ts` | 获取服务实例 |
| `useTemplates` | `src/hooks/useTemplates.ts` | 模板列表/CRUD 状态管理 |

---

## 十、环境配置

### 后端 `.env.dev`
```
SERVER_FLAVOR=development
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,app://
DATABASE_DRIVER=sqlite
DEFAULT_DB_PATH=./data/app.dev.db
DB_SYNCHRONIZE=true
JWT_SECRET=development-jwt-secret
JWT_EXPIRES_IN=7d

AI_PROVIDER=openai-compatible
AI_MODEL=deepseek-v4-pro
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### 前端环境变量 / 构建变量
```
BACKEND_URL=http://localhost:4000
```

说明:
- `BACKEND_URL` 由 Next.js Route Handler 读取，默认 `http://localhost:4000`
- 后端配置读取顺序支持 `.env.dev.local` → `.env.dev` 等模式文件；`.local` 用于本地密钥
- Provider-specific key 优先级高于通用 `AI_API_KEY` / `AI_BASE_URL`

---

## 十一、前后端数据流图

```
用户在编辑器修改属性
  ↓
ThemeLayoutBuilder (state.canvases[])
  ↓
user makes change → layoutBuilderService.updateNodeInDocument()
  ↓
canvases state 更新 → DynamicThemeRenderer 重渲染
  ↓
用户点击"AI 助手" → EditorAiPanel
  ↓
EditorAiService.editCanvas({ prompt, currentDocument, pages, ... })
  ↓
Next.js /api/ai/editor → NestJS /api/ai/editor
  ↓
NestJS AiService.streamEditor() → QueryLoop → OpenAI stream
  ↓
SSE event: text → 前端展示 / tool_call → 前端执行
  ↓
applyInstructions() → layoutDocument 变换 → canvases 更新
  ↓
保存: PUT /api/templates/mine/:templateId → 更新 templates 表
```

---

## 十二、已知问题与注意事项

1. **SQLite 并发限制**: 使用 better-sqlite3 + WAL 模式，支持并发读，但写入仍需串行化。适合单用户和小团队场景。
2. **数据库驱动变更**: 已从 sqljs（内存）迁移至 better-sqlite3（文件 + WAL），配置文件需使用 `sqlite` 作为 `DATABASE_DRIVER` 值。配置类型保留 `postgres` / `mysql`，但当前会直接抛出 not implemented。
3. **JSON 列数据库层无约束**: owned template 更新和 hosted site 发布前有应用层校验与 render smoke；themes 仍直接保存 DTO，旧数据或绕过写路径的数据可能不符合 schema。
4. **Token 消耗高**: 编辑器 AI 调用每次注入完整 Canvas Outline (最大 80 节点)，单次请求 4-8K token。
5. **自定义组件边界**: 设计不再要求 core-only；可以用声明式 `componentTemplates`
   做业务组件，但 alias 必须声明、props 要可编辑且有中文标签，内部仍应展开为安全 core.* 结构。
6. **语义目标仍有低级兜底风险**: 新页面/列表/槽位修改应优先走 TemplateProfile 语义工具；旧的 `semanticTarget` 和低级 nodeId 工具仍存在，只适合精确修补。
7. **QueryLoop 已共享**: `query-loop.ts` 现在位于 `shared/agent/runtime/queryLoop.ts`，后端通过 `@shared/agent/runtime/queryLoop` 重导出，前端直接导入共享版本。代码重复问题已解决。
8. **themes 表 vs templates 表**: 结构高度重复，themes 像是未清理的技术债。
9. **编辑器 Agent 迭代数**: 默认 96 次迭代（环境变量 `EDITOR_AGENT_MAX_ITERATIONS` 可覆盖，最低 32），Token 消耗可能很高。
10. **TemplateProfile 自动扫描不是最终真相**: 自动扫描只能生成基础 page/region/slot/pattern，关键模板需要 override 文件或数据库 override 修正。

---

## 十三、运行、构建与测试命令

### 根目录脚本
```bash
npm run dev                 # Next.js dev server, 默认 http://localhost:3000
npm run build               # Next.js production build
npm run start               # Next.js production server
npm run lint                # ESLint 全仓检查
npm run dev:all             # 同时启动 Next.js + backend dev
npm run dev:backend         # 进入 backend 并启动后端 dev
npm run dev:electron        # Next.js + Electron main 构建 + Electron
npm run build:electron      # Next standalone + Electron main + electron-builder
npm run test:integration    # 需要后端已启动，跑主要 API 集成链路
npm run test:source-export  # React 源码导出 smoke test
npm run agent:evaluate      # Agent mock/live 场景评估
npm run agent:cache-test    # Agent cache hit regression
npm run templates:validate  # 校验 templates_json 根目录模板 schema
```

### 后端脚本
```bash
cd backend
npm run dev                 # db:init:dev + nest watch, 默认端口 4000
npm run start:dev           # nest watch --flavor=dev
npm run start:prod          # node dist/backend/src/main --flavor=prod
npm run db:init:dev         # 初始化 dev 数据库文件
npm run db:init:prod        # 初始化 prod 数据库文件
npm run migration:run:dev   # TypeORM CLI 跑 dev migration，使用 --flavor=dev
npm run migration:run:prod  # TypeORM CLI 跑 prod migration，使用 --flavor=prod
npm run migration:generate:dev -- src/database/migrations/Name
npm run lint                # backend ESLint --fix
npm run test                # Jest 入口，当前仓库测试覆盖较少
```

### 常用本地地址
```
Web:      http://localhost:3000
Backend:  http://localhost:4000/api
Swagger:  http://localhost:4000/api/docs
Public:   http://localhost:3000/sites/:subdomain
```

---

## 十四、鉴权与用户流程

### 本地账号注册
```
浏览器输入 raw password
  ↓
src/lib/hash-password.ts → SHA256(rawPassword)
  ↓
POST /api/users/register { username, password: sha256 }
  ↓
users.passwordHash 保存 bcrypt(SHA256(rawPassword))
  ↓
返回 { accessToken, user }
```

### Challenge-response 登录
```
GET /api/users/auth/challenge
  ↓
后端生成 32-byte nonce，内存保存 5 分钟，单次使用
  ↓
浏览器发送 SHA256(rawPassword)，nonce 仅用于服务端 anti-replay
  ↓
POST /api/users/login { identifier, password: sha256, nonce }
  ↓
后端消费 nonce，bcrypt.compare(password, storedPasswordHash)；旧 SHA256 存量会静默升级为 bcrypt
  ↓
返回 JWT
```

### JWT 使用方式
```
Authorization: Bearer <accessToken>
```

前端 `AuthService` 将 token 存在 `localStorage.ai_app_token`，用户信息存在 `localStorage.ai_app_user`，并通过 `ai-app-auth-changed` 自定义事件通知 UI。后端 `JwtAuthGuard` 只接受 Bearer token，payload 结构为 `{ sub, username }`。

### OAuth 流程
```
GET /api/users/oauth/qrcode?provider=wechat|qq
  ↓
返回 qrUrl + state
  ↓
平台回调前端 /auth/callback/wechat
  ↓
POST /api/users/oauth/callback { provider, code, state }
  ↓
后端校验 5 分钟内存 state，换取 openId，创建或复用用户
```

注意: OAuth 的 app id / secret / redirect URI 必须配置在后端环境变量中，否则接口返回配置错误。

---

## 十五、导出与发布链路

### A. 本地 JSON 导出
```
编辑器 canvases[]
  ↓
ExportService.serializeCanvases()
  ↓
合并为多页面 ThemeLayoutDocument
  ↓
POST /api/export/save-json
  ↓
写入 ~/Documents/ai-app-exports/<filename>
```

### B. React 源码导出
```
编辑器 canvases[]
  ↓
buildExportPayload()
  ↓
POST /api/export/build-project
  ↓
generateScaffoldFiles()
  ├── migrateThemeLayoutDocument()
  ├── validateThemeLayoutDocument(failOnUnknownProps: true)
  ├── renderSmokeThemeLayoutDocument()
  └── compileDocumentToReactProject()
  ↓
写入 output/react-source-exports/<projectName>
  ↓
spawn node node_modules/vite/bin/vite.js build
  ↓
返回 distDir
```

源码导出会把 DSL 编译为可维护的 React/Vite 项目；`core.widget` 会被占位组件处理，未知自定义 alias 会生成 fallback 组件。

### C. Hosted Runtime 发布
```
POST /api/sites { templateId, subdomain? } (JWT)
  ↓
SitesService.findOwnedTemplate()
  ↓
prepareTemplateLayoutForPersistence()
  ↓
通过共享 validator 校验 core.widget 的依赖、library 与 renderer allowlist
  ↓
写 published_sites + published_site_revisions
  ↓
GET /api/public/sites/:subdomain 返回 runtime config
  ↓
Next.js /sites/:subdomain 用 DynamicThemeRenderer 渲染
```

发布只允许用户自己的模板副本，不能直接发布市场模板。`subdomain` 会规范化为 3-63 位小写字母、数字、连字符，冲突返回 `409`。

`src/app/sites/[subdomain]/page.tsx` 标记为 `force-static`，并包含 `_placeholder`/后端不可用时的静态预览 fallback，用于保证前端静态构建可完成；真实公开站点仍通过 `BACKEND_URL/api/public/sites/:subdomain` 拉取。

### D. 发布修订与回滚
```
POST /api/sites/:id/revisions  # 从当前 owned template 生成新 revision
POST /api/sites/:id/rollback   # body: { revisionId }
GET  /api/sites/mine           # 我的站点列表
GET  /api/sites/:id            # 我的站点详情
```

`published_sites.activeRevisionId` 指向当前生效修订；回滚只是切换 active revision，不会删除历史版本。

---

## 十六、测试与评估入口

### 集成测试
`scripts/integration-test.js` 默认访问 `http://localhost:4000/api`，覆盖:
- 注册/登录 challenge-response
- 未授权访问返回 401
- 读取当前用户与 token usage
- 复制市场模板到个人模板
- 发布 hosted site、公开解析、重复 subdomain 冲突
- 站点列表、详情、重发修订、回滚
- 模板节点更新与保存

### 源码导出 smoke test
`scripts/source-export-smoke.cjs` 会临时创建 fixture 文档，编译导出项目，运行 Vite build，再手动改导出后的源码并再次 build，验证导出的 React 项目可维护。

### Agent Eval
```
scripts/agent-eval/scenarios.json      # 场景定义
scripts/agent-eval/run-agent-eval.js   # mock/live 运行器
scripts/agent-eval/report-writer.js    # 输出报告
backend/src/ai/agent-eval.controller.ts # /api/ai/agent-eval/mock|live
```

生产环境默认禁用 agent eval endpoint，除非显式设置 `ENABLE_AGENT_EVAL_ENDPOINT=true`。

### Semantic Low-Code Smoke
`scripts/semantic-lowcode-smoke.mjs` 会临时编译共享 agent 模块，验证:

- `buildTemplateProfile()` 能从 fixture 文档生成 pages/slots/patterns。
- `validateTemplateProfile()` 能通过基础 profile。
- `editor_update_slot` 能编译并应用为 `update_props`。
- `editor_create_page_from_page_kind` 能生成新页面。
- `editor_fill_pattern` 能编译并应用为 `clone_pattern_items`。
- `TemplateProfileOverride`、`profileCache`、`concurrencyControl`、`atomicOperationManager` 基础行为可用。

### 模板 JSON 导入校验
`templates_json/` 是后端启动时的临时模板导入目录；根目录放 `<templateId>.json`，`templates_json/configs/` 放 `<templateId>.generated.json`，可选 `.assets.json` / `.permissions.json` / `.evaluation.json`。后端启动会读取、校验、写入模板和 Agent 配置表；`TEMPLATE_JSON_DELETE_AFTER_IMPORT=true` 时成功导入后删除对应文件。当前批量 JSON 模板不保留 `.override.json`，避免旧 slot/node 语义覆盖新首页结构。

`templates_json/README.md` 是后续让 AI 批量生成模板 schema 时应优先读取的统一说明文件，包含目录规范、分类规则、生成质量规则、跨页面 UI 风格一致性、设备布局边界、手机端 section 级大组件默认全宽、组件多样性、主题色参与 UI、允许声明式 `componentTemplates` 自定义业务组件、TemplateProfile 语义命名和人工审查清单。不要再按 core-only、全白卡片、容器+文本堆叠的方式生成模板。

`pnpm templates:validate` 只扫描 `templates_json` 根目录模板 schema，不会把 `configs` 下的配置文件当模板。分类 key 必须是英文 slug，中文展示写入 `categoryLabel` / `functionalCategoryLabels`，并同步到 `backend/data/template-category-labels.json`。

---

## 十七、配置加载规则

后端启动时 `ConfigFactory.applyStartupFlavor()` 根据 CLI 与环境变量决定 flavor:
```
--flavor=dev | --flavor=prod | --env=test
SERVER_FLAVOR
NODE_ENV
默认 development
```

环境文件加载顺序:
```
development: .env.dev.local  → .env.dev
production:  .env.prod.local → .env.prod
test:        .env.test.local → .env.test
```

配置读取支持两层命名:
```
DEV_DB_PATH / PROD_DB_PATH / TEST_DB_PATH
DB_PATH
```

AI provider 规则:
```
AI_PROVIDER=openai
  → OPENAI_API_KEY / OPENAI_BASE_URL

AI_PROVIDER=openai-compatible
  → DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL

兜底:
  → AI_API_KEY / AI_BASE_URL
```

数据库驱动目前已迁移为 `better-sqlite3`（配置值 `sqlite`）。`postgres` / `mysql` 类型已在配置类型里保留，但 `database-options.factory.ts` 会直接抛出 not implemented。

---

## 十八、常见改动落点

| 需求 | 优先看这些文件 |
|------|----------------|
| 新增后端 API | `backend/src/*/*.controller.ts`, `*.service.ts`, `app.module.ts` |
| 新增数据库字段 | `backend/src/*/entities/*.entity.ts`, 对应 service, `database-options.factory.ts` |
| 改模板市场 | `backend/src/templates/*`, `src/views/TemplatesPage/*`, `src/services/TemplateService.ts` |
| 改模板分类/中文标签 | `backend/src/templates/template-category-registry.service.ts`, `backend/data/template-category-labels.json`, `templates_json/README.md` |
| 改模板 Agent Profile | `shared/agent/template/*`, `backend/src/templates/entities/template-profile-*.entity.ts`, `templates_json/configs/*.generated.json`；只有人工精修模板才新增 `*.override.json` |
| 改语义低代码编译 | `shared/agent/compiler/semanticInstructionCompiler.ts`, `shared/agent/specs/*`, `shared/agent/errors/agentErrors.ts` |
| 改编辑器画布行为 | `src/ui/editor/controllers/*`, `layoutBuilderService.ts`, `ThemeLayoutBuilder.tsx` |
| 改 AI 编辑能力 | `backend/src/ai/tools/editor-edit.tool.ts`, `src/ai/tools/editor-edit.tool.ts`, `shared/agent/editor/*`, `shared/agent/tools/editorEditTools.ts` |
| 改 AI 迭代参数 | `backend/src/ai/ai.service.ts` (EDITOR_AGENT_MAX_ITERATIONS, DEFAULT_EDITOR_AGENT_MAX_ITERATIONS=96, 最低 32) |
| 改共享 Agent 运行时 | `shared/agent/runtime/queryLoop.ts`, `shared/agent/runtime/providerTypes.ts` |
| React 源码导出 | `src/exporters/react-source/compileNode.ts`, `src/exporters/react-source/templates/project.ts` (CSS + 内联 style) |
| 改 AI 生成模板 | `generate-template.tool.ts`, `shared/agent/prompts/templateDesignerPrompt.ts`, `template-ai.service.ts` |
| 新增 core 组件 | `src/ui/renderer/components/*`, `coreAliases.tsx`, 组件 descriptor / prompt / validator, compileNode.ts, project.ts CSS |
| 改发布站点 | `backend/src/sites/*`, `src/app/sites/[subdomain]/*`, `backend/src/templates/template-layout-validation.ts` |
| 改源码导出 | `src/exporters/react-source/*`, `src/services/ExportService.ts`, `scripts/source-export-smoke.cjs` |
| 改登录注册 | `src/lib/hash-password.ts`, `src/services/AuthService.ts`, `backend/src/auth/*`, `backend/src/users/*` |
| 改模板 JSON 导入 | `backend/src/templates/templates.service.ts`, `templates_json/`, `scripts/validate-template-json.mjs` |

---

## 十九、排障速查

1. **前端提示 Backend service is unavailable**  
   检查 `BACKEND_URL` 与后端端口。默认应为 `http://localhost:4000`。

2. **Swagger 没有更新**  
   后端启动时才写 `shared/openapi.json`。重启 `backend`，确认启动 cwd 是 `backend/`，否则输出路径可能不同。

3. **登录总是 401**  
   检查是否先调用 challenge；nonce 只能使用一次且 5 分钟过期。前端登录发送 `SHA256(rawPassword)`，nonce 不再参与密码哈希。

4. **JWT 重启后失效**  
   开发环境如果没固定 `JWT_SECRET` 会使用 fallback；生产必须配置稳定 `JWT_SECRET`。修改 secret 会让旧 token 失效。

5. **AI SSE 没有流式输出**  
   通用代理走 `/api/ai/stream`，编辑器走 `/api/ai/editor`；不要经由普通 `/api/proxy/ai/*` 处理 SSE。

6. **Widget 校验/渲染失败**  
   `core.widget` 需要声明在 `layoutDocument.dependencies` 中的安全依赖，并使用 validator 允许的 library/renderer。运行时可通过 `NEXT_PUBLIC_ENABLE_AI_WIDGETS=false` 禁用。

7. **源码导出失败**  
   先看 validator 报错路径；导出前会执行迁移、schema 校验和 render smoke。常见原因是 unknown props、缺失 `layout` 或非法页面结构。

8. **数据库文件写入**  
   当前使用 `better-sqlite3` + WAL 模式，写操作通过 TypeORM 自动同步。检查 `DEFAULT_DB_PATH` / `DB_PATH` 是否指向可写路径。

9. **生产启动报 JWT secret 错误**  
   生产 flavor 下未设置 `JWT_SECRET` 或 `PROD_JWT_SECRET` 会直接拒绝启动。

