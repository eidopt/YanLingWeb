# Agent 对话模块拆分与 100 Prompt 集成评测 Spec

## 1. 背景

项目的最终目标是通过和 AI 对话生成设计，同时兼容手动编辑，并让模板保持可渲染、可编辑、可继续迭代。当前代码已经具备基础能力：

- 前端模板生成入口：`src/ai/template-ai.service.ts`
- 前端编辑器 AI 入口：`src/ai/editor-ai.service.ts`
- 后端 AI 代理、流式接口、保存模板：`backend/src/ai/ai.service.ts`
- 编辑器操作应用器：`src/ui/editor/services/aiEditInstructions.ts`
- 模板 DSL 类型：`src/ui/layout/types.ts`
- 现有 API 集成测试：`scripts/integration-test.js`

但当前 agent 对话逻辑和 UI、HTTP、后端代理、模板持久化耦合较深，导致核心能力无法被单独评测。现有集成测试只能证明认证、模板 CRUD、AI 对话记录持久化可用，不能证明“给定用户 prompt 后，agent 是否真的完成了用户任务，且没有破坏模板”。

本 spec 的首要目的，是把 agent 对话模块拆成可单独运行、可注入 provider、可注入模板上下文、可采集结果、可自动评分的模块，并建立约 100 个 prompt 的集成评测集。任务完成标准是：100 个 prompt 的通过率达到 85% 以上，并且失败样本有可定位的结构化报告。

## 2. 范围

### 2.1 本次必须完成

1. 拆分模板生成 agent 与编辑器 agent，使它们可以脱离 React UI 单独运行。
2. 支持模拟用户输入不同 prompt，自动运行完整 agent loop。
3. 支持测试前端 agent 路径：前端上下文构建、工具调用、模板保存或编辑应用。
4. 支持测试后端 agent 路径：后端 provider、流式 loop、工具请求、token usage 记录。
5. 增加模板 JSON 校验和语义评分，避免只检查“JSON 不坏”。
6. 建立 100 个左右 prompt 的测试集，覆盖页面和组件的增删改查、多页面生成、无关改动检测。
7. 输出机器可读的测试报告和人工可读的 Markdown 汇总报告。
8. 以 85% 通过率作为任务完成门槛。

### 2.2 本次不做

1. 不要求完成“导出为完全自包含真实代码项目”的改造。
2. 不要求所有 prompt 都调用真实线上模型；必须支持真实 provider 与 mock provider 两种模式。
3. 不要求视觉像素级黄金图完全一致；本阶段以结构、语义、渲染非空、任务完成度为主。
4. 不引入重型 E2E UI 点击流程作为唯一测试方式；浏览器渲染检查可以作为补充证据。

## 3. 目标完成标准

### 3.1 主验收指标

100 个 prompt 集成评测通过率必须 >= 85%。

一个 prompt 通过必须同时满足：

1. agent run 正常结束，产生 `done` 事件或等价终止状态。
2. 没有 terminal error。
3. 预期工具被调用，例如生成模板必须调用 `generate_template`，编辑任务必须调用 `apply_editor_edits`。
4. 最终模板 JSON 通过结构校验。
5. 最终模板可被 renderer 解析，且不会出现未知 alias、缺失 page、根节点错误、不可插入子节点等基础错误。
6. 任务语义校验通过，例如要求“新增客服页面”，最终必须真的出现客服页面，而不是只得到一个合法 JSON。
7. 无关改动校验通过，例如只改按钮文案时，不应新增页面、不应删除其他组件、不应大面积改写主题。

### 3.2 次级指标

1. 结构校验通过率 >= 95%。
2. 语义任务完成率 >= 85%。
3. 无关改动失败率 <= 10%。
4. agent run 平均耗时需要记录，但不作为第一阶段门槛。
5. 每个失败用例必须输出：
   - scenario id
   - prompt
   - 初始模板摘要
   - 最终模板摘要
   - agent events
   - tool calls
   - validator errors
   - semantic assertion failures

## 4. 现有问题

### 4.1 Agent 服务与 UI/HTTP 耦合

`TemplateAiService.generate()` 同时负责：

- 获取模型配置。
- 构建 intent plan。
- 构建 system prompt。
- 创建 `BackendProxyProvider`。
- 运行 `QueryLoop`。
- 处理 UI event。
- 保存模板到 `/api/proxy/ai/templates`。

这让测试很难只测试“prompt 到模板”的 agent 行为。测试必须模拟 token、fetch、代理接口、浏览器环境。

`EditorAiService.editCanvas()` 也存在类似问题。它同时负责：

- 构建编辑器上下文。
- 读取语义目标配置。
- 管理 conversation id。
- 运行 provider。
- 执行 `applyInstructions`。
- 发出 UI event。

这些逻辑应拆成纯 agent runner 与 UI adapter。

### 4.2 前后端 QueryLoop 行为不容易统一评测

前端有 `src/ai/core/query-loop.ts`，后端有 `backend/src/ai/core/query-loop.ts`。两边都能驱动工具调用，但上下文构建与工具执行责任分散。测试需要能选择：

- frontend-agent mode：使用前端 prompt/context builder，经过后端 proxy provider，工具在测试进程里执行。
- backend-agent mode：使用后端 provider/stream，后端产出 tool request，测试进程应用或验证工具结果。

### 4.3 模板 DSL 缺少独立 validator

`src/ui/layout/types.ts` 定义了 TypeScript 类型和 normalize 函数，但没有运行时 schema。AI 输出错误时，很多问题只有在渲染时才表现为空白或局部缺失。

必须新增运行时 validator，至少覆盖：

- document 顶层字段。
- pages/defaultPageId/layout 一致性。
- root 必须是 `core.screen`。
- alias 必须存在于 core alias 或 `componentTemplates`。
- 组件 props 必须符合 descriptor。
- 非容器节点不能有 children。
- navigation interactions 指向存在的 page。
- node id 全局唯一。
- cssVars 与运行时变量规范一致。

### 4.4 现有集成测试不覆盖真实 agent 成功率

`scripts/integration-test.js` 覆盖了认证、模板复制、页面/元素 CRUD、AI conversation persistence，但没有覆盖真实 prompt 运行、模板生成、编辑语义完成度、无关改动检测。

## 5. 目标架构

目标是形成四层结构：

1. **Agent Core**：纯 TypeScript，不依赖 React，不直接 fetch，不直接读写数据库。
2. **Runtime Adapters**：把 Agent Core 接到前端、后端、测试 runner。
3. **Template Validation/Evaluation**：结构校验、语义断言、diff 检测、渲染 smoke。
4. **Scenario Harness**：读取 100 个 prompt，运行 agent，产出报告。

### 5.1 建议目录

```text
shared/
  agent/
    types.ts
    prompts/
      templateDesignerPrompt.ts
      editorCopilotPrompt.ts
    context/
      editorContext.ts
      intentPlanContext.ts
    validation/
      themeLayoutValidator.ts
      templateDiff.ts
      semanticAssertions.ts
    fixtures/
      blankDocument.ts
      seedDocuments.ts

src/
  ai/
    agents/
      templateGenerationAgent.ts
      editorEditAgent.ts
      agentEventRecorder.ts
    adapters/
      browserTemplateStore.ts
      browserEditorApplyAdapter.ts

backend/
  src/
    ai/
      agent-runner.service.ts
      agent-eval.controller.ts

scripts/
  agent-eval/
    run-agent-eval.js
    scenarios.json
    report-writer.js
```

### 5.2 为什么放在 shared

前端和后端已经都配置了 `@shared/*` 路径，但后端 `backend/tsconfig.json` 当前只 include `src/**/*`。为了让后端也能编译 `shared/agent/*`，需要调整后端 tsconfig：

```json
{
  "include": ["src/**/*", "../shared/**/*.ts"]
}
```

或者改为在 `backend/src/ai` 内只导入类型与纯函数编译产物。推荐第一种，成本低，符合当前 alias 设计。

## 6. 核心类型设计

新增 `shared/agent/types.ts`。

```ts
export type AgentMode = 'template_generation' | 'editor_edit';

export interface AgentRunInput {
  mode: AgentMode;
  prompt: string;
  model?: string;
  templateId?: string;
  document?: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  selectedNodeId?: string | null;
  conversation?: AgentConversationMessage[];
}

export interface AgentRunResult {
  scenarioId?: string;
  mode: AgentMode;
  prompt: string;
  status: 'passed' | 'failed' | 'errored';
  events: AgentEvent[];
  toolCalls: AgentToolCall[];
  initialDocument?: ThemeLayoutDocument;
  finalDocument?: ThemeLayoutDocument;
  validation: ValidationResult;
  semantic: SemanticEvaluationResult;
  unrelatedDiff: UnrelatedDiffResult;
  durationMs: number;
  error?: string;
}
```

要求：

- `AgentRunInput` 不包含 React callback。
- `AgentRunResult` 可以 JSON 序列化。
- 所有 event、tool call、validation error 都必须带时间戳或顺序号。

## 7. Agent Core 拆分要求

### 7.1 TemplateGenerationAgent

新增 `src/ai/agents/templateGenerationAgent.ts`。

职责：

1. 接收 `prompt`、`provider`、`model`、`templateStore`、`eventSink`。
2. 调用 `planUiIntent(prompt)`。
3. 构建 system prompt 与 intent plan prompt。
4. 运行 `QueryLoop`。
5. 拦截 `generate_template` 工具调用。
6. 对工具参数先运行 validator。
7. 根据运行模式决定：
   - dry run：不保存数据库，只返回生成结果。
   - persist：保存到后端或测试模板仓库。
8. 输出 `AgentRunResult`。

`TemplateAiService.generate()` 改成 thin adapter：

1. 获取 token。
2. 创建 `BackendProxyProvider`。
3. 创建 `BrowserTemplateStore`。
4. 调用 `TemplateGenerationAgent.run()`。
5. 把 agent event 转成 UI event。

### 7.2 EditorEditAgent

新增 `src/ai/agents/editorEditAgent.ts`。

职责：

1. 接收 `prompt`、`document`、`pages`、`selectedNodeId`、`component catalog`、`provider`、`editApplier`。
2. 构建编辑器上下文。
3. 运行 `QueryLoop`。
4. 拦截 `apply_editor_edits`。
5. 校验 operations。
6. 应用 operations 到 document。
7. 运行最终模板 validator 和 semantic evaluator。
8. 输出最终 document 与结构化报告。

`EditorAiService.editCanvas()` 改成 thin adapter：

1. 读取 config/conversation。
2. 创建 provider。
3. 把 UI 的 `applyInstructions` 包成 `BrowserEditorApplyAdapter`。
4. 调用 `EditorEditAgent.run()`。
5. 把 agent event 转成 UI event。

### 7.3 后端 AgentRunnerService

新增 `backend/src/ai/agent-runner.service.ts`。

职责：

1. 为后端测试路径提供相同的 agent run 能力。
2. 使用后端 provider，不经过浏览器 fetch。
3. 支持 dry run，避免测试污染数据库。
4. 支持 persist run，用测试账号保存结果并读取验证。
5. 统一记录 token usage。

注意：

- 后端不应直接依赖 React 或 `src/ui/editor`。
- `applyEditorAiEditInstructions` 当前在 `src/ui/editor/services`，如果后端 runner 也要应用编辑操作，应把无 UI 依赖的编辑应用逻辑移动到 `shared/agent/editor/applyEditorInstructions.ts` 或 `shared/layout/editorOperations.ts`。
- 前端原路径继续 re-export，避免大面积修改 import。

## 8. Validator 设计

新增 `shared/agent/validation/themeLayoutValidator.ts`。

### 8.1 基础结构规则

必须检查：

1. `version` 是 number。
2. `themeId`、`themeName`、`description` 是非空字符串。
3. `components` 是非空数组。
4. `pages` 是非空数组。
5. `defaultPageId` 指向存在页面。
6. `layout` 与 default page 的 layout 保持一致，或至少是存在页面的 root。
7. 每个 page 的 root alias 必须是 `core.screen`。
8. node id 在整个 document 内唯一。
9. 每个 node 必须有 `id`、`alias`、`layout`。
10. `layout.mode` 必须是 `flow`、`grid`、`absolute`。

### 8.2 Alias 规则

允许 alias 来源：

1. core alias，例如 `core.screen`、`core.panel`、`core.stack`、`core.row`、`core.grid`、`core.text`、`core.button`、`core.search`、`core.tabs`、`core.tag`、`core.notice`、`core.image`、`core.html`、`core.widget`。
2. `document.components` 中声明的 alias。
3. `componentTemplates` 中声明的 alias，如果后续将 componentTemplates 并入 document 级校验。

未知 alias 必须失败，不能只给 warning。

### 8.3 Children 规则

只有以下容器可以包含 children：

- `core.screen`
- `core.panel`
- `core.stack`
- `core.row`
- `core.grid`

其他节点出现 children 时失败。

### 8.4 Props 规则

根据 `ThemeComponentDescriptor.props` 校验：

1. unknown prop 记 warning 或 fail，需要配置开关。
2. enum prop 必须命中枚举。
3. number prop 必须可转为有效数字。
4. boolean prop 必须是 boolean 或可明确转换。
5. object prop 必须是 plain object。
6. string[] prop 必须是 string array。

评测模式建议 unknown prop 默认 fail，因为它通常代表 AI 生成了不可编辑的假字段。

### 8.5 Interaction 规则

1. `navigate.targetPageId` 必须存在。
2. `onTabClick` 的所有目标页面必须存在。
3. 删除页面后不能留下指向已删除页面的 navigation。
4. 页面导航同步类 prompt 必须检查 tabs 和 pages 一致。

## 9. Semantic Evaluator 设计

新增 `shared/agent/validation/semanticAssertions.ts`。

目标：判断 prompt 的意图是否真的完成，而不只是生成了合法 JSON。

### 9.1 Scenario Schema

`scripts/agent-eval/scenarios.json` 每条 scenario：

```json
{
  "id": "component-update-text-001",
  "mode": "editor_edit",
  "startDocument": "commerce-market",
  "selectedNodeId": "home-primary-button",
  "prompt": "把当前主按钮文案改成立即预约",
  "expected": {
    "mustHave": [
      {
        "type": "node_prop_equals",
        "nodeId": "home-primary-button",
        "prop": "label",
        "value": "立即预约"
      }
    ],
    "mustNotChange": [
      {
        "type": "page_count"
      },
      {
        "type": "node_exists",
        "nodeId": "home-footer-tabs"
      }
    ],
    "maxUnrelatedChangeScore": 0.1
  }
}
```

### 9.2 Assertion 类型

必须支持：

- `node_exists`
- `node_not_exists`
- `node_alias_equals`
- `node_prop_equals`
- `node_prop_contains`
- `node_prop_not_contains`
- `page_exists`
- `page_not_exists`
- `page_count_equals`
- `page_count_delta`
- `page_name_contains`
- `navigation_targets_include`
- `navigation_targets_exact`
- `document_contains_text`
- `document_not_contains_text`
- `component_count_delta`
- `new_page_has_min_nodes`
- `all_pages_have_screen_root`
- `generated_app_has_min_pages`
- `generated_app_has_required_sections`

### 9.3 语义评分

每条 scenario 最终分为：

- structureScore：结构校验分。
- taskScore：意图完成分。
- unrelatedChangeScore：无关改动扣分。
- renderScore：渲染可用分。

默认通过条件：

```text
structureScore == 1
taskScore >= 0.8
unrelatedChangeScore <= maxUnrelatedChangeScore
renderScore >= 0.8
```

## 10. 无关改动检测

新增 `shared/agent/validation/templateDiff.ts`。

### 10.1 Diff 粒度

对比初始 document 和最终 document：

1. page 增删改。
2. node 增删改。
3. props 改动。
4. layout/frame 改动。
5. interactions 改动。
6. components/catalog 改动。
7. cssVars/theme metadata 改动。

### 10.2 Diff 评分

每个 scenario 可以声明允许改动范围：

```json
{
  "allowedChanges": [
    { "path": "pages.home.nodes.home-primary-button.props.label" }
  ]
}
```

未声明但发生变化的路径计入 unrelated change。

示例规则：

- 只改按钮文案：只允许该 button 的 `props.label` 改动。
- 删除一个组件：允许该 node 消失，允许父容器 children/order 变化。
- 新增一个页面：允许 pages 增加一个，允许导航 tabs 增加对应项。
- 删除一个页面：允许 pages 减少一个，允许导航移除该页。
- 从空白生成多页面：允许大范围变化，但必须满足 required sections。

## 11. 100 Prompt 测试集设计

总数建议 100 条，按能力覆盖分组。

### 11.1 组件 CRUD：40 条

1. 新增组件 10 条
   - 在首页顶部新增搜索框。
   - 在主内容区新增公告条。
   - 在商品列表前新增筛选标签。
   - 在底部上方新增行动按钮。
   - 在指定 panel 内新增一行说明文字。
   - 在服务卡片后新增第二个服务入口。
   - 在 dashboard 中新增统计卡片。
   - 在个人中心新增会员标签。
   - 在列表空状态中新增提示文案。
   - 在选中容器内部新增联系按钮。

2. 删除组件 10 条
   - 删除当前选中的提示条。
   - 删除首页搜索框。
   - 删除指定卡片里的副标题。
   - 删除底部上方的营销按钮。
   - 删除重复的服务卡片。
   - 删除页面中的标签列表。
   - 删除公告区。
   - 删除某个图片组件。
   - 删除空状态按钮。
   - 删除一个非根容器。

3. 修改组件 10 条
   - 修改主按钮文案。
   - 修改页面标题。
   - 修改搜索框 placeholder。
   - 修改卡片标题。
   - 修改公告内容。
   - 修改 tag 标签。
   - 修改 tabs activeTab。
   - 修改图片 alt/title。
   - 修改按钮跳转目标。
   - 修改面板 tone 或布局宽度。

4. 查询/定位类 10 条
   - 找到主按钮并把它改成指定文案。
   - 找到底部导航并同步页面。
   - 找到搜索框并修改 placeholder。
   - 找到当前选中的组件并换文案。
   - 找到页面标题并改名。
   - 找到第一个服务卡片并更新标题。
   - 找到重复的按钮并只保留一个。
   - 找到 footer tabs 并添加跳转。
   - 找到主内容区并插入说明。
   - 找到指定语义区域但不能误改其他区域。

### 11.2 页面 CRUD：25 条

1. 新增页面 8 条
   - 新增“客服中心”页面。
   - 新增“订单详情”页面。
   - 新增“设置”页面。
   - 新增“消息通知”页面。
   - 新增“会员权益”页面。
   - 新增“数据分析”页面。
   - 新增“帮助与反馈”页面。
   - 新增“商品详情”页面。

2. 删除页面 6 条
   - 删除空白测试页面。
   - 删除重复的设置页面。
   - 删除帮助页并同步底部导航。
   - 删除非默认页面。
   - 删除订单详情页但保留首页。
   - 尝试删除当前唯一页面，应拒绝或安全失败。

3. 修改页面 6 条
   - 修改页面名称。
   - 修改页面标题。
   - 修改页面描述。
   - 修改默认页面。
   - 修改页面导航标签。
   - 修改页面根 screen 的 title。

4. 页面查询/导航 5 条
   - 同步所有页面到底部导航。
   - 确认每个 tab 都能跳到对应页面。
   - 找到客服页面并新增 FAQ 区块。
   - 找到订单页并删除状态卡片。
   - 找到设置页并增加退出按钮。

### 11.3 无关改动检测：15 条

这些 prompt 目标很小，评测重点是不能乱动。

1. 只改一个按钮文案，不允许页面数量变化。
2. 只改标题，不允许新增组件。
3. 只删一个 tag，不允许删除父卡片。
4. 只新增搜索框，不允许改主题色。
5. 只同步底部导航，不允许改主内容。
6. 只改 placeholder，不允许改按钮。
7. 只改选中组件，不允许改同类组件。
8. 只删除重复卡片，不允许删除第一个卡片。
9. 只新增页面，不允许改首页布局。
10. 只删除指定页面，不允许删除默认页。
11. 只改一个 tab label，不允许改 targetPageId。
12. 只改页面名称，不允许改 page id。
13. 只改一个 panel tone，不允许改 children。
14. 只移动一个组件，不允许改文案。
15. 只添加跳转 interaction，不允许新增页面。

### 11.4 从空白生成完整多页面模板：20 条

这些走 `template_generation` 或“空白 document + editor edit”模式。

要求每条至少生成：

- 3 个页面以上。
- 每页 root 为 `core.screen`。
- 首页有明确主内容。
- 有导航或可识别页面关系。
- 有行动按钮或关键操作入口。
- 文案符合 prompt 领域。

示例：

1. 生成一个预约健身私教的多页面应用。
2. 生成一个本地咖啡店点单应用。
3. 生成一个宠物医院服务预约应用。
4. 生成一个二手书交易小程序。
5. 生成一个企业工单管理应用。
6. 生成一个在线课程学习应用。
7. 生成一个社区活动报名应用。
8. 生成一个家政服务预约应用。
9. 生成一个 SaaS 数据看板应用。
10. 生成一个餐厅排队取号应用。
11. 生成一个美甲门店预约应用。
12. 生成一个房源浏览应用。
13. 生成一个电商会员中心应用。
14. 生成一个心理咨询预约应用。
15. 生成一个旅游行程规划应用。
16. 生成一个生鲜团购应用。
17. 生成一个招聘职位管理应用。
18. 生成一个物业报修应用。
19. 生成一个个人财务记录应用。
20. 生成一个设计作品集展示应用。

## 12. 测试 Runner 设计

新增 `scripts/agent-eval/run-agent-eval.js`。

### 12.1 命令

```bash
pnpm agent:evaluate
pnpm agent:evaluate -- --mode mock
pnpm agent:evaluate -- --mode live --limit 10
pnpm agent:evaluate -- --scenario component-update-text-001
pnpm agent:evaluate -- --group page-crud
```

新增 package scripts：

```json
{
  "scripts": {
    "agent:evaluate": "node scripts/agent-eval/run-agent-eval.js"
  }
}
```

### 12.2 环境变量

```text
AGENT_EVAL_BASE_URL=http://localhost:4000/api
AGENT_EVAL_USER=admin
AGENT_EVAL_PASSWORD=admin1234
AGENT_EVAL_PROVIDER_MODE=mock|live
AGENT_EVAL_PASS_RATE=0.85
AGENT_EVAL_MAX_CONCURRENCY=2
AGENT_EVAL_OUTPUT_DIR=output/agent-eval
```

live 模式默认串行或低并发，避免触发后端 rate limit。当前后端 rate limit 是每用户每分钟 10 次，跑 100 条真实模型测试时需要：

1. 测试 runner 自带节流。
2. 或增加仅测试环境可配置的 rate limit。
3. 或使用多个测试用户分片。

### 12.3 输出文件

```text
output/agent-eval/
  latest.json
  latest.md
  failures/
    component-update-text-001.json
    page-delete-003.json
  snapshots/
    component-update-text-001.before.json
    component-update-text-001.after.json
```

## 13. Mock Provider 设计

必须支持 mock provider，原因：

1. CI 不能依赖外部模型。
2. 需要稳定复现 validator 和 evaluator。
3. 需要构造边界错误。

新增 `shared/agent/testing/mockProvider.ts` 或 `src/ai/agents/testing/mockProvider.ts`。

Mock provider 能根据 scenario id 返回：

- 合法的 `generate_template` tool call。
- 合法的 `apply_editor_edits` tool call。
- 故意的未知 alias。
- 故意的无关改动。
- 故意的无工具调用。
- 故意的 malformed JSON。

mock 模式通过率必须达到 100%，否则说明 harness 或 validator 本身不稳定。

live 模式通过率最终要求 >= 85%。

## 14. 运行流程

### 14.1 编辑类 Scenario

1. 读取 scenario。
2. 加载 start document fixture。
3. 根据 scenario 设置 selectedNodeId、activePage、conversation。
4. 调用 `EditorEditAgent.run()`。
5. 捕获 events 和 tool calls。
6. 得到 final document。
7. 执行结构 validator。
8. 执行 semantic assertions。
9. 执行 unrelated diff。
10. 可选执行 render smoke。
11. 写入结果。

### 14.2 生成类 Scenario

1. 读取 prompt。
2. 调用 `TemplateGenerationAgent.run()`。
3. 捕获 `generate_template` 输入。
4. dry run 模式不保存数据库。
5. persist 模式保存到测试账号模板，再读取确认。
6. 校验最终 `layoutDocument`。
7. 执行多页面应用语义断言。
8. 写入结果。

## 15. 渲染 Smoke 检查

第一阶段不要求像素级视觉 diff，但应增加基础 render smoke。

建议新增 `scripts/agent-eval/render-smoke.js`，使用 React server render 或 Playwright。

最低要求：

1. 每个 page 可被 `DynamicThemeRenderer` 渲染。
2. 页面 HTML 非空。
3. 不出现 unknown alias error。
4. 不出现 React render exception。
5. 至少有一个用户可见文本节点。

如果使用 Playwright，增加：

1. desktop 1440x900 screenshot。
2. mobile 390x844 screenshot。
3. console error 收集。
4. 页面主体高度 > 0。
5. 关键文本可见。

## 16. 需要修改的现有代码

### 16.1 `src/ai/template-ai.service.ts`

改造前：服务内直接构建 prompt、运行 loop、调用 fetch 保存模板。

改造后：

- 保留对 UI 的 public API。
- 内部调用 `TemplateGenerationAgent`。
- 移除或 re-export system prompt，真实 prompt 放到 `shared/agent/prompts/templateDesignerPrompt.ts`。
- `saveTemplate()` 变成 `BrowserTemplateStore.saveGeneratedTemplate()`。

验收：

- 页面现有“AI 生成模板”功能行为不变。
- agent eval 可以不加载浏览器直接调用同一核心逻辑。

### 16.2 `src/ai/editor-ai.service.ts`

改造前：服务内包含大量上下文构建函数和 prompt。

改造后：

- prompt 移到 `shared/agent/prompts/editorCopilotPrompt.ts`。
- `buildEditorContext()`、`summarizeCanvas()`、`summarizeComponents()` 等移到 `shared/agent/context/editorContext.ts`。
- `EditorAiService` 只负责 token/config/conversation/UI event bridge。
- 核心运行交给 `EditorEditAgent`。

验收：

- 编辑器 AI panel 行为不变。
- agent eval 可直接构造 document + prompt 运行。

### 16.3 `src/ui/editor/services/aiEditInstructions.ts`

改造目标：

- 将无 UI 依赖的 operation 类型、sanitizer、apply logic 移到 shared。
- 保留原文件作为前端兼容导出。
- 修复当前错误信息中的编码损坏，避免 AI repair loop 和测试报告不可读。

建议新路径：

```text
shared/agent/editor/editorOperations.ts
shared/agent/editor/applyEditorInstructions.ts
```

验收：

- 前端 import 不需要大面积改动。
- 后端/test runner 可以复用同一套 operation apply logic。

### 16.4 `backend/src/ai/ai.service.ts`

新增或调整：

- 注入 `AgentRunnerService`。
- 后端 stream editor 路径继续保留。
- test/eval 模式允许 dry run，不写数据库。
- 后端 provider 事件需要被记录为 `AgentRunResult.events`。

不建议把 eval controller 默认暴露到生产。应使用：

```text
NODE_ENV !== 'production'
```

或显式环境变量：

```text
ENABLE_AGENT_EVAL_ENDPOINT=true
```

### 16.5 `scripts/integration-test.js`

保留现有 API 集成测试，不要混入 100 prompt eval。

原因：

- 现有测试应该保持快速、稳定。
- agent eval 会慢、会调用模型、会产生大量报告。

新增独立脚本：

```text
scripts/agent-eval/run-agent-eval.js
```

## 17. 任务拆分计划

### Phase 1：抽离纯函数与类型

交付：

1. `shared/agent/types.ts`
2. `shared/agent/prompts/*`
3. `shared/agent/context/*`
4. `shared/agent/validation/themeLayoutValidator.ts`
5. `shared/agent/validation/templateDiff.ts`
6. `shared/agent/validation/semanticAssertions.ts`

验收：

- `pnpm lint` 通过。
- `pnpm build` 通过。
- `backend npm run build` 通过。
- validator 有最小单元测试或 mock runner 验证。

### Phase 2：拆分 Agent Runner

交付：

1. `src/ai/agents/templateGenerationAgent.ts`
2. `src/ai/agents/editorEditAgent.ts`
3. `src/ai/adapters/browserTemplateStore.ts`
4. `src/ai/adapters/browserEditorApplyAdapter.ts`
5. `TemplateAiService` 和 `EditorAiService` 改为 adapter。

验收：

- 原 UI 功能保持可用。
- mock provider 可跑通生成和编辑各 1 条 scenario。

### Phase 3：后端 runner 与 eval 接入

交付：

1. `backend/src/ai/agent-runner.service.ts`
2. 可选 `backend/src/ai/agent-eval.controller.ts`
3. 后端 tsconfig include shared。
4. dry run/persist run 支持。

验收：

- 后端 build 通过。
- mock backend-agent scenario 通过。
- 不在生产环境默认开放 eval endpoint。

### Phase 4：100 Prompt Scenario 集

交付：

1. `scripts/agent-eval/scenarios.json`
2. seed document fixtures。
3. scenario schema 校验。
4. 100 条 prompt 分类覆盖。

验收：

- scenario 文件可被校验。
- 每条都有明确 expected assertions。
- 每条都声明允许改动范围或使用默认策略。

### Phase 5：报告与通过率门禁

交付：

1. `scripts/agent-eval/report-writer.js`
2. `output/agent-eval/latest.json`
3. `output/agent-eval/latest.md`
4. package script `agent:evaluate`

验收：

- mock mode 100/100 通过。
- live mode 初始报告可定位失败。
- live mode 最终通过率 >= 85%。

## 18. 风险与处理

### 18.1 真实模型随机性

风险：同一 prompt 多次输出不同，导致通过率波动。

处理：

- eval 使用固定模型。
- temperature 尽量降低。
- 每个 scenario 最多允许 1 次 auto repair。
- 报告记录 model、provider、时间、token usage。

### 18.2 DSL 过于自由

风险：AI 生成了合法 JSON，但语义不符合业务目标。

处理：

- 使用 semantic assertions。
- 使用 allowed diff。
- 使用最小页面/最小区块/关键文案检查。
- 对模板生成增加 required sections。

### 18.3 测试污染数据库

风险：100 条测试创建大量模板。

处理：

- 默认 dry run。
- persist run 使用测试前缀，例如 `eval-*`。
- runner 结束后清理测试模板。
- 或使用 test database flavor。

### 18.4 Rate limit

风险：100 条 live prompt 触发 10 req/min 限制。

处理：

- runner 节流。
- test 环境允许配置 rate limit。
- 分批运行。

### 18.5 前后端共享代码编译问题

风险：shared 中引用 DOM/React，导致后端无法编译。

处理：

- `shared/agent` 只允许纯 TS 和类型。
- 不引用 React、Next、DOM API。
- 渲染 smoke 放在 scripts 或 frontend test harness。

## 19. 最终交付清单

1. Agent core 拆分完成。
2. 前端 UI adapter 保持原行为。
3. 后端 agent runner 支持测试模式。
4. 模板 DSL validator 可独立运行。
5. semantic evaluator 可判断任务是否完成。
6. unrelated diff 可检测额外改动。
7. 100 条 prompt scenarios。
8. mock eval 100% 通过。
9. live eval >= 85% 通过。
10. `output/agent-eval/latest.md` 可作为最终测试报告。

## 20. 完成定义

本任务只有在以下条件全部满足时才算完成：

1. `pnpm lint` 通过。
2. `pnpm build` 通过。
3. `backend npm run build` 通过。
4. 现有 `pnpm test:integration` 通过。
5. `pnpm agent:evaluate -- --mode mock` 通过率 100%。
6. `pnpm agent:evaluate -- --mode live` 在 100 条 prompt 上通过率 >= 85%。
7. 失败报告能明确区分：
   - 模型没有调用工具。
   - 工具参数非法。
   - 模板结构非法。
   - 任务语义未完成。
   - 出现无关改动。
   - 后端/API/认证失败。
8. 至少 10 条失败样本经过人工复查，确认评分规则没有系统性误判。

