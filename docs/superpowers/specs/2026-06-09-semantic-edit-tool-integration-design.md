# AI 语义编辑工具集成 — 设计 Spec

> **状态**: 设计已通过，待用户审阅
> **创建日期**: 2026-06-09
> **关联文档**: `docs/next-priorities-plan.md`（工作一）
> **目标**: 把已建好的 `TemplateProfile` + `semanticInstructionCompiler` 基础设施接入 AI Agent 工具链，实现 AI 从"猜 node ID"到"语义操作"的根本转变

---

## 1. 背景与现状

### 1.1 已完成的基础设施（无需重做）

| 组件                                         | 文件                                                                          | 状态                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| 5 个语义工具定义                             | `shared/agent/tools/editorEditTools.ts:311-372`                               | ✅ 完成                             |
| `EDITOR_SEMANTIC_TOOLS` 集合                 | `shared/agent/tools/editorEditTools.ts:374-380`                               | ✅ 完成                             |
| 语义编译器                                   | `shared/agent/compiler/semanticInstructionCompiler.ts`                        | ✅ 完成（5 种指令全部实现）         |
| 编译错误类型（含候选项）                     | `shared/agent/errors/agentErrors.ts:1-16`                                     | ✅ 完成（15 种结构化错误码）        |
| 原子操作管理器                               | `shared/agent/editor/atomicOperations.ts`                                     | ✅ 完成（`AtomicOperationManager`） |
| `applyEditorAiEditInstructions` 识别语义指令 | `shared/agent/editor/applyEditorInstructions.ts:151-179`                      | ✅ 完成                             |
| 工具定义前后端 re-export                     | `backend/src/ai/tools/editorEdit.tool.ts` + `src/ai/tools/editorEdit.tool.ts` | ✅ 完成                             |
| Editor Prompt 引导                           | `shared/agent/prompts/editorCopilotPrompt.ts`                                 | ✅ 完成                             |
| `summarizeTemplateProfile` 工具函数          | `shared/agent/context/editorContext.ts:325`                                   | ✅ 完成                             |

### 1.2 缺失的关键环节

| 缺失                   | 当前问题                                                                                                                  | 影响                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 统一执行入口           | 没有 `executeSemanticTool()` 包装函数                                                                                     | 5 个语义工具和 9 个低级工具混在同一路径，dry-run 无法独立 |
| dry-run 模式           | `applyEditorAiEditInstructions` 不支持预览                                                                                | AI 无法在执行前确认编译结果                               |
| 显式原子应用           | 现有 `applyEditorAiEditInstructions` 是 ad-hoc 原子（验证失败回滚到原始 doc），但缺独立的 `applyCompiledOperationsAtomic` | 撤销快照不显式保留，UI undo 难做                          |
| Profile 注入到 context | `summarizeTemplateProfile` 存在但未注入到 AI context                                                                      | AI 看不到可用 slotKey/patternKey/regionKey                |
| 端到端测试             | 无 spec 文件                                                                                                              | 无法验证语义路径端到端可工作                              |

---

## 2. 架构概览

```
                    ┌─────────────────┐
                    │  AI Agent       │
                    │  (LLM 决策)      │
                    └────────┬────────┘
                             │ tool_call(name, args)
                             ▼
        ┌────────────────────────────────────────────┐
        │  executeSemanticTool(name, args, document) │  ← 新增：统一入口
        │  (shared/agent/tools/semanticToolExecutor) │
        └────┬───────────────┬──────────────────────┘
             │ 1. Profile    │ 2. 编译
             ▼               ▼
   buildTemplateProfile   compileSemanticEditorInstruction
             │               │
             │  CompiledSemanticInstruction
             ▼
   applyCompiledOperationsAtomic
   (shared/agent/editor/atomicApply)
             │
             │ 3. dry-run?  → 4. 原子应用
             ▼
   ┌──────────────────────────────┐
   │ AtomicOperationManager (现成) │
   │  - snapshot 原始 doc          │
   │  - 逐个 apply op              │
   │  - 任一失败 → 整体回滚        │
   └────────────┬─────────────────┘
                │ ApplyResult { applied, snapshot, ... }
                ▼
        AgentEditResult<ApplyResult>
                │
                ▼
        Agent 收到结果 → 决定是否继续
```

**关键边界**：

- `semanticToolExecutor.ts` 只暴露 1 个函数 `executeSemanticTool()`
- `atomicApply.ts` 只暴露 1 个函数 `applyCompiledOperationsAtomic()`，复用 `AtomicOperationManager`
- Agent runner 仅在工具名属于 `EDITOR_SEMANTIC_TOOLS` 时调用 executor，其余走旧路径

**与现有的关系**：

- 不修改 `applyEditorAiEditInstructions`（9 个低级工具仍走它）
- 不修改 `compileSemanticEditorInstruction`（已完整）
- 不修改 `editorEditTools.ts` 工具定义

---

## 3. 核心组件

### 3.1 `shared/agent/tools/semanticToolExecutor.ts`（新增）

```typescript
// shared/agent/tools/semanticToolExecutor.ts

import type { AgentEditResult } from '../errors/agentErrors';
import type { EditorAiEditInstruction } from '../editor/applyEditorInstructions';
import {
  compileSemanticEditorInstruction,
  type CompiledSemanticInstruction,
  type SemanticEditorInstruction,
} from '../compiler/semanticInstructionCompiler';
import { buildTemplateProfile } from '../template/buildTemplateProfile';
import { applyCompiledOperationsAtomic } from '../editor/atomicApply';
import type { ThemeLayoutDocument } from '../types';

export type SemanticToolName =
  | 'editor_update_slot'
  | 'editor_fill_pattern'
  | 'editor_create_page_from_page_kind'
  | 'editor_replace_section'
  | 'editor_submit_page_spec';

export interface ExecuteSemanticToolOptions {
  sessionId?: string;
  dryRun?: boolean;
}

export interface ApplyResult {
  applied: boolean;
  snapshot?: ThemeLayoutDocument; // 操作前快照（用于撤销）
  appliedOperations: EditorAiEditInstruction[];
  warnings: string[];
  preview?: CompiledSemanticInstruction['operations']; // dryRun 时填充
}

/**
 * 5 个语义工具的统一执行入口。
 * 流程：参数归一化 → Profile 扫描 → 编译 → (可选) dry-run 预览 → 原子应用。
 * 所有错误返回结构化 AgentEditError，不抛 raw exception。
 */
export async function executeSemanticTool(
  toolName: SemanticToolName,
  params: Record<string, unknown>,
  document: ThemeLayoutDocument,
  options: ExecuteSemanticToolOptions = {},
): Promise<AgentEditResult<ApplyResult>>;
```

**实现要点**：

- 内部 `buildInstructionFromToolCall(toolName, params)` 把 tool 参数映射到 `SemanticEditorInstruction` discriminated union
- dry-run 模式下：调用 compiler 但不调用 atomic apply；返回 `{ preview: compiled.operations, warnings }`
- 任何步骤失败 → 直接返回 `AgentEditError`（已含 `availableSlots` / `availablePatterns` / `availablePageKinds` / `availableRegions` 等候选项）

### 3.2 `shared/agent/editor/atomicApply.ts`（新增）

```typescript
// shared/agent/editor/atomicApply.ts

import { atomicOperationManager, type OperationStep } from './atomicOperations';
import type { AgentEditResult } from '../errors/agentErrors';
import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import { applyEditorAiEditInstructions } from './applyEditorInstructions';
import type { ThemeLayoutDocument } from '../types';
import type { ApplyResult } from '../tools/semanticToolExecutor';

export interface AtomicApplyOptions {
  sessionId?: string;
}

/**
 * 对编译产出的 CompiledSemanticInstruction 做原子应用：
 * 1. snapshot 原始 document
 * 2. 把每个 op 包装成 OperationStep
 * 3. 复用 AtomicOperationManager 执行（任一失败整体回滚）
 * 4. 返回 ApplyResult（含 snapshot 用于撤销）
 */
export function applyCompiledOperationsAtomic(
  compiled: CompiledSemanticInstruction,
  document: ThemeLayoutDocument,
  options?: AtomicApplyOptions,
): Promise<AgentEditResult<ApplyResult>>;
```

**实现细节**：

```typescript
async function applyCompiledOperationsAtomic(compiled, document, options) {
  const steps: OperationStep<ThemeLayoutDocument>[] = compiled.operations.map((op, i) => ({
    stepId: `op-${i}`,
    description: op.type,
    execute: (doc) => {
      const result = applyEditorAiEditInstructions(doc, [op]);
      if (result.errors.length > 0) {
        throw new Error(result.errors.join('; '));
      }
      return result.document;
    },
    rollback: (doc) => doc, // AtomicOperationManager 已用 snapshot 整体回滚
  }));

  const sessionId = options?.sessionId ?? 'unknown';
  const opId = atomicOperationManager.createAtomicOperation(document, sessionId, steps);
  const execution = await atomicOperationManager.executeAtomicOperation(opId);

  if (!execution.success || !execution.data) {
    return execution; // 已自动回滚
  }

  return {
    success: true,
    data: {
      applied: true,
      snapshot: document, // 保留原始 doc 用于撤销
      appliedOperations: compiled.operations,
      warnings: compiled.warnings,
    },
  };
}
```

### 3.3 Agent Runner 集成

**改动**：

- `backend/src/ai/agentRunner.service.ts:392-421` 的 `toolExecutor`
- `src/ai/agents/editorEditAgent.ts:160-167` 的 `toolExecutor`

**新分支**：

```typescript
import { EDITOR_SEMANTIC_TOOLS } from './tools/editorEdit.tool';
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';

const SEMANTIC_TOOL_NAMES = new Set(EDITOR_SEMANTIC_TOOLS.map((t) => t.name));

toolExecutor: async (name, args) => {
  // 新分支：5 个语义工具走统一入口
  if (SEMANTIC_TOOL_NAMES.has(name)) {
    const result = await executeSemanticTool(
      name as SemanticToolName,
      args,
      currentDocument,
      { sessionId: scenario.sessionId ?? 'unknown' },
    );
    return { output: JSON.stringify(result) };
  }

  // 旧分支：9 个低级工具走原路径（不变）
  const edit = editorToolCallToOperations(name, args);
  const result = applyEditorAiEditInstructions(currentDocument, edit.operations, {...});
  return { output: JSON.stringify(result) };
};
```

**重要**：保留旧的 `editorToolCallToOperations` + `applyEditorAiEditInstructions` 路径，仅在工具名属于 `EDITOR_SEMANTIC_TOOLS` 时切到新路径。

### 3.4 Profile 注入到 Context

**改动**：`shared/agent/context/editorContext.ts`

**新增函数**（在现有 `summarizeTemplateProfile` 基础上）：

```typescript
/**
 * 为 AI Prompt 生成 Profile 摘要，列出可用的 pageKind/region/slot/pattern。
 * 这是 AI 决定"用什么 slotKey"的信息源。
 */
export function buildTemplateProfileSummary(profile: TemplateProfile): string {
  return [
    '## 模板语义索引（TemplateProfile 摘要）',
    '优先使用语义工具（editor_update_slot / editor_fill_pattern / editor_create_page_from_page_kind / editor_replace_section / editor_submit_page_spec）',
    '',
    '### 可用页面类型（pageKind）',
    ...profile.pages.map((p) => `- ${p.pageKind}: pageId=${p.pageId}, name=${p.name}`),
    '',
    '### 可用区域（regionKey，replaceable=true）',
    ...profile.regions
      .filter((r) => r.replaceable)
      .map((r) => `- ${r.regionKey}: page=${r.pageKey}, nodeId=${r.nodeId}`),
    '',
    '### 可编辑槽位（slotKey，最多 30 个）',
    ...profile.slots.slice(0, 30).map((s) => `- ${s.slotKey}: ${s.component} props=[${s.editableProps.join(',')}]`),
    '',
    '### 可填充模式（patternKey）',
    ...profile.patterns.map(
      (p) => `- ${p.patternKey}: fields=[${p.fields.map((f) => f.fieldKey).join(',')}], maxItems=${p.maxItems ?? 50}`,
    ),
  ].join('\n');
}
```

**在 `buildEditorAgentContext` 末尾注入**：

```typescript
// 现有逻辑末尾追加：
const profile = buildTemplateProfile(document);
const profileSummary = buildTemplateProfileSummary(profile);
contextBlocks.push(profileSummary);
```

---

## 4. 错误处理

所有错误必须返回**结构化错误**（已含候选项），让 AI 能自我纠正，不抛 raw exception。

| 阶段         | 失败场景                 | 返回错误                                          | AI 的下一步                  |
| ------------ | ------------------------ | ------------------------------------------------- | ---------------------------- |
| 参数解析     | 工具名不属于语义工具     | throw → AgentRunner 兜底                          | 不应发生                     |
| 编译         | slot 不存在              | `slot_not_found` + `availableSlots`               | 改用 availableSlots 中的 key |
| 编译         | pattern 不存在           | `pattern_not_found` + `availablePatterns`         | 同上                         |
| 编译         | pageKind 不存在          | `page_kind_not_found` + `availablePageKinds`      | 同上                         |
| 编译         | region 不存在/不可替换   | `region_not_found` + `availableRegions`           | 同上                         |
| 编译         | props 不在 editableProps | `invalid_props` + `invalidProps` + `allowedProps` | 改用 allowedProps            |
| dry-run      | 任何编译错误             | 同上                                              | 同上                         |
| atomic apply | apply 抛异常             | `apply_failed` + `partialSuccess: false`          | 文档已自动回滚，重试或换工具 |
| atomic apply | 回滚失败                 | `atomic_rollback_failed`                          | 严重错误，停止               |

**关键不变量**：

- `partialSuccess: false` 时，`document` 一定等于初始 document（已 snapshot+rollback）
- 所有错误**类型化**（`AgentEditError`），不抛 `Error` 对象
- 任何错误**不阻塞** AI 继续推理；只返回错误信息让 AI 决定

### 撤销快照契约

`applyCompiledOperationsAtomic` 返回的 `snapshot` 是操作**前**的完整 document。调用方负责保存（用于 UI 的 undo/redo）。

后续：把这个 snapshot 通过 SSE `tool_call_end` 事件传给前端（属于工作二的范畴），本阶段只把 snapshot 保留在返回值里。

---

## 5. 测试策略

### 5.1 测试文件结构

```
shared/agent/tools/
  ├── semanticToolExecutor.spec.ts          (新增) - 6 个用例
  ├── semanticTools.spec.ts                  (新增) - isSemanticTool / parseSemanticArgs 工具函数
shared/agent/editor/
  ├── atomicApply.spec.ts                    (新增) - 3 个用例
backend/src/ai/tools/
  ├── semantic-tools.spec.ts                 (新增) - E2E via AgentRunner（mock provider） 3 个用例
```

### 5.2 12 个测试用例分布

| #   | 测试                                 | 期望行为                                                 | 归属文件                                    |
| --- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| 1   | update_slot 基础（修改 hero 标题）   | success, snapshot 保留                                   | semanticToolExecutor.spec                   |
| 2   | update_slot 非法 prop                | `invalid_props` + `invalidProps` + `allowedProps`        | semanticToolExecutor.spec                   |
| 3   | update_slot slotKey 不存在           | `slot_not_found` + `availableSlots`                      | semanticToolExecutor.spec                   |
| 4   | fill_pattern 3 个商品卡片            | success + clone_pattern_items 产生 3 个 node             | semanticToolExecutor.spec                   |
| 5   | fill_pattern 100 items               | 触发 `maxItems` 限制（仅保留 50） + warning              | semanticToolExecutor.spec                   |
| 6   | create_page_from_kind (order)        | success，新 page 出现在 document.pages                   | semanticToolExecutor.spec                   |
| 7   | create_page_from_kind 不存在         | `page_kind_not_found` + `availablePageKinds`             | semanticToolExecutor.spec                   |
| 8   | replace_section 成功                 | success                                                  | atomicApply.spec                            |
| 9   | replace_section 不可替换 region      | `region_not_found`/`compile_failed` + `availableRegions` | atomicApply.spec                            |
| 10  | submit_page_spec 创建完整页          | 分解为多个 op，全部 success                              | atomicApply.spec                            |
| 11  | 原子性：中途失败                     | document 状态 == 初始状态，partialSuccess=false          | atomicApply.spec                            |
| 12  | E2E：AI 调用语义工具到 document 变更 | 完整链路                                                 | backend/src/ai/tools/semantic-tools.spec.ts |

### 5.3 测试基础设施

- **fixture**：用 `shared/agent/fixtures/blankDocument.ts` 和 `seedDocuments.ts` 中已有的模板作为测试输入
- **断言风格**：参考 `semanticInstructionCompiler.spec.ts`（已有）的模式
- **覆盖率目标**：executor + atomicApply 主体 > 80%
- **E2E 用例**：用 `mockProvider` 让 LLM 模拟"返回特定 tool_call"，验证 `agentRunner.service.ts` 走新 executor 分支

### 5.4 关键边界测试

- `parseSemanticArgs` 对参数缺失/类型错误的容错
- `isSemanticTool` 区分语义工具和低级工具
- `executeSemanticTool` 在 dryRun=true 时**不修改** document（用 structuredClone 比对）
- 原子性：构造一个会失败的 op（如 `clone_pattern_items` 但 sourceRootNodeId 不存在），验证 rollback

---

## 6. 交付标准

### 功能标准（P0，必须满足）

- [ ] **F1**: `executeSemanticTool` 统一入口存在，签名如 §3.1
- [ ] **F2**: `applyCompiledOperationsAtomic` 复用 `AtomicOperationManager`，失败回滚到初始 document
- [ ] **F3**: 5 个语义工具在 `agentRunner.service.ts` 走新 executor 分支
- [ ] **F4**: 5 个语义工具在 `editorEditAgent.ts` 走新 executor 分支
- [ ] **F5**: 9 个低级工具**不变**，仍走 `applyEditorAiEditInstructions`
- [ ] **F6**: 编译错误返回结构化 `AgentEditError`，含 `availableSlots` / `availablePatterns` / `availablePageKinds` / `availableRegions` 候选项
- [ ] **F7**: `buildTemplateProfileSummary` 注入到 AI context
- [ ] **F8**: dryRun=true 时不修改 document，返回 preview

### 质量标准（P0，必须满足）

- [ ] **Q1**: 12 个新增测试全部通过
- [ ] **Q2**: `pnpm typecheck:all` 通过
- [ ] **Q3**: `pnpm --dir backend test` 通过
- [ ] **Q4**: 新增代码测试覆盖率 > 80%
- [ ] **Q5**: 不引入新的 shared agent boundary 违规（`pnpm shared:boundary:check` 通过）
- [ ] **Q6**: 现有测试**不破坏**（所有 spec 文件继续通过）

### 性能标准（P1，应该满足）

- [ ] **P1**: Profile 扫描 + 编译 < 200ms（单个模板）
- [ ] **P2**: dryRun 模式 < 200ms
- [ ] **P3**: 单个 slot 更新（含 Profile + 编译 + apply）< 500ms

---

## 7. 实施步骤

按以下顺序实现（每步可独立编译运行）：

### Step A: 基础设施（不破坏现有）

1. 新建 `shared/agent/tools/semanticToolExecutor.ts`
   - 实现 `buildInstructionFromToolCall(toolName, params)`
   - 实现 `executeSemanticTool(name, params, doc, options)`
   - 暂不接入 agent runner
2. 新建 `shared/agent/editor/atomicApply.ts`
   - 实现 `applyCompiledOperationsAtomic`
   - 复用 `AtomicOperationManager`
3. 新建 `shared/agent/tools/semanticTools.ts`（工具函数）
   - `isSemanticTool(name)` 守卫
   - `parseSemanticArgs(name, args)` 归一化

### Step B: Context 注入

4. 在 `shared/agent/context/editorContext.ts` 新增 `buildTemplateProfileSummary`
5. 在 `buildEditorAgentContext` 末尾注入 profile 摘要

### Step C: Agent Runner 集成

6. 修改 `backend/src/ai/agentRunner.service.ts` toolExecutor，分发到 executor
7. 修改 `src/ai/agents/editorEditAgent.ts` toolExecutor，分发到 executor

### Step D: 测试

8. 新建 `shared/agent/tools/semanticToolExecutor.spec.ts`（6 个用例）
9. 新建 `shared/agent/editor/atomicApply.spec.ts`（3 个用例）
10. 新建 `backend/src/ai/tools/semantic-tools.spec.ts`（3 个 E2E 用例）

### Step E: 验证

11. `pnpm typecheck:all`
12. `pnpm --dir backend test`
13. `pnpm test:integration`
14. `pnpm shared:boundary:check`

---

## 8. 风险与缓解

| 风险                                                                            | 影响                   | 缓解                                                                |
| ------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `AtomicOperationManager` 的 `applyEditorAiEditInstructions` 调用会修改 doc 状态 | 多次调用可能污染原 doc | 已在 `applyEditorAiEditInstructions` 内部 `cloneDocument`，无副作用 |
| Profile 注入到 context 增加 token 数                                            | AI 响应成本上升        | 限制 30 slots + 16 patterns，已是合理预算                           |
| AI 不遵守"优先语义工具"规则                                                     | 语义路径不被使用       | 现有 prompt 已强调；新 prompt 注入 profile 摘要会增强引导           |
| dry-run 返回的 preview 与实际 apply 不一致                                      | 用户被误导             | 复用 compiler，确保两次走同一代码路径                               |
| E2E 测试需要 mock provider                                                      | 测试复杂               | 用现有 `shared/agent/testing/mockProvider.ts`                       |

---

## 9. 后续工作（不在本阶段范围）

- **工作二（结构化 SSE 协议）**: 把 snapshot 通过 SSE 事件传给前端，支持 UI undo
- **Profile 缓存**: 同一 document 多次 edit 时复用 Profile，避免重复扫描
- **批量语义工具**: 一次调用多个语义操作，进一步减少 AI 轮次
- **撤销/重做 UI**: 前端集成 snapshot 实现 undo/redo

---

_本文档随实施进展持续更新。_
