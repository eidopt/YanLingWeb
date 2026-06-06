# 下一步实施计划

> **创建日期**: 2026-06-04
> **基准分支**: `feat/editor-ai-improvements`
> **核心目标**: 提升 Agent 执行效率 — 尽量前 1-2 次完成整个流程，减少反复重试
> **前置文档**: `docs/roadmap/README.md`, `docs/roadmap/execution-plan.md`

---

## 总览

| 序号  | 课题                       | 工期   | 可行性  | 核心发现                                                                                   |
| ----- | -------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------ |
| **①** | P1-1 Pipeline 单阶段重试   | 2 天   | ✅ 容易 | SchemaGen 只消费 brief，brief 产生后不变。重跑不需要 Designer。现有测试 harness 可直接扩展 |
| **②** | P1-1 SchemaGen prompt 强化 | 1 天   | ✅ 容易 | 两大失败主因（重复 ID、遗漏 biz-\* 声明）已被机械修复兜底，prompt 强化是锦上添花           |
| **③** | P1-2 pageKind 推断增强     | 2 天   | ✅ 中等 | 当前只看 name/id 正则，完全不看组件结构。walkNodes 已存在可复用。误判风险需用高阈值控制    |
| **④** | P1-2 导航类型多样化        | 0.5 天 | ✅ 容易 | buildNavigation 硬编码 `'bottom_tabs'`，检测 core.tabbar/core.sidebar 即可                 |
| **⑤** | P0-3 结构化 SSE（一期）    | 3 天   | ⚠️ 中等 | 心跳已完成。剩余是事件类型定义 + 后端发出 + 前端 console 透传                              |

---

## ① P1-1 Pipeline 单阶段重试

### 可行性分析

#### 当前代码架构

**文件**: `backend/src/ai-templates/orchestrator/pipeline.service.ts`

```
for attempt = 1..3:
  Stage 1: Designer → brief
  Stage 2: Critic → verdict (如果 revise → continue 回 Designer)
  Stage 3: SchemaGen (内部 3 次重试 × 最多 8 次 LLM 迭代)
         → 如果全部失败 → continue 回 Designer  ← 这是浪费
  Stage 4: Verifier → 如果失败 → continue 回 Designer
```

**关键发现**:

1. **SchemaGen 只消费 `brief`**（Designer 的输出）。`brief` 一旦产生就不再变。重跑 SchemaGen **不需要重跑 Designer**。
   - 代码位置: `pipeline.service.ts:98` — `this.schemaGenerator.run(brief, attempt)`
   - `brief` 来自 `stages.designer.at(-1).output`，在 SchemaGen 之前已经产生（line 72）

2. **阶段级 try/catch 已存在** — 每个 stage 都有独立 catch，只是 catch 后 `continue` 回 Stage 1。
   - SchemaGen catch: `pipeline.service.ts:98-111`
   - `reviseSuggestion` 在 line 108 构造: `` `Stage 3 schema generation failed: ${msg}` ``

3. **`stages` 数组已设计为多次记录** — `PipelineStageRecord[]` 天然支持同阶段存多条。
   - `stages.designer` 和 `stages.critic` 已在 SchemaGen 之前 push（line 72, 77）
   - `stages.schema` 只在成功时 push（line 119）

4. **SchemaGen 内部已有 3 次自修复**（`SCHEMA_STAGE_RETRIES = 3`，line 96）。每次内部重试调用 `runStructuredStage`（最多 8 次 LLM 迭代）。外层再加 2 次不需要改内部逻辑。
   - 总 SchemaGen 尝试: 3（内部）× 3（外层）= 9 次，当前也是 3×3 但中间夹带了 Designer + Critic

5. **错误信息足够丰富** — `parseAndValidate` 失败时抛出前 5 个校验错误的 `[code] path: message`（schemaGenerator.agent.ts:235）。可以注入到 `reviseSuggestion` 让下一次 SchemaGen 知道上次错在哪。

#### 现有测试基础设施

**文件**: `backend/src/ai-templates/orchestrator/pipeline.service.spec.ts`（399 行）

**测试 harness**（line 112 `createHarness()`）:

- `FakeDesignerAgent`, `FakeDiversityCriticAgent`, `FakeSchemaGeneratorAgent`, `FakeVerifierAgent`
- 每个都有 `jest.fn()` mock 的 `runMock` 字段
- 辅助函数: `createBrief()`, `createSchema()`, `createDocument()`, `stage()`

**现有 4 个测试**:

| 测试                   | 行号 | 覆盖场景                                                 |
| ---------------------- | ---- | -------------------------------------------------------- |
| Happy path             | 230  | 4 阶段全部通过                                           |
| External results       | 260  | generateExternal 隐藏内部阶段                            |
| Critic retry           | 281  | Critic revise → Designer 带 reviseSuggestion 重试        |
| **Schema throw retry** | 319  | SchemaGen 抛异常 → 回 Designer 重试 ← **这是我们要改的** |
| Verifier exhaustion    | 345  | 3 次全部失败 → 抛异常                                    |

**关键**: line 319-343 的测试验证了当前行为（SchemaGen 失败 → 回 Designer）。改完后这个测试需要更新为新行为（SchemaGen 失败 → 内层重试，不回 Designer）。

### 方案

**改动文件**: `pipeline.service.ts`（~20 行）

**改动位置**: line 93-118（SchemaGen 阶段的 try/catch 块）

将 SchemaGen 失败后的 `continue`（回到 Designer）改为内层 for 循环重试：

```typescript
// 当前（line 97-118）:
for (let stageRetry = 0; stageRetry < SCHEMA_STAGE_RETRIES; stageRetry++) {
  try {
    schemaRecord = await this.schemaGenerator.run(brief, attempt);
    schemaGenSucceeded = true;
    break;
  } catch (err) {
    // ... 最后一次失败后:
    reviseSuggestion = `Stage 3 schema generation failed: ${msg}`;
  }
}
if (!schemaGenSucceeded) continue; // ← 回到 Designer

// 改为:
const SCHEMA_PIPELINE_RETRIES = 2; // 外层重试次数（不含首次）
for (let pipelineRetry = 0; pipelineRetry <= SCHEMA_PIPELINE_RETRIES; pipelineRetry++) {
  for (let stageRetry = 0; stageRetry < SCHEMA_STAGE_RETRIES; stageRetry++) {
    try {
      schemaRecord = await this.schemaGenerator.run(brief, attempt);
      schemaGenSucceeded = true;
      break;
    } catch (err) {
      // ... 内层重试逻辑不变
    }
  }
  if (schemaGenSucceeded) break;
  // 外层重试：注入上一次的错误信息，让 LLM 知道错在哪
  this.logger.warn(`schemaGen pipeline-retry ${pipelineRetry + 1}: ${lastError}`);
}
if (!schemaGenSucceeded) {
  reviseSuggestion = `Stage 3 schema generation failed: ${lastError}`;
  continue; // 全部失败才回 Designer
}
```

**Verifier 暂不做单阶段重试** — Verifier 失败可能是 brief 本身有问题，需要回到 Designer。

### 测试策略

#### 新增测试用例（在 `pipeline.service.spec.ts` 中）

**测试 1: SchemaGen 外层重试成功**

```
场景: SchemaGen 在 attempt 1 内层 3 次全失败，外层重试 1 次成功
验证:
  - Designer.runMock 只调用 1 次（不重跑）
  - SchemaGen.runMock 调用 4 次（3 内层 + 1 外层重试）
  - stages.schema 只有 1 条记录（成功那次）
```

**测试 2: SchemaGen 外层重试全部失败，回 Designer**

```
场景: SchemaGen 内层 3 次 × 外层 3 次 = 9 次全失败
验证:
  - Designer.runMock 调用 2 次（首次 + 失败后回 Designer）
  - 第 2 次 Designer 调用的 reviseSuggestion 包含错误信息
  - 最终 Pipeline 抛出失败
```

**测试 3: SchemaGen 首次成功（无重试）**

```
场景: SchemaGen 首次内层就成功
验证:
  - Designer.runMock 只调用 1 次
  - SchemaGen.runMock 只调用 1 次
  - 行为与当前 happy path 一致
```

#### 如何验证效果

**指标**: Pipeline 平均 attempt 次数

**方法**:

1. 在 pipeline.service.ts 中添加日志: `attempt X: schemaGen succeeded (no designer retry needed)`
2. 运行 `pnpm agent:evaluate` 的 template_generation 场景
3. 对比改动前后的 `attempt` 分布:
   - 当前: SchemaGen 失败时 attempt 递增（因为回 Designer）
   - 改后: SchemaGen 外层重试时 attempt 不递增（因为不回 Designer）

**验收标准**: Pipeline 一次通过率 > 70%（当前约 40-50%）

---

## ② P1-1 SchemaGen prompt 强化

### 可行性分析

#### 失败主因（基于代码注释）

| 失败模式                 | 频率                                           | 代码位置                     | 当前修复                                       |
| ------------------------ | ---------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| **跨页重复 node ID**     | 最高 — "SchemaGen 反复耗尽迭代的主因"          | schemaGenerator.agent.ts:218 | `dedupeNodeIds()` 机械修复（line 221）         |
| **遗漏 biz-\* 组件声明** | 最高 — "最高频的 missing_component_descriptor" | schemaGenerator.agent.ts:154 | `autoBizComponents()` 机械修复（line 156-168） |
| **非法 props**           | 中等                                           | schemaGenerator.agent.ts:229 | `unknownProps` 校验后抛异常                    |

**关键发现**: 前两大失败主因已有机械修复兜底。prompt 强化是**锦上添花**——从源头减少 LLM 犯错，减少不必要的迭代次数。

### 方案

**改动文件**: SchemaGen 的 system prompt（在 schemaGenerator.agent.ts 中或引用的 prompt 文件）

在 system prompt 中添加:

```
## Critical Rules

1. **Node ID Uniqueness**: Every node ID across ALL pages must be globally unique.
   ❌ WRONG: page-1 uses "hero-text" AND page-2 uses "hero-text"
   ✅ RIGHT: page-1 uses "home-hero-text", page-2 uses "product-hero-text"

2. **Component Declaration**: If you define a componentTemplate entry, you MUST also
   add a matching entry in the components catalog.
   ❌ WRONG: componentTemplates has "biz-promo-card" but components has no entry
   ✅ RIGHT: components includes {alias: "biz-promo-card", props: []}

3. **Props**: Only use props listed in the component catalog for each alias.
   Price text MUST use ¥ symbol. Text content MUST be in Chinese.
```

### 测试策略

**方法**: 对比 SchemaGen 内部迭代次数

1. 在 `schemaGenerator.agent.ts` 的 `runStructuredStage` 调用前后记录迭代次数
2. 运行 10 个 template_generation 场景
3. 对比改动前后的平均迭代次数

**验收标准**: SchemaGen 平均内部迭代次数下降（从日志统计）

**回退方案**: 如果 prompt 强化不生效，保持现有机械修复兜底。两者不冲突。

---

## ③ P1-2 pageKind 推断增强

### 可行性分析

#### 当前实现

**文件**: `shared/agent/template/buildTemplateProfile.ts:28-58`

**输入**: 仅 `${page.name} ${pageId}` 文本
**逻辑**: 9 个正则匹配 + `'unknown'` fallback
**问题**: 页面叫"页面1"就返回 unknown，即使里面有完整商品卡片布局

#### `unknown` 的下游影响（严重）

| 影响点                            | 代码位置                           | 后果                                 |
| --------------------------------- | ---------------------------------- | ------------------------------------ |
| `create_page_from_page_kind` 指令 | semanticInstructionCompiler.ts:109 | 直接失败，返回 `page_kind_not_found` |
| AI 看到 `kind=unknown`            | editorContext.ts:331               | 无法推断页面用途                     |
| 语义 page fallback                | templateProfileResolver.ts:18      | 找不到参考页                         |

#### 可用但未使用的信号

**`walkNodes` 已存在于** `buildTemplateProfile.ts:74-82`，递归遍历完整节点树。当前用于 `inferPatternFields`（line 138）和 slot 发现（line 224），但**不用于 pageKind 推断**。

**可用的结构信号**:

| 信号                                      | 可检测内容 | pageKind            |
| ----------------------------------------- | ---------- | ------------------- |
| `core.form` + `core.input` + 提交按钮     | 表单页面   | `form`              |
| 价格文本（¥/$/€）+ 购买按钮               | 商品页面   | `product`           |
| `core.search` + `core.grid` / `core.list` | 分类/列表  | `category` / `list` |
| `core.avatar` + 菜单列表                  | 个人中心   | `profile`           |
| `core.statistic` + 数据图表               | 仪表盘     | `dashboard`         |
| 订单状态标签 + 订单列表                   | 订单页面   | `order`             |

#### 现有测试

**无专门的 spec 文件**。`buildTemplateProfile` 通过以下间接测试:

- `semantic-instruction-compiler.spec.ts` — 6+ 测试，但只测 slot/pattern/region
- `semantic-lowcode-smoke.mjs` — smoke test
- `nodeCandidateSet.spec.ts` — 使用 `createCommerceMarketDocument()` 但不测 pageKind

**测试 fixture `createCommerceMarketDocument()`**: 3 个页面（首页/订单/我的），全部有中文名，现有正则全部命中。**无法测到 unknown 场景**。

### 方案（三步走）

#### Step 1: meta.pageKind 显式标注（5 分钟）

- 给 `ThemeLayoutNodeSemanticMeta` 加 `pageKind?: string`
- `inferPageKind` 优先读 `page.layout.meta?.pageKind`
- 模板生成时 AI 在 `submit_page_spec` 中标注 pageKind

#### Step 2: 组件结构信号匹配（2-3 小时）

**改动文件**: `buildTemplateProfile.ts`

```typescript
// 在 inferPageKind 的正则匹配之后，添加 fallback:
const structuralMatch = inferPageKindFromStructure(page.layout);
if (structuralMatch && structuralMatch.score >= 0.6) {
  return structuralMatch.kind;
}
return 'unknown';

// 新增函数:
function inferPageKindFromStructure(layout: ThemeLayoutNode): { kind: string; score: number } | null {
  const signals: Record<string, number> = {};
  walkNodes(layout, (node) => {
    // 收集信号
    if (node.alias === 'core.form') signals.form = (signals.form || 0) + 1;
    if (node.alias === 'core.input') signals.input = (signals.input || 0) + 1;
    if (node.alias === 'core.search') signals.search = (signals.search || 0) + 1;
    if (node.alias === 'core.avatar') signals.avatar = (signals.avatar || 0) + 1;
    if (node.alias === 'core.statistic') signals.statistic = (signals.statistic || 0) + 1;
    // 价格模式
    if (node.alias === 'core.text' && typeof node.props?.text === 'string') {
      if (/[¥$€]\s*\d/.test(node.props.text)) signals.price = (signals.price || 0) + 1;
    }
    // 购买/提交按钮
    if (node.alias === 'core.button' && typeof node.props?.label === 'string') {
      if (/购买|加购|下单|立即/.test(node.props.label)) signals.buyButton = (signals.buyButton || 0) + 1;
      if (/提交|保存|确认|注册/.test(node.props.label)) signals.submitButton = (signals.submitButton || 0) + 1;
    }
  });

  // 评分
  const scores: Record<string, number> = {
    product: Math.min(
      1,
      (signals.price || 0) * 0.3 + (signals.buyButton || 0) * 0.3 + Math.min(1, (signals.image || 0) / 2) * 0.2,
    ),
    form: Math.min(
      1,
      (signals.form || 0) * 0.4 + Math.min(1, (signals.input || 0) / 2) * 0.3 + (signals.submitButton || 0) * 0.3,
    ),
    profile: Math.min(1, (signals.avatar || 0) * 0.5 + Math.min(1, signals.menuList || 0) * 0.3),
    category: Math.min(1, (signals.search || 0) * 0.3 + Math.min(1, signals.grid || 0) * 0.4),
    dashboard: Math.min(1, (signals.statistic || 0) * 0.5),
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 0.6 ? { kind: best[0], score: best[1] } : null;
}
```

**调用顺序**: meta.pageKind → name regex → 结构信号 → unknown

#### Step 3: 导航类型多样化（0.5 天）

**改动文件**: `buildTemplateProfile.ts:119-130`

```typescript
// 当前: return { type: 'bottom_tabs', items };
// 改为:
const hasTabbar = walkNodes(document.layout, (n) => n.alias === 'core.tabbar' && n.slot === 'footer');
const hasSidebar = walkNodes(document.layout, (n) => n.alias === 'core.sidebar');
let type = 'bottom_tabs';
if (hasSidebar) type = 'side_nav';
else if (device === 'desktop' && pages.length > 5) type = 'side_nav';
else if (device === 'desktop') type = 'top_tabs';
return { type, items };
```

### 测试策略

#### 新增 spec 文件: `shared/agent/template/buildTemplateProfile.spec.ts`

**测试 1: 现有正则行为不退化**

```
输入: { name: '首页', id: 'home' } → 期望: pageKind = 'home'
输入: { name: '订单', id: 'orders' } → 期望: pageKind = 'order'
输入: { name: '我的', id: 'profile' } → 期望: pageKind = 'profile'
```

**测试 2: unknown 场景**

```
输入: { name: '页面1', id: 'page-1' } → 当前期望: pageKind = 'unknown'
```

**测试 3: 结构信号匹配 — 商品页**

```
输入: name='页面1', layout 包含 core.image + ¥价格文本 + 购买按钮
期望: pageKind = 'product'（不再是 unknown）
```

**测试 4: 结构信号匹配 — 表单页**

```
输入: name='页面2', layout 包含 core.form + core.input + 提交按钮
期望: pageKind = 'form'
```

**测试 5: 结构信号匹配 — 个人中心**

```
输入: name='页面3', layout 包含 core.avatar + 菜单列表
期望: pageKind = 'profile'
```

**测试 6: 高阈值防误判**

```
输入: name='页面4', layout 只有一个 core.text（无明显结构信号）
期望: pageKind = 'unknown'（score < 0.6，不猜）
```

**测试 7: meta.pageKind 显式标注优先**

```
输入: name='页面1', layout.meta.pageKind = 'custom-landing'
期望: pageKind = 'custom-landing'（忽略正则和结构信号）
```

#### 如何验证效果

**基线测量**:

1. 用 `createCommerceMarketDocument()` 跑 `buildTemplateProfile()`，记录 pageKind
2. 再构造 5 个 generic-name 页面（页面1-5），分别带不同结构信号
3. 记录改动前全部返回 `unknown`

**改动后验证**:

1. 同样的 10 个测试输入
2. 中文名页面: 不退化（仍返回正确 pageKind）
3. generic-name 页面: 有结构信号的返回正确 pageKind，无信号的仍返回 unknown
4. 统计: unknown 率从 ~20% 降到 < 10%，误判率 < 5%

**验收标准**:

- [ ] meta.pageKind 显式标注优先于所有推断
- [ ] 结构信号匹配作为 name regex 的 fallback
- [ ] pageKind 'unknown' 比例 < 10%
- [ ] 误判率 < 5%（宁可 unknown 不猜错）
- [ ] 所有新测试用例通过

### 回退方案

如果信号匹配误判率 > 10%:

- **只保留 Step 1**（meta.pageKind 显式标注）
- 在模板生成的 `submit_page_spec` 工具中要求 AI 必须填写 pageKind
- 这样 pageKind 由 AI 在生成时确定，不靠事后推断

---

## ⑤ P0-3 结构化 SSE 协议（一期）

### 可行性分析

#### 当前 SSE 架构

- **心跳已完成**: `startSseHeartbeat(res)` 5 秒间隔（ai.controller.ts）
- **当前事件格式**: `data: ${JSON.stringify(event)}` — event 只有 `type` + 常规字段
- **后端**: `AiService.stream()` / `streamEditor()` 返回 Observable，controller 转发为 SSE
- **前端**: `BackendProxyProvider` 解析 `data:` JSON，只处理 `text_delta`, `tool_call`, `done`, `error`

#### 改造空间

后端 `agent-runner.service.ts` 已有丰富的内部事件（`tool_start`, `tool_done`, `tool_error`, `clarification` 等），但这些事件**不通过 SSE 发到前端**。SSE 只转发 Provider 级别的事件。

### 方案（一期：后端发事件 + 前端 console 透传）

**新增文件**: `shared/agent/contracts/sseEvents.ts`

```typescript
export type SSEEventType =
  | 'text_delta'
  | 'reasoning_delta'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'pipeline_stage_start'
  | 'pipeline_stage_end'
  | 'done'
  | 'error';
```

**改动**:

- `ai.controller.ts`: 在 SSE 流中插入结构化事件
- `backendProxy.provider.ts`: 解析新事件类型，console.log 输出

### 测试策略

**后端测试**: 在 `ai.controller.spec.ts` 中验证:

- SSE 流包含 `tool_call_start` 和 `tool_call_end` 事件
- 事件包含工具名和耗时
- 现有事件（text_delta, done, error）不退化

**前端验证**: 打开浏览器 console，运行一个 AI 编辑操作，确认 console.log 输出结构化事件

**验收标准**:

- [ ] 后端发出 `tool_call_start`、`tool_call_end` 事件
- [ ] DeepSeek `reasoning_content` 作为 `reasoning_delta` 事件发出
- [ ] 前端 console 可看到所有结构化事件
- [ ] 现有事件格式不退化

---

## 执行路径

```
① P1-1 单阶段重试 (2d)  ← 效率提升最大
   └─ ② P1-1 SchemaGen prompt (1d) ← 配合①从源头减少错误
      └─ ③ P1-2 pageKind 推断 (2d) ← 生成准确度 ↑
         └─ ④ P1-2 导航类型 (0.5d) ← 配合③
            └─ ⑤ P0-3 SSE 一期 (3d) ← 可观测性
```

## 风险与缓解

| 风险                               | 影响              | 缓解策略                                          |
| ---------------------------------- | ----------------- | ------------------------------------------------- |
| SchemaGen 单阶段重试后仍然频繁失败 | brief 本身有问题  | 在重试时注入上一次的错误信息作为 reviseSuggestion |
| pageKind 信号匹配误判              | AI 克隆错误参考页 | 评分阈值 > 0.6，宁可 unknown 不猜错               |
| SchemaGen prompt 强化不生效        | LLM 不遵守新约束  | 保持现有机械修复兜底，两者不冲突                  |
| SSE 协议改造影响现有功能           | 前后端不同步      | 一期只加事件不改现有格式，向后兼容                |

---

_本计划将随实施进展持续更新。每完成一个课题后标记验收结果。_
