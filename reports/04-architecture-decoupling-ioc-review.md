# 04 架构评审：解耦、控制反转与可读性

> 评审日期：2026-05-29
> 评审基准：`docs/architect-refactor.md`（v1.0 缺陷报告，逐项核对）
> 评审方式：直接核对当前源码（不依赖 reports/ 的自述），覆盖 `src/`、`backend/`、`shared/`、配置与工具链
> 结论先行：缺陷报告里的整改项**绝大多数已落地**；解耦与控制反转**已真正做到**；可读性**总体良好**。本报告原列出的全部行动项（A1–A3、B1–B8）已于 2026-05-29 落地并验证，见下方「执行结果」。

---

## 执行结果（2026-05-29 落地，全部已完成并验证）

下表 A/B 全部行动项已实现，整套验证通过：前后端 `tsc --noEmit` 均 0 错误、`pnpm build`（含 docs/shared-format/shared-boundary/renderer-registry 守卫 + Next 构建）通过、后端 Jest **45 套 / 273 测试全绿**、`pnpm test:state-persistence` / `test:di-container` / `test:source-export` 三个 smoke 通过、改动文件 ESLint `--max-warnings=0` 干净。

| 项 | 内容 | 落地证据 |
| --- | --- | --- |
| A1 | pre-commit 钩子自动安装 | 根 `package.json` 新增 `"prepare": "git config core.hooksPath .githooks \|\| exit 0"`，`pnpm install` 后钩子自动生效。 |
| A2 | `layoutBuilderService` 入 `domain/` + 拆分 + 抽样例数据 | 1403 行 → `src/domain/template/`（`types`/`sampleContent`/`nodeOperations`/`draftBuilders`/`layoutOperations`/`libraryPreview`/`index`，均 <600）；`SAMPLE_PROP_OVERRIDES` 独立到 `sampleContent.ts`；11 个 importer 改指 `domain/template`；旧文件删除；`pnpm build` 通过。 |
| A3 | `core.html` 白名单去重 | 提取到 `shared/theme-layout/htmlSafety.ts`（`ALLOWED_HTML_TAGS`/`ALLOWED_HTML_STYLE_PROPS`/`resolveHtmlTag`/`isUnsafeStyleValue`/`sanitizeInlineStyle`）；渲染器 `HtmlNode.tsx` 与导出器 `compileNode` 共同引用；导出路径顺带收紧到与渲染器一致的 style-prop 白名单。 |
| B1 | 超大文件拆到 <600 行 | 后端：`templates.service.ts` 1486→554、`agent-runner.service.ts` 846→550、`ai.service.ts` 788→561（抽 helpers，DI/公有 API 不变）。shared：`applyEditorInstructions.ts` 1522→457、`themeLayoutValidator.ts` 1173→142。导出器：`compileNode.ts` 1293→92、`templates/project.ts` 727→8、`components.ts` 647→17（输出字节级一致，smoke 通过）。编辑器：`aiEditInstructions.ts` 1377→68、`useBuilderDocumentState.ts` 1336→467、`useCanvasReorder.ts` 982→526、`EditorAiPanel.tsx` 785→515。全部以「保留公有导出/barrel」方式拆分，零 importer 改动。（数据文件 `template-seed.data.ts`、`blankDocument.ts` 视为种子数据保留。） |
| B2 | Repository token 统一 Symbol | `TEMPLATE_READ_REPOSITORY`、`EXPORT_RECORD_REPOSITORY` 由 string 改为 `Symbol(...)`；所有 consumer 已用常量引用，零 DI 破坏（后端测试全绿）。 |
| B3 | 边界守卫升级为 ESLint 规则 | `eslint.config.js` 新增 `no-restricted-imports`（scoped `src/**`），拦截 backend-only/实现段的 `@shared/agent/*` 与深相对路径两种绕过方式；与 `check-shared-boundaries.cjs` 并存防御；`pnpm lint` 通过、无误报。 |
| B4 | IoC 容器覆盖测试 | `scripts/di-container-smoke.ts` + `test:di-container` 脚本：验证 `ServiceContainer` 的 singleton/transient/value/override 语义，以及 `createAppServiceContainer(configure)` 覆盖 `httpClient` 后依赖链确实使用 fake。 |
| B5 | HttpClient 重试/拦截器 | `FetchHttpClient` 新增可选 `retry`（429/可选 503，遵循 `Retry-After`，指数退避，封顶，**默认关闭**避免与既有自动保存重试叠加）+ 可选 `onRequest`/`onResponse` 拦截钩子；SSE 流不自动重试；公有接口向后兼容。 |
| B6 | 渲染器性能（虚拟化 + 依赖预加载） | 只读/预览渲染（`renderNodeShell` 缺席）时由控制器置 `runtime.staticRender=true`，`ScreenNode` 对无绝对定位子节点的顶层区块行加 `content-visibility:auto` + `contain-intrinsic-size` 容器化（浏览器跳过视口外子树布局/绘制）；编辑器模式不受影响（避免破坏节点测量/选区）。依赖预加载：`useDependencyLoader` 注入 `<link rel="modulepreload">` 让 ESM widget 依赖更早抓取。未采用 JS DOM 窗口化（与绝对定位 + 编辑器测量冲突且无性能实测依据），以 React.memo + CSS 容器化 + 预加载为安全上限。 |
| B7 | 渲染器细粒度错误边界 | 新增 `src/ui/renderer/RendererErrorBoundary.tsx`（紧凑中文降级面板 + `resetKeys` 自恢复），包裹已发布站点 / 预览 / 编辑器画布 / 库与模板卡片的 `DynamicThemeRenderer`，坏节点不再拖垮整壳。 |
| B8 | `createPersistentStore` 工厂 | 新增 `src/state/createPersistentStore.ts`（订阅/持久化/跨标签/调试/去重/`reset` 收敛一次）；9 个 store 中 8 个迁移（净减 ~300 行），默认浅比较去重；`editorCanvasDragState`（复杂瞬态 + 字段级相等）按需保留。`test:state-persistence` 通过。 |

> 一次因并发子代理执行 `git stash` 造成上一轮已改动的被跟踪文件（jest 阈值、`templates.service.spec` 形状修复、`generateDetailed`、reports/03、模块边界文档等）被回退；已从悬挂 stash 提交 `b88a7906` 精确恢复并重新全量验证通过。后续重构均禁止子代理执行任何 git 命令。

---

## 一、总体评估（三个维度）

| 维度 | 评级 | 说明 |
| --- | --- | --- |
| 低耦合（Decoupling） | ✅ 达成 | 后端 DIP 全面落地：所有 service/controller 依赖 Repository 端口接口，零 `@InjectRepository`/`Repository<>` 泄漏；`AiModule` 不再跨域 import 模板实体；`shared/` 用公共 barrel + 守卫脚本强制边界。 |
| 控制反转（IoC） | ✅ 达成 | 后端用 NestJS DI + 端口 token；前端用真正的 token 化 `ServiceContainer`（含生命周期管理与测试覆盖钩子），取代了原“穷人版 Service Locator”。 |
| 人类可读性（Readability） | 🟡 良好，有债务 | 分层清晰（`services/state/domain/ui/views`）、命名一致、Repository-端口模式统一；但仍有 8 个 >1300 行的超大文件，且 9.4（功能-视图分层）只完成一半。 |

**一句话**：缺陷报告第十节的核心结论是“模块边界没有执行”。这一点现在已经被执行——通过 Repository 端口、模块边界守卫、shared barrel 守卫强制落地。剩下的不是架构方向问题，而是**少量收尾**：拆几个大文件、把 `layoutBuilderService` 挪进 `domain/`、让 Git 钩子默认生效。

---

## 二、逐项核对（对照 architect-refactor.md）

图例：✅ 已做到　🟡 部分/有保留　⛔ 未做（按决策搁置）

### 架构层（一）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 1.1 SQLite→PostgreSQL | ✅ | `backend/src/database/database-options.factory.ts` 按 `driver` 切 sqlite/postgres；`pg ^8.21` 为依赖；`migration-sql.ts` 方言感知（uuid/timestamp/pgcrypto）；`scripts/init-db.js` 生产环境拒绝直接 init。**保留**：默认仍是 SQLite，真正的生产 PG 切换是部署决策，非代码缺口。 |
| 1.2 前后端模块系统 | ✅（已决策） | 决策为接受“双系统边界”：后端 CommonJS + shared ESM-only，`scripts/check-shared-module-format.cjs` 强制 shared 为 ESM。不做全量后端 ESM 迁移。 |
| 1.3 API 版本控制 | ✅ | `backend/src/common/middleware/api-version-alias.middleware.ts` 重写 `/api/v1/*`→`/api/*`；`main.ts` 双 Swagger（`api/docs` + `api/v1/docs`）。 |

### 前端（二）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 2.1 状态管理分散 | ✅ | `src/state/` 10 个外部 store（`useSyncExternalStore`）+ `statePersistence.ts`（SSR 安全、容错损坏数据）+ `stateDebugRegistry.ts`。 |
| 2.2 设计令牌系统 | ✅（基线） | `shared/theme-layout/styleProfile.ts` + `buildTemplateProfile()` 派生样式画像。**保留**：仍仅暗/亮主题，品牌级定制（完整 token 体系）未展开。 |
| 2.3 渲染器性能 | ✅ | `renderTree.tsx` 已用 `memo(ThemeNodeView)`；只读渲染对顶层区块行加 `content-visibility` 容器化（B6），ESM 依赖改 `modulepreload` 预加载（B6）。JS 窗口化因与绝对定位/编辑器测量冲突且无实测依据未采用，已记录。 |
| 2.4 错误边界 | ✅ | `src/app/_components/AppErrorBoundary.tsx` 包裹整个 AppShell。**缺口**：仅应用级，渲染器崩溃会拖垮整壳，无围绕 `DynamicThemeRenderer` 的细粒度边界。 |

### 后端（三）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 3.1 迁移管理 | ✅ | 生产 `db:init` 保护 + run/revert 脚本 + `migration-rollback.spec.ts` + runbook。 |
| 3.2 标准响应格式 | ✅ | 全局 `ApiResponseInterceptor` + `ApiExceptionFilter`（`app.module.ts:50-55`），SSE 正确绕过包装。 |
| 3.3 速率限制 | ✅ | 全局 `ThrottlerGuard` + 分层 `@Throttle`（登录/注册 5/min、AI 10/min、导出 10/5min、发布 12/5min、模板生成 3/10min）。 |
| 3.4 事务边界 | ✅ | 站点发布/回滚用 `manager.transaction`（`typeorm-published-site.repository.ts:24,54,85`）；模板复制/更新/生成保存用 `runInTransaction`（`templates.service.ts:298,390,461`，事务作用域 store 正确传递）。 |

### AI Agent（四）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 4.1 缓存策略 | ✅（基线） | 前端缓存命中展示 + proxy 透传 conversation/response 头。**保留**：OpenAI `previousResponseId` 利用有限。 |
| 4.2 工具定义去重 | ✅ | 单一源 `shared/agent/tools/*`；`backend/src/ai/tools/*` 与 `src/ai/tools/*` 均为纯 re-export（字节级一致）。 |
| 4.3 语义化生成 | 🟡（已决策搁置） | 语义编译器/`semanticTargetResolver`/语义断言 + 10 例确定性 mock 矩阵已存在；更广的 live-provider 场景**需真实 provider 环境**，按决策不在离线默认检查中跑。 |

### 导出与部署（五）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 5.1 源码导出编译器 | ✅（远超原状） | `compileNode.ts` 现处理 **~48 个 core.\* 别名**（原仅 15）；`core.widget`→`StaticWidget`、`core.html`→`HtmlBlock`（均非占位符，含样式净化）；交互覆盖 navigate/setVisibility/toggleVisibility/tabs/carousel/dialog/drawer/form/pagination/rate/switch/alert；`dataBinding` 走 `AsyncDataBoundary` 异步数据导出。**保留**：富工作流（tab/chart 联动、多步流程）需先文档化 generated-state 契约。 |
| 5.2 发布回滚 | ✅ | `sites.controller.ts`：revisions 列表 / diff(`?from=&to=`) / rollback API，事务化激活。 |

### 测试与质量（六）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 6.1 测试覆盖 | 🟡（已决策止于地板） | 全部后端 controller + 全部命名的 TypeORM adapter 已有单测（本轮新增 13 文件/122 测试）；后端覆盖 Statements 52.74% / Branches 28.12% / Functions 45.55% / Lines 51.63%，阈值已抬到地板（52/27/45/51）。**距 80% 目标**仍需明确策略，按决策暂停。 |
| 6.2 代码规范执行 | 🟡 | Prettier + lint-staged + `.githooks/pre-commit` 都存在；**缺口**：钩子未自动激活——`git config core.hooksPath` 仍是默认 `.git/hooks`，需手动 `pnpm hooks:install`，无 `prepare`/postinstall 自动绑定。 |

### 安全（七）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 7.1 子域名安全 | ✅ | `next.config.ts` 对 `/sites/:path*` 下发 CSP（`default-src 'self'`、`frame-ancestors 'none'`、script-src 仅 self+esm.sh、生产去 `unsafe-eval`）+ `X-Frame-Options: DENY`；`SitesService` 保留子域名 + 保留字校验。 |
| 7.2 内容净化 | ✅ | `widgetSafety.ts` 库/源/属性白名单；`HtmlNode.tsx` tag/style 白名单；AI 产物经 `validateThemeLayoutDocument` 校验。**缺口**：`core.html` 的 tag/style 白名单在渲染器与导出器**各有一份副本**，未提到 shared/contracts，存在漂移风险。 |

### 工程化（八）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 8.1 环境配置校验 | ✅ | `config.factory.ts` 校验 PORT/生产 CORS/`synchronize=false`/DB/OAuth，抛 `ConfigValidationError`。 |
| 8.2 Monorepo / 包管理 | ✅ | 根与 `backend` 的 TypeScript 均锁 `~6.0.2`（原 6.0 vs 5.7 不一致已修复）。 |
| 8.3 文档与代码同步 | ✅ | `docs/README.md` + `current-implementation-status.md` + `scripts/check-docs-current-status.cjs`（接入 lint/build）。 |

### DI 与解构（九，核心）
| 项 | 评级 | 证据 / 现状 |
| --- | --- | --- |
| 9.1 AiModule 跨域耦合 / God Service | ✅ | `ai.module.ts` 仅注册 AI 自有实体，通过 `TemplatesModule` 作边界引入，**无模板实体/仓库直引**；`AiService` 构造仅注入 7 项（含 `TEMPLATE_READ_REPOSITORY`、`TEMPLATE_AGENT_KNOWLEDGE_SERVICE` 端口），**0 个 TypeORM 仓库**；行数 1570+→**788**。**保留**：788 仍偏大。 |
| 9.2 Repository 抽象（DIP） | ✅ | 9 个领域均有“端口接口 + 注入 token + TypeOrm adapter”；service/controller 层 `@InjectRepository\|Repository<\|from 'typeorm'` **零命中**。**小瑕疵**：`TEMPLATE_READ_REPOSITORY`、`EXPORT_RECORD_REPOSITORY` 为 string token，其余为 Symbol，不一致。 |
| 9.3 前端 IoC 容器 | ✅ | `ServiceContainer.ts` 真正的 token 容器（singleton/transient/value + `resolve`）；`AppServicesContext.tsx` 用工厂注册全图，支持 `configure(container, tokens)` 测试覆盖。**小瑕疵**：暂无覆盖路径的测试；两个 AI service 仍走 `() => getToken()` 回调（但已由容器提供）。 |
| 9.4 功能-视图分离 | ✅ | `autosaveStrategy` 早已抽出；A2 已把 `layoutBuilderService.ts`（1403 行）迁入 `src/domain/template/` 并拆为 7 个 <600 行模块，`SAMPLE_PROP_OVERRIDES` 独立到 `sampleContent.ts`，11 个 importer 改指 domain，旧文件删除，`pnpm build` 通过。 |
| 9.5 shared 包边界 | ✅（物理拆分按决策搁置） | `shared/agent/{browser,contracts,runtime,tools}` 公共 barrel + `check-shared-boundaries.cjs` 双向强制（前端仅 browser/contracts/tools；后端仅 contracts/runtime/tools）。**决策**：保留逻辑 barrel 边界，物理 workspace 拆包延后。**小瑕疵**：守卫是正则脚本，绕过 `@shared` 别名的深相对 import 不被拦。 |
| 9.6 前端 HttpClient 抽象 | ✅ | `src/services/http/HttpClient.ts`（接口 + `FetchHttpClient` + 集中 SSE 解析 + 信封解包）；全树仅 `FetchHttpClient` 内部一处 `fetch(`；各 service 注入消费。**小瑕疵**：无拦截器/重试层（429 重试仍在调用方）。 |
| 9.7 BFF 双路径 / SSE | ✅ | `/api/ai/editor`、`/api/ai/stream` 直连路由**已删除**，统一走 `/api/proxy/[...path]`；proxy 对 `text/event-stream` 用 `ReadableStream` 透传（`no-transform`/`x-accel-buffering: no`），`arrayBuffer()` 仅用于非流式 JSON。 |

---

## 三、仍未做到 / 需要采取行动的事项

按“可立即执行的真实缺口”优先，其后是可读性债务，最后是已决策/外部前置条件的搁置项。

### A. 真实缺口（建议尽快）

| # | 缺口 | 影响 | 建议行动 | 工作量 |
| --- | --- | --- | --- | --- |
| A1 | **6.2 pre-commit 钩子未自动安装**：`core.hooksPath` 未指向 `.githooks`，需手动 `pnpm hooks:install`。 | 新克隆的仓库提交时**不会**跑 lint/format，规范无法默认强制。 | 在根 `package.json` 加 `"prepare": "git config core.hooksPath .githooks"`（或引入 husky），使 `pnpm install` 后钩子自动生效。 | 低 |
| A2 | **9.4 未彻底分层**：`layoutBuilderService.ts`（1403 行）含硬编码 `SAMPLE_PROP_OVERRIDES`，未迁入 `domain/`。 | 纯逻辑与 UI 样例数据混居，违背报告 9.4 的分层目标；可测性与可读性受损。 | ① 将 `layoutBuilderService.ts`（及 `semanticTargets.ts`）迁入 `src/domain/template/layoutOperations`；② 把 `SAMPLE_PROP_OVERRIDES` 抽到独立的主题内容数据文件，使操作模块只剩结构逻辑。 | 中 |
| A3 | **7.2 `core.html` 白名单重复**：渲染器（`HtmlNode.tsx`）与导出器（`compileNode.ts`）各维护一份 `ALLOWED_TAGS`/`sanitizeInlineStyle`。 | 两处易漂移，导出与运行时净化口径可能不一致（安全面）。 | 提取到 `shared/agent/contracts`（或 `shared/theme-layout`）的单一白名单常量 + 净化函数，渲染器与导出器共同引用。 | 低 |

### B. 可读性 / 一致性债务（建议排期）

| # | 债务 | 建议行动 | 工作量 |
| --- | --- | --- | --- |
| B1 | 超大文件（>1300 行）：`shared/.../applyEditorInstructions.ts`(1522)、`backend/.../templates.service.ts`(1486)、`shared/.../themeLayoutValidator.ts`(1173)、`src/.../layoutBuilderService.ts`(1403)、`src/.../aiEditInstructions.ts`(1377)、`src/.../useBuilderDocumentState.ts`(1336)、`src/exporters/.../compileNode.ts`(1309)。 | 沿职责缝隙拆分：validator 按节点类型规则拆；`applyEditorInstructions` 按操作拆；`templates.service` 抽 `TemplateGeneratedSaveService`/`TemplateDuplicationService`；编辑器 builder 簇（与 A2 合并做）。目标单文件 <600 行。 | 中-高 |
| B2 | 9.2 Repository token 类型不一致（2 个 string，其余 Symbol）。 | 统一改为 `Symbol`，避免 token 碰撞。 | 低 |
| B3 | 9.5 边界守卫为正则，漏查绕过 `@shared` 别名的深相对 import。 | 升级为 ESLint `no-restricted-imports` 或 TS project references，从语言层强制。 | 中 |
| B4 | 9.3 IoC 容器无覆盖路径测试；AI service 仍用 `getToken` 回调。 | 加一条用 `configure` 覆盖 `httpClient`/`authService` 的容器单测锁定契约；可选：让 AI service 直接注入 `AuthService`。 | 低 |
| B5 | 9.6 HttpClient 无拦截器/重试层。 | 可选：加请求/响应拦截器链或集中 429/Retry-After 处理。 | 低-中 |
| B6 | 2.3 渲染器无虚拟化；依赖懒加载。 | 大树（100+ 节点）引入虚拟滚动；高频依赖改预加载。 | 中 |
| B7 | 2.4 仅应用级错误边界。 | 在 `DynamicThemeRenderer` 外加细粒度边界，坏节点优雅降级而不卸载编辑器外壳。 | 低 |
| B8 | 状态管理样板重复：`src/state/` 10 个 store 各自重抄同一套订阅/持久化/跨标签/调试管道（~1941 行，大量复制）。详见附录 A。 | 抽 `createPersistentStore` 工厂收敛管道，每个 store 只剩“初始值 + key + restore/persist 选择器 + 动作”，可砍约 60% 代码；顺带把 `JSON.stringify` 去重换浅比较、加 `reset()`。 | 中 |

### C. 已决策 / 受外部前置条件约束（无需现在动）

| # | 事项 | 处置 |
| --- | --- | --- |
| C1 | 6.1 后端覆盖率 80% 目标 | 已决策：止于新地板（52/27/45/51）；继续前需先定覆盖策略（收窄 `collectCoverageFrom` 或大规模 service/provider 补测）。 |
| C2 | 4.3 更广 live-provider 语义场景 | 需真实 provider 环境，离线默认检查不跑。 |
| C3 | 5.1 富导出工作流（tab/chart 联动、多步） | 前置：先文档化 generated-state 契约。 |
| C4 | 9.5 shared 物理拆包 | 已决策：保留 barrel 边界，物理拆包延后到有具体需求。 |
| C5 | 1.1 生产环境真正切到 PostgreSQL | 代码已支持；是否切换是部署/运维决策。 |
| C6 | 2.2 品牌级设计令牌定制 | 基线 styleProfile 已有；完整 token 体系是产品决策。 |

---

## 四、结论

- **解耦与控制反转：已达成。** 后端 DIP 全面落地、模块边界被守卫脚本强制；前端有真正的 token 化 IoC 容器与 HttpClient 抽象；BFF 双路径已统一并支持 SSE 流式。架构方向上没有遗留的“硬伤”。
- **可读性：已落地修复。** 分层与命名一致、Repository-端口模式统一、view/controller/content 三段式清晰；原先的 8 个超大文件已全部拆到 <600 行（仅种子/夹具数据文件保留），9.4 已彻底分层。
- **本报告全部行动项（A1–A3、B1–B8）已于 2026-05-29 完成并验证**（见顶部「执行结果」）：前后端 typecheck、`pnpm build`（含全部守卫）、后端 273 测试、三个 smoke、ESLint 全绿。剩余仅 C 类已决策/外部前置项（80% 覆盖率、live-provider 场景、富导出工作流、物理拆包、生产 PG 切换、品牌令牌），按既定决策不在本轮动。

> 注：本报告基于 2026-05-29 当前源码核对（`f1ba28a` 之后）。逐项证据见正文 file:line 引用。后续若执行 A/B 行动，请回写本报告与 `reports/03-defects-stage-summary.md`。

---

## 附录 A：前端状态管理机制专题（补充 2.1 / 9.3）

### A.1 实现机制简介

**范式**：零第三方库，纯 React 18 的 `useSyncExternalStore`（无 Redux/Zustand/Jotai）。每个领域一个文件，三件套：

```
单例 store 类（外部可订阅）  +  use<Name>Snapshot() Hook  +  *StateActions 动作对象
```

以 `src/state/templatesPageState.ts` 为标准样板，每个 store 内部结构一致：

| 组成 | 作用 |
| --- | --- |
| `private snapshot`（不可变，整体替换） | 唯一状态源 |
| `listeners: Set<() => void>` | 订阅者集合 |
| `subscribe` | 加监听 → 注册 debug → 开 `storage` 跨标签监听 → 从 localStorage 水合 → 返回退订（空闲时停监听） |
| `getSnapshot` / `getServerSnapshot` | 后者 SSR 返回 `INITIAL_SNAPSHOT`，避免 hydration 不一致 |
| 公开方法 → 私有 `update(updater)` | 算出 next → `JSON.stringify` 去重 → 替换 snapshot → 持久化 → 记录 debug → 通知监听者 |

**四个横切能力**（10 个 store 都接入）：

1. **持久化** `src/state/statePersistence.ts`（45 行）：极薄的 SSR 安全 localStorage 封装，读时容错（坏数据自动 `removeItem`），写时吞掉配额错误。每个 store 自带版本化 key（如 `yanling:templates-page:v1`）和**选择性** `restore*`/`persist*`（如只持久化 search/category/sort，不存 debouncedSearch）。
2. **跨标签同步**：监听 `window` 的 `storage` 事件，重读并 diff 后应用。
3. **调试** `src/state/stateDebugRegistry.ts`（59 行）：`window.__YANLING_STATE__` 暴露 `{ stores, history(最近 50 条变更) }`，无需 devtools 即可在控制台查状态与变更历史。
4. **派生/副作用**：放在 Hook 里，如 `useTemplatesPageSnapshot` 用 `useEffect` 把 `search` 防抖成 `debouncedSearch`。

现有 10 个 store：`authState`、`homeWorkspaceState`、`templatesPageState`、`searchResultsState`、`editorPageState`、`editorDocumentState`、`editorAiPanelState`、`editorBuilderUiState`、`editorNodeDialogState`、`editorCanvasDragState`。

### A.2 可读性评估

- **单文件层面：良好。** 命名统一（`<name>State.ts` / `*StateStore` / `use<Name>Snapshot` / `*StateActions`）、零依赖、不可变整体替换易推理；SSR 安全、容错持久化、跨标签同步、内建调试都很周到一致。
- **整体层面：有明显债务——样板重复。** 10 个 store 各自重抄同一套 `subscribe / startListening / stopListeningIfIdle / restoreFromStorage / handleStorage / applyRestoredSnapshot / registerDebugStore / createSnapshotKey` 机器（~1941 行，大量复制）。次要问题：`JSON.stringify` 去重对大快照（`editorAiPanelState` 336 行、`editorCanvasDragState` 279 行）O(n) 且对字段顺序敏感；动作有的走 `*StateActions`、有的直接调 store 方法，略不一致；模块级单例无法在测试间 `reset` 隔离。

### A.3 推荐方案

方向上**不建议引入 Redux**（更重、样板更多）。问题是重复，不是范式。按 ROI：

1. **首选（最低风险、保持零依赖）：抽 `createPersistentStore` 工厂。** 把订阅/通知/去重/持久化/跨标签/调试管道收敛一次，每个领域 store 只剩“初始值 + key + restore/persist 选择器 + 动作”：

   ```ts
   // src/state/createPersistentStore.ts —— 写一次
   export function createPersistentStore<S>(opts: {
     name: string; storageKey: string; initial: S;
     restore?(raw: Record<string, unknown>, fallback: S): S;
     persist?(s: S): Record<string, unknown>;
   }) { /* 封装 listeners / subscribe / update(去重+持久化+debug) / 跨标签 */ }
   ```

   预计砍约 60% 代码、消除复制粘贴，保留现有 SSR/跨标签/调试行为；顺带将 `JSON.stringify` 去重换浅比较、加 `reset()`。

2. **若愿意加一个依赖：迁移到 Zustand。** 它本质就是这套模式的成品（底层也用 `useSyncExternalStore`）：`persist` 中间件覆盖手写的 localStorage+版本化+跨标签，`devtools` 中间件替代自建 debug registry，自带选择器。对应 `architect-refactor.md` 2.1 的原始建议。代价：一个依赖 + 迁移成本。仅当编辑器状态复杂度预期继续上升时最划算。

3. **无论走哪条都建议的小修**：大快照浅比较去重；统一动作出口（都走 `*StateActions`）；加 `reset()` 便于测试。

**结论**：当前自研层能跑、带守卫与持久化，核心缺陷只是重复。**方案 ① 工厂抽取最契合**——零依赖、不改用法即可把可读性拉满（对应行动 B8）。状态复杂度若持续上升再考虑 ② Zustand。
