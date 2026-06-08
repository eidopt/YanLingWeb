# 结构化 SSE 协议（Phase 1）— 设计 Spec

> **状态**: 设计待用户审阅
> **创建日期**: 2026-06-09
> **关联文档**: `docs/roadmap/next-steps-plan.md`（工作 ⑤）
> **目标**: 在不破坏现有 SSE 契约的前提下，为 AI 流式通信增加结构化事件（`tool_start` / `tool_done` / `reasoning_delta` / `pipeline_stage_*` / `clarification` / `usage_summary`），并提供前端订阅 API。

---

## 1. 背景与现状

### 1.1 当前 SSE 架构

| 层                       | 文件                                                                | 现状                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider 事件源**      | `backend/src/ai/core/providers/openaiCompatible.provider.ts:67-205` | 内部有 `reasoningBuffer`（DeepSeek `reasoning_content`）累积，但**只放在 `done.reasoningContent` 一并发出**                                                   |
| **Service 层**           | `backend/src/ai/ai.service.ts:206-260`                              | `runStream` / `runEditorStream` 走两套不同的 emit 函数（`emitStreamEvent` vs `emitEditorEvent`），事件 shape 也不一致                                         |
| **Service 层（编辑器）** | `backend/src/ai/ai.service.ts:355-398`                              | `QueryLoop` 的 `onTextDelta` / `onToolEvent` / `onError` 钩子已经有 `tool_start` / `tool_done` / `tool_error` 内部事件，**但只在内部用，没有通过 SSE 发出去** |
| **Controller**           | `backend/src/ai/ai.controller.ts:99-132, 157-194`                   | 维持 `data: <json>\n\n` 透传 + 5s `:heartbeat` 心跳                                                                                                           |
| **前端 Provider**        | `src/ai/core/providers/backendProxy.provider.ts:154-167`            | 只识别 `text_delta` / `tool_call` / `done` / `error` 四种，老类型直接 `JSON.parse` 后 yield 给上层 `QueryLoop`                                                |

### 1.2 现状的问题

| 问题                                                                                | 后果                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 后端 `tool_start` / `tool_done` 内部事件不发 SSE                                    | 编辑器 AI 调试时看不到 AI 在"思考"/"调工具"/"等响应"的阶段划分 |
| DeepSeek `reasoning_content` 一次性塞进 `done.reasoningContent`                     | 前端无法实时展示推理过程（典型 5-30s 全黑屏）                  |
| `pipeline_stage_*`（Designer / Critic / Schema / Verifier）只在 agent eval 内部存在 | 模板生成流式场景下，运维/调试无法看到多阶段重试过程            |
| 编辑器流和模板流事件 shape 不一致                                                   | 同一前端 BFF 需要写两套解析逻辑                                |
| 没有任何前端订阅 API 可观测 SSE                                                     | 调试必须开 DevTools Network Tab，无法在业务代码里观察          |

### 1.3 范围内 / 范围外

**Phase 1 范围内**（本 spec）:

- 6 类新结构化事件透传（5 类新增 + `usage_summary` 从 `done` 抽出）
- 双流覆盖（`/api/ai/stream` + `/api/ai/editor`）
- Envelope 包装（`{ schema, type, ts, payload }`）+ 共享类型
- 前端 `onStructuredEvent` 订阅口
- 单元测试 + Playwright E2E

**Phase 1 范围外**（明确不做）:

- 不改 `openaiCompatible.provider.ts` 的 `ProviderStreamEvent` 类型契约（联合类型**可加 `reasoning_delta` 新分支**，但老变体和 `done.reasoningContent` 聚合字段必须保留）
- 不改 `ProviderMessage` / `ProviderRequest` 类型
- 不改 `ProviderCapabilities` 既有字段（不新增 `emitsReasoningDelta` 之类标记，provider 自行决定是否 yield）
- 不引入异步流控 / back-pressure
- 不写 metrics / Sentry 上报
- 不在 E2E 测断连重连 / heartbeat
- 不替换 `QueryLoop` 内部事件传递机制

---

## 2. 架构概览

### 2.1 分层数据流

```
                        ┌─────────────────────────┐
   用户 ─prompt─→        │   前端 (Next.js)        │
                        │   BackendProxyProvider  │
                        └────────┬────────────────┘
                                 │ HTTP POST + SSE
                                 ▼
                        ┌─────────────────────────┐
                        │  AiController           │
                        │  (透传, 不变)            │
                        └────────┬────────────────┘
                                 │ Observable<StreamSseEvent>
                                 ▼
                        ┌─────────────────────────┐
                        │  AiService              │
                        │  emitSseEvent(type,p)   │  ← 新增
                        │  + 6 类事件生产点        │
                        └────────┬────────────────┘
                                 │ 调用 Provider / QueryLoop
                                 ▼
                        ┌─────────────────────────┐
                        │  AI Provider /          │
                        │  AiTemplatesModule      │
                        └─────────────────────────┘
```

### 2.2 关键原则

1. **Envelope 是单向数据**:BFF 出来什么样，前端拿什么样。后端不拆不拼。
2. **共享类型**: 9 个事件 type 全部在 `shared/agent/contracts/sseEvents.ts` 统一定义，前后端共享。
3. **零 controller 改动**: `ai.controller.ts` 一行不动，`event.data` 已是 envelope 字符串。
4. **运行时校验在 service 层**: envelope 序列化失败时降级为 `error` envelope（带 `schema_error: true`），**不断流**。
5. **上游 API 兼容**: `BackendProxyProvider` 内部拆 envelope 后转回原 `ProviderStreamEvent` 形状 yield，`QueryLoop` 调用者**完全不知道 envelope 存在**。

### 2.3 文件清单

| 文件                                                    | 性质               | 行数估计                         |
| ------------------------------------------------------- | ------------------ | -------------------------------- |
| `shared/agent/contracts/sseEvents.ts`                   | 新建               | ~80 行                           |
| `backend/src/ai/sse/sseEnvelope.ts`                     | 新建               | ~50 行                           |
| `backend/src/ai/sse/sseEnvelope.spec.ts`                | 新建               | ~150 行                          |
| `src/ai/core/providers/backendProxy.provider.events.ts` | 新建               | ~60 行                           |
| `backend/src/ai/ai.service.ts`                          | 改动               | +60 行（4 处 emit + 2 处新事件） |
| `src/ai/core/providers/backendProxy.provider.ts`        | 改动               | +40 行（envelope 解析 + 订阅口） |
| `src/app/test/sse-consumer/page.tsx`                    | 新建（仅测试用）   | ~50 行                           |
| `backend/test/e2e/sse-envelope.spec.ts`                 | 新建（Playwright） | ~120 行                          |

**总计**: ~610 行（其中测试 ~270 行，生产代码 ~340 行）

---

## 3. 核心组件

### 3.1 共享类型 `shared/agent/contracts/sseEvents.ts`

```typescript
export const SSE_EVENT_SCHEMA_VERSION = 'sse.v1' as const;

export type SseEventEnvelope<T extends SseEventType, P> = {
  schema: typeof SSE_EVENT_SCHEMA_VERSION;
  type: T;
  ts: string; // ISO 8601
  payload: P;
};

export type SseEventType =
  // 现有（保持兼容）
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
  error: { message: string; schema_error?: boolean; originalType?: string; truncated?: boolean };
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
```

### 3.2 后端 envelope 序列化 `backend/src/ai/sse/sseEnvelope.ts`

```typescript
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB, 远超正常事件大小

export function serializeSseEvent<T extends SseEventType>(type: T, payload: SseEventPayloadByType[T]): string {
  const envelope: SseEventEnvelope<T, typeof payload> = {
    schema: SSE_EVENT_SCHEMA_VERSION,
    type,
    ts: new Date().toISOString(),
    payload,
  };
  const json = JSON.stringify(envelope);
  if (json.length > MAX_PAYLOAD_BYTES) {
    return JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'error',
      ts: envelope.ts,
      payload: {
        message: `payload too large: ${json.length}B`,
        truncated: true,
        originalType: type,
      },
    });
  }
  return json;
}

export function trySerializeSseEvent(type: SseEventType, payload: unknown): string {
  try {
    return serializeSseEvent(type, payload as SseEventPayloadByType[typeof type]);
  } catch (e) {
    return JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type: 'error',
      ts: new Date().toISOString(),
      payload: {
        message: `envelope serialization failed: ${(e as Error).message}`,
        schema_error: true,
        originalType: type,
      },
    });
  }
}
```

### 3.3 前端 envelope 解析 `src/ai/core/providers/backendProxy.provider.events.ts`

```typescript
export type { SseEventEnvelope, SseEventType, SseEventPayloadByType } from '@shared/agent/contracts/sseEvents';
export { SSE_EVENT_SCHEMA_VERSION } from '@shared/agent/contracts/sseEvents';

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

export const NEW_STRUCTURED_EVENT_TYPES: ReadonlySet<SseEventType> = new Set([
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
  return { ok: true, envelope: obj };
}
```

### 3.4 `BackendProxyProvider` 改动

**新增构造参数**:

```typescript
constructor(
  getToken: () => string | null,
  onAuthExpired?: () => void,
  httpClient?: HttpClient,
  private readonly onStructuredEvent?: (e: SseEventEnvelope<SseEventType, unknown>) => void,
) { ... }
```

**解析路径** (替换原 `JSON.parse(streamEvent.data) as ProviderStreamEvent` 段):

```
raw streamEvent.data
  ↓
parseSseEnvelope(raw)
  ├── 失败: console.warn(reason), 跳过, 不 yield
  └── 成功: envelope.type
        ├── ∈ NEW_STRUCTURED_EVENT_TYPES:
        │     onStructuredEvent?.(envelope) + console.log('[SSE]', envelope.type, envelope.payload)
        └── ∈ 老类型 (text_delta / tool_call / done / error):
              拆 envelope, 转成原 ProviderStreamEvent 形状 yield 出去
```

**老类型映射** (在 Provider 内部 `convertEnvelopeToProviderEvent`):

```typescript
function convertEnvelopeToProviderEvent(e: SseEventEnvelope<SseEventType, any>): ProviderStreamEvent | null {
  switch (e.type) {
    case 'text_delta':
      return { type: 'text_delta', text: e.payload.text };
    case 'tool_call':
      return { type: 'tool_call', id: e.payload.id, name: e.payload.name, arguments: e.payload.arguments };
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

---

## 4. 数据流

### 4.1 编辑器流（`streamEditor` / `runStructuredEditorStream`）

```
用户发 prompt
  ↓
[前端] BackendProxyProvider.stream(request) → HTTP POST /api/ai/editor
  ↓
[后端] AiController.editorStream
  ↓ res.write('data: <envelope-json>\n\n')
  ↓
[后端] AiService.streamEditor → runStructuredEditorStream
  ↓ 内部循环:
  │   QueryLoop.onTextDelta(text)        → emitSseEvent('text_delta', { text })
  │   QueryLoop.onToolEvent({status:start})  → emitSseEvent('tool_start', { name, toolCallId, ts })
  │   QueryLoop.onToolEvent({status:done})   → emitSseEvent('tool_done', { name, toolCallId, durationMs })
  │   QueryLoop.onToolEvent({status:error})  → emitSseEvent('tool_error', { name, error })
  │   QueryLoop.onError(msg)             → emitSseEvent('error', { message })
  │   DeepSeek reasoning_content delta   → emitSseEvent('reasoning_delta', { delta })  [新增, 实时]
  │   clarification 检测到                → emitSseEvent('clarification', { question, options })
  │   QueryLoop.run 完成, 带 usage       → emitSseEvent('usage_summary', { model, usage })
  │                                      → emitSseEvent('done', { usage, stopReason, response_id })
  ↓
[前端] BackendProxyProvider 解析 envelope:
  │   - 老类型 → 转回 ProviderStreamEvent 形状 yield (QueryLoop 行为不变)
  │   - 新类型 → 调 onStructuredEvent(handler) + console.log
  ↓
[前端] 上层 QueryLoop / EditorAgent 收到原 ProviderStreamEvent
```

### 4.2 模板生成流（`stream` / `runStream`）

```
用户输入 prompt → 模板广场页
  ↓
[后端] AiController.streamProxy
  ↓
[后端] AiService.stream → runStream (走 Provider, 不走 QueryLoop)
  │   改 1: runStream 内对每条 ProviderStreamEvent 用 emitSseEvent 包装
  │          text_delta / tool_call / done / error 全部加 envelope
  │   改 2: DeepSeek reasoningBuffer 改为实时 yield reasoning_delta
  │          (需要从 OpenAICompatibleProvider 拿回调, 通过 options.onReasoningDelta)
  │   改 3: done 之前先发 usage_summary
  ↓
[后端] AiTemplatesModule.PipelineService
  │   改: 4 个 stage 开始/结束注入 pipeline_stage_start/end
  │   改: 通过 onPipelineStageEvent 回调传出
  │       (AiService.stream 增加 onPipelineStageEvent? 参数)
  ↓
[后端] AiController.streamProxy 调 service.stream 时传回调:
  (type, payload) => emitSseEvent(`pipeline_stage_${type}`, payload)
  ↓
[前端] BackendProxyProvider 收到 pipeline_stage_*, 与 editor 流共用解析路径
```

### 4.3 Pipeline stage 事件传递路径（关键设计点）

**问题**: `AiTemplatesModule.PipelineService` 与 `AiService.stream` 是不同模块，前者不直接接 SSE。

**方案**: 回调注入解耦。

```typescript
// ai.service.ts 新增
stream(
  ownerUserId: string,
  req: StreamRequest,
  cacheOptions?: ProviderCacheOptions,
  onPipelineStageEvent?: (
    phase: 'start' | 'end',
    payload: { stage: string; attempt: number; durationMs?: number; status?: 'ok' | 'failed'; error?: string }
  ) => void,
): Observable<StreamSseEvent> { ... }

// ai.controller.ts streamProxy 新增（就一行回调注入）
const subscription = this.aiService.stream(
  req.user.sub, body, cacheOptions,
  (phase, payload) => this.emitSseEvent(
    phase === 'start' ? 'pipeline_stage_start' : 'pipeline_stage_end',
    payload,
  ),
).subscribe(...)
```

### 4.4 时序保证

| 事件                       | 时序                                                     |
| -------------------------- | -------------------------------------------------------- |
| `pipeline_stage_start`     | 必须在该 stage 第一次 LLM 调用**之前**发出               |
| `pipeline_stage_end`       | 必须在该 stage 返回结果**之后**、下一个 `start` 之前发出 |
| `tool_start` / `tool_done` | 在 `QueryLoop` 钩子同步发出，无跨阶段问题                |
| `usage_summary`            | 在 `done` 之前发出（独立事件，避免一次大包）             |
| `reasoning_delta`          | 跟随 DeepSeek `reasoning_content` 增量，实时 yield       |
| `clarification`            | 早退事件，发出后**立刻**发 `done` 关闭流（保持现有行为） |

---

## 5. 错误处理

### 5.1 错误分类

| 错误类型                       | 触发场景                                                   | 处理策略                                                                                           |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **envelope 序列化失败**        | `JSON.stringify` 抛错（循环引用等）                        | 降级为 `error` envelope + `schema_error: true` payload，继续发流                                   |
| **payload 类型不匹配**         | service 误传 `text_delta` 类型但 payload 缺 `text` 字段    | 同样降级，截断到 1KB 放 `payload.original` 便于排错                                                |
| **envelope 解析失败（前端）**  | `parseSseEnvelope` 拿到非 JSON / schema 不匹配 / 未知 type | 返回 `{ ok: false, reason }`，**不 yield** 给上游；`console.warn`，不断流                          |
| **OpenAI Provider 内部异常**   | 现有 `runStream` catch 路径                                | 改为 `emitSseEvent('error', { message })` envelope，行为不变                                       |
| **编辑器流验证失败**           | `runStructuredEditorStream` 抛 `NotFoundException` 等      | 现有路径：被 `streamEditor` catch 转 envelope                                                      |
| **模板生成 pipeline 阶段失败** | SchemaGen 重试耗尽、Verifier 不通过                        | 现有的 `PipelineResult.error` 字段保留；发 `pipeline_stage_end` 带 `status: 'failed'`，再发 `done` |
| **断连 / 客户端 cancel**       | `req.on('close')` / `abortController.abort()`              | 现有路径，不停 heartbeat，`subscription.unsubscribe()`                                             |

### 5.2 错误降级原则

**不因为 envelope 出问题就关流**。这是核心原则 — 任何 envelope 层的错误必须降级为"继续发流 + 内部 console.error 记录"：

- 开发期能立即看到问题（console 红色）
- 用户不感知格式层 bug
- 上线后可通过远程 console 收集排查

### 5.3 Payload 大小保护

```typescript
const MAX_PAYLOAD_BYTES = 64 * 1024;

export function serializeSseEvent(type, payload) {
  const envelope = { schema, type, ts, payload };
  const json = JSON.stringify(envelope);
  if (json.length > MAX_PAYLOAD_BYTES) {
    return JSON.stringify({
      schema,
      type: 'error',
      ts,
      payload: { message: `payload too large: ${json.length}B`, truncated: true, originalType: type },
    });
  }
  return json;
}
```

64KB 是参考值，远超正常事件大小（典型 `tool_call.arguments` < 1KB）。

### 5.4 心跳不受影响

现有 `startSseHeartbeat(res)`（5s 间隔 SSE 注释行）不经过 `serializeSseEvent`，**不参与 envelope**。心跳的 `:heartbeat\n\n` 是 SSE 规范注释，客户端不会解析 — 改 envelope 不会影响心跳工作。

---

## 6. 测试

### 6.1 测试策略

**核心思路**: 不引入新的独立测试基础设施，把所有 envelope 行为验证塞到既有的 spec / E2E 里：

- 单元测试在 `sseEnvelope.spec.ts` 集中测序列化层
- 行为集成在 `ai.controller.spec.ts` 既有用例里改断言
- E2E 行为在 `agentTemplateGeneration.spec.ts` 增 case
- 跨端全链路在 `backend/test/e2e/sse-envelope.spec.ts`（Playwright）

### 6.2 TDD 任务清单（红 → 绿 → 重构）

#### Phase A: Envelope 序列化层（独立可测）

```
T1.  [红] sseEnvelope.spec.ts: serializeSseEvent('text_delta', {text:'hi'})
       → 返回 '{"schema":"sse.v1","type":"text_delta","ts":"...","payload":{"text":"hi"}}'
T2.  [红] trySerializeSseEvent 在 payload 缺字段时降级为 error envelope (含 schema_error:true)
T3.  [红] serializeSseEvent 在 payload 超 64KB 时降级为 error envelope (含 truncated:true)
T4.  [红] serializeSseEvent 接受所有 12 个 SseEventType 字符串字面量（类型守卫测）
```

#### Phase B: Service 层 emit 升级

```
T5.  [红] 改 ai.service.ts runStream: emitStreamEvent 不再调, 改用 emitSseEvent('text_delta', ...)
       → ai.controller.spec.ts 既有 streamProxy case 失败（原本 JSON 是 {type:'text'}, 现在带 envelope）
T6.  [绿] 改回 streamProxy case 的断言, 改用 parseSseEnvelope
T7.  [红] 给 `shared/agent/contracts/provider.ts` 的 `ProviderStreamEvent` 联合添加 `reasoning_delta` 变体 `{ type: 'reasoning_delta'; text: string }`；改 `openaiCompatible.provider.ts:138-141`：除了累加 `reasoningBuffer`，每收到一个 reasoning chunk 就 `yield { type: 'reasoning_delta', text: delta }`；改 `runStream` / `runStructuredEditorStream` 把 `reasoning_delta` ProviderStreamEvent 包 envelope
T8.  [绿] reasoning_delta 在 SSE 串里能被 controller spec 拆到
T9.  [红] usage_summary: runStream 在 done 之前先发 usage_summary
T10. [绿] controller spec 验证 done 之前一条是 usage_summary
```

#### Phase C: Pipeline stage 事件注入

```
T11. [红] agentTemplateGeneration.spec.ts: 新增 case "emits pipeline_stage_start/end"
       → 第一版会失败，因为 AiTemplatesModule.PipelineService 还没暴露阶段事件
T12. [绿] AiService.stream 增加 onPipelineStageEvent 回调参数
T13. [绿] AiController.streamProxy 在调用 service.stream 时传回调，回调内 emitSseEvent
T14. [绿] agentTemplateGeneration.spec.ts 通过
```

#### Phase D: 前端 envelope 解析 + 订阅口

```
T15. [红] 新建 src/ai/core/providers/backendProxy.provider.events.spec.ts:
       parseSseEnvelope('{"schema":"sse.v1","type":"tool_start","payload":{...}}')
       → { ok:true, envelope:{...} }
T16. [红] parseSseEnvelope 拿 schema 不匹配的 raw → { ok:false, reason }
T17. [红] parseSseEnvelope 拿未知 type → { ok:false, reason }
T18. [绿] BackendProxyProvider 加 onStructuredEvent 构造参数; onStructuredEvent handler
       在收到 tool_start envelope 时被调用 1 次, console.log 输出事件
T19. [绿] 老类型 text_delta / tool_call / done / error 在 BackendProxyProvider 内部拆 envelope
       后, 转回原 ProviderStreamEvent 形状 yield 出去 — 上游 queryLoop 调用者行为不变
       (这条测用现有 queryLoop 的 mock 验证)
```

#### Phase E: 前端 E2E（backend/test/e2e, Playwright）

```
T20. [红] 新建 backend/test/e2e/sse-envelope.spec.ts:
       启动 Next.js dev (port 3000) 与 backend dev (port 4000)
       Playwright page.route 拦截 /api/proxy/ai/editor, 返回固定 SSE 串
       (含 envelope 的 tool_start/text_delta/done/clarification 4 种事件)
       → 打开带订阅 handler 的测试页 /test/sse-consumer
       → 断言 page.on('console') 收到 "tool_start" 等日志
       → 断言 window.__sseReceived 含 4 个 envelope, 顺序正确
T21. [绿] 去掉 page.route mock, 真实后端跑通一次, console 输出确认
```

**T20 配套**: 新建 `src/app/test/sse-consumer/page.tsx`（仅测试用，生产构建排除），挂上 `onStructuredEvent` handler 后把收到的 envelope 写入 `window.__sseReceived`。

### 6.3 验收清单

- [ ] `serializeSseEvent` 单元测试全过（T1-T4）
- [ ] controller spec 中 envelope 透传路径正确（T5-T6, T8, T10）
- [ ] E2E pipeline_stage 事件正确发出（T11-T14）
- [ ] 前端 `parseSseEnvelope` 正确解析 + 拒绝非法输入（T15-T17）
- [ ] `BackendProxyProvider.onStructuredEvent` 订阅口工作（T18-T19）
- [ ] Playwright E2E `sse-envelope.spec.ts` 在 mock 后端下通过（T20）
- [ ] Playwright E2E 在真实后端下通过，console 输出确认（T21）

---

## 7. 风险与缓解

| 风险                                                                                | 影响                                      | 缓解策略                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope 改造引入 TypeScript 类型循环引用（shared 包被 backend 和 frontend 同时引） | 构建失败                                  | shared/agent/contracts/sseEvents.ts 严格只用 `type` 关键字 + 原始类型，不 import 任何 backend/frontend 模块                                                                                                                               |
| OpenAICompatibleProvider 实时 yield reasoning_delta 破坏其他 provider               | 现有 OpenAI provider 不发 reasoning_delta | `ProviderStreamEvent` 联合加 `reasoning_delta` 变体（向后兼容，老消费者不消费新分支即可）；只 `openaiCompatible` provider 实时 yield；OpenAI provider 不发此事件；`done.reasoningContent` 仍保留作为聚合兜底（取 `reasoningBuffer` 末值） |
| 现有 queryLoop 收到新事件 type 报错                                                 | 上层 `QueryLoop` 不识别                   | `ProviderStreamEvent` 类型不变（仅加分支）；envelope 在 `BackendProxyProvider` 内部拆，老类型映射回去；新类型仅通过 `onStructuredEvent` 订阅口流出                                                                                        |
| PipelineService 内部 try/catch 吞掉 stage 事件回调异常                              | 测试偶发失败                              | onPipelineStageEvent 回调内 try/catch，错误走 logger.warn                                                                                                                                                                                 |
| Playwright 启动 Next.js dev 太慢（>30s）                                            | E2E 卡死                                  | `webServer` 配置 `timeout: 60_000, reuseExistingServer: true`；先手动启动 dev 再跑测试                                                                                                                                                    |

---

## 8. 后续 Phase（不在本 spec 范围）

- **Phase 2**: 改造 `QueryLoop` 内部事件传递为 envelope 形状（消除 service 双套 emit）
- **Phase 3**: Sentry breadcrumb 上报 + 远程 metrics 端点
- **Phase 4**: 客户端断连重连 + heartbeat 协议扩展（`:heartbeat\n\n` 加 payload）
- **Phase 5**: 流式 JSON Patch 事件（编辑器画布直接消费，不走 tool_call）

---

_本 spec 将随实现进展持续更新。每完成一个 Phase 后在验收清单勾选。_
