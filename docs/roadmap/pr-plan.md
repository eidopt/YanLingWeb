# PR 拆分计划（pr3 系列）

> **创建日期**: 2026-06-07
> **基准**: `split/pr2-03-roadmap-docs`（当前分支）
> **前置文档**: `docs/roadmap/README.md`, `docs/roadmap/next-steps-plan.md`

---

## 总览

当前已合并 4 个 PR（pr2-01 ~ pr2-04），覆盖 Roadmap 约 45% 工作量。剩余工作按依赖关系和逻辑内聚性拆为 **5 个 PR**，形成链式依赖：

```
pr2-04 (已合并)
  └─ pr3-01: CacheStrategy 补全 + 国产 Provider
       └─ pr3-02: preValidateAndFix + SchemaGen 增强
            └─ pr3-03: 缓存感知 Compaction + 可观测性
                 └─ pr3-04: 结构化 SSE 协议
                      └─ pr3-05: 编辑撤销栈 + 原子操作
```

### 依赖关系说明

| PR     | 依赖   | 原因                                                                                                                   |
| ------ | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| pr3-01 | pr2-04 | Provider 基础设施已就位，补全 CacheStrategy 实际注入逻辑                                                               |
| pr3-02 | pr3-01 | `preValidateAndFix` 需要 `ProviderCapabilities` 判断模型能力来决定预修复策略                                           |
| pr3-03 | pr3-02 | `decideCompaction` 需要知道当前缓存策略类型（来自 pr3-01），且 compact 后的前缀稳定性影响 preValidateAndFix 的重试效果 |
| pr3-04 | pr3-03 | SSE `cache_diagnostic` 事件依赖 `CacheDiagnosticReport`（来自 pr3-03）                                                 |
| pr3-05 | pr3-04 | 撤销栈的 UI 交互依赖 SSE 事件反馈（来自 pr3-04）                                                                       |

---

## pr3-01: CacheStrategy 补全 + 国产 Provider

**分支**: `split/pr3-01-cache-providers`
**从**: `split/pr2-04-camelcase-renames`
**Roadmap 课题**: P0-1 多模型统一适配层（完成）
**预估工期**: 3 天

### 目标

消除 CacheStrategy 中的 PLACEHOLDER，实现 MiMo/MiniMax 独立 Provider，使国产模型可正常运行。

### 任务清单

#### T1: CacheKeyStrategy 实际注入（Kimi）

- **文件**: `backend/src/ai/core/providers/cacheStrategy.ts`
- **改动**: `CacheKeyStrategy.applyToRequest()` 注入 `prompt_cache_key` 到请求 header
- **验证**: 单元测试 — 调用后 request 包含 cacheKey

#### T2: CacheControlStrategy 消息级注入（Qwen）

- **文件**: `backend/src/ai/core/providers/cacheStrategy.ts`
- **改动**: `CacheControlStrategy.applyToRequest()` 在前两条 system 消息上注入 `cache_control: { type: "ephemeral" }`
- **依赖**: 需要在 `ProviderMessage` 接口上扩展 `cacheControl?: { type: string }` 字段
- **文件**: `shared/agent/contracts/provider.ts`
- **验证**: 单元测试 — 前两条 system 消息包含 cacheControl

#### T3: MiMoProvider 实现

- **新文件**: `backend/src/ai/core/providers/mimo.provider.ts`
- **继承**: `OpenAICompatibleProvider`
- **关键重写**:
  - `getCapabilities()` → `reasoningMode: 'required'`, `cacheStrategy: 'none'`
  - 流式解析: 保留 `reasoning_content` delta，下一轮必须回传
  - 消息转换: assistant 消息无 `reasoningContent` 时填空字符串（防 400）
- **验证**: 单元测试 — 模拟 MiMo 流式响应，验证 reasoning_content 保留

#### T4: MiniMaxProvider 实现

- **新文件**: `backend/src/ai/core/providers/minimax.provider.ts`
- **继承**: `OpenAICompatibleProvider`
- **关键重写**:
  - `getCapabilities()` → `reasoningMode: 'split'`, `cacheStrategy: 'none'`
  - 请求注入: `reasoning_split: true` 参数
  - 流式解析: 处理分离的推理输出流
- **验证**: 单元测试 — 模拟 MiniMax 双模式响应

#### T5: QwenProvider 实现

- **新文件**: `backend/src/ai/core/providers/qwen.provider.ts`
- **继承**: `OpenAICompatibleProvider`
- **关键重写**:
  - `getCapabilities()` → `reasoningMode: 'passthrough'`, `cacheStrategy: 'cache_control'`
  - 请求注入: `enable_thinking: true` 参数（通过 `extraParams`）
- **验证**: 单元测试 — 验证 enable_thinking 参数注入

#### T6: KimiProvider 实现

- **新文件**: `backend/src/ai/core/providers/kimi.provider.ts`
- **继承**: `OpenAICompatibleProvider`
- **关键重写**:
  - `getCapabilities()` → `reasoningMode: 'passthrough'`, `cacheStrategy: 'cache_key'`
  - 请求 header: `x-msh-cache-key` 注入
- **验证**: 单元测试 — 验证 cache key header 注入

#### T7: 跨模型集成测试

- **新文件**: `backend/src/ai/core/providers/cross-model.spec.ts`
- **测试场景**:
  - DeepSeek → GPT → DeepSeek 连续 5 轮（reasoning_content 不污染）
  - GPT → MiMo 切换（reasoningContent 填充）
  - compact 后模型配置跟随
- **验证**: 所有场景通过

#### T8: 国产模型 .env 预设配置模板

- **新文件**: `docs/roadmap/model-presets.md`
- **内容**: 每个国产模型的推荐环境变量配置

### 验收标准

- [ ] `CacheKeyStrategy` 和 `CacheControlStrategy` 不再是 PLACEHOLDER
- [ ] MiMo/MiniMax/Qwen/Kimi Provider 各有独立实现和单元测试
- [ ] 跨模型切换 5 轮对话无错误
- [ ] `reasoning_content` 不跨模型污染
- [ ] 预设配置文档覆盖 6 个国产模型

### 影响范围

| 改动类型 | 文件                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| 修改     | `cacheStrategy.ts`, `provider.ts` (shared contracts)                              |
| 新增     | `mimo.provider.ts`, `minimax.provider.ts`, `qwen.provider.ts`, `kimi.provider.ts` |
| 新增     | `cross-model.spec.ts`, `model-presets.md`                                         |

---

## pr3-02: preValidateAndFix + SchemaGen 增强

**分支**: `split/pr3-02-pipeline-prevalidate`
**从**: `split/pr3-01-cache-providers`
**Roadmap 课题**: P1-1 Pipeline 成功率提升（完成）
**预估工期**: 2.5 天

### 目标

在 LLM 输出后、parseAndValidate 前插入自动预修复链，减少 SchemaGen 重试次数。

### 任务清单

#### T1: preValidateAndFix 预修复链

- **新文件**: `backend/src/ai-templates/stages/preValidateFix.ts`
- **逻辑**:
  1. `dedupeNodeIds()` — 自动去重跨页重复 ID（已有，移至此处前置调用）
  2. `autoBizComponents()` — 自动补全 biz-\* 组件声明（已有，移至此处前置调用）
  3. `removeUnknownProps()` — 自动移除未声明的 props
  4. `fixImageUrls()` — 自动修复非法图片 URL
- **返回**: `{ document, fixes: string[] }` — 修复清单用于日志
- **验证**: 单元测试 — 输入含重复 ID 的文档，输出已去重

#### T2: 集成 preValidateAndFix 到 SchemaGen 流程

- **文件**: `backend/src/ai-templates/stages/schemaGenerator.ts`
- **改动**: 在 `parseAndValidate()` 之前调用 `preValidateAndFix()`
- **验证**: SchemaGen 测试 — 预修复后首次通过率提升

#### T3: Critic 结构化修正指引

- **文件**: `shared/agent/contracts/pipeline.ts`（或相关 types 文件）
- **改动**: `CriticVerdict` 新增 `reviseActions?: ReviseAction[]` 字段
- **新类型**:
  ```typescript
  type ReviseAction =
    | { type: 'add_section'; afterRegion: string; sectionKind: string }
    | { type: 'replace_section'; regionKey: string; newKind: string }
    | { type: 'adjust_layout'; regionKey: string; direction: 'row' | 'column' }
    | { type: 'improve_contrast'; regionKey: string; suggestion: string };
  ```
- **文件**: `backend/src/ai-templates/stages/diversity-critic.ts`
- **改动**: prompt 引导 Critic 输出结构化 `reviseActions`
- **验证**: 单元测试 — Critic 输出包含 reviseActions

#### T4: SchemaGen prompt 补充（补充 pr2-02 遗漏）

- **文件**: `shared/agent/prompts/templates/stageSchemaGenerator.ts`
- **改动**: 在 Critical Rules 中补充价格格式约束、本地化约束
- **验证**: prompt diff 审查

#### T5: 失败 case 收集脚本

- **新文件**: `scripts/agent-eval/collect-failures.ts`
- **逻辑**: 从 `agentEval` 历史记录中提取 SchemaGen 失败 case，按失败模式分类
- **输出**: `reports/schema-gen-failures.json`
- **验证**: 运行脚本，输出包含分类统计

### 验收标准

- [ ] `preValidateAndFix()` 在 SchemaGen parse 前自动执行
- [ ] 预修复覆盖 4 种修复类型
- [ ] Pipeline 一次通过率 > 70%（当前约 40-50%）
- [ ] SchemaGen 平均重试次数 < 2
- [ ] Critic 输出可包含结构化 reviseActions

### 影响范围

| 改动类型 | 文件                                          |
| -------- | --------------------------------------------- |
| 新增     | `preValidateFix.ts`, `preValidateFix.spec.ts` |
| 修改     | `schemaGenerator.ts`, `pipeline.service.ts`   |
| 修改     | `diversity-critic.ts`, pipeline types         |
| 新增     | `collect-failures.ts`                         |

---

## pr3-03: 缓存感知 Compaction + 可观测性

**分支**: `split/pr3-03-compaction-cache-aware`
**从**: `split/pr3-02-pipeline-prevalidate`
**Roadmap 课题**: P0-2 缓存策略抽象与稳定化（完成）
**预估工期**: 2.5 天

### 目标

Compaction 不再盲目执行，根据缓存命中率智能决策；前端可查看每轮缓存诊断。

### 任务清单

#### T1: decideCompaction 缓存感知决策

- **新文件**: `src/ai/core/compact/compactionDecision.ts`
- **逻辑**:
  - 缓存命中率 > 70% 且 token < 120% 上限 → 跳过 compact
  - token < 150% 上限 → microCompact（不改前缀）
  - token >= 150% 上限 → full compact（prefix-safe）
- **依赖**: 需要 `CacheStrategy.type` 来判断缓存类型（来自 pr3-01）
- **验证**: 单元测试 — 3 种场景各返回正确决策

#### T2: 集成 decideCompaction 到 autoCompact

- **文件**: `src/ai/core/compact/autoCompact.ts`
- **改动**: 调用 `decideCompaction()` 替代当前的 `needsCompaction()` 简单判断
- **验证**: 单元测试 — 高缓存命中率时跳过 compact

#### T3: 后端 Provider Log 折叠优化

- **文件**: `backend/src/ai/services/providerLogCompaction.service.ts`
- **改动**: 折叠时保留原始前缀，仅在折叠边界插入 checkpoint 消息
- **验证**: 单元测试 — 折叠后前缀哈希不变

#### T4: CacheDiagnosticReport 实现

- **新文件**: `backend/src/ai/services/cacheDiagnostic.service.ts`
- **功能**:
  - 记录每次请求的前缀哈希、命中/未命中 token 数、命中率
  - 在 `done` 事件中附加 `cacheDiagnostic` 字段
- **文件**: `backend/src/ai/ai.controller.ts`
- **改动**: `done` 事件序列化时包含 cacheDiagnostic
- **验证**: 单元测试 — done 事件包含 cacheDiagnostic

#### T5: 前端缓存诊断展示

- **文件**: `src/ui/editor/components/EditorAiPanel.tsx`（或新组件）
- **改动**: 在 AI 面板底部展示最近一轮缓存命中率（折叠面板）
- **验证**: 手动测试 — 执行 3 轮对话后可看到缓存命中率

### 验收标准

- [ ] DeepSeek 多轮对话（5 轮）平均缓存命中率 >= 60%
- [ ] compact 后首轮缓存命中率 > 30%（当前约 10%）
- [ ] 前端可查看每轮缓存诊断（命中率、前缀哈希）
- [ ] 后端 Provider Log 折叠后前缀不变
- [ ] 高缓存命中率时自动跳过 compact

### 影响范围

| 改动类型 | 文件                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 新增     | `compactionDecision.ts`, `cacheDiagnostic.service.ts`                    |
| 修改     | `autoCompact.ts`, `providerLogCompaction.service.ts`, `ai.controller.ts` |
| 修改     | `EditorAiPanel.tsx`（前端缓存诊断 UI）                                   |

---

## pr3-04: 结构化 SSE 协议

**分支**: `split/pr3-04-sse-protocol`
**从**: `split/pr3-03-compaction-cache-aware`
**Roadmap 课题**: P0-3 结构化 SSE 协议（完成）
**预估工期**: 4 天

### 目标

前后端共享统一事件类型，用户可感知 AI 执行进度和推理过程。

### 任务清单

#### T1: SSE 事件类型定义

- **新文件**: `shared/agent/contracts/sseEvents.ts`
- **内容**: `SSEEventType` 联合类型 + 各事件 data 接口
- **事件类型**:
  - `text_delta`, `reasoning_delta`（文本/推理增量）
  - `tool_call_start`, `tool_call_end`（工具调用生命周期）
  - `pipeline_stage_start`, `pipeline_stage_end`（Pipeline 阶段进度）
  - `cache_diagnostic`（缓存诊断，依赖 pr3-03）
  - `heartbeat`（心跳，已有）
  - `done`, `error`（终止）
- **验证**: 类型编译通过

#### T2: 后端 reasoning_delta 事件转发

- **文件**: `backend/src/ai/core/providers/openaiCompatible.provider.ts`
- **改动**: 解析 `delta.reasoning_content` → 发出 `reasoning_delta` 事件
- **验证**: 单元测试 — DeepSeek 流式响应包含 reasoning_delta

#### T3: 后端 tool_call_start/end 事件

- **文件**: `backend/src/ai/ai.controller.ts`
- **改动**: 在工具调用前后发出 `tool_call_start`/`tool_call_end` 事件，包含工具名和耗时
- **验证**: 单元测试 — SSE 流包含工具调用事件

#### T4: 后端 pipeline_stage 事件

- **文件**: `backend/src/ai-templates/orchestrator/pipeline.service.ts`
- **改动**: 在每个 stage 开始/结束时发出 `pipeline_stage_start`/`pipeline_stage_end`
- **验证**: 单元测试 — Pipeline SSE 流包含阶段事件

#### T5: 前端 BackendProxyProvider 解析新事件

- **文件**: `src/ai/core/providers/backendProxy.provider.ts`
- **改动**: 解析新事件类型，`reasoning_delta` 通过回调传递给上层
- **验证**: 单元测试 — 新事件类型正确解析

#### T6: 前端推理过程展示 UI

- **新文件**: `src/ui/editor/components/ReasoningPanel.tsx`
- **功能**: 折叠面板展示 AI 推理过程（reasoning_delta 累积）
- **文件**: `src/ui/editor/components/EditorAiPanel.tsx`
- **改动**: 集成 ReasoningPanel
- **验证**: 手动测试 — DeepSeek 对话时可展开查看推理过程

#### T7: 前端 Pipeline 进度展示 UI

- **新文件**: `src/ui/editor/components/PipelineProgress.tsx`
- **功能**: 展示 4 阶段进度条 + 重试次数
- **验证**: 手动测试 — 生成模板时可看到阶段进度

### 验收标准

- [ ] 前端可展示 AI 当前执行阶段（如 "SchemaGen 迭代 3/8"）
- [ ] DeepSeek reasoning_content 在前端可折叠展示
- [ ] 工具调用显示名称和耗时（如 "editor_edit (1.2s)"）
- [ ] Pipeline 生成过程可视化（4 阶段进度 + 重试次数）
- [ ] 现有事件格式不退化（向后兼容）

### 影响范围

| 改动类型 | 文件                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 新增     | `sseEvents.ts` (shared), `ReasoningPanel.tsx`, `PipelineProgress.tsx`     |
| 修改     | `openaiCompatible.provider.ts`, `ai.controller.ts`, `pipeline.service.ts` |
| 修改     | `backendProxy.provider.ts`, `EditorAiPanel.tsx`                           |

---

## pr3-05: 编辑撤销栈 + 原子操作

**分支**: `split/pr3-05-editor-undo`
**从**: `split/pr3-04-sse-protocol`
**Roadmap 课题**: P1-3 Agent 断点续传与撤销
**预估工期**: 3 天

### 目标

AI 编辑操作可撤销，多条指令原子执行，对话上下文可恢复。

### 任务清单

#### T1: EditorUndoStack 实现

- **新文件**: `src/domain/editor/editorUndoStack.ts`
- **功能**:
  - `pushSnapshot(description, document)` — 编辑前保存快照
  - `undoTo(snapshotId)` — 撤销到指定快照
  - `listSnapshots()` — 获取可撤销列表
  - 最大 20 个快照，FIFO 淘汰
- **验证**: 单元测试 — push 20 个快照，undo 到第 5 个

#### T2: applyInstructionsAtomic 原子操作

- **新文件**: `src/domain/editor/atomicInstructions.ts`
- **逻辑**:
  1. Dry-run: 对所有指令做 `compileAndValidate()`
  2. 全部通过才原子应用
  3. 任一失败则回滚到快照
- **验证**: 单元测试 — 3 条指令中 1 条失败，全部回滚

#### T3: 集成撤销栈到 editorEditAgent

- **文件**: `src/ai/agents/editorEditAgent.ts`
- **改动**: 在执行 `editor_edit` 工具前调用 `undoStack.pushSnapshot()`
- **验证**: 手动测试 — AI 编辑后可通过 UI 撤销

#### T4: 撤销 UI 按钮

- **文件**: `src/ui/editor/components/EditorAiPanel.tsx`
- **改动**: 添加"撤销 AI 编辑"按钮，调用 `undoStack.undoTo()`
- **验证**: 手动测试 — 点击撤销按钮恢复到编辑前状态

#### T5: 对话上下文持久化增强

- **文件**: `src/state/editorAiPanelState.ts`
- **改动**: 持久化 `compactSummary`、`lastPrefixHash`、`cacheContext`
- **验证**: 单元测试 — 刷新页面后对话上下文恢复

### 验收标准

- [ ] AI 编辑后可通过 UI 撤销到编辑前状态
- [ ] 撤销栈最多保留 20 个快照
- [ ] 多条编辑指令要么全部成功，要么全部回滚
- [ ] 页面刷新后对话上下文可恢复

### 影响范围

| 改动类型 | 文件                                                               |
| -------- | ------------------------------------------------------------------ |
| 新增     | `editorUndoStack.ts`, `atomicInstructions.ts`                      |
| 修改     | `editorEditAgent.ts`, `EditorAiPanel.tsx`, `editorAiPanelState.ts` |

---

## 时间线总览

```
W1  ──┬── pr3-01: T1-T2 CacheStrategy 补全
      ├── pr3-01: T3-T6 国产 Provider 实现
W2  ──┤── pr3-01: T7-T8 集成测试 + 配置文档
      └── pr3-02: T1-T2 preValidateAndFix
W3  ──┬── pr3-02: T3-T5 Critic 增强 + 失败收集
      └── pr3-03: T1-T2 decideCompaction
W4  ──┬── pr3-03: T3-T5 缓存诊断 + 前端展示
      └── pr3-04: T1-T4 SSE 事件后端
W5  ──┬── pr3-04: T5-T7 SSE 前端解析 + UI
      └── pr3-05: T1-T2 撤销栈 + 原子操作
W6  ──┴── pr3-05: T3-T5 集成 + UI + 持久化
```

**总计**: ~16 天（3.2 周），覆盖 Roadmap Phase 1-2 全部遗留工作。

---

## 风险与缓解

| 风险                       | 影响                         | 缓解                                                  |
| -------------------------- | ---------------------------- | ----------------------------------------------------- |
| 国产模型 API 变更          | Provider 需要持续维护        | Provider 抽象隔离变更；评测快速发现回归               |
| preValidateAndFix 误修复   | 改变了 LLM 的正确输出        | fixes 日志可追溯；仅修复明确错误（重复 ID、遗漏声明） |
| SSE 协议变更影响现有客户端 | 前后端需同步更新             | 一期只加事件不改现有格式，向后兼容                    |
| decideCompaction 过于保守  | 跳过 compact 导致 token 超限 | 设置 120% 硬上限，超过必须 compact                    |
| 撤销栈内存占用             | 20 个快照 × 大文档           | 快照使用 structuredClone，仅存引用差异                |

---

_本计划将随实施进展持续更新。每个 PR 合并后标记验收结果。_
