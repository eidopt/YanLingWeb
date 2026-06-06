# 下一步实施计划

> **创建日期**: 2026-06-04
> **基准分支**: `feat/editor-ai-improvements`
> **核心目标**: 提升 Agent 执行效率 — 尽量前 1-2 次完成整个流程，减少反复重试
> **前置文档**: `docs/roadmap/README.md`, `docs/roadmap/execution-plan.md`

---

## 总览

| 序号  | 课题                           | 预估工期    | 对效率的影响                                                 | 可行性  |
| ----- | ------------------------------ | ----------- | ------------------------------------------------------------ | ------- |
| **①** | P1-1 Pipeline 单阶段重试       | 2 天        | 最大 — SchemaGen 失败不重启全局，省掉 Designer + Critic 重跑 | ✅ 容易 |
| **②** | P1-1 SchemaGen prompt 强化     | 1 天        | 从源头减少 SchemaGen 犯错率                                  | ✅ 容易 |
| **③** | P1-2 pageKind 推断增强         | 2 天        | AI 生成模板时首次正确率 ↑，减少"猜错→重来"                   | ✅ 中等 |
| **④** | P1-2 导航类型多样化            | 0.5 天      | 配合 pageKind，提升模板结构准确性                            | ✅ 容易 |
| **⑤** | P0-3 结构化 SSE 协议（分两期） | 3 天 + 5 天 | 不直接减少重试，但用户可实时看到进度，提前发现问题           | ⚠️ 中等 |

---

## ① P1-1 Pipeline 单阶段重试

### 问题

当前 Pipeline 中，SchemaGen 失败后 `continue` 回到 Stage 1（Designer），浪费已生成的 brief。Designer 使用 pro 模型，每次重跑都是高成本。

### 现状分析

**关键发现**（基于代码调研）：

1. **SchemaGen 只消费 `brief`**（Designer 的输出），brief 一旦产生就不再变。重跑 SchemaGen 不需要重跑 Designer。
2. **阶段级 try/catch 已存在** — 代码里每个 stage 都有独立的 catch，只是 catch 后 `continue` 回到 Stage 1。
3. **`stages` 数组已设计为多次记录** — `PipelineStageRecord[]` 天然支持同一阶段存多条结果。
4. **SchemaGen 内部已有 3 次自修复**（`SCHEMA_STAGE_RETRIES = 3`）— 外层再加 2 次不需要改内部逻辑。

### 方案

**文件**: `backend/src/ai-templates/orchestrator/pipeline.service.ts`

在 SchemaGen 阶段的 catch 块中，将 `continue`（回到 Designer）改为内层 for 循环重试：

```typescript
// 当前逻辑（lines 93-118）：
// SchemaGen 失败 → reviseSuggestion = error → continue（回到 Designer）

// 优化后逻辑：
const SCHEMA_PIPELINE_RETRIES = 2; // 外层重试次数
let schemaGenSucceeded = false;

for (let schemaRetry = 0; schemaRetry <= SCHEMA_PIPELINE_RETRIES; schemaRetry++) {
  try {
    schemaRecord = await this.schemaGenerator.run(brief, attempt);
    schemaGenSucceeded = true;
    break;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `attempt ${attempt} schemaGen pipeline-retry ${schemaRetry + 1}/${SCHEMA_PIPELINE_RETRIES + 1}: ${msg}`,
    );
    if (schemaRetry === SCHEMA_PIPELINE_RETRIES) {
      // 全部重试失败，才回到 Designer
      reviseSuggestion = `Stage 3 schema generation failed after ${SCHEMA_PIPELINE_RETRIES + 1} attempts: ${msg}`;
      lastError = `schema gen throw: ${msg}`;
    }
  }
}
if (!schemaGenSucceeded) continue; // 回到 Designer
```

**总 SchemaGen 尝试次数**: 3（内部自修复）× 3（外层重试）= 9 次，当前也是 3×3=9 次但中间夹带了 Designer + Critic 重跑。

**Verifier 暂不做单阶段重试** — Verifier 失败可能是 brief 本身有问题，需要回到 Designer。后续有评测数据后再决定。

### 验收标准

- [ ] SchemaGen 失败时，Designer + Critic 不重跑（日志可验证）
- [ ] Pipeline 整体成功率 > 70%（需要端到端测试统计）
- [ ] SchemaGen 重试日志包含 attempt 编号和失败原因

### 回退方案

如果单阶段重试后 SchemaGen 仍然频繁失败（说明 brief 本身有问题），则：

- 在 SchemaGen 重试时注入上一次的错误信息作为 `reviseSuggestion`，让 LLM 知道上次错在哪里
- 如果连续 2 次 SchemaGen 失败且错误相同，则判定为 brief 问题，回到 Designer

---

## ② P1-1 SchemaGen prompt 强化

### 问题

SchemaGen 失败的两大主因（基于代码注释）：

1. **跨页重复 node ID** — "SchemaGen 反复耗尽迭代的主因"
2. **遗漏 `biz-*` 组件声明** — "最高频的 missing_component_descriptor"

这两个问题虽然已被 `dedupeNodeIds()` 和 `autoBizComponents()` 机械修复，但修复本身消耗迭代次数，而且修复后的文档可能不是 LLM 的"原意"。

### 方案

**文件**: SchemaGen 的 system prompt（在 `backend/src/ai-templates/stages/schemaGenerator.agent.ts` 或其 prompt 文件中）

在 system prompt 中添加明确的反面示例和约束：

```
## Critical Rules

1. **Node ID Uniqueness**: Every node ID across ALL pages must be globally unique.
   ❌ WRONG: page-1 uses "hero-text" AND page-2 uses "hero-text"
   ✅ RIGHT: page-1 uses "home-hero-text", page-2 uses "product-hero-text"
   Prefix each ID with the page name to guarantee uniqueness.

2. **Component Declaration**: If you define a componentTemplate entry, you MUST also
   add a matching entry in the components catalog with at least {alias, props: []}.
   ❌ WRONG: componentTemplates has "biz-promo-card" but components has no entry for it
   ✅ RIGHT: components includes {alias: "biz-promo-card", props: []}

3. **Props Validation**: Only use props that exist in the component catalog.
   Price text MUST use ¥ symbol. Text content MUST be in Chinese.
```

### 验收标准

- [ ] SchemaGen 平均内部迭代次数下降（从日志统计）
- [ ] `dedupeNodeIds` 触发率下降（从日志中的 renameMap 长度统计）
- [ ] `autoBizComponents` 触发率下降

### 回退方案

Prompt 强化不生效时，保持现有的机械修复兜底。两者不冲突。

---

## ③ P1-2 pageKind 推断增强

### 问题

当前 `inferPageKind` 只看 `page.name + page.id` 的正则匹配。页面叫"页面1"就返回 `unknown`，即使它里面有完整的商品卡片布局。

`unknown` 的下游影响：

- `create_page_from_page_kind` 语义指令直接失败
- AI 看到 `kind=unknown` 无法推断页面用途
- 语义操作中的 page fallback 链断裂

### 现状分析

**当前实现**: `shared/agent/template/buildTemplateProfile.ts` 第 28-58 行

纯 name/id 正则匹配，8 种模式 + `'unknown'` fallback。

**可用但未使用的信号**（页面布局树）：

| 信号                                      | 可检测内容 | 典型 pageKind       |
| ----------------------------------------- | ---------- | ------------------- |
| `core.form` + `core.input` + 提交按钮     | 表单页面   | `form`              |
| 价格文本（¥/$/€）+ 购买按钮               | 商品页面   | `product`           |
| `core.search` + `core.grid` / `core.list` | 分类/列表  | `category` / `list` |
| `core.avatar` + 菜单列表                  | 个人中心   | `profile`           |
| `core.statistic` + 数据图表               | 仪表盘     | `dashboard`         |
| 订单状态标签 + 订单列表                   | 订单页面   | `order`             |

### 方案（分三步）

**Step 1: `meta.pageKind` 显式标注**（5 分钟）

- 给 `ThemeLayoutNodeSemanticMeta` 加 `pageKind?: string` 字段
- `inferPageKind` 优先读 `page.layout.meta?.pageKind`
- 模板生成时 AI 在 `submit_page_spec` 中标注 pageKind，直接生效

**Step 2: 组件结构信号匹配**（2-3 小时）

**文件**: `shared/agent/template/buildTemplateProfile.ts`

在已有的 `walkNodes` 遍历中加入信号收集，用加权评分匹配 pageKind profile。

```typescript
const PAGE_KIND_SIGNALS: Record<string, PageKindSignal[]> = {
  product: [
    { type: 'prop_match', alias: 'core.text', prop: 'text', pattern: /[¥$€]\d/, weight: 3 },
    { type: 'prop_match', alias: 'core.button', prop: 'label', pattern: /购买|加购|下单|立即/, weight: 2 },
    { type: 'alias_count', alias: 'core.image', minCount: 2, weight: 1 },
  ],
  form: [
    { type: 'alias_present', alias: 'core.form', weight: 3 },
    { type: 'alias_count', alias: 'core.input', minCount: 2, weight: 2 },
    { type: 'prop_match', alias: 'core.button', prop: 'label', pattern: /提交|保存|确认|注册/, weight: 2 },
  ],
  profile: [
    { type: 'alias_present', alias: 'core.avatar', weight: 3 },
    { type: 'prop_match', alias: 'core.text', prop: 'text', pattern: /会员|积分|余额|订单数/, weight: 2 },
  ],
  // ... 其他 pageKind
};

function inferPageKindFromStructure(layout: ThemeLayoutNode): { kind: string; score: number } | null {
  const signals = collectSignals(layout);
  let best = { kind: 'unknown', score: 0 };

  for (const [kind, expectedSignals] of Object.entries(PAGE_KIND_SIGNALS)) {
    const score = computeSignalScore(signals, expectedSignals);
    if (score > best.score) best = { kind, score };
  }

  // 阈值：> 0.6 才接受，否则返回 null（保持 unknown）
  return best.score >= 0.6 ? best : null;
}
```

**调用顺序**：

1. `page.layout.meta?.pageKind` — 显式标注（优先）
2. name/id 正则匹配 — 现有逻辑（其次）
3. 组件结构信号匹配 — 新增 fallback（最后）

**Step 3: 验证信号匹配的准确率**

用现有模板数据跑一轮测试，统计：

- 结构匹配的准确率（人工抽检 20 个模板）
- 误判率（false positive）
- 覆盖率提升（unknown 从 20% 降到多少）

### 验收标准

- [ ] `meta.pageKind` 显式标注优先于所有推断
- [ ] 组件结构信号匹配作为 name regex 的 fallback
- [ ] pageKind 'unknown' 比例 < 10%（从 ~20% 降低）
- [ ] 误判率（false positive）< 5%（宁可 unknown 不猜错）
- [ ] 有单元测试覆盖各 pageKind 的信号匹配

### 回退方案

如果信号匹配的误判率 > 10%，则：

- **只保留 Step 1**（meta.pageKind 显式标注）
- 在模板生成的 `submit_page_spec` 工具中要求 AI 必须填写 `pageKind`
- 这样 pageKind 由 AI 在生成时确定，不靠事后推断

---

## ④ P1-2 导航类型多样化

### 问题

`buildNavigation` 硬编码返回 `'bottom_tabs'`，不支持侧边栏/顶部导航。

### 方案

**文件**: `shared/agent/template/buildTemplateProfile.ts`

```typescript
function buildNavigation(document: ThemeLayoutDocument): TemplateProfileNavigation | undefined {
  const pages = document.pages ?? [];
  if (pages.length <= 1) return undefined; // 单页无需导航

  const device = inferDevice(document);
  const { items } = buildNavigationItems(document);

  // 基于实际组件结构推断导航类型
  const hasTabbar = walkNodes(document.layout).some((n) => n.alias === 'core.tabbar' && n.slot === 'footer');
  const hasSidebar = walkNodes(document.layout).some((n) => n.alias === 'core.sidebar');
  const hasNavbar = walkNodes(document.layout).some((n) => n.alias === 'core.navbar');

  let type: TemplateProfileNavigationType = 'bottom_tabs';
  if (hasSidebar) type = 'side_nav';
  else if (hasNavbar || hasTabbar)
    type = 'bottom_tabs'; // tabbar 默认在底部
  else if (device === 'desktop' && pages.length > 5) type = 'side_nav';
  else if (device === 'desktop') type = 'top_tabs';

  return { type, items };
}
```

### 验收标准

- [ ] 检测到 `core.sidebar` 时返回 `'side_nav'`
- [ ] 桌面端 + 多页面（>5）时返回 `'side_nav'`
- [ ] 移动端默认返回 `'bottom_tabs'`
- [ ] 有单元测试

---

## ⑤ P0-3 结构化 SSE 协议（分两期）

### 问题

SSE 通信缺乏结构化进度信息。前端只看到 loading，无法感知 AI 在做什么阶段。

### 一期：后端发事件 + 前端 console 透传（3 天）

**目标**: 后端发出结构化事件，前端在 console 日志中可看到。

**文件**:

- `shared/agent/contracts/sseEvents.ts`（新增 — 事件类型定义）
- `backend/src/ai/ai.controller.ts`（发出结构化事件）
- `src/ai/core/providers/backendProxy.provider.ts`（解析事件，console.log 输出）

**事件类型**:

```typescript
type SSEEventType =
  | 'text_delta'
  | 'reasoning_delta' // DeepSeek/MiMo 推理过程
  | 'tool_call_start' // 工具调用开始（含工具名）
  | 'tool_call_end' // 工具调用完成（含结果摘要 + 耗时）
  | 'pipeline_stage_start' // Pipeline 阶段开始
  | 'pipeline_stage_end' // Pipeline 阶段完成
  | 'agent_clarification' // 需要用户澄清
  | 'cache_diagnostic' // 缓存命中信息
  | 'done'
  | 'error';
```

**验收标准**:

- [ ] 后端发出 `tool_call_start`、`tool_call_end` 事件
- [ ] 后端发出 `pipeline_stage_start`、`pipeline_stage_end` 事件
- [ ] DeepSeek `reasoning_content` 作为 `reasoning_delta` 事件发出
- [ ] 前端 console 可看到所有结构化事件

### 二期：前端 UI 展示（5 天）

**目标**: 用户可在界面上看到 AI 执行进度。

**UI 组件**:

- Pipeline 进度条（4 阶段 + 重试次数）
- 工具调用状态（名称 + 耗时）
- 推理过程折叠面板
- 缓存命中率显示

**验收标准**:

- [ ] 前端显示 Pipeline 阶段进度（如 "SchemaGen 迭代 3/8"）
- [ ] 工具调用显示名称和耗时（如 "editor_edit (1.2s)"）
- [ ] DeepSeek reasoning_content 可折叠展示
- [ ] 长时间请求（>10s）有心跳动画，不断开

### 回退方案

如果前后端同步改造风险大，一期可以只做：

- 后端在现有 SSE `data:` 字段中附带 `stage` 和 `tool` 信息（不改协议格式）
- 前端解析现有 `data:` JSON 中的新字段，console.log 输出
- 不新增事件类型，不改 `sseEvents.ts`

---

## 执行路径

```
① P1-1 单阶段重试 (2d)
   └─ ② P1-1 SchemaGen prompt (1d)
      └─ ③ P1-2 pageKind 推断 (2d)
         └─ ④ P1-2 导航类型 (0.5d)
            └─ ⑤ P0-3 SSE 一期 (3d)
               └─ ⑤ P0-3 SSE 二期 (5d)
```

**总工期**: 约 13.5 天（2.5 周）

---

## 风险与缓解

| 风险                               | 影响              | 缓解策略                                          |
| ---------------------------------- | ----------------- | ------------------------------------------------- |
| SchemaGen 单阶段重试后仍然频繁失败 | brief 本身有问题  | 在重试时注入上一次的错误信息作为 reviseSuggestion |
| pageKind 信号匹配误判              | AI 克隆错误参考页 | 评分阈值 > 0.6，宁可 unknown 不猜错               |
| SSE 协议改造影响现有功能           | 前后端不同步      | 一期只加事件不改现有格式，向后兼容                |
| SchemaGen prompt 强化不生效        | LLM 不遵守新约束  | 保持现有机械修复兜底，两者不冲突                  |

---

_本计划将随实施进展持续更新。每完成一个课题后标记验收结果。_
