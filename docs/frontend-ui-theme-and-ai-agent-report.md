# 前端 UI 主题库与 AI Agent 可行性报告

## 结论摘要

当前前端 UI 的主要问题不是单个页面缺少样式，而是设计 token 分裂：营销页使用 `--c-*`，页面组件使用 `--page-*`，弹窗/表单使用 `--color-*`，编辑器又有 `--preview-accent` 和 `--sidebar-accent`。这会导致同一种卡片、弹窗、输入框、焦点态在不同页面表现不一致。

本次已新增一套全局语义主题库，并通过兼容别名接入现有页面和组件：

- 新主题库：`src/styles/theme-library.css`
- Next 全局入口：`src/app/globals.css`
- 导出/旧入口：`src/styles/global.css`
- App 主题挂载：`src/app/layout.tsx`
- 已接入的主要 UI 面：首页、工作台、模板页、全局导航、登录弹窗、模板预览弹窗、导出弹窗、用户设置弹窗、编辑器面板、页面基础组件、渲染器文本组件

AI agent 方面，编辑器里的“增量编辑 agent”是可行的，适合做精确文本、属性、布局、小组件插入、多页面导航同步等任务。但它不能被判断为“每次自然语言输入都能正确理解并执行”。当前链路必须经过“自然语言 -> 意图识别 -> 模板伪代码/编辑 DSL -> 本地执行”的中间层，这一层是概率式语义转换，不是确定性编译器。简单明确任务可靠率较高，开放、含糊、跨页面、动态业务类任务会明显掉线。

## 1. 前端 UI 现状分析

### 技术栈

- Next 15 App Router + React 19 + TypeScript
- 样式主要是 CSS Modules
- 全局样式入口是 `src/app/globals.css`
- 组件和页面主要分布在 `src/views`、`src/ui`、`src/app/_components`

### 现有视觉语言

项目已有比较明确的品牌方向：

- 深色工作台背景
- 蓝/紫/绿色强调色
- 毛玻璃侧栏
- 白色或半透明卡片
- 大圆角、轻阴影、hover lift
- 模板渲染器内部另有 `--accent`、`--surface`、`--radius-*` 运行时 token

这些方向是可以保留的，问题在于它们没有统一归口。

### 主要不一致点

- 同一品牌色被写成 `#6366f1`、`#4f46e5`、`#0f8f5f`、`--page-accent`、`--c-indigo` 等多套来源。
- 同一弹窗模式在登录、预览、导出、用户设置里圆角和阴影不同。
- 全局 focus 之前使用微信绿色 `#07c160`，与大部分 App UI 的蓝色主操作不一致。
- 首页 hero/CTA 的装饰 orb 已移除，负 letter-spacing 已收敛；后续重点应继续把共享按钮、卡片、聊天浮层、编辑器局部控件收敛到组件级 token。
- `src/styles/global.css` 和 `src/app/globals.css` 内容重复，容易漂移。

## 2. 新 UI 主题库设计

### Token 分层

新主题库采用 `--app-*` 作为唯一上层语义 token：

- 颜色：`--app-color-primary`、`--app-color-accent`、`--app-color-danger`、`--app-neutral-*`
- 背景/表面：`--app-bg`、`--app-surface-*`、`--app-bg-elevated`
- 文本：`--app-text-primary`、`--app-text-muted`、`--app-text-inverse`
- 字体：`--app-font-sans`、`--app-font-size-*`、`--app-font-weight-*`
- 间距：`--app-space-*`
- 圆角：`--app-radius-*`
- 阴影：`--app-shadow-*`
- 动效：`--app-motion-*`
- 焦点：`--app-focus-ring`

同时保留兼容别名：

- `--page-*`：给 `ui/pages` 和首页使用
- `--c-*`：给旧首页样式使用
- `--color-*`：给旧弹窗/导出组件使用
- `--theme-card-*`：给模板卡片使用

这样能先统一视觉基线，同时避免大规模重写所有 CSS Modules。

### 组件级规范

建议后续把这些组件逐步收敛为共享 primitives：

- `Button` / `IconButton`
- `TextField` / `Textarea` / `SearchBox`
- `Tabs` / `SegmentedControl`
- `Badge` / `StatusMessage`
- `Card` / `ThemeCard`
- `Dialog` / `Drawer`
- `Tooltip`
- `WorkbenchPanel` / `Toolbar`
- `EmptyState` / `Progress`

目前已经通过全局 token 接入了现有组件，但还没有把所有组件抽成统一 React primitive。下一步应该优先做 `Dialog`、`Button`、`Field`，因为它们复用面最大。

### 已落地的设计改动

- 全局引入 `src/styles/theme-library.css`
- `body` 挂载 `data-app-theme="studio"`
- 全局字体、背景、正文色、focus、selection 改为 token
- 移除首页 hero/CTA 的装饰 orb DOM 和 CSS
- 修正首页、页面组件、全局导航、渲染器文本的负 letter-spacing
- 模板页搜索、分类 tab、标题、空状态接入 token
- 登录、模板预览、导出、用户设置弹窗接入统一 radius/shadow/surface/focus 语言
- 给模板预览弹窗和导出弹窗补充 `role="dialog"`、`aria-modal`、`aria-labelledby`
- 编辑器面板接入 `--app-*` surface/radius/shadow，并保持模板 accent 可覆盖
- 页面共享组件的按钮、卡片、流程箭头、浮动聊天入口和消息气泡进一步接入组件级 token，避免继续散落品牌渐变、品牌阴影、反色表面和在线状态颜色

## 3. AI Agent 当前实现

### 编辑器增量编辑链路

当前编辑器 agent 的核心路径：

1. `src/views/EditorPage/useEditorPageController.ts` 加载模板，并把用户拥有的模板变更自动保存为 `layoutDocument`。
2. `src/ui/editor/ThemeLayoutBuilder.tsx` 收集当前 canvas、页面列表、选中节点、组件目录，并挂载 `EditorAiPanel`。
3. `src/ui/editor/components/EditorAiPanel.tsx` 管理对话、远端持久化、流式状态，并调用 `EditorAiService.editCanvas()`。
4. `src/ai/editor-ai.service.ts` 生成 system prompt、意图计划、语义目标、组件目录、页面列表、当前画布摘要。
5. `src/ai/core/query-loop.ts` 执行 LLM query loop，只暴露 `apply_editor_edits` 工具。
6. `src/ui/editor/services/aiEditInstructions.ts` 在浏览器侧校验并应用操作，包括属性更新、插入、移动、删除、页面导航同步等。

这个设计的优点是编辑器修改不是让模型直接写任意 JSON，而是让模型输出窄 DSL，再由本地代码校验和应用。

### 模板伪代码实现

这里的“模板伪代码”主要是三层：

- `layoutDocument`：页面、节点、布局、属性、交互的 JSON 树。
- `componentTemplates`：非 core alias 的可复用模板定义。
- `$bind`：把外层 props 绑定到模板内部节点。

渲染路径：

- `src/ui/renderer/renderTree.tsx` 遍历 `layoutDocument`
- `src/ui/renderer/coreAliases.tsx` 渲染 `core.*`
- `src/ui/renderer/templateInterpreter.tsx` 解释 `componentTemplates` 和 `$bind`
- `src/ui/renderer/components/WidgetNode/WidgetNode.tsx` 在显式开启后执行 widget 代码

这套系统适合表达静态 UI、页面结构、简单导航和可编辑组件，不适合直接表达真实业务逻辑、数据库、支付、权限、实时数据、任意三方运行时代码。

### 自然语言到模板伪代码的判断

当前方案不能保证正确执行每一次自然语言输入。根本原因是用户输入并不会直接映射到 `layoutDocument`，而是经过多层解释：

1. `planUiIntent(prompt)` 先用关键词匹配推断 UI 类型、能力范围和置信度。
2. system prompt 把意图计划、组件目录、语义目标、当前画布摘要交给模型。
3. 模型把自然语言翻译成 `apply_editor_edits` 的操作数组。
4. `aiEditInstructions` 再把语义目标解析成具体 nodeId，并逐条应用到画布。

这条链路的好处是安全边界比“让模型直接改整份 JSON”更强；坏处是每一步都有语义损失：

- 关键词意图路由只能识别显性词，不能真正理解业务上下文。
- 用户说“上面那个卡片”“改成更高级”“像小红书一样”时，语义目标可能不唯一。
- 当前画布摘要有节点数量上限，大页面里模型可能看不到真正目标。
- `layoutDocument` 只能表达静态 UI 和有限交互，无法承载后端、支付、权限、实时数据等真实行为。
- 模型可能输出渲染器不支持的 alias，或者把静态 UI shell 误说成可运行功能。
- 批量操作目前不是事务，部分成功会让用户误以为整条自然语言需求已完成。

因此应把这套 agent 定位为“AI 辅助局部编辑器”，而不是“自然语言需求到完整应用的确定性执行器”。中间语义层是必要的，但现阶段更像 guardrail 和提示增强，不足以消除理解偏差。

## 4. 可行性与可靠率

以下可靠率是基于源码审计和现有测试报告的工程估算，不是大规模线上 eval 结果。

| 任务类型 | 首次成功率估计 |
| --- | ---: |
| 精确选中节点的文案/属性修改 | 80-90% |
| 标题、底栏、搜索框、主按钮等语义目标修改 | 65-80% |
| 插入简单已知组件到选中容器 | 65-80% |
| 在复杂页面中推断位置并插入 | 40-60% |
| 精确节点删除/移动 | 70-85% |
| 新增/删除页面并同步底部 tabs | 70-85% |
| 自定义导航 wiring | 55-75% |
| 静态 dashboard/form/chart 近似生成 | 40-60% |
| 当前完整 AI 模板生成链路 | 25-45% |
| 默认动态 widget/charts/3D | 10-25% |
| 真实后端/auth/payment/realtime 行为 | 0-10% |

如果输入是“把选中的按钮文案改成立即预约”，成功率接近高位；如果输入是“帮我做一个完整电商小程序，支持下单支付和会员积分”，当前系统最多能生成静态 UI 壳，不能正确完成真实业务执行。

总体判断：

- 编辑器增量 agent：可用，但需要验证、事务和 eval 才能达到产品级稳定。
- 模板生成 agent：目前偏原型可用，不应承诺高可靠生成完整可运行 App。
- `componentTemplates` 伪代码：作为静态 UI 组合层可行，作为通用应用运行时不可靠。

## 5. 主要风险

### 1. 自然语言语义转换会误解目标

当前 `planUiIntent()` 是关键词/能力匹配，不是可靠的语义解析器；`semanticTargets` 是基于节点摘要和规则评分的目标解析。它能提高“标题、底栏、CTA、搜索框”等常见区域的命中率，但遇到歧义表达、多个相似卡片、跨页面引用或缺少上下文时，仍可能选错节点或执行近似方案。

### 2. 提示词与渲染器能力不一致

`generate-template.tool.ts` 中列出了 `core.input`、`core.divider`、`core.spacer`，但 `coreAliases.tsx` 当前没有实现这些 alias。模型一旦输出这些节点，渲染器会返回 `null`，页面可能缺块或变空。

### 3. 后端保存缺少 schema 校验

`backend/src/ai/ai.service.ts` 的 `saveTemplate()` 会把模型生成的 `layoutDocument` 直接保存。缺少结构校验会让坏模板进入数据库。

### 4. 画布摘要会截断

`src/ai/editor-ai.service.ts` 的画布摘要上限是 80 个节点。大页面里目标节点可能不在上下文里，模型只能猜。

### 5. 批量编辑不是事务

`applyEditorAiEditInstructions()` 会逐条应用。前几条成功、后几条失败时，用户会得到部分修改。

### 6. 客户端 agent 和后端 editor agent 路线重复

当前前端主要走客户端应用工具调用；后端 `/api/ai/editor` 会发 `edit_request`，但前端没有明确接入这个 alternate path。两套路径并存会增加维护成本。

### 7. Widget 是高风险能力

`core.widget` 在开启后会动态 import approved URL，并用 `new Function` 执行模型生成代码。默认关闭是正确的；要产品化应改成 iframe sandbox 或 curated widget registry。

### 8. 现有集成测试没有真实 LLM eval

`docs/integration-test-report.md` 验证了 API、对话持久化、token 统计路径，但没有触发真实 LLM。AI 成功率还缺少自动化评估。

## 6. 更好的方案

### 方案 A：强化现有 DSL，最适合当前阶段

这是推荐路线。

1. 定义统一 schema
   - 用 Zod 或 JSON Schema 定义 `ThemeLayoutDocument`、`ThemeLayoutNode`、`EditorAiEditInstruction`。
   - 前端工具参数、后端保存、测试 fixture 全部复用同一份 schema。

2. 修正 alias contract
   - 要么实现 `core.input`、`core.divider`、`core.spacer`。
   - 要么从前后端 prompt、intent hints、工具描述里删除它们。
   - unknown alias 不应静默 `null`，应该显示错误占位并上报。

3. 加 dry-run 和事务应用
   - AI 操作先 `validate -> preview diff -> apply`。
   - 一批操作里任一失败时默认不提交，或明确标记 partial apply。

4. 加文档版本号
   - 每次 AI run 绑定 `documentRevision`。
   - 用户在 AI 执行过程中手动改动时，应用前检测冲突。

5. 做 eval
   - 建立 50-100 条 fixture：文案、按钮、底栏、建页、删页、插组件、导航同步。
   - 使用 mock LLM 输出和真实模型输出两套测试。
   - 记录 exact success、partial success、repair success。

6. 给低置信度需求加确认闸门
   - 当 `intentPlan.confidence < 0.65`、存在 unsupported capability、或语义目标匹配低置信度时，不应直接执行。
   - UI 先展示“我理解为要修改哪个区域、执行哪些操作、哪些能力只是静态近似”。
   - 用户确认后再写入画布，或要求用户选中节点/补充描述。

预期效果：

- 简单编辑可以稳定到 85-95%。
- 复杂编辑可以提升到 60-80%。
- 完整模板生成如果加 schema repair，可提升到 55-75%。

### 方案 B：让模板生成变成“规划 + 编译”

当前让模型一次性输出完整 `layoutDocument`，失败面很大。更好的方式是：

1. 模型先输出产品结构计划：
   - 页面列表
   - 区块列表
   - 每个区块的组件意图
   - 文案草稿

2. 编译器把计划编译成 `layoutDocument`：
   - 组件 alias 由编译器选择
   - 布局由确定性规则生成
   - 文案和主题变量来自模型

3. 模型只在校验失败时修复小片段。

预期效果：

- 大幅减少 unsupported alias 和坏布局。
- 生成结果风格更稳定。
- 牺牲一部分模型自由度，换取产品可靠性。

### 方案 C：动态能力走插件/沙箱，不走任意 widget 代码

如果要支持 chart、3D、地图、表单提交等动态能力：

- 建立 `WidgetRegistry`
- 每个 widget 有固定 schema、依赖、权限、渲染组件
- 模型只能选择 widget 和填写 props
- 真正执行放 iframe sandbox 或受控 React 组件里

不建议让模型直接生成 `new Function` 代码作为主路径。

## 7. 本次附带修复

本次顺手修复了一个缓存链路问题：

- `src/ai/core/providers/backend-proxy.provider.ts` 会发送 `x-conversation-id` 和 `x-previous-response-id`
- 之前 `src/app/api/ai/stream/route.ts` 没有透传这些 header
- 已改为转发到后端 `/api/ai/stream`

这不会改变 UI 行为，但会让后端 OpenAI prompt-cache 逻辑有机会生效。

## 8. 最终判断

这套实现可以作为“可视化编辑器 + AI 辅助局部修改”的基础，方向是对的。它不适合作为“任意一句话生成高可靠完整应用”的最终架构，也不能承诺每次自然语言输入都会被正确理解。自然语言到模板伪代码的语义转换一定会出现偏差，只是可以通过 schema、置信度、预览确认、事务回滚和 eval 把偏差控制在可接受范围内。

要提高可靠率，最关键不是换更强模型，而是收窄模型输出面：统一 schema、修正 alias contract、把模板生成改成计划编译、加入 dry-run/事务/eval。这样才能把当前偏演示性质的生成链路推进到可运营的产品能力。
