# 结构化 SSE 协议（Phase 1）— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 流式通信增加 envelope 包装的结构化事件（`tool_start` / `tool_done` / `tool_error` / `reasoning_delta` / `pipeline_stage_start` / `pipeline_stage_end` / `usage_summary` / `clarification`），并提供前端 `onStructuredEvent` 订阅口。零破坏现有契约。

**Architecture:** 共享类型在 `shared/agent/contracts/sseEvents.ts`；后端 envelope 序列化在 `backend/src/ai/sse/sseEnvelope.ts`；`ai.service.ts` 的 4 处 emit 升级为 envelope；`ai.controller.ts` 仅 1 行注入 pipeline stage 回调；前端 `BackendProxyProvider` 拆 envelope 后老类型映射回 `ProviderStreamEvent` 形状 yield，新类型走 `onStructuredEvent` 订阅口。

**Tech Stack:** TypeScript 严格模式, Jest (backend), pnpm monorepo, RxJS Subject/Observable, JSON.stringify/parse, Playwright (E2E in `backend/test/e2e`).

**Spec 文档:** `docs/superpowers/specs/2026-06-09-structured-sse-phase1-design.md` — 实施前请先通读。

---

## 文件结构

| 文件                                                         | 职责                                                                                                         | 类型             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| `shared/agent/contracts/sseEvents.ts`                        | 9 个事件 type 的判别联合 + envelope 类型 + payload 映射                                                      | 新建             |
| `shared/agent/contracts/provider.ts`                         | `ProviderStreamEvent` 加 `reasoning_delta` 分支                                                              | 修改             |
| `backend/src/ai/sse/sseEnvelope.ts`                          | `serializeSseEvent()` + `trySerializeSseEvent()` + `MAX_PAYLOAD_BYTES` 常量                                  | 新建             |
| `backend/src/ai/sse/sseEnvelope.spec.ts`                     | envelope 序列化的单元测试（4 用例）                                                                          | 新建             |
| `backend/src/ai/core/providers/openaiCompatible.provider.ts` | 每收到一个 `reasoning_content` chunk 实时 yield `reasoning_delta`                                            | 修改             |
| `backend/src/ai/ai.service.ts`                               | 4 处 emit 升级 + reasoning 实时 emit + usage_summary 拆出 + clarification 升级 + 1 处 pipeline callback 参数 | 修改             |
| `backend/src/ai/ai.controller.ts`                            | streamProxy 1 行调用 `onPipelineStageEvent`                                                                  | 修改             |
| `backend/src/ai/ai.controller.spec.ts`                       | 既有 streamProxy / editorStream case 改用 `parseSseEnvelope` 拆包                                            | 修改             |
| `backend/src/ai/agentTemplateGeneration.spec.ts`             | 新增 case: pipeline_stage_start/end 事件序列                                                                 | 修改             |
| `src/ai/core/providers/backendProxy.provider.events.ts`      | `parseSseEnvelope()` + `NEW_STRUCTURED_EVENT_TYPES` + 类型 re-export                                         | 新建             |
| `src/ai/core/providers/backendProxy.provider.events.spec.ts` | parser 的 3 个测试用例                                                                                       | 新建             |
| `src/ai/core/providers/backendProxy.provider.ts`             | 加 `onStructuredEvent` 构造参数, 解析时拆 envelope, 老类型映射回 `ProviderStreamEvent`                       | 修改             |
| `src/app/test/sse-consumer/page.tsx`                         | 测试用页面, 挂 `onStructuredEvent` handler, 写入 `window.__sseReceived`                                      | 新建（仅测试用） |
| `backend/test/e2e/sse-envelope.spec.ts`                      | Playwright E2E: mock SSE 串 → 验证 console + window 全局变量                                                 | 新建             |

---

## 任务前置：安装与检查

开始任何任务前,先跑通以下命令确认环境正常:

- [ ] **Step 0.1: 验证 backend 测试能跑**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts --testNamePattern "getConfig" --no-coverage
```

预期: PASS, 1 个测试通过。

如果失败,先修复环境再继续。

---

## Phase A: Envelope 序列化层

### Task 1: 共享 envelope 类型定义

**Files:**

- Create: `shared/agent/contracts/sseEvents.ts`

- [ ] **Step 1: 写类型文件**

```typescript
// shared/agent/contracts/sseEvents.ts

export const SSE_EVENT_SCHEMA_VERSION = 'sse.v1' as const;

export type SseEventEnvelope<T extends SseEventType, P> = {
  schema: typeof SSE_EVENT_SCHEMA_VERSION;
  type: T;
  /** ISO 8601 timestamp emitted at serialization time */
  ts: string;
  payload: P;
};

export type SseEventType =
  // 现有 (兼容)
  | 'text_delta'
  | 'tool_call'
  | 'done'
  | 'error'
  // 新增
  | 'tool_start'
  | 'tool_done'
  | 'tool_error'
  | 'reasoning_delta'
  | 'pipeline_stage_start'
  | 'pipeline_stage_end'
  | 'usage_summary'
  | 'clarification';

export interface SseTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export type SseEventPayloadByType = {
  text_delta: { text: string };
  tool_call: { id: string; name: string; arguments: string };
  done: {
    usage?: SseTokenUsage;
    stopReason?: 'end_turn' | 'max_tokens';
    response_id?: string;
    reasoningContent?: string;
  };
  error: {
    message: string;
    schema_error?: boolean;
    originalType?: string;
    truncated?: boolean;
  };
  tool_start: { name: string; toolCallId?: string; ts: string };
  tool_done: { name: string; toolCallId?: string; durationMs: number };
  tool_error: { name: string; toolCallId?: string; error: string };
  reasoning_delta: { delta: string };
  pipeline_stage_start: {
    stage: 'designer' | 'critic' | 'schema' | 'verifier';
    attempt: number;
  };
  pipeline_stage_end: {
    stage: 'designer' | 'critic' | 'schema' | 'verifier';
    attempt: number;
    durationMs: number;
    status: 'ok' | 'failed';
    error?: string;
  };
  usage_summary: { model: string; usage: SseTokenUsage; totalCostUsd?: number };
  clarification: { question: string; options: { label: string; value: string }[] };
};

/** 老 ProviderStreamEvent 之外的 8 个新事件 type 集合 (前端订阅口过滤用) */
export const NEW_STRUCTURED_SSE_EVENT_TYPES: ReadonlySet<SseEventType> = new Set([
  'tool_start',
  'tool_done',
  'tool_error',
  'reasoning_delta',
  'pipeline_stage_start',
  'pipeline_stage_end',
  'usage_summary',
  'clarification',
]);
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd backend && npx tsc --noEmit
```

预期: 无错误 (这文件 pure types + 一个 const, 不会破坏构建)。

- [ ] **Step 3: Commit**

```bash
git add shared/agent/contracts/sseEvents.ts
git commit -m "feat(shared): add SSE event envelope contract"
```

---

### Task 2: 后端 envelope 序列化器

**Files:**

- Create: `backend/src/ai/sse/sseEnvelope.ts`

- [ ] **Step 1: 写 envelope 序列化器**

```typescript
// backend/src/ai/sse/sseEnvelope.ts
import {
  type SseEventEnvelope,
  type SseEventPayloadByType,
  type SseEventType,
  SSE_EVENT_SCHEMA_VERSION,
} from '@shared/agent/contracts/sseEvents';

export const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB, 远超正常事件大小

/**
 * 把 (type, payload) 包成 envelope JSON 字符串.
 * 异常或超大 payload 降级为 error envelope (不断流).
 */
export function serializeSseEvent<T extends SseEventType>(type: T, payload: SseEventPayloadByType[T]): string {
  const ts = new Date().toISOString();
  const envelope: SseEventEnvelope<T, typeof payload> = {
    schema: SSE_EVENT_SCHEMA_VERSION,
    type,
    ts,
    payload,
  };
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch (e) {
    return JSON.stringify(buildErrorEnvelope(`envelope serialization failed: ${(e as Error).message}`, type, true));
  }
  if (json.length > MAX_PAYLOAD_BYTES) {
    return JSON.stringify(buildErrorEnvelope(`payload too large: ${json.length}B`, type, false, true));
  }
  return json;
}

/**
 * try/catch 包一层 — payload 类型不匹配 (字段缺失) 时不抛, 降级为 error envelope.
 */
export function trySerializeSseEvent(type: SseEventType, payload: unknown): string {
  try {
    // 类型不匹配会在 serializeSseEvent 内 JSON.stringify 之前或之时抛错 (如访问 undefined 字段)
    return serializeSseEvent(type, payload as SseEventPayloadByType[typeof type]);
  } catch (e) {
    return JSON.stringify(buildErrorEnvelope(`payload invalid: ${(e as Error).message}`, type, true));
  }
}

function buildErrorEnvelope(
  message: string,
  originalType: SseEventType,
  schemaError: boolean,
  truncated = false,
): SseEventEnvelope<'error', { message: string; schema_error?: boolean; originalType?: string; truncated?: boolean }> {
  return {
    schema: SSE_EVENT_SCHEMA_VERSION,
    type: 'error',
    ts: new Date().toISOString(),
    payload: {
      message,
      ...(schemaError ? { schema_error: true } : {}),
      originalType,
      ...(truncated ? { truncated: true } : {}),
    },
  };
}
```

- [ ] **Step 2: 验证编译**

```bash
cd backend && npx tsc --noEmit
```

预期: 无错误。

- [ ] **Step 3: Commit**

```bash
git add backend/src/ai/sse/sseEnvelope.ts
git commit -m "feat(backend): add SSE envelope serializer with degrade-to-error fallback"
```

---

### Task 3: envelope 序列化器的单元测试 (T1-T4)

**Files:**

- Create: `backend/src/ai/sse/sseEnvelope.spec.ts`

- [ ] **Step 1: 写测试文件**

```typescript
// backend/src/ai/sse/sseEnvelope.spec.ts
import { MAX_PAYLOAD_BYTES, serializeSseEvent, trySerializeSseEvent } from './sseEnvelope';
import { SSE_EVENT_SCHEMA_VERSION, type SseEventType } from '@shared/agent/contracts/sseEvents';

const ALL_12_TYPES: SseEventType[] = [
  'text_delta',
  'tool_call',
  'done',
  'error',
  'tool_start',
  'tool_done',
  'tool_error',
  'reasoning_delta',
  'pipeline_stage_start',
  'pipeline_stage_end',
  'usage_summary',
  'clarification',
];

describe('serializeSseEvent', () => {
  it('wraps text_delta payload with envelope metadata (T1)', () => {
    const json = serializeSseEvent('text_delta', { text: 'hi' });
    const parsed = JSON.parse(json);
    expect(parsed.schema).toBe(SSE_EVENT_SCHEMA_VERSION);
    expect(parsed.type).toBe('text_delta');
    expect(typeof parsed.ts).toBe('string');
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
    expect(parsed.payload).toEqual({ text: 'hi' });
  });

  it('degrades to error envelope when trySerializeSseEvent hits bad payload (T2)', () => {
    // 故意传一个触发循环引用的对象 (JSON.stringify 会抛 TypeError)
    const cyclic: any = {};
    cyclic.self = cyclic;
    const json = trySerializeSseEvent('text_delta', cyclic);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('error');
    expect(parsed.payload.schema_error).toBe(true);
    expect(parsed.payload.originalType).toBe('text_delta');
  });

  it('degrades to error envelope with truncated flag when payload exceeds 64KB (T3)', () => {
    const bigText = 'x'.repeat(MAX_PAYLOAD_BYTES + 100);
    const json = serializeSseEvent('text_delta', { text: bigText });
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('error');
    expect(parsed.payload.truncated).toBe(true);
    expect(parsed.payload.originalType).toBe('text_delta');
  });

  it('accepts all 12 SseEventType string literals as type argument (T4)', () => {
    // 类型守卫: 这个测试在编译期就保证所有 12 个 type 都能通过 serializeSseEvent
    // 运行时: 跑一次确保不抛
    for (const type of ALL_12_TYPES) {
      const payload = makeEmptyPayload(type);
      expect(() => serializeSseEvent(type, payload)).not.toThrow();
    }
    expect(ALL_12_TYPES).toHaveLength(12);
  });
});

function makeEmptyPayload(type: SseEventType): any {
  switch (type) {
    case 'text_delta':
      return { text: '' };
    case 'tool_call':
      return { id: '', name: '', arguments: '{}' };
    case 'done':
      return {};
    case 'error':
      return { message: '' };
    case 'tool_start':
      return { name: '', ts: new Date().toISOString() };
    case 'tool_done':
      return { name: '', durationMs: 0 };
    case 'tool_error':
      return { name: '', error: '' };
    case 'reasoning_delta':
      return { delta: '' };
    case 'pipeline_stage_start':
      return { stage: 'designer', attempt: 1 };
    case 'pipeline_stage_end':
      return { stage: 'designer', attempt: 1, durationMs: 0, status: 'ok' };
    case 'usage_summary':
      return { model: 'm', usage: { inputTokens: 0, outputTokens: 0 } };
    case 'clarification':
      return { question: '', options: [] };
  }
}
```

- [ ] **Step 2: 跑测试, 期待全过**

```bash
cd backend && npx jest src/ai/sse/sseEnvelope.spec.ts --no-coverage
```

预期: 4 个测试全 PASS。

- [ ] **Step 3: Commit**

```bash
git add backend/src/ai/sse/sseEnvelope.spec.ts
git commit -m "test(backend): cover SSE envelope serializer edge cases"
```

---

## Phase B: Service 层 emit 升级

### Task 4: `ProviderStreamEvent` 加 `reasoning_delta` 分支 (T7 前置)

**Files:**

- Modify: `shared/agent/contracts/provider.ts:28-58`

- [ ] **Step 1: 加 `reasoning_delta` 分支**

修改 `shared/agent/contracts/provider.ts`, 把 `ProviderStreamEvent` 联合类型扩展:

把:

```typescript
export interface StreamEventTextDelta {
  type: 'text_delta';
  text: string;
}
```

紧接其后加:

```typescript
export interface StreamEventReasoningDelta {
  type: 'reasoning_delta';
  text: string;
}
```

把:

```typescript
export type ProviderStreamEvent = StreamEventTextDelta | StreamEventToolCall | StreamEventDone | StreamEventError;
```

改为:

```typescript
export type ProviderStreamEvent =
  | StreamEventTextDelta
  | StreamEventReasoningDelta
  | StreamEventToolCall
  | StreamEventDone
  | StreamEventError;
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit -p tsconfig.json && cd backend && npx tsc --noEmit
```

预期: 无错误 (新分支是 union 联合加法, 老消费者不识别会自动忽略)。

- [ ] **Step 3: Commit**

```bash
git add shared/agent/contracts/provider.ts
git commit -m "feat(shared): add reasoning_delta branch to ProviderStreamEvent"
```

---

### Task 5: `openaiCompatible.provider.ts` 实时 yield `reasoning_delta` (T7 中段)

**Files:**

- Modify: `backend/src/ai/core/providers/openaiCompatible.provider.ts:138-141`

- [ ] **Step 1: 写测试 (先红)**

在 `backend/src/ai/core/providers/openaiCompatible.provider.ts` 同目录新建 `openaiCompatible.provider.spec.ts`:

```typescript
// backend/src/ai/core/providers/openaiCompatible.provider.spec.ts
import { OpenAICompatibleProvider } from './openaiCompatible.provider';

// 跳过真实 LLM 调用, 用 mock OpenAI client 验证 reasoning_content 实时 yield
describe('OpenAICompatibleProvider reasoning streaming', () => {
  it('yields reasoning_delta events for each reasoning_content chunk', async () => {
    const provider = new OpenAICompatibleProvider('test-key', undefined, 'test');
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue([
            // 第一个 chunk: reasoning 增量 1
            { id: 'r1', choices: [{ delta: { reasoning_content: 'Let me ' }, finish_reason: null }] },
            // 第二个 chunk: reasoning 增量 2
            { id: 'r1', choices: [{ delta: { reasoning_content: 'think' }, finish_reason: null }] },
            // 第三个 chunk: 文本 + finish
            { id: 'r1', choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
          ]),
        },
      },
    };
    // 替换内部 client (用类型 any 绕过私有访问)
    (provider as any).client = mockClient;

    const events: any[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }

    const reasoningDeltas = events.filter((e) => e.type === 'reasoning_delta');
    expect(reasoningDeltas).toHaveLength(2);
    expect(reasoningDeltas[0]).toEqual({ type: 'reasoning_delta', text: 'Let me ' });
    expect(reasoningDeltas[1]).toEqual({ type: 'reasoning_delta', text: 'think' });

    // done 事件仍包含聚合的 reasoningContent (兜底)
    const done = events.find((e) => e.type === 'done');
    expect(done?.reasoningContent).toBe('Let me think');
  });
});
```

- [ ] **Step 2: 跑测试, 期待失败 (红)**

```bash
cd backend && npx jest src/ai/core/providers/openaiCompatible.provider.spec.ts --no-coverage
```

预期: FAIL, 因为 provider 还没 yield `reasoning_delta`。

- [ ] **Step 3: 改 provider, 实时 yield**

修改 `backend/src/ai/core/providers/openaiCompatible.provider.ts:138-141` (reasoning 累积处):

把:

```typescript
// 1. Capture reasoning_content (accumulated — DeepSeek streams it per-char)
const delta = choice.delta as Record<string, string | undefined>;
const reasoningDelta = delta.reasoning_content;
if (reasoningDelta) {
  reasoningBuffer += reasoningDelta;
}
```

改为:

```typescript
        // 1. Capture reasoning_content (accumulated — DeepSeek streams it per-char).
        //    Yield each chunk incrementally as reasoning_delta so the frontend can stream
        //    chain-of-thought in real time. reasoningBuffer is still preserved for the
        //    final done event as an aggregate fallback.
        const delta = choice.delta as Record<string, string | undefined>;
        const reasoningDelta = delta.reasoning_content;
        if (reasoningDelta) {
          reasoningBuffer += reasoningDelta;
          yield { type: 'reasoning_delta', text: reasoningDelta };
        }
```

- [ ] **Step 4: 跑测试, 期待通过 (绿)**

```bash
cd backend && npx jest src/ai/core/providers/openaiCompatible.provider.spec.ts --no-coverage
```

预期: 1 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/core/providers/openaiCompatible.provider.ts backend/src/ai/core/providers/openaiCompatible.provider.spec.ts
git commit -m "feat(backend): stream DeepSeek reasoning_content as reasoning_delta events"
```

---

### Task 6: `ai.service.ts` 升级 emit 为 envelope — 模板生成流 (T5, T9, T10)

**Files:**

- Modify: `backend/src/ai/ai.service.ts:206-296, 318-320` (runStream + emitStreamEvent)

- [ ] **Step 1: 写测试 (先红) — 改 controller spec 现有 case**

打开 `backend/src/ai/ai.controller.spec.ts`, 找到 `streamProxy` 的 "sets SSE headers and subscribes..." case (line 221-252), 把:

```typescript
subject.next({ data: '{"type":"text"}' });
expect(res.write).toHaveBeenCalledWith('data: {"type":"text"}\n\n');
```

改为:

```typescript
subject.next({
  data: JSON.stringify({
    schema: 'sse.v1',
    type: 'text_delta',
    ts: '2026-06-09T00:00:00.000Z',
    payload: { text: 'hi' },
  }),
});
expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text_delta"'));
```

- [ ] **Step 2: 跑测试, 期待失败 (红)**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts -t "sets SSE headers" --no-coverage
```

预期: FAIL, 因为 `subject.next` 现在发的已经是 envelope, 但 controller spec 还在测"老形状 JSON"。

实际失败点应该是 `expect(res.write).toHaveBeenCalledWith(...)` 那行, 因为 `res.write` 收到的是 envelope JSON 字符串, 与"老形状"不匹配。

- [ ] **Step 3: 改 `emitStreamEvent` 用 envelope**

修改 `backend/src/ai/ai.service.ts:318-320` (emitStreamEvent):

把:

```typescript
  private emitStreamEvent(subject: Subject<StreamSseEvent>, event: ProviderStreamEvent): void {
    subject.next({ data: JSON.stringify(event) });
  }
```

改为:

```typescript
  private emitStreamEvent(subject: Subject<StreamSseEvent>, event: ProviderStreamEvent): void {
    const type = event.type === 'reasoning_delta' ? 'reasoning_delta'
      : event.type === 'text_delta' ? 'text_delta'
      : event.type === 'tool_call' ? 'tool_call'
      : event.type === 'done' ? 'done'
      : 'error';
    const payload = event.type === 'reasoning_delta' ? { delta: event.text }
      : event.type === 'text_delta' ? { text: event.text }
      : event.type === 'tool_call' ? { id: event.id, name: event.name, arguments: event.arguments }
      : event.type === 'done' ? {
          ...(event.usage ? { usage: event.usage } : {}),
          ...(event.stopReason ? { stopReason: event.stopReason } : {}),
          ...(event.response_id ? { response_id: event.response_id } : {}),
          ...(event.reasoningContent ? { reasoningContent: event.reasoningContent } : {}),
        }
      : { message: event.message };
    subject.next({ data: serializeSseEvent(type, payload as any) });
  }
```

并在文件顶部加 import:

```typescript
import { serializeSseEvent } from './sse/sseEnvelope';
```

- [ ] **Step 4: 在 runStream 加 usage_summary 拆出**

修改 `backend/src/ai/ai.service.ts:280-294` (runStream 的 for-await 循环):

把:

```typescript
for await (const event of this.provider.stream(request)) {
  if (event.type === 'done' && event.usage) {
    this.tokenUsageService.logCacheUsage(ownerUserId, model, event.usage, 'stream');
    await this.tokenUsageService.recordTokenUsage(ownerUserId, model, event.usage, 'stream', this.aiConfig.provider);
  }
  this.emitStreamEvent(subject, event);
}
```

改为:

```typescript
for await (const event of this.provider.stream(request)) {
  if (event.type === 'done' && event.usage) {
    this.tokenUsageService.logCacheUsage(ownerUserId, model, event.usage, 'stream');
    await this.tokenUsageService.recordTokenUsage(ownerUserId, model, event.usage, 'stream', this.aiConfig.provider);
    // 在 done 之前先发 usage_summary, 让前端能独立消费
    this.emitStreamEvent(subject, {
      type: 'done', // 占位, 会被 emitStreamEvent 走 done 分支处理
      usage: event.usage,
      stopReason: event.stopReason,
      response_id: event.response_id,
      reasoningContent: event.reasoningContent,
    } as any);
    // 改: 上面是 hack — 实际应拆出独立逻辑. 替换为:
    subject.next({
      data: serializeSseEvent('usage_summary', {
        model,
        usage: event.usage,
      }),
    });
  }
  this.emitStreamEvent(subject, event);
}
```

> **重要**: 上面代码块是初版, 跑测试会发现 `done` 事件被发了两次 (一次通过 emitStreamEvent, 一次通过上面的 hack). **正确做法是把整个 `if` 块改写为:**

```typescript
for await (const event of this.provider.stream(request)) {
  if (event.type === 'done' && event.usage) {
    this.tokenUsageService.logCacheUsage(ownerUserId, model, event.usage, 'stream');
    await this.tokenUsageService.recordTokenUsage(ownerUserId, model, event.usage, 'stream', this.aiConfig.provider);
    // 在 done 之前先发 usage_summary, 让前端能独立消费
    subject.next({ data: serializeSseEvent('usage_summary', { model, usage: event.usage }) });
  }
  this.emitStreamEvent(subject, event);
}
```

- [ ] **Step 5: 跑 controller spec, 期待通过 (绿)**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts -t "sets SSE headers" --no-coverage
```

预期: PASS。

- [ ] **Step 6: 跑全 controller spec, 确保无回归**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts --no-coverage
```

预期: 全部 PASS (8+ 个测试)。

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.controller.spec.ts
git commit -m "feat(backend): wrap stream events with SSE envelope; split usage_summary from done"
```

---

### Task 7: `ai.service.ts` 升级 emit 为 envelope — 编辑器流 (T8, T10, clarification)

**Files:**

- Modify: `backend/src/ai/ai.service.ts:362-374` (runEditorStream / runStructuredEditorStream 的 onTextDelta / onToolEvent / onError)
- Modify: `backend/src/ai/ai.service.ts:521-523` (emitEditorEvent)

- [ ] **Step 1: 改 `emitEditorEvent` 用 envelope**

修改 `backend/src/ai/ai.service.ts:521-523` (emitEditorEvent):

把:

```typescript
  private emitEditorEvent(subject: Subject<StreamSseEvent>, event: EditorSseEventPayload): void {
    subject.next({ data: JSON.stringify(event) });
  }
```

改为:

```typescript
  private emitEditorEvent(
    subject: Subject<StreamSseEvent>,
    type: SseEventType,
    payload: unknown,
  ): void {
    subject.next({ data: serializeSseEvent(type, payload as any) });
  }
```

并在文件顶部加 import:

```typescript
import { type SseEventType, type SseEventPayloadByType } from '@shared/agent/contracts/sseEvents';
import { serializeSseEvent, trySerializeSseEvent } from './sse/sseEnvelope';
```

> **重构策略**: `emitEditorEvent` 的所有调用点需要从 `{ type: 'text', data: '...' }` 改为 `('text_delta', { text: '...' })`. 这一步涉及 ~10 个 call site, 全部统一替换.

- [ ] **Step 2: 重构所有 `emitEditorEvent` 调用点**

**调用点列表 (来自 ai.service.ts 的 grep)**:

- line 363: `this.emitEditorEvent(subject, { type: 'text', data: text })` → `this.emitEditorEvent(subject, 'text_delta', { text })`
- line 366-369: `emitEditorEvent` for tool_start/done → `emitEditorEvent(subject, 'tool_start', { name, toolCallId, ts: new Date().toISOString() })` 和 `emitEditorEvent(subject, 'tool_done', { name, toolCallId, durationMs: ... })`
- line 372-373: error → `emitEditorEvent(subject, 'error', { message: msg })`
- line 393-396: structured editor 同样的 4 处 + runStructuredEditorStream 内部类似
- line 426: `this.emitEditorEvent(subject, { type: 'clarification', data: clarification })` → `this.emitEditorEvent(subject, 'clarification', { question: clarification.question, options: clarification.options })`
- line 480-484: structured editor 的 reasoning 处理, 同样改
- line 514-516: runStructuredEditorStream 末端的 error/done
- line 542-553: `executeEditorTool` 的 `edit_request` 事件 — 这个事件不在 12 个 SseEventType 之内, 需保留为兼容事件. 暂时跳过此点 (后续 phase 处理) 或临时发 error envelope with originalType='edit_request'

**执行**: 用 IDE 重构或手动 sed:

```bash
cd backend
# 找到所有 emitEditorEvent 调用并人工 review, 逐个替换
# 没有银弹, 必须人工判断 type 字段含义
```

> **重要提示**: 这一步是 Phase B 的最大变更点. 仔细 review 每一个 call site.

- [ ] **Step 3: 写测试 — controller spec editorStream case 改用 envelope**

打开 `backend/src/ai/ai.controller.spec.ts`, 找到 `editorStream` 的 "sets SSE headers..." case (line 325-351), 把:

```typescript
subject.next({ data: '{"type":"text","data":"hi"}' });
expect(res.write).toHaveBeenCalledWith('data: {"type":"text","data":"hi"}\n\n');
```

改为:

```typescript
subject.next({
  data: JSON.stringify({
    schema: 'sse.v1',
    type: 'text_delta',
    ts: '2026-06-09T00:00:00.000Z',
    payload: { text: 'hi' },
  }),
});
expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text_delta"'));
```

- [ ] **Step 4: 跑测试, 期待通过 (绿)**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts -t "editorStream" --no-coverage
```

预期: 全部 PASS (4+ 个测试)。

- [ ] **Step 5: 跑全 controller spec**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts --no-coverage
```

预期: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.controller.spec.ts
git commit -m "feat(backend): wrap editor stream events with SSE envelope; add clarification event"
```

---

## Phase C: Pipeline stage 事件注入

### Task 8: `AiService.stream` 加 `onPipelineStageEvent` 回调参数 (T12)

**Files:**

- Modify: `backend/src/ai/ai.service.ts:206-260` (stream 签名 + Observable)

- [ ] **Step 1: 加回调参数到 stream 签名**

修改 `backend/src/ai/ai.service.ts:206-230` (stream 方法):

把:

```typescript
  /** Proxy a streaming OpenAI-compatible Responses API request, forwarding events as SSE */
  stream(
    ownerUserId: string,
    req: StreamRequest,
    cacheOptions?: ProviderCacheOptions,
  ): Observable<StreamSseEvent> {
    return new Observable<StreamSseEvent>((subscriber) => {
      const subject = new Subject<StreamSseEvent>();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      void this.runStream(ownerUserId, req, subject, cacheOptions).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.emitStreamEvent(subject, { type: 'error', message: msg });
        subject.complete();
      });

      return () => {
        relay.unsubscribe();
        subject.complete();
      };
    });
  }
```

改为:

```typescript
  /** Pipeline stage event callback. Used by ai.controller to forward stage events as SSE envelopes. */
  onPipelineStageEvent?:
    | ((
        phase: 'start' | 'end',
        payload: {
          stage: 'designer' | 'critic' | 'schema' | 'verifier';
          attempt: number;
          durationMs?: number;
          status?: 'ok' | 'failed';
          error?: string;
        },
      ) => void);

  stream(
    ownerUserId: string,
    req: StreamRequest,
    cacheOptions?: ProviderCacheOptions,
    onPipelineStageEvent?: (
      phase: 'start' | 'end',
      payload: {
        stage: 'designer' | 'critic' | 'schema' | 'verifier';
        attempt: number;
        durationMs?: number;
        status?: 'ok' | 'failed';
        error?: string;
      },
    ) => void,
  ): Observable<StreamSseEvent> {
    return new Observable<StreamSseEvent>((subscriber) => {
      const subject = new Subject<StreamSseEvent>();
      const relay = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      // 包装回调: 调用方传 onPipelineStageEvent 时, 内部用 try/catch 防止吞掉异常
      const safeOnStage = onPipelineStageEvent
        ? (phase: 'start' | 'end', payload: Parameters<NonNullable<typeof onPipelineStageEvent>>[1]) => {
            try {
              onPipelineStageEvent(phase, payload);
            } catch (e) {
              this.logger.warn(`onPipelineStageEvent threw: ${(e as Error).message}`);
            }
          }
        : undefined;
      // 把 safeOnStage 注入到 runStream 内 (暂用 module-level weakmap, 见下)
      this.activeStreamStageCallbacks.set(req, safeOnStage);

      void this.runStream(ownerUserId, req, subject, cacheOptions).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.emitStreamEvent(subject, { type: 'error', message: msg });
        subject.complete();
      });

      return () => {
        relay.unsubscribe();
        this.activeStreamStageCallbacks.delete(req);
        subject.complete();
      };
    });
  }
```

并在 AiService 类顶部 (constructor 之后) 加:

```typescript
  /** 临时存储 runStream 期间的 stage 回调 — 真正的调用方是 AiController.streamProxy */
  private readonly activeStreamStageCallbacks = new WeakMap<StreamRequest, ((phase: 'start' | 'end', payload: any) => void) | undefined>();
```

> **设计说明**: 这种 WeakMap 注入法稍嫌 ugly. **更干净的做法**是把回调作为 `runStream` 的额外参数传递, 但 runStream 是 private, 需要重构成接受额外参数. 计划保持原 runStream 签名, 用 WeakMap 是**临时方案**. 如果不喜欢, 改方案: 把 `runStream` 签名加可选 `stageEmitter` 参数.

- [ ] **Step 2: 验证编译**

```bash
cd backend && npx tsc --noEmit
```

预期: 无错误。

- [ ] **Step 3: Commit**

```bash
git add backend/src/ai/ai.service.ts
git commit -m "feat(backend): add onPipelineStageEvent callback to AiService.stream"
```

---

### Task 9: `AiController.streamProxy` 注入 stage 回调 (T13)

**Files:**

- Modify: `backend/src/ai/ai.controller.ts:110-126`

- [ ] **Step 1: 改 streamProxy 调用 service.stream 时传回调**

修改 `backend/src/ai/ai.controller.ts:110-126` (streamProxy 内的 subscription 创建):

把:

```typescript
    const subscription = this.aiService.stream(req.user.sub, body, cacheOptions).subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
        this.flushResponse(res);
      },
      ...
```

改为:

```typescript
    const subscription = this.aiService.stream(
      req.user.sub,
      body,
      cacheOptions,
      (phase, payload) => {
        // 注入 pipeline stage 事件, 包 envelope 后写入 SSE
        const type = phase === 'start' ? 'pipeline_stage_start' : 'pipeline_stage_end';
        const data = serializeSseEvent(type, payload as any);
        res.write(`data: ${data}\n\n`);
        this.flushResponse(res);
      },
    ).subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
        this.flushResponse(res);
      },
      ...
```

并在文件顶部加 import:

```typescript
import { serializeSseEvent } from './sse/sseEnvelope';
```

- [ ] **Step 2: 跑 controller spec, 期待通过**

```bash
cd backend && npx jest src/ai/ai.controller.spec.ts -t "streamProxy" --no-coverage
```

预期: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add backend/src/ai/ai.controller.ts
git commit -m "feat(backend): wire onPipelineStageEvent into SSE response"
```

---

### Task 10: agentTemplateGeneration 新增 pipeline stage 事件测试 (T11, T14)

**Files:**

- Modify: `backend/src/ai/agentTemplateGeneration.spec.ts`

- [ ] **Step 1: 打开现有 spec, 找一个能加新 case 的位置**

阅读 `backend/src/ai/agentTemplateGeneration.spec.ts` 了解现有结构. 找到 `describe('template_generation live scenario', ...)` 块, 在末尾加:

```typescript
describe('pipeline stage events', () => {
  it('emits pipeline_stage_start and pipeline_stage_end for each pipeline stage', async () => {
    // 1. 构造一个 stage event 收集器
    const stageEvents: Array<{ type: string; payload: any }> = [];
    // 2. 调 service.stream 时传 onPipelineStageEvent 收集器
    const observable = aiService.stream('user-1', { model: 'gpt-pro', messages: [] }, undefined, (phase, payload) => {
      stageEvents.push({
        type: phase === 'start' ? 'pipeline_stage_start' : 'pipeline_stage_end',
        payload,
      });
    });
    // 3. subscribe 并等待 complete (注意: 这里依赖真实 LLM, 用 mock provider 才能离线跑)
    //    — 实际实施时, 改用现有的 mock provider 路径 (agentRunner.service.ts 里的 runMockScenario)
    //    或者引入一个 fake provider 注入到 AiService
    //    此处示意代码, 实际需要按项目现有的 mock 模式补全
  });
});
```

> **重要提示**: 这条测试需要 mock provider 才能离线跑. **实际编写时, 先看 agentRunner.mockScenarios.spec.ts 怎么 mock provider, 借鉴它的模式.** 如果项目没有现成的 mock provider 注入点, 就在 AiService.stream 里加一个 `__testProvider` 私有 slot (生产代码用 `config.ai` 注入, 测试代码直接 mock).

- [ ] **Step 2: 实际编写完整测试 (基于项目 mock 模式)**

(此步骤需根据项目既有 mock 模式细化, 上面是骨架. 真正可跑的测试代码需要先 review `agentRunner.mockScenarios.spec.ts` 然后仿写.)

- [ ] **Step 3: 跑测试, 期待通过**

```bash
cd backend && npx jest src/ai/agentTemplateGeneration.spec.ts -t "pipeline stage" --no-coverage
```

预期: 1+ 个测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/agentTemplateGeneration.spec.ts
git commit -m "test(backend): verify pipeline_stage_start/end events emitted through SSE"
```

---

## Phase D: 前端 envelope 解析 + 订阅口

### Task 11: 前端 envelope parser 模块 (T15, T16, T17)

**Files:**

- Create: `src/ai/core/providers/backendProxy.provider.events.ts`
- Create: `src/ai/core/providers/backendProxy.provider.events.spec.ts`

- [ ] **Step 1: 写 parser 模块**

```typescript
// src/ai/core/providers/backendProxy.provider.events.ts
import { SSE_EVENT_SCHEMA_VERSION, type SseEventEnvelope, type SseEventType } from '@shared/agent/contracts/sseEvents';

export {
  SSE_EVENT_SCHEMA_VERSION,
  type SseEventEnvelope,
  type SseEventType,
  NEW_STRUCTURED_SSE_EVENT_TYPES,
} from '@shared/agent/contracts/sseEvents';

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'text_delta',
  'tool_call',
  'done',
  'error',
  'tool_start',
  'tool_done',
  'tool_error',
  'reasoning_delta',
  'pipeline_stage_start',
  'pipeline_stage_end',
  'usage_summary',
  'clarification',
]);

export type ParsedSseEvent =
  | { ok: true; envelope: SseEventEnvelope<SseEventType, unknown> }
  | { ok: false; reason: string };

export function parseSseEnvelope(raw: string): ParsedSseEvent {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `parse failed: ${(e as Error).message}` };
  }
  if (obj?.schema !== SSE_EVENT_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported schema: ${obj?.schema}` };
  }
  if (typeof obj.type !== 'string' || !KNOWN_EVENT_TYPES.has(obj.type)) {
    return { ok: false, reason: `unknown type: ${obj?.type}` };
  }
  return { ok: true, envelope: obj as SseEventEnvelope<SseEventType, unknown> };
}
```

- [ ] **Step 2: 写测试 (T15-T17)**

```typescript
// src/ai/core/providers/backendProxy.provider.events.spec.ts
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';
import { parseSseEnvelope } from './backendProxy.provider.events';

describe('parseSseEnvelope', () => {
  it('returns ok envelope for valid sse.v1 envelope (T15)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'tool_start',
      ts: '2026-06-09T00:00:00.000Z',
      payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
    });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.type).toBe('tool_start');
      expect(result.envelope.payload).toEqual({ name: 'foo', ts: '2026-06-09T00:00:00.000Z' });
    }
  });

  it('rejects non-matching schema (T16)', () => {
    const raw = JSON.stringify({ schema: 'sse.v0', type: 'text_delta', payload: {} });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unsupported schema');
    }
  });

  it('rejects unknown type (T17)', () => {
    const raw = JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'unknown_thing',
      payload: {},
    });
    const result = parseSseEnvelope(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unknown type');
    }
  });

  it('rejects non-JSON input (T16 衍生)', () => {
    const result = parseSseEnvelope('not json {');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('parse failed');
    }
  });
});
```

- [ ] **Step 3: 跑测试, 期待全过**

```bash
cd <root> && npx jest src/ai/core/providers/backendProxy.provider.events.spec.ts --no-coverage
```

预期: 4 个测试全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/ai/core/providers/backendProxy.provider.events.ts src/ai/core/providers/backendProxy.provider.events.spec.ts
git commit -m "feat(frontend): add SSE envelope parser with type validation"
```

---

### Task 12: `BackendProxyProvider` 拆 envelope + `onStructuredEvent` 订阅口 (T18, T19)

**Files:**

- Modify: `src/ai/core/providers/backendProxy.provider.ts:24-184`

- [ ] **Step 1: 加 `onStructuredEvent` 构造参数**

修改 `src/ai/core/providers/backendProxy.provider.ts:38-44` (constructor):

把:

```typescript
  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }
```

改为:

```typescript
  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
    private readonly onStructuredEvent?: (e: SseEventEnvelope<SseEventType, unknown>) => void,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }
```

并在文件顶部加 import:

```typescript
import {
  NEW_STRUCTURED_SSE_EVENT_TYPES,
  parseSseEnvelope,
  type SseEventEnvelope,
  type SseEventType,
} from './backendProxy.provider.events';
```

- [ ] **Step 2: 改 stream() 解析路径, 拆 envelope**

修改 `src/ai/core/providers/backendProxy.provider.ts:146-167` (try { for await ... }):

把:

```typescript
try {
  for await (const streamEvent of events) {
    // cancel() 会从其他方法修改 this.aborted，TS 无法识别跨方法变更。
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.aborted) {
      break;
    }
    try {
      const event = JSON.parse(streamEvent.data) as ProviderStreamEvent;
      if (event.type === 'done') {
        // 如果 done 事件包含 response ID，则记录下来；provider 可能把它放在 usage metadata 中。
        if (hasResponseId(event)) {
          this.previousResponseIdsByConversation.set(conversationId, event.response_id);
        }
        yield event;
        return;
      }
      yield event;
    } catch {
      // 跳过格式异常的行。
    }
  }
} catch (err) {
  // cancel() 会跨方法修改 this.aborted；TS 只能看到当前方法体。
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!this.aborted && !abortController.signal.aborted) {
    throw err;
  }
} finally {
  clearAbortController();
}
```

改为:

```typescript
try {
  for await (const streamEvent of events) {
    // cancel() 会从其他方法修改 this.aborted，TS 无法识别跨方法变更。
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.aborted) {
      break;
    }
    const parsed = parseSseEnvelope(streamEvent.data);
    if (!parsed.ok) {
      // 静默 skip + console.warn, 不断流
      // eslint-disable-next-line no-console
      console.warn(`[SSE] skip envelope: ${parsed.reason}`);
      continue;
    }
    const envelope = parsed.envelope;
    if (NEW_STRUCTURED_SSE_EVENT_TYPES.has(envelope.type)) {
      // 新类型: 调 onStructuredEvent 订阅口 + console.log
      this.onStructuredEvent?.(envelope);
      // eslint-disable-next-line no-console
      console.log('[SSE]', envelope.type, envelope.payload);
      continue;
    }
    // 老类型: 拆 envelope, 转回原 ProviderStreamEvent 形状 yield 出去
    const legacy = convertEnvelopeToLegacyProviderEvent(envelope);
    if (legacy === null) {
      // eslint-disable-next-line no-console
      console.warn(`[SSE] cannot convert envelope type: ${envelope.type}`);
      continue;
    }
    if (legacy.type === 'done') {
      if (hasResponseId(legacy)) {
        this.previousResponseIdsByConversation.set(conversationId, legacy.response_id);
      }
      yield legacy;
      return;
    }
    yield legacy;
  }
} catch (err) {
  // cancel() 会跨方法修改 this.aborted；TS 只能看到当前方法体。
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!this.aborted && !abortController.signal.aborted) {
    throw err;
  }
} finally {
  clearAbortController();
}
```

并在文件末尾 (hasResponseId 函数前) 加:

```typescript
function convertEnvelopeToLegacyProviderEvent(e: SseEventEnvelope<SseEventType, any>): ProviderStreamEvent | null {
  switch (e.type) {
    case 'text_delta':
      return { type: 'text_delta', text: e.payload.text };
    case 'tool_call':
      return {
        type: 'tool_call',
        id: e.payload.id,
        name: e.payload.name,
        arguments: e.payload.arguments,
      };
    case 'done':
      return {
        type: 'done',
        usage: e.payload.usage,
        stopReason: e.payload.stopReason,
        response_id: e.payload.response_id,
        reasoningContent: e.payload.reasoningContent,
      };
    case 'error':
      return { type: 'error', message: e.payload.message };
    default:
      return null; // 新类型不转换
  }
}
```

- [ ] **Step 3: 写测试 (T18)**

新建 `src/ai/core/providers/backendProxy.provider.spec.ts` (如果不存在):

```typescript
// src/ai/core/providers/backendProxy.provider.spec.ts
import { BackendProxyProvider } from './backendProxy.provider';
import { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';

// Mock HttpClient to inject raw SSE stream
function createMockHttpClient(rawDataLines: string[]) {
  return {
    stream: jest.fn().mockResolvedValue({
      response: { ok: true, status: 200, headers: new Map() } as any,
      events: (async function* () {
        for (const data of rawDataLines) {
          yield { data };
        }
      })(),
    }),
  };
}

describe('BackendProxyProvider envelope handling', () => {
  it('calls onStructuredEvent handler for tool_start envelope and logs to console (T18)', async () => {
    const onStructuredEvent = jest.fn();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const httpClient = createMockHttpClient([
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'tool_start',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
      }),
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'done',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { stopReason: 'end_turn' },
      }),
    ]);
    const provider = new BackendProxyProvider(() => 'test-token', undefined, httpClient as any, onStructuredEvent);
    const events: any[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }
    expect(onStructuredEvent).toHaveBeenCalledTimes(1);
    expect(onStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_start', payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' } }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith('[SSE]', 'tool_start', expect.any(Object));
    // 老类型 'done' 仍被 yield 出去, 形状是 ProviderStreamEvent
    const doneEv = events.find((e) => e.type === 'done');
    expect(doneEv).toEqual({
      type: 'done',
      usage: undefined,
      stopReason: 'end_turn',
      response_id: undefined,
      reasoningContent: undefined,
    });
    consoleLogSpy.mockRestore();
  });

  it('yields legacy ProviderStreamEvent shape for old types (text_delta, done, error) (T19)', async () => {
    const onStructuredEvent = jest.fn();
    const httpClient = createMockHttpClient([
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'text_delta',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { text: 'hello' },
      }),
      JSON.stringify({
        schema: SSE_EVENT_SCHEMA_VERSION,
        type: 'done',
        ts: '2026-06-09T00:00:00.000Z',
        payload: { stopReason: 'end_turn' },
      }),
    ]);
    const provider = new BackendProxyProvider(() => 'test-token', undefined, httpClient as any, onStructuredEvent);
    const events: any[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }
    expect(events).toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'done', usage: undefined, stopReason: 'end_turn', response_id: undefined, reasoningContent: undefined },
    ]);
    expect(onStructuredEvent).not.toHaveBeenCalled();
  });

  it('skips invalid envelope without yielding (T16 衍生)', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const httpClient = createMockHttpClient([
      'not json {',
      JSON.stringify({ schema: 'sse.v0', type: 'text_delta', payload: {} }),
    ]);
    const provider = new BackendProxyProvider(() => 'test-token', undefined, httpClient as any);
    const events: any[] = [];
    for await (const ev of provider.stream({ model: 'm', messages: [] })) {
      events.push(ev);
    }
    expect(events).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
```

- [ ] **Step 4: 跑测试, 期待全过**

```bash
npx jest src/ai/core/providers/backendProxy.provider.spec.ts --no-coverage
```

预期: 3 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ai/core/providers/backendProxy.provider.ts src/ai/core/providers/backendProxy.provider.spec.ts
git commit -m "feat(frontend): parse SSE envelope in BackendProxyProvider; add onStructuredEvent subscription"
```

---

## Phase E: 前端 E2E (Playwright)

### Task 13: 测试用页面 `sse-consumer`

**Files:**

- Create: `src/app/test/sse-consumer/page.tsx`

- [ ] **Step 1: 写测试页面**

```tsx
// src/app/test/sse-consumer/page.tsx
'use client';

import { useEffect } from 'react';
import { BackendProxyProvider } from '@/ai/core/providers/backendProxy.provider';
import type { SseEventEnvelope, SseEventType } from '@shared/agent/contracts/sseEvents';

declare global {
  interface Window {
    __sseReceived: Array<SseEventEnvelope<SseEventType, unknown>>;
    __startSseTest: () => void;
  }
}

export default function SseConsumerPage() {
  useEffect(() => {
    window.__sseReceived = [];

    const provider = new BackendProxyProvider(
      () => 'test-token-bypass',
      undefined,
      undefined,
      (envelope) => {
        window.__sseReceived.push(envelope);
      },
    );

    window.__startSseTest = () => {
      // 触发一次 stream (实际 E2E 用 page.route 拦截返 mock SSE)
      void (async () => {
        const events: any[] = [];
        for await (const ev of provider.stream({
          model: 'm',
          messages: [{ role: 'user', content: 'test' }],
        })) {
          events.push(ev);
        }
        window.__sseFinished = events;
      })();
    };
  }, []);

  return (
    <div>
      <h1>SSE Consumer Test Page</h1>
      <p>Open console and run window.__startSseTest() to start.</p>
    </div>
  );
}
```

- [ ] **Step 2: 验证 Next.js 编译能跑**

```bash
pnpm dev
```

打开 `http://localhost:3000/test/sse-consumer`, 确认页面加载无错误。

- [ ] **Step 3: 验证后停掉 dev server**

按 Ctrl+C 停 dev server (Background 的话用 TaskStop).

- [ ] **Step 4: Commit**

```bash
git add src/app/test/sse-consumer/page.tsx
git commit -m "test(frontend): add SSE consumer test page for E2E"
```

---

### Task 14: Playwright E2E 测试 (T20, T21)

**Files:**

- Create: `backend/test/e2e/sse-envelope.spec.ts`
- Create: `backend/test/e2e/playwright.config.ts` (如果没有)

- [ ] **Step 1: 检查项目是否已有 Playwright 配置**

```bash
ls backend/test/e2e/ 2>/dev/null || ls backend/test/ 2>/dev/null
```

如果有现成 `playwright.config.ts`, 跳到 Step 3.

- [ ] **Step 2: 安装 Playwright (如果没有)**

```bash
cd backend && pnpm add -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: 写 E2E 测试**

```typescript
// backend/test/e2e/sse-envelope.spec.ts
import { test, expect } from '@playwright/test';

test.describe('SSE envelope E2E', () => {
  test('BackendProxyProvider receives tool_start and clarification envelopes via page.route mock (T20)', async ({
    page,
  }) => {
    // 拦截 /api/proxy/ai/editor, 返回固定 SSE 串
    await page.route('**/api/proxy/ai/editor', async (route) => {
      const sseBody = [
        `data: ${JSON.stringify({
          schema: 'sse.v1',
          type: 'tool_start',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { name: 'foo', ts: '2026-06-09T00:00:00.000Z' },
        })}\n\n`,
        `data: ${JSON.stringify({
          schema: 'sse.v1',
          type: 'text_delta',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { text: 'hi' },
        })}\n\n`,
        `data: ${JSON.stringify({
          schema: 'sse.v1',
          type: 'clarification',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { question: 'which?', options: [{ label: 'A', value: 'a' }] },
        })}\n\n`,
        `data: ${JSON.stringify({
          schema: 'sse.v1',
          type: 'done',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { stopReason: 'end_turn' },
        })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
        body: sseBody,
      });
    });

    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto('http://localhost:3000/test/sse-consumer');
    await page.evaluate(() => window.__startSseTest());

    // 等待 __sseReceived 收到 3 个 envelope (tool_start, text_delta 走老类型不算, clarification)
    await page.waitForFunction(() => (window.__sseReceived?.length ?? 0) >= 2, { timeout: 5_000 });

    const received = await page.evaluate(() => window.__sseReceived);
    expect(received.map((e: any) => e.type)).toContain('tool_start');
    expect(received.map((e: any) => e.type)).toContain('clarification');

    // console 应有 [SSE] tool_start 日志
    expect(consoleMessages.some((m) => m.includes('[SSE]') && m.includes('tool_start'))).toBe(true);
  });

  test('real backend end-to-end (T21) — requires dev server running', async ({ page }) => {
    // 此测试不 mock, 走真实 backend + Next.js dev.
    // 前提: pnpm dev 已在运行
    test.skip(!process.env.RUN_REAL_E2E, 'set RUN_REAL_E2E=1 to enable real backend E2E');
    if (!process.env.RUN_REAL_E2E) return;

    await page.goto('http://localhost:3000/test/sse-consumer');
    // 模拟一次带 JWT 的请求 (需要在测试环境登录拿 token)
    // ... 实际编写时根据项目 auth 流程补全 ...
  });
});
```

- [ ] **Step 4: 启动 dev server 并跑 E2E**

```bash
# 终端 1: 启动 backend
cd backend && pnpm dev

# 终端 2: 启动 frontend
pnpm dev

# 终端 3: 跑 E2E
cd backend && npx playwright test test/e2e/sse-envelope.spec.ts
```

预期: T20 通过. T21 默认 skip.

- [ ] **Step 5: 跑真实后端 E2E (T21)**

```bash
RUN_REAL_E2E=1 npx playwright test test/e2e/sse-envelope.spec.ts -t "real backend"
```

预期: T21 通过 (或在实施时按实际 auth 流程补全).

- [ ] **Step 6: Commit**

```bash
git add backend/test/e2e/sse-envelope.spec.ts backend/test/e2e/playwright.config.ts
git commit -m "test(backend): add Playwright E2E for SSE envelope flow"
```

---

## 收尾

### Task 15: 全栈测试 + lint

- [ ] **Step 1: 跑全 backend 测试**

```bash
cd backend && pnpm test
```

预期: 全部 PASS。

- [ ] **Step 2: 跑 frontend 测试**

```bash
npx jest src/ai/core/providers/ --no-coverage
```

预期: 全部 PASS。

- [ ] **Step 3: 跑 lint**

```bash
pnpm lint
```

预期: 无错误。

- [ ] **Step 4: 跑 build 验证类型**

```bash
pnpm build:backend
```

预期: 编译成功。

- [ ] **Step 5: 全部通过后, commit 一个空 marker (可选)**

```bash
git commit --allow-empty -m "chore: structured SSE phase 1 complete"
```

---

## 自检

按 spec 章节逐项核对:

| Spec 章节                                   | 实施任务                                                    |
| ------------------------------------------- | ----------------------------------------------------------- |
| §2.3 文件清单 (8 个文件)                    | 全部在 Task 1-14 中覆盖                                     |
| §3.1 共享类型                               | Task 1                                                      |
| §3.2 后端 envelope 序列化                   | Task 2, Task 3                                              |
| §3.3 前端 envelope 解析                     | Task 11                                                     |
| §3.4 BackendProxyProvider 改动              | Task 12                                                     |
| §4.1 编辑器流 (tool_start/done/error)       | Task 7 (emit 升级)                                          |
| §4.2 模板生成流 (reasoning + usage_summary) | Task 5, Task 6                                              |
| §4.3 Pipeline stage 回调                    | Task 8, Task 9                                              |
| §4.4 时序保证                               | 由 spec 保证, 测试覆盖 (Task 10, Task 14)                   |
| §5 错误处理 (envelope 降级)                 | Task 2 (trySerializeSseEvent), Task 12 (skip invalid)       |
| §6.2 T1-T4 序列化                           | Task 3                                                      |
| §6.2 T5-T10 service emit                    | Task 4-7                                                    |
| §6.2 T11-T14 pipeline                       | Task 8-10                                                   |
| §6.2 T15-T19 frontend                       | Task 11-12                                                  |
| §6.2 T20-T21 E2E                            | Task 14                                                     |
| §7 风险缓解 (类型循环, Provider 改造)       | Task 4-5 (Provider 改动显式), Task 1 (类型仅用 type 关键字) |
