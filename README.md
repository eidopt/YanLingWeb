# AI App

AI App 是一个在线 AI 应用生成与编辑平台。用户可以从模板广场选择已有版式，也可以用自然语言描述需求，让 AI 生成网站、小程序或 APP 页面结构；生成后仍可在可视化编辑器里手动调整、保存，并进一步走到网页或小程序发布流程。

当前项目包含三个主要部分：

- 前端：Next.js + React，负责官网首页、模板广场、编辑器和前端代理接口。
- 后端：NestJS + TypeORM + SQLite，负责模板、主题、导出记录、用户认证和 AI 代理。
- 桌面端：Electron 包装 Next 应用，用于后续桌面端分发。

## 功能概览

- 官网首页：展示 AI 创建应用、模板广场、手动编辑和代发布能力。
- 模板广场：从后端读取模板数据，支持进入编辑器使用模板。
- 可视化编辑器：基于 `layoutDocument` 渲染页面结构，支持组件选择、属性编辑、拖拽与预览。
- AI 生成与编辑：前端通过代理调用后端 AI 流式接口，后端持有模型 API key。
- 用户体系：支持账号注册登录、挑战码登录流程、微信 / QQ OAuth 扫码登录入口。
- 导出与发布准备：包含导出记录接口和前端本地导出相关 API。
- OpenAPI：后端启动时生成 `shared/openapi.json`，Swagger 位于 `/api/docs`。

## 技术栈

- Frontend: Next.js 15, React 19, TypeScript
- Backend: NestJS 10, TypeORM, better-sqlite3, Swagger
- AI: OpenAI-compatible provider through backend proxy
- Desktop: Electron, Vite, electron-builder
- Tooling: ESLint 9, simple-import-sort, concurrently

## 目录结构

```text
.
├── backend/                  # NestJS 后端
│   ├── src/ai/               # AI 流式接口、provider、工具调用
│   ├── src/auth/             # JWT guard
│   ├── src/config/           # 环境变量配置工厂
│   ├── src/templates/        # 模板实体、接口和 seed 数据
│   ├── src/themes/           # 主题 CRUD
│   ├── src/users/            # 用户、登录、OAuth
│   ├── src/exports/          # 导出记录
│   ├── scripts/init-db.js    # SQLite 文件初始化
│   └── .env.dev/.env.prod    # 后端运行环境配置
├── electron/                 # Electron main/preload
├── shared/                   # 前后端共享类型和 OpenAPI 输出
├── src/
│   ├── app/                  # Next App Router 页面和 API route
│   ├── ai/                   # 前端 AI query loop、provider、工具
│   ├── services/             # 前端业务 service
│   ├── ui/                   # 通用 UI、编辑器、渲染器、页面组件
│   └── views/                # 页面级视图：Home / Editor / Templates
└── output/                   # 导出产物目录
```

## 环境要求

- Node.js 22+。
- pnpm (推荐) 或 npm
- macOS / Linux / Windows 均可开发前端和后端；Electron 打包目标按平台能力决定。

## 安装依赖

项目使用 pnpm workspace 管理前后端依赖，根目录一条命令安装全部：

```bash
pnpm install
```

## 环境变量

后端已经按启动模式拆分环境文件：

- `backend/.env.dev`
- `backend/.env.prod`
- `backend/.env.test`
- `backend/.env.example`

实际启动不会自动读取通用 `backend/.env`。如需放本地密钥，使用 `.local` 文件或 shell 环境变量：

- `backend/.env.dev.local`
- `backend/.env.prod.local`
- `backend/.env.test.local`

`.local` 文件会优先于对应模式文件加载，并已被 `.gitignore` 的 `*.local` 规则忽略。

常用变量：

```bash
PORT=4000
SERVER_FLAVOR=development
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,app://
DATABASE_DRIVER=sqlite
DEFAULT_DB_PATH=./data/app.dev.db
DB_SYNCHRONIZE=true
# Required in production. Generate with: openssl rand -hex 32
JWT_SECRET=replace-with-a-stable-random-secret
JWT_EXPIRES_IN=7d

AI_API_KEY=
AI_BASE_URL=

WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_REDIRECT_URI=

QQ_APP_ID=
QQ_APP_SECRET=
QQ_REDIRECT_URI=
```

说明：

- `AI_API_KEY` 是后端调用 AI 模型的 key，前端不直接持有。
- `AI_BASE_URL` 可选，用于 OpenAI-compatible 网关。
- `JWT_SECRET` 必须在生产环境显式设置为稳定随机值，否则后端会拒绝启动。修改该值会让已有 JWT 立即失效。
- 开发 / 测试环境未设置 `JWT_SECRET` 时会使用固定的 insecure fallback，并在启动时打印 warning；建议仍在 `.env.*.local` 中配置稳定值。
- `DATABASE_DRIVER` 默认使用 `better-sqlite3`（原生 SQLite），也兼容旧版 `sqljs`（WASM）；后续可扩展到 `postgres`、`mysql`。
- `DEFAULT_DB_PATH` 是本地文件数据库默认路径；`DB_PATH` 可作为更具体的覆盖项。
- `DB_SYNCHRONIZE` 本地可为 `true`（自动建表），生产环境应设为 `false` 并使用 migration 管理 schema 变更。

## 启动开发环境

推荐分别启动前端和后端，便于观察日志。

启动后端：

```bash
cd backend
npm run dev
```

后端默认地址：

- API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`

启动前端：

```bash
pnpm dev
```

前端默认地址：

- Web: `http://localhost:3000`

也可以在根目录同时启动前后端：

```bash
pnpm dev:all
```

## 后端启动模式

后端启动参数决定加载哪组环境变量：

```bash
cd backend
npm run start:dev
npm run start:prod
node dist/src/main --flavor=prod
node dist/src/main --env=test
```

加载顺序：

- dev: `.env.dev.local` -> `.env.dev` -> `.env.development.local` -> `.env.development`
- prod: `.env.prod.local` -> `.env.prod` -> `.env.production.local` -> `.env.production`
- test: `.env.test.local` -> `.env.test`

数据库初始化脚本也支持相同模式：

```bash
cd backend
npm run db:init:dev
npm run db:init:prod
npm run db:init:test
```

数据库 migration（生产部署或 schema 变更时使用）：

```bash
cd backend
npm run migration:run:dev      # dev 环境执行 migration
npm run migration:run:prod     # prod 环境执行 migration
npm run migration:generate:dev -- src/database/migrations/MigrationName  # 生成新 migration
```

## 前后端通信

前端不直接访问后端域名，而是通过 Next API route 代理：

- `/api/proxy/*` -> `${BACKEND_URL}/api/*`
- `/api/ai/stream` -> `${BACKEND_URL}/api/ai/stream`

`BACKEND_URL` 在 `next.config.ts` 中读取，默认值为 `http://localhost:4000`。

示例：

```ts
fetch('/api/proxy/templates');
fetch('/api/proxy/users/login', { method: 'POST', body: JSON.stringify(dto) });
```

AI 流式请求使用专门的 SSE 代理，避免 Next 普通响应缓冲破坏流式输出。

## 主要后端 API

所有接口都有全局前缀 `/api`。

- `GET /api/templates`：模板列表
- `GET /api/templates/:templateId`：模板详情
- `POST /api/themes`：创建主题
- `GET /api/themes`：主题列表
- `POST /api/exports`：创建导出记录
- `GET /api/users/auth/challenge`：获取登录挑战 nonce
- `POST /api/users/register`：账号注册
- `POST /api/users/login`：挑战码登录
- `GET /api/users/oauth/qrcode?provider=wechat`：获取 OAuth 扫码地址
- `POST /api/users/oauth/callback`：OAuth 回调
- `POST /api/ai/stream`：AI 流式请求，需要 Bearer token
- `POST /api/ai/templates`：保存 AI 生成模板，需要 Bearer token

## AI 工作流

前端 AI 逻辑位于 `src/ai`：

- `src/ai/core/query-loop.ts`：前端 query loop 和工具调用循环。
- `src/ai/core/providers/backend-proxy.provider.ts`：把模型请求转发给后端。
- `src/ai/planning/ui-intent-router.ts`：对用户需求做 UI 意图预分类。
- `src/ai/tools/editor-edit.tool.ts`：编辑器内 AI 修改工具。
- `src/ai/tools/generate-template.tool.ts`：模板生成工具。

后端 AI 逻辑位于 `backend/src/ai`：

- `ai.controller.ts`：AI SSE 接口和模板保存接口。
- `ai.service.ts`：鉴权后转发、限流和 provider 调用。
- `core/providers/openai.provider.ts`：OpenAI-compatible provider。
- `tools/generate-template.tool.ts`：保存模板相关工具输入结构。

## 编辑器与模板渲染

编辑器和渲染器的核心数据结构是 `layoutDocument`。模板中的页面、组件、布局、属性和交互会被解释为可渲染的 UI 树。

关键目录：

- `src/ui/editor`：编辑器 UI、控制器、节点检查器、拖拽与交互模式。
- `src/ui/renderer`：动态主题渲染器、节点渲染、样式解析和模板解释器。
- `src/ui/pages`：可复用的页面级基础组件和页面主题。
- `src/views`：具体页面实现，不放通用组件。

## 常用命令

根目录：

```bash
pnpm dev              # 启动 Next 前端
pnpm dev:backend      # 启动 Nest 后端
pnpm dev:all          # 同时启动前后端
pnpm build            # 构建 Next 应用
pnpm lint             # 前端 lint
pnpm lint:backend     # 后端 lint
pnpm dev:electron     # Electron 开发模式
pnpm build:electron   # Electron 打包
```

后端目录：

```bash
npm run dev              # 初始化 dev 数据库并启动 watch
npm run build            # Nest 构建
npm run start:prod       # 使用 prod 模式启动 dist
npm run migration:run:prod  # 执行生产 migration
npm run lint             # eslint src --fix
npm run test             # Jest 测试
```

## 构建与运行

前端生产构建：

```bash
pnpm build
pnpm start
```

后端生产构建与部署：

```bash
cd backend
npm run build
npm run db:init:prod          # 创建数据库文件和目录
npm run migration:run:prod    # 执行 migration 建表（首次部署必须）
npm run start:prod
```

> **注意**: 生产环境 `DB_SYNCHRONIZE=false`，TypeORM 不会自动建表。首次部署或 schema 变更后必须运行 `migration:run:prod`。

Electron 打包：

```bash
pnpm build:electron
```

打包产物输出到 `release/`。

## 开发注意事项

- 后端 lint 会自动修复：`cd backend && npm run lint`。
- 后端 TypeScript 构建输出在 `backend/dist`。
- 后端启动会生成 `shared/openapi.json`。
- SQLite 数据库位于 `backend/data/*.db`，数据库文件已在 `.gitignore` 中忽略。
- 不要把真实密钥提交到仓库；本地密钥放在 `.env.*.local` 或 shell 环境变量中。

## 快速排查

检查端口：

```bash
lsof -nP -i tcp:3000
lsof -nP -i tcp:4000
```

后端健康检查可以直接访问：

```bash
curl http://localhost:4000/api/templates
```

如果 AI 接口返回未配置错误，检查后端对应模式的 `.local` 文件中是否设置了 `AI_API_KEY`。
