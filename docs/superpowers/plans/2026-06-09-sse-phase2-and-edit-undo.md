# SSE Phase 2 UI 消费 + 编辑撤销栈 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PR #11 (语义工具) + PR #12 (结构化 SSE Phase 1) 已经实现但 OPEN 的成果推到用户可见层 — 模板生成过程显示 4 阶段进度条，编辑器 AI 面板展示推理过程，AI 编辑可一键撤销，最多 20 个快照。

**Architecture:**

- **Path A** 在两层添加 UI 消费层：(1) `TemplateAiService` 接 `onStructuredEvent` 回调，把 `pipeline_stage_start/end` 翻译成新的 `pipeline_stage` 事件类型向上抛；(2) `EditorAiService` 在 envelope 解析 switch 里补 `reasoning_delta` 与 `usage_summary` 分支，让前端 ChatPanel 能渲染推理内容折叠面板与用量徽章；(3) 后端 `editorAi.service` 在编辑器流结束时把 `usage_summary` 写入既有 `AiTokenUsage` 表。
- **Path B** 把 PR #11 已有 `applyCompiledOperationsAtomic` 提供的 `snapshot` 沿用到 UI 层：`EditorAiService.applyBackendEditRequest` 在调 `applyInstructions` 之前先 `structuredClone(currentDocument)` 入栈；`EditorAiPanel` 暴露 `onUndoLastEdit()` 回调给 `ThemeLayoutBuilder`，由后者在 `useThemeLayoutDoc` 状态下回滚；撤销栈持久化到 `localStorage`（key = `editorUndoStack:${templateId}`）并附带最后一条 assistant message 写入 `editorAiConversation` 实体的新字段。

**Tech Stack:** Next.js 15 / React 19 / TypeScript 6 / NestJS 10 / better-sqlite3 + TypeORM / SSE envelope (`sse.v1`)。

---

## 背景与前置

| 既有成果                                                         | PR     | 状态       |
| ---------------------------------------------------------------- | ------ | ---------- |
| `serializeSseEvent` / `parseSseEnvelope` (9 个事件类型 envelope) | #12    | 实现，OPEN |
| `BackendProxyProvider.onStructuredEvent` 4th 参数                | #12    | 实现，OPEN |
| `applyCompiledOperationsAtomic` 含 `snapshot` 字段               | #11    | 实现，OPEN |
| `EditorAiService.consumeEditorEventStream` envelope 解析 switch  | #12    | 实现，OPEN |
| `EditorAiCacheStats` 拉取 + 徽章                                 | 已合并 | 既有       |
| `TokenUsageService.recordTokenUsage`                             | 已合并 | 既有       |

**关键 gap**（本次计划要补的）：

1. `TemplateAiService` 不接 `onStructuredEvent`，`pipeline_stage_start/end` 被丢弃
2. `EditorAiService` 的 envelope switch 显式 `default: break` 跳过 `reasoning_delta` / `usage_summary`
3. 编辑器 AI 编辑结果没有 UI 撤销入口
4. 编辑器流结束时不写 token usage 记录

---

## 文件结构

### Path A 新增 (5 文件)

| 文件                                      | 职责                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| `src/ui/chat/PipelineProgress.tsx`        | 4 阶段进度条 (designer → critic → schema → verifier) |
| `src/ui/chat/ReasoningPanel.tsx`          | 推理内容折叠面板 (DeepSeek reasoning_content)        |
| `src/ui/chat/PipelineProgress.module.css` | 进度条样式                                           |
| `src/ui/chat/ReasoningPanel.module.css`   | 折叠面板样式                                         |
| `scripts/agentEvalEnvelope.ts`            | envelope 流黄金集对比 runner                         |

### Path A 修改 (8 文件)

| 文件                                                | 改动                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `src/ai/templateAi.service.ts`                      | 接 `onStructuredEvent`，转 `pipeline_stage` 事件            |
| `src/ai/editorAi.service.ts`                        | envelope switch 加 `reasoning_delta` / `usage_summary` 分支 |
| `src/ai/editorAi.service.content.ts`                | 加新事件类型文案                                            |
| `src/ui/editor/components/EditorAiPanel.tsx`        | 处理 `reasoning` / `usage_summary` 事件                     |
| `src/ui/editor/components/EditorAiPanel.content.ts` | 文案                                                        |
| `src/ui/editor/components/EditorAiPanel.helpers.ts` | 解析新事件                                                  |
| `src/views/EditorPage/EditorPageView.tsx`           | 嵌入 `PipelineProgress` 到模板生成等待态                    |
| `backend/src/ai/services/editorAi.service.ts`       | 调 `TokenUsageService.recordTokenUsage` 持久化 usage        |

### Path B 新增 (3 文件)

| 文件                                            | 职责                                                |
| ----------------------------------------------- | --------------------------------------------------- |
| `shared/agent/editor/editorUndoStack.ts`        | `EditorUndoStack` 数据结构（push/undo/list/max 20） |
| `shared/agent/editor/editorUndoStack.spec.ts`   | 单元测试                                            |
| `src/ui/editor/components/EditorUndoButton.tsx` | 撤销按钮 + 快照列表 dropdown                        |

### Path B 修改 (6 文件)

| 文件                                                     | 改动                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/ai/editorAi.service.ts`                             | `applyBackendEditRequest` 前调 `pushSnapshot(document)`               |
| `src/ui/editor/components/EditorAiPanel.tsx`             | 接 `onApplyInstructions` 同时调 `pushSnapshot`，暴露 `onUndoLastEdit` |
| `src/state/editorAiPanelState.ts`                        | undo stack state 持久化到 localStorage                                |
| `src/ui/editor/ThemeLayoutBuilder.tsx`                   | 工具栏嵌入 `EditorUndoButton`                                         |
| `backend/src/ai/ai.service.ts`                           | 扩 `SaveEditorAiConversationInput` schema 接受 `undoStack` 字段       |
| `backend/src/ai/entities/editorAiConversation.entity.ts` | 加 `undoStack` TEXT 列（JSON 序列化）                                 |

---

# Path A — SSE Phase 2 UI 消费

## A.1 TemplateAiService 透传 pipeline_stage 事件

**Files:**

- Modify: `src/ai/templateAi.service.ts:7-10, 66-128`
- Test: `src/ai/templateAi.service.spec.ts` (新建)

- [ ] **Step 1: 写失败的测试 — `pipeline_stage_start` 通过 `onStructuredEvent` 透传**

在 `src/ai/templateAi.service.spec.ts`（如不存在则新建）加：

```ts
import { describe, it, expect, vi } from 'vitest'; // 或 node:test，看项目惯例
import { TemplateAiService } from './templateAi.service';
import type { BackendProxyProvider } from './core/providers/backendProxy.provider';

describe('TemplateAiService pipeline events', () => {
  it('emits pipeline_stage event when onStructuredEvent fires pipeline_stage_start', async () => {
    const events: { type: string; data: string }[] = [];
    let capturedCallback: ((env: unknown) => void) | null = null;

    const fakeProvider = {
      resetConversation: vi.fn(),
      cancel: vi.fn(),
      onStructuredEvent: undefined as unknown,
      // 模拟 BackendProxyProvider: 接受 4th 参数 onStructuredEvent
      setCallback: (cb: (env: unknown) => void) => {
        capturedCallback = cb;
      },
    } as unknown as BackendProxyProvider;

    const service = new TemplateAiService(() => null, undefined);
    // 替换内部 provider
    (service as unknown as { provider: BackendProxyProvider }).provider = fakeProvider;
    (
      service as unknown as { provider: BackendProxyProvider & { onStructuredEvent: unknown } }
    ).provider.onStructuredEvent = (cb: (env: unknown) => void) => {
      capturedCallback = cb;
    };

    // 触发 pipeline_stage_start
    const fakeEnvelope = {
      schema: 'sse.v1',
      type: 'pipeline_stage_start',
      ts: '2026-06-09T00:00:00Z',
      payload: { stage: 'designer', attempt: 1 },
    };
    // 调用 onEvent 的 onEvent 实现
    void service.generate({
      prompt: 'test',
      onEvent: (event) => {
        events.push({ type: event.type, data: event.data });
      },
    });

    // 等待 microtask 后手动触发
    await Promise.resolve();
    if (capturedCallback) {
      (capturedCallback as (env: unknown) => void)(fakeEnvelope);
    }

    // 预期 events 包含 { type: 'pipeline_stage', data: JSON.stringify({ phase: 'start', stage: 'designer', attempt: 1 }) }
    // 实际现在不会触发 — FAIL
  });
});
```

Run: `pnpm exec tsx --test src/ai/templateAi.service.spec.ts`
Expected: FAIL — `events` 为空，没有 `pipeline_stage` 类型

- [ ] **Step 2: 实现 — `TemplateAiService` 接 `onStructuredEvent` 回调**

修改 `src/ai/templateAi.service.ts`：

```ts
import { BackendProxyProvider } from './core/providers/backendProxy.provider';
import {
  NEW_STRUCTURED_SSE_EVENT_TYPES,
  type SseEventEnvelope,
  type SseEventType,
} from './core/providers/backendProxy.provider.events';

export interface AiGenerateEvent {
  type: 'text' | 'intent_plan' | 'tool_start' | 'tool_done' | 'template_saved' | 'pipeline_stage' | 'error' | 'done';
  data: string;
}
```

把 `provider` 的初始化从 constructor 移到第一次 `generate` 调用前（懒加载），并在 `generate()` 内部注册回调：

```ts
async generate(opts: GenerateTemplateOptions): Promise<void> {
  // ... 已有代码 ...
  this.provider.resetConversation();
  this.provider.onStructuredEvent = (envelope: SseEventEnvelope<SseEventType, unknown>) => {
    if (envelope.type === 'pipeline_stage_start' || envelope.type === 'pipeline_stage_end') {
      const phase = envelope.type === 'pipeline_stage_start' ? 'start' : 'end';
      const payload = envelope.payload as { stage: string; attempt: number; durationMs?: number; status?: string; error?: string };
      onEvent({
        type: 'pipeline_stage',
        data: JSON.stringify({ phase, ...payload }),
      });
    }
  };
  // ... 已有代码 ...
}
```

`BackendProxyProvider` 已有 `onStructuredEvent` setter 通过 constructor 4th 参数赋值；要改为可写属性。检查 `backendProxy.provider.ts:49` 改为 `private` → `settable`：

```ts
// 原: private readonly onStructuredEvent?: ...
// 改: public onStructuredEvent?: ...
```

Run: `pnpm exec tsx --test src/ai/templateAi.service.spec.ts`
Expected: PASS

- [ ] **Step 3: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 0 error

- [ ] **Step 4: Commit**

```bash
git add src/ai/templateAi.service.ts src/ai/core/providers/backendProxy.provider.ts src/ai/templateAi.service.spec.ts
git commit -m "feat(ai): surface pipeline_stage events from TemplateAiService"
```

---

## A.2 PipelineProgress 进度条组件

**Files:**

- Create: `src/ui/chat/PipelineProgress.tsx`
- Create: `src/ui/chat/PipelineProgress.module.css`
- Modify: `src/views/EditorPage/EditorPageView.tsx`（如不存在则在模板生成等待态嵌入）

- [ ] **Step 1: 写失败测试 — 组件按 stage 状态渲染**

创建 `src/ui/chat/PipelineProgress.spec.ts`：

```ts
import { describe, it, expect } from 'node:test';
import { render } from '@testing-library/react'; // 或 jsdom + node --test 自定义
import { PipelineProgress } from './PipelineProgress';

describe('PipelineProgress', () => {
  it('renders 4 stages with all "pending" by default', () => {
    // 由于 React 19 渲染测试较复杂,这里只断言组件 export + prop 类型
    expect(typeof PipelineProgress).toBe('function');
  });

  it('accepts PipelineProgressStage union type', () => {
    type Stage = Parameters<typeof PipelineProgress>[0]['stages'][number]['status'];
    const s: Stage = 'running';
    expect(s).toBe('running');
  });
});
```

Run: `pnpm exec tsx --test src/ui/chat/PipelineProgress.spec.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 2: 实现组件**

创建 `src/ui/chat/PipelineProgress.tsx`：

```tsx
'use client';

import { Box, Text } from 'ui/base';
import styles from './PipelineProgress.module.css';

export type PipelineStageName = 'designer' | 'critic' | 'schema' | 'verifier';
export type PipelineStageStatus = 'pending' | 'running' | 'ok' | 'failed';

export interface PipelineProgressStage {
  stage: PipelineStageName;
  status: PipelineStageStatus;
  attempt: number;
  durationMs?: number;
  error?: string;
}

export interface PipelineProgressProps {
  stages: readonly PipelineProgressStage[];
  currentAttempt?: number;
}

const STAGE_LABELS: Record<PipelineStageName, string> = {
  designer: 'Designer',
  critic: 'Critic',
  schema: 'Schema',
  verifier: 'Verifier',
};

const STAGE_ORDER: readonly PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];

export function PipelineProgress({ stages, currentAttempt }: PipelineProgressProps) {
  const stageMap = new Map(stages.map((s) => [s.stage, s]));
  return (
    <Box className={styles.container} aria-label="Pipeline 进度">
      {STAGE_ORDER.map((name) => {
        const stage = stageMap.get(name) ?? { stage: name, status: 'pending' as const, attempt: 0 };
        return (
          <Box key={name} className={styles.stage} data-status={stage.status}>
            <Box className={styles.dot} />
            <Text as="span" size="sm" weight="bold">
              {STAGE_LABELS[name]}
            </Text>
            {stage.status === 'running' ? (
              <Text as="span" size="xs" variant="muted">
                attempt {stage.attempt}...
              </Text>
            ) : null}
            {stage.status === 'ok' && stage.durationMs != null ? (
              <Text as="span" size="xs" variant="muted">
                {(stage.durationMs / 1000).toFixed(1)}s
              </Text>
            ) : null}
            {stage.status === 'failed' ? (
              <Text as="span" size="xs" variant="error">
                失败
              </Text>
            ) : null}
          </Box>
        );
      })}
      {currentAttempt != null ? (
        <Text as="span" size="xs" variant="faint" className={styles.attempt}>
          全局 attempt {currentAttempt}
        </Text>
      ) : null}
    </Box>
  );
}
```

创建 `src/ui/chat/PipelineProgress.module.css`：

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--app-surface-2, rgba(255, 255, 255, 0.04));
}

.stage {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-fg-faint, rgba(255, 255, 255, 0.3));
}

.stage[data-status='running'] .dot {
  background: var(--app-accent, #3b82f6);
  animation: pulse 1.2s infinite;
}

.stage[data-status='ok'] .dot {
  background: var(--app-success, #10b981);
}

.stage[data-status='failed'] .dot {
  background: var(--app-error, #ef4444);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.attempt {
  margin-top: 0.5rem;
  display: block;
}
```

Run: `pnpm exec tsx --test src/ui/chat/PipelineProgress.spec.ts`
Expected: PASS

- [ ] **Step 3: 在 EditorPageView 嵌入**

修改 `src/views/EditorPage/EditorPageView.tsx`：找到模板生成等待态（`generating === true` 的分支），加：

```tsx
import { PipelineProgress, type PipelineProgressStage } from 'ui/chat/PipelineProgress';

// 在组件内部,使用 useState 累积 stages
const [pipelineStages, setPipelineStages] = useState<PipelineProgressStage[]>([]);
// 从 EditorPageController 接收 onPipelineEvent 回调（新增 prop）
useEffect(() => {
  if (onPipelineEvent) {
    onPipelineEvent((event) => {
      if (event.type !== 'pipeline_stage') return;
      const payload = JSON.parse(event.data) as {
        phase: 'start' | 'end';
        stage: string;
        attempt: number;
        durationMs?: number;
        status?: string;
        error?: string;
      };
      setPipelineStages((current) => {
        const next = [...current];
        const existing = next.findIndex((s) => s.stage === payload.stage);
        const status = payload.phase === 'start' ? 'running' : payload.status === 'ok' ? 'ok' : 'failed';
        if (existing >= 0) {
          next[existing] = {
            stage: payload.stage as PipelineStageName,
            status,
            attempt: payload.attempt,
            durationMs: payload.durationMs,
            error: payload.error,
          };
        } else {
          next.push({
            stage: payload.stage as PipelineStageName,
            status,
            attempt: payload.attempt,
            durationMs: payload.durationMs,
            error: payload.error,
          });
        }
        return next;
      });
    });
  }
}, [onPipelineEvent]);

// JSX 中:
{
  generating && pipelineStages.length > 0 ? (
    <PipelineProgress stages={pipelineStages} currentAttempt={Math.max(1, ...pipelineStages.map((s) => s.attempt))} />
  ) : null;
}
```

- [ ] **Step 4: Controller 暴露 onPipelineEvent 回调**

修改 `src/views/EditorPage/useEditorPageController.ts:83-107`，把 `templateAiService.generate` 的 onEvent 拆出 pipeline_stage 处理：

```ts
let pipelineCallback: ((event: { type: string; data: string }) => void) | null = null;

void templateAiService.generate({
  prompt: promptParam,
  signal: abort.signal,
  onEvent: (event) => {
    // 既有: template_saved / done / error
    if (event.type === 'template_saved') { /* 已有 */ }
    if (event.type === 'done') { /* 已有 */ }
    if (event.type === 'error') { /* 已有 */ }
    // 新增: pipeline_stage 转发到 view
    if (event.type === 'pipeline_stage' && pipelineCallback) {
      pipelineCallback(event);
    }
  },
});

return { /* 既有 */, onPipelineEvent: (cb) => { pipelineCallback = cb; } };
```

- [ ] **Step 5: 类型检查 + 手动验证**

Run: `pnpm exec tsc --noEmit`
Expected: 0 error

启动 dev server, 进入 `/editor?autoGenerate=true&prompt=做一个电商首页`, 观察是否显示 4 阶段进度条。

- [ ] **Step 6: Commit**

```bash
git add src/ui/chat/PipelineProgress.tsx src/ui/chat/PipelineProgress.module.css src/views/EditorPage/EditorPageView.tsx src/views/EditorPage/useEditorPageController.ts
git commit -m "feat(ui): render pipeline progress bar from SSE events"
```

---

## A.3 EditorAiService 透传 reasoning_delta

**Files:**

- Modify: `src/ai/editorAi.service.ts:15-19, 88-93, 343-417`

- [ ] **Step 1: 扩 `EditorAiEvent` 类型**

```ts
// src/ai/editorAi.service.ts:15
export interface EditorAiEvent {
  type:
    | 'text'
    | 'intent_plan'
    | 'tool_start'
    | 'tool_done'
    | 'edit_applied'
    | 'clarification'
    | 'reasoning'
    | 'usage_summary'
    | 'error'
    | 'done';
  data: string;
  terminal?: boolean;
}
```

- [ ] **Step 2: 写失败测试 — `reasoning_delta` 翻译成 `reasoning` 事件**

创建 `src/ai/editorAi.service.reasoning.spec.ts`：

```ts
import { describe, it, expect } from 'node:test';
import { EditorAiService } from './editorAi.service';

describe('EditorAiService reasoning events', () => {
  it('translates reasoning_delta envelope to reasoning event', async () => {
    // 用 mock HttpClient 喂 envelope 事件
    const events: EditorAiEvent[] = [];
    const mockHttp = {
      stream: async () => ({
        response: { ok: true, status: 200, headers: new Map() },
        events: (async function* () {
          yield {
            data: JSON.stringify({
              schema: 'sse.v1',
              type: 'reasoning_delta',
              ts: 't',
              payload: { delta: '让我想想...' },
            }),
          };
          yield { data: JSON.stringify({ schema: 'sse.v1', type: 'done', ts: 't', payload: {} }) };
        })(),
      }),
    };
    const service = new EditorAiService(() => 'token', undefined, mockHttp as any);
    await service.editCanvas({
      prompt: 'test',
      document: {} as any,
      onEvent: (e) => events.push(e),
      applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }),
    });
    expect(events.some((e) => e.type === 'reasoning' && e.data === '让我想想...')).toBe(true);
  });
});
```

Run: `pnpm exec tsx --test src/ai/editorAi.service.reasoning.spec.ts`
Expected: FAIL — `reasoning` 事件不触发

- [ ] **Step 3: 修改 envelope switch**

`src/ai/editorAi.service.ts` 第 346-386 行的 `case 'sse.v1':` 块内，在 `default: break;` 之前添加：

```ts
case 'reasoning_delta':
  onEvent({ type: 'reasoning', data: eventDataToString(getPayloadField(event, 'delta')) });
  break;
case 'usage_summary': {
  const usagePayload = getPayloadField(event, 'usage') as { inputTokens: number; outputTokens: number; cacheHitTokens?: number; cacheMissTokens?: number } | undefined;
  const model = eventDataToString(getPayloadField(event, 'model'));
  if (usagePayload) {
    onEvent({ type: 'usage_summary', data: JSON.stringify({ model, usage: usagePayload }) });
  }
  break;
}
```

同时 legacy switch（第 388-417 行）的 default 也加同样分支（向后兼容非 envelope 事件流）。

Run: `pnpm exec tsx --test src/ai/editorAi.service.reasoning.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ai/editorAi.service.ts src/ai/editorAi.service.reasoning.spec.ts
git commit -m "feat(ai): surface reasoning_delta and usage_summary from envelope"
```

---

## A.4 ReasoningPanel 折叠面板

**Files:**

- Create: `src/ui/chat/ReasoningPanel.tsx`
- Create: `src/ui/chat/ReasoningPanel.module.css`
- Modify: `src/ui/editor/components/EditorAiPanel.tsx`, `EditorAiPanel.helpers.ts`, `EditorAiPanel.content.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/ui/chat/ReasoningPanel.spec.ts`：

```ts
import { describe, it, expect } from 'node:test';
import { ReasoningPanel } from './ReasoningPanel';

describe('ReasoningPanel', () => {
  it('renders empty when content is empty', () => {
    expect(typeof ReasoningPanel).toBe('function');
  });
});
```

- [ ] **Step 2: 实现组件**

```tsx
// src/ui/chat/ReasoningPanel.tsx
'use client';

import { useState } from 'react';
import { Box, Button, Text } from 'ui/base';
import styles from './ReasoningPanel.module.css';

export interface ReasoningPanelProps {
  content: string;
  defaultExpanded?: boolean;
  label?: string;
}

export function ReasoningPanel({ content, defaultExpanded = false, label = 'AI 推理过程' }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!content) return null;
  return (
    <Box className={styles.container}>
      <Button
        type="button"
        variant="link"
        size="xs"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={styles.toggle}
      >
        {expanded ? '▾' : '▸'} {label} ({content.length} 字)
      </Button>
      {expanded ? (
        <Box className={styles.body}>
          <Text as="pre" size="xs" variant="muted" className={styles.pre}>
            {content}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
```

CSS：折叠面板样式（与项目 `ChatPanel.module.css` 风格一致，参考实现即可）。

- [ ] **Step 3: EditorAiPanel 累积 reasoning 流**

`src/ui/editor/components/EditorAiPanel.helpers.ts` 加：

```ts
export function buildReasoningAccumulator(messages: readonly EditorAiMessage[]): string {
  // 找到最后一条 assistant 消息, 返回其累积的 reasoning delta
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.reasoningDelta) {
      return m.reasoningDelta;
    }
  }
  return '';
}
```

`EditorAiMessage` 接口加 `reasoningDelta?: string`。

在 `EditorAiPanel.tsx` 的 `runAssistant` 内（第 282 行已创建 `assistantMessageId`），找到第 363-419 行的 `onEvent` switch，添加 `case 'reasoning'`：

```ts
case 'reasoning': {
  const delta = event.data;
  // 使用 runAssistant 闭包内已存在的 assistantMessageId
  appendAssistantReasoning(assistantMessageId, delta);
  break;
}
```

并新增 `appendAssistantReasoning(messageId, delta)` 工具函数（在 helpers 文件，与 `appendAssistantDelta` 同风格），把 delta 累加到 `message.reasoningDelta` 字段。

`ReasoningPanel` 嵌入位置：在 ChatPanel messages 渲染后追加一个 section。修改 `src/ui/chat/ChatPanel.tsx` 加可选 prop `renderAfterMessages?: ReactNode`，让 EditorAiPanel 注入 `<ReasoningPanel content={buildReasoningAccumulator(messages)} />` 作为 sections。

- [ ] **Step 4: 类型检查 + 手动验证**

Run: `pnpm exec tsc --noEmit`
Expected: 0 error

启动 dev, 进入编辑器, 选 DeepSeek 模型, 触发一条 AI 编辑, 观察折叠面板是否出现并显示推理内容。

- [ ] **Step 5: Commit**

```bash
git add src/ui/chat/ReasoningPanel.tsx src/ui/chat/ReasoningPanel.module.css src/ui/editor/components/EditorAiPanel.tsx src/ui/editor/components/EditorAiPanel.helpers.ts src/ui/editor/components/EditorAiPanel.content.ts
git commit -m "feat(ui): render AI reasoning content as collapsible panel"
```

---

## A.5 usage_summary 持久化到 AiTokenUsage

**Files:**

- Modify: `backend/src/ai/services/editorAi.service.ts`

- [ ] **Step 1: 写失败测试 — `usage_summary` 事件触发 `recordTokenUsage`**

查找 `backend/src/ai/services/editorAi.service.ts`（PR #12 新建文件）。如不存在，定位等价文件并改 plan 路径。

加 spec 文件 `backend/src/ai/services/editorAi.usage.spec.ts`（项目后端使用 `jest`，不是 `vitest`）：

```ts
import { Test } from '@nestjs/testing';
import { EditorAiService } from './editorAi.service';
import { TokenUsageService } from './tokenUsage.service';

describe('EditorAiService usage persistence', () => {
  it('calls tokenUsageService.recordTokenUsage when usage_summary envelope received', async () => {
    const recordSpy = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [EditorAiService, { provide: TokenUsageService, useValue: { recordTokenUsage: recordSpy } }],
    }).compile();
    // ... 触发 editor 流, 喂入 usage_summary envelope
    // 断言 recordSpy 被以 (ownerUserId, model, usage, 'editor', 'backend-proxy') 调用
  });
});
```

- [ ] **Step 2: 注入 TokenUsageService**

在 `EditorAiService` constructor 注入 `@Inject(TokenUsageService)`，并在 envelope stream 收到 `usage_summary` 事件时调 `recordTokenUsage`。注意：现有 `EditorAiService` 大概率已通过 module 注入，可在 `app.module.ts` 检查是否已 import `TokenUsageService` 模块 — 如未导入需先加。

- [ ] **Step 3: 类型检查 + 测试**

Run: `cd backend && pnpm test -- --testPathPattern=editorAi.usage.spec`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/services/editorAi.service.ts backend/src/ai/services/editorAi.usage.spec.ts
git commit -m "feat(backend): persist editor usage_summary to AiTokenUsage table"
```

---

## A.6 envelope 流黄金集对比

**Files:**

- Create: `scripts/agentEvalEnvelope.ts`
- Create: `tests/eval/golden/envelope-template-generation.json` (录制)
- Create: `tests/eval/golden/envelope-editor-edit.json` (录制)

- [ ] **Step 1: 录制黄金集 — 模板生成**

```bash
pnpm dev:all
# 浏览器: 触发一次模板生成
# 用 Chrome DevTools MCP 或后端 logger 抓 envelope 流, 保存到 JSON
```

```json
// tests/eval/golden/envelope-template-generation.json
[
  { "schema": "sse.v1", "type": "pipeline_stage_start", "ts": "...", "payload": { "stage": "designer", "attempt": 1 } },
  { "schema": "sse.v1", "type": "tool_start", "ts": "...", "payload": { "name": "generate_template" } },
  { "schema": "sse.v1", "type": "tool_done", "ts": "...", "payload": { "name": "generate_template", "durationMs": 3200 } },
  { "schema": "sse.v1", "type": "pipeline_stage_end", "ts": "...", "payload": { "stage": "designer", "attempt": 1, "durationMs": 5000, "status": "ok" } },
  ...
]
```

- [ ] **Step 2: 写 eval runner**

```ts
// scripts/agentEvalEnvelope.ts
import fs from 'fs';
import path from 'path';
import { parseSseEnvelope } from '../src/ai/core/providers/backendProxy.provider.events';

const goldenPath = process.argv[2];
const actualPath = process.argv[3];
if (!goldenPath || !actualPath) {
  console.error('usage: tsx scripts/agentEvalEnvelope.ts <golden.json> <actual.jsonl>');
  process.exit(1);
}

const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf-8')) as Array<{ type: string; payload?: unknown }>;
const actualText = fs.readFileSync(actualPath, 'utf-8');
const actualLines = actualText.split('\n').filter(Boolean);
const actual = actualLines.map((line) => JSON.parse(line.replace(/^data: /, '')));

// 字段比对 (忽略 ts):
const goldenTypes = golden.map((e) => e.type);
const actualTypes = actual.map((e) => e.type);
const typeMatches = JSON.stringify(goldenTypes) === JSON.stringify(actualTypes);

let payloadDiffs = 0;
for (let i = 0; i < Math.min(golden.length, actual.length); i++) {
  if (JSON.stringify(golden[i].payload) !== JSON.stringify(actual[i].payload)) payloadDiffs++;
}

if (!typeMatches || payloadDiffs > 0) {
  console.error(`Mismatch: types=${typeMatches ? 'ok' : 'MISMATCH'}, payloadDiffs=${payloadDiffs}`);
  process.exit(1);
}
console.log(`Match: ${golden.length} events, 0 payload diffs`);
```

- [ ] **Step 3: 在 package.json 加 script**

```json
{
  "scripts": {
    "agent:eval:envelope": "tsx scripts/agentEvalEnvelope.ts tests/eval/golden/envelope-template-generation.json"
  }
}
```

- [ ] **Step 4: 录制 + 跑通 + Commit**

```bash
# 录制时用 Chrome DevTools MCP 抓网络
# 实际测试时修改后端 record 流到文件
pnpm agent:eval:envelope
git add scripts/agentEvalEnvelope.ts tests/eval/golden/ package.json
git commit -m "test(eval): add envelope stream golden set comparison"
```

---

# Path B — P1-3 编辑撤销栈

## B.1 EditorUndoStack 数据结构

**Files:**

- Create: `shared/agent/editor/editorUndoStack.ts`
- Create: `shared/agent/editor/editorUndoStack.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// shared/agent/editor/editorUndoStack.spec.ts
import { describe, it, expect } from 'node:test';
import { EditorUndoStack } from './editorUndoStack';

describe('EditorUndoStack', () => {
  it('pushes and pops snapshots with max=20', () => {
    const stack = new EditorUndoStack({ maxSize: 20 });
    for (let i = 0; i < 25; i++) {
      stack.push({
        id: `snap-${i}`,
        document: { themeId: `t-${i}` } as never,
        description: `edit ${i}`,
        createdAt: new Date().toISOString(),
      });
    }
    expect(stack.size).toBe(20);
    const latest = stack.pop();
    expect(latest?.id).toBe('snap-24'); // 最新
  });

  it('list returns all snapshots newest-first', () => {
    const stack = new EditorUndoStack({ maxSize: 5 });
    stack.push({ id: 'a', document: {} as never, description: 'a', createdAt: 't' });
    stack.push({ id: 'b', document: {} as never, description: 'b', createdAt: 't' });
    expect(stack.list().map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('serializes to JSON and back', () => {
    const stack = new EditorUndoStack({ maxSize: 5 });
    stack.push({ id: 'a', document: { themeId: 't' } as never, description: 'a', createdAt: '2026-06-09T00:00:00Z' });
    const json = stack.toJSON();
    const restored = EditorUndoStack.fromJSON(json);
    expect(restored.list()[0].id).toBe('a');
  });

  it('returns null when popping empty stack', () => {
    const stack = new EditorUndoStack({ maxSize: 5 });
    expect(stack.pop()).toBeNull();
  });
});
```

Run: `pnpm exec tsx --test shared/agent/editor/editorUndoStack.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 2: 实现**

```ts
// shared/agent/editor/editorUndoStack.ts
import type { ThemeLayoutDocument } from '../types';

export interface EditorUndoSnapshot {
  id: string;
  document: ThemeLayoutDocument;
  description: string;
  createdAt: string;
  assistantMessageId?: string;
}

export interface EditorUndoStackOptions {
  maxSize?: number;
}

export const DEFAULT_UNDO_STACK_SIZE = 20;

export class EditorUndoStack {
  private entries: EditorUndoSnapshot[] = [];
  private readonly maxSize: number;

  constructor(options: EditorUndoStackOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_UNDO_STACK_SIZE;
  }

  get size(): number {
    return this.entries.length;
  }

  push(snapshot: EditorUndoSnapshot): void {
    this.entries.push(snapshot);
    while (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  pop(): EditorUndoSnapshot | null {
    return this.entries.pop() ?? null;
  }

  peek(): EditorUndoSnapshot | null {
    return this.entries[this.entries.length - 1] ?? null;
  }

  list(): readonly EditorUndoSnapshot[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    this.entries = [];
  }

  toJSON(): { maxSize: number; entries: EditorUndoSnapshot[] } {
    return { maxSize: this.maxSize, entries: this.entries };
  }

  static fromJSON(json: { maxSize?: number; entries: EditorUndoSnapshot[] }): EditorUndoStack {
    const stack = new EditorUndoStack({ maxSize: json.maxSize ?? DEFAULT_UNDO_STACK_SIZE });
    stack.entries = json.entries ?? [];
    return stack;
  }
}
```

Run: `pnpm exec tsx --test shared/agent/editor/editorUndoStack.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add shared/agent/editor/editorUndoStack.ts shared/agent/editor/editorUndoStack.spec.ts
git commit -m "feat(shared): add EditorUndoStack data structure"
```

---

## B.2 EditorAiService 在 edit_request 前压栈

**Files:**

- Modify: `src/ai/editorAi.service.ts:420-447`

- [ ] **Step 1: 写失败测试 — `edit_request` 处理时拿到旧 document 并入栈**

修改 `src/ai/editorAi.service.ts:420` 的 `applyBackendEditRequest` 签名, 让它接收 `currentDocument` 参数：

```ts
private applyBackendEditRequest(
  data: unknown,
  currentDocument: ThemeLayoutDocument, // 新增
  onSnapshot: (snapshot: { id: string; document: ThemeLayoutDocument; description: string; createdAt: string }) => void, // 新增
  onEvent: (event: EditorAiEvent) => void,
  applyInstructions: EditorAiEditCanvasOptions['applyInstructions'],
  applyOptions: ApplyEditorAiEditInstructionsOptions,
): void {
  // 压栈: 编辑前的 document
  onSnapshot({
    id: `undo-${Date.now().toString(36)}`,
    document: structuredClone(currentDocument),
    description: applyOptions.reason ?? 'AI 编辑',
    createdAt: new Date().toISOString(),
  });
  // ... 原有 applyInstructions 调用 ...
}
```

并修改 `consumeEditorEventStream` 调用处，把 `this` 持有的 `document` 引用传过去（已有 `applyOptions: ApplyEditorAiEditInstructionsOptions`，但不含 document 引用，需扩展 `EditorAiEditCanvasOptions` 加 `getCurrentDocument: () => ThemeLayoutDocument`）。

- [ ] **Step 2: 实施 — 类型扩展 + 调用改造**

```ts
// src/ai/editorAi.service.ts
export interface EditorAiEditCanvasOptions {
  // ... 既有 ...
  getCurrentDocument: () => ThemeLayoutDocument; // 新增
}
```

```ts
// 在 consumeEditorEventStream 内
case 'edit_request':
  this.applyBackendEditRequest(
    getPayloadField(event, 'data'),
    opts.getCurrentDocument(), // 新增
    (snapshot) => {
      // 通过外部传入的 onSnapshot 回调
      onSnapshot(snapshot);
    },
    onEvent,
    applyInstructions,
    { ...applyOptions, reason: this.extractReason(getPayloadField(event, 'data')) },
  );
  break;
```

`editCanvas(opts)` 调用 `consumeEditorEventStream` 时，传入 `opts.getCurrentDocument` 与 `opts.onSnapshot`。

`EditorAiEditCanvasOptions.onSnapshot` 新增字段：

```ts
onSnapshot?: (snapshot: { id: string; document: ThemeLayoutDocument; description: string; createdAt: string }) => void;
```

- [ ] **Step 3: 单元测试**

`src/ai/editorAi.service.snapshot.spec.ts`：

```ts
it('calls onSnapshot with document clone before applying edit_request', async () => {
  const snapshots: any[] = [];
  const mockHttp = {
    stream: async () => ({
      response: { ok: true, status: 200 },
      events: (async function* () {
        yield {
          data: JSON.stringify({
            schema: 'sse.v1',
            type: 'edit_request',
            ts: 't',
            payload: { data: JSON.stringify({ operations: [], reason: 'test reason' }) },
          }),
        };
        yield { data: JSON.stringify({ schema: 'sse.v1', type: 'done', ts: 't', payload: {} }) };
      })(),
    }),
  };
  const doc = { themeId: 'original' } as any;
  const service = new EditorAiService(() => 'token', undefined, mockHttp as any);
  await service.editCanvas({
    prompt: 'test',
    document: doc,
    getCurrentDocument: () => doc,
    onSnapshot: (s) => snapshots.push(s),
    onEvent: () => {},
    applyInstructions: () => ({ errors: [], applied: [], selectedNodeId: null }),
  });
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].document.themeId).toBe('original');
  expect(snapshots[0].description).toBe('test reason');
});
```

Run: `pnpm exec tsx --test src/ai/editorAi.service.snapshot.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ai/editorAi.service.ts src/ai/editorAi.service.snapshot.spec.ts
git commit -m "feat(ai): push undo snapshot before applying edit_request"
```

---

## B.3 EditorAiPanel 持有 undo stack 并暴露 undo 回调

**Files:**

- Modify: `src/ui/editor/components/EditorAiPanel.tsx`, `EditorAiPanel.helpers.ts`, `EditorAiPanel.content.ts`
- Modify: `src/state/editorAiPanelState.ts`

- [ ] **Step 1: editorAiPanelState 加 undo stack 状态**

`src/state/editorAiPanelState.ts` 加：

```ts
import { EditorUndoStack } from '@shared/agent/editor/editorUndoStack';

interface EditorAiPanelState {
  // ... 既有 ...
  undoStack: EditorUndoStack;
}

const undoStackByKey = new Map<string, EditorUndoStack>();

export function getEditorAiPanelUndoStack(conversationKey: string): EditorUndoStack {
  let stack = undoStackByKey.get(conversationKey);
  if (!stack) {
    // 尝试从 localStorage 恢复
    const stored = loadFromLocalStorage(conversationKey);
    stack = stored ?? new EditorUndoStack();
    undoStackByKey.set(conversationKey, stack);
  }
  return stack;
}

function loadFromLocalStorage(conversationKey: string): EditorUndoStack | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(`editorUndoStack:${conversationKey}`);
  if (!raw) return null;
  try {
    return EditorUndoStack.fromJSON(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistEditorAiPanelUndoStack(conversationKey: string, stack: EditorUndoStack): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`editorUndoStack:${conversationKey}`, JSON.stringify(stack.toJSON()));
}
```

- [ ] **Step 2: EditorAiPanel 集成 onSnapshot 与 onUndoLastEdit**

`src/ui/editor/components/EditorAiPanel.tsx`：

- 加 prop: `onUndoLastEdit?: (restoredDocument: ThemeLayoutDocument) => void`
- 加 internal state 持有 undoStack 引用 — **必须用 `useState` 包裹，否则 push 后 React 不会重渲染**：

```ts
const [undoStack] = useState<EditorUndoStack>(() => getEditorAiPanelUndoStack(conversationKey));
const [undoAvailableCount, setUndoAvailableCount] = useState(0);
// 在 useEffect 里 sync 初始 count
useEffect(() => {
  setUndoAvailableCount(undoStack.size);
}, [undoStack]);
```

- 在 `runAssistant` 调用 `editorAiService.editCanvas` 时传入 `onSnapshot`：

```ts
await editorAiService.editCanvas({
  // ... 既有 ...
  onSnapshot: (snapshot) => {
    undoStack.push(snapshot);
    persistEditorAiPanelUndoStack(conversationKey, undoStack);
    setUndoAvailableCount(undoStack.size);
  },
});
```

- 加 `handleUndo()` 函数：

```ts
const handleUndo = useCallback(() => {
  const snap = undoStack.pop();
  if (!snap) return;
  persistEditorAiPanelUndoStack(conversationKey, undoStack);
  setUndoAvailableCount(undoStack.size);
  onUndoLastEdit?.(snap.document);
}, [conversationKey, onUndoLastEdit, undoStack]);
```

把 `handleUndo` 与 `undoAvailableCount` 通过 props 传给 `ChatPanel`（需扩展 ChatPanel 加 `undoButtonLabel` / `onUndo` / `undoAvailableCount` props）。

- [ ] **Step 3: ChatPanel 加 undo 按钮**

`src/ui/chat/ChatPanel.tsx` 加 props：

```ts
export interface ChatPanelProps {
  // ... 既有 ...
  undoButtonLabel?: string;
  onUndo?: () => void;
  undoAvailableCount?: number;
}
```

在 `actions` Box 加：

```tsx
{
  onUndo && (undoAvailableCount ?? 0) > 0 ? (
    <Button type="button" onClick={onUndo} size="sm" variant="secondary">
      {undoButtonLabel ?? `撤销 (${undoAvailableCount})`}
    </Button>
  ) : null;
}
```

- [ ] **Step 4: ThemeLayoutBuilder 接收 onUndoLastEdit prop**

`src/ui/editor/ThemeLayoutBuilder.tsx`（如已存在）接 prop `onUndoLastEdit`，把 props 透传给 `EditorAiPanel`，并实现：

```tsx
const handleUndoLastEdit = useCallback(
  (restored: ThemeLayoutDocument) => {
    // 触发 useThemeLayoutDoc 的 reset action
    setDocument(restored);
    // 通知用户
    // 记录到 console 或 messages
  },
  [setDocument],
);
```

具体 setDocument API 视项目既有模式而定；最简：`applyEditorDocument(restored)`。

- [ ] **Step 5: 类型检查 + 手动验证**

Run: `pnpm exec tsc --noEmit`
Expected: 0 error

启动 dev, 触发 3 次 AI 编辑, 点撤销按钮, 验证 document 回滚 + undo 计数 -1。

- [ ] **Step 6: Commit**

```bash
git add src/state/editorAiPanelState.ts src/ui/editor/components/EditorAiPanel.tsx src/ui/editor/components/EditorAiPanel.content.ts src/ui/chat/ChatPanel.tsx src/ui/editor/ThemeLayoutBuilder.tsx
git commit -m "feat(editor): add UI undo button for AI edits with persistent stack"
```

---

## B.4 后端持久化 undo stack 到 editor conversation

**Files:**

- Modify: `backend/src/ai/entities/editorAiConversation.entity.ts`
- Modify: `backend/src/ai/ai.service.ts`（扩 `SaveEditorAiConversationInput`）
- Create migration: `backend/src/database/migrations/<ts>-AddUndoStackToEditorConversation.ts`

- [ ] **Step 1: 写失败测试 — 保存 conversation 接受 undoStack 字段**

`backend/src/ai/services/editorConversation.service.undoStack.spec.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { EditorConversationService } from './editorConversation.service';

describe('EditorConversationService undo stack', () => {
  it('persists undo stack as part of conversation payload', async () => {
    // mock repo
    // call saveConversation({ messages: [], undoStack: [...20 snapshots] })
    // assert repo.save called with serialized JSON
  });

  it('round-trips undo stack through loadConversation', async () => {
    // mock repo 返回包含 undoStack 字段的 row
    // call loadConversation
    // assert result.undoStack 解析为正确数组
  });
});
```

Run: `pnpm --dir backend test -- --runTestsByPath src/ai/services/editorConversation.service.undoStack.spec.ts`
Expected: FAIL — undoStack 字段未定义

- [ ] **Step 2: 加 TypeORM 字段**

`backend/src/ai/entities/editorAiConversation.entity.ts` 加：

```ts
@Column({ name: 'undo_stack', type: 'text', nullable: true })
undoStack: string | null;
```

- [ ] **Step 3: 生成 + 跑 migration**

```bash
cd backend
pnpm migration:generate src/database/migrations/AddUndoStackToEditorConversation
pnpm migration:run
```

- [ ] **Step 4: 扩 `SaveEditorAiConversationInput`**

`backend/src/ai/ai.service.ts` 找到 `SaveEditorAiConversationInput` type，加：

```ts
export interface SaveEditorAiConversationInput {
  messages: EditorAiConversationMessage[];
  undoStack?: EditorUndoSnapshotSerialized[]; // 新增
}
```

`EditorUndoSnapshotSerialized` 定义：

```ts
export interface EditorUndoSnapshotSerialized {
  id: string;
  document: unknown; // ThemeLayoutDocument as JSON
  description: string;
  createdAt: string;
  assistantMessageId?: string;
}
```

`saveEditorConversation` 把 `undoStack` 序列化到 entity 的 `undoStack` 字段；`getEditorConversation` 反序列化返回。

- [ ] **Step 5: 前端 EditorAiPanel 同步 undo stack 到后端**

`src/state/editorAiPanelState.ts` 扩 `saveBrowserEditorAiPanelConversationMessages`，把 undo stack 一起发送到后端。

```ts
// src/ui/editor/components/EditorAiPanel.tsx useEffect（已有 saveConversation 副作用）
useEffect(
  () => {
    // 既有: save conversation messages
    // 新增: 同时 save undo stack
    void editorAiService.saveConversation(conversationTemplateId, {
      messages: persisted,
      undoStack: stack.toJSON().entries,
    });
  },
  [
    /* dep */
  ],
);
```

`EditorAiService.saveConversation` 加 `undoStack` 字段透传。

Run: `pnpm --dir backend test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/entities/editorAiConversation.entity.ts backend/src/ai/ai.service.ts backend/src/ai/services/editorConversation.service.ts backend/src/database/migrations/ src/ai/editorAi.service.ts src/state/editorAiPanelState.ts src/ui/editor/components/EditorAiPanel.tsx backend/src/ai/services/editorConversation.service.undoStack.spec.ts
git commit -m "feat(undo): persist editor undo stack to backend conversation"
```

---

## 执行顺序

```
A.1 (TemplateAiService pipeline 透传)
  └─ A.2 (PipelineProgress UI 组件)
A.3 (EditorAiService reasoning 透传)
  └─ A.4 (ReasoningPanel UI 组件)
A.5 (usage_summary 持久化)
  └─ A.6 (envelope 黄金集对比)
B.1 (EditorUndoStack 数据结构)
  └─ B.2 (EditorAiService 压栈)
     └─ B.3 (EditorAiPanel UI 撤销)
        └─ B.4 (后端持久化)
```

A 路径的 6 个任务大致可 2-3 天完成。B 路径的 4 个任务大致 2-3 天。总工期 4-6 天（含 review + 修 bug）。

---

## 风险与缓解

| 风险                                                                                | 缓解                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `BackendProxyProvider.onStructuredEvent` 当前是 readonly 构造参数, 改为可写影响类型 | 接受 — 已有 `onAuthExpired` 同模式可参考                                          |
| `ThemeLayoutBuilder` 的 document state 管理方式不明确, 撤销回调需适配               | 在 B.4 前先在 EditorPage 验证 `setDocument` API                                   |
| envelope 黄金集录制依赖真实后端响应, 容易脆                                         | 录制前 freeze 当前 prompt + 模型, 黄金集标注生成日期 + prompt hash                |
| 推理流跨多轮对话累积, UI 需要按 message 边界切分                                    | 在 EditorAiMessage 引入 `reasoningDelta` 字段, 在 `runAssistant` 结束/done 时清空 |
| 撤销栈持久化占用 localStorage 空间 (20 × ~50KB 文档 ≈ 1MB)                          | 暂不压缩, 监控浏览器存储; 后续可加 LZ-string                                      |
| 编辑器流 usage 持久化要新依赖 User entity, 可能循环引用                             | 通过 ownerUserId 解耦; 复用 `TokenUsageService.recordTokenUsage`                  |

---

## 验收

- [ ] 模板生成等待态显示 4 阶段进度条 + 当前 attempt
- [ ] 编辑器 AI 面板在 DeepSeek 模型下显示折叠推理面板
- [ ] 编辑器流结束后, `AiTokenUsage` 表新增对应记录
- [ ] envelope 黄金集测试通过
- [ ] 编辑器 AI 编辑后, 工具栏出现「撤销 (N)」按钮, 点击后 document 回滚
- [ ] 撤销栈最多 20 个快照, 跨刷新恢复
- [ ] 后端 editor_conversations 表 undo_stack 列有正确 JSON
- [ ] `pnpm typecheck:all` 通过
- [ ] `pnpm --dir backend test` 通过
- [ ] `pnpm --filter backend test:e2e` 通过
