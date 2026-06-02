# 言灵项目开发路线图 (Roadmap)

> **版本**: v1.0  
> **创建日期**: 2026-06-03  
> **基准分支**: main  
> **前置文档**: `.workbuddy/KNOWLEDGE_BASE.md`, `docs/agent-low-code-generation-plan.md`, `reports/03-code-framework-defects-progress.md`

---

## 总览

言灵项目当前已具备完整的 AI 编辑器、模板生成流水线、站点发布和源码导出能力。但在**多模型兼容、缓存策略、流式协议、Pipeline 成功率**四个维度存在系统性短板，直接制约产品稳定性和运营成本。

本路线图按优先级分为 **3 个阶段**，聚焦 8 个核心课题，每个课题包含：问题定位、根因分析、解决思路、关键设计、验收标准。

### 阶段全景

| 阶段              | 周期    | 核心课题                                                                             | 目标                                                            |
| ----------------- | ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Phase 1: 基石** | W1-W5   | P0-1 多模型统一适配层<br>P0-2 缓存策略抽象与稳定化<br>P0-3 结构化 SSE 协议           | 消除模型锁定，缓存命中率 >60%，前端可感知 AI 执行进度           |
| **Phase 2: 夯实** | W6-W10  | P1-1 Pipeline 成功率提升<br>P1-2 上下文管理与前缀稳定性<br>P1-3 Agent 断点续传与撤销 | Pipeline 一次通过率 >70%，compaction 不破坏缓存，编辑操作可撤销 |
| **Phase 3: 进阶** | W11-W16 | P2-1 Agent 评测体系<br>P2-2 语义编译器扩展                                           | 自动化回归覆盖核心场景，语义工具覆盖 90% 编辑意图               |

---

## Phase 1: 基石 (W1-W5)

> 目标：消除 DeepSeek 硬编码依赖，任何模型切换后系统可正常运行且缓存命中率不低于 60%。

---

### P0-1: 多模型统一适配层

**优先级**: P0（最高）  
**预估工期**: 3 周  
**负责模块**: `backend/src/ai/core/providers/`, `backend/src/ai/ai.service.helpers.ts`

#### 1.1 问题定位

当前系统仅针对 DeepSeek 做了深度优化，切换到 GPT 或其他模型后出现第二轮对话错误。具体表现：

| 现象                         | 触发条件                                                   | 影响                       |
| ---------------------------- | ---------------------------------------------------------- | -------------------------- |
| GPT 第二轮对话返回 400/500   | 从 DeepSeek 切换到 GPT 后首次多轮对话                      | 用户无法使用 GPT           |
| `previous_response_id` 失效  | compaction 后 system prefix 变化                           | GPT 有状态缓存完全失效     |
| `reasoning_content` 交叉污染 | DeepSeek 对话历史包含 `reasoning_content` 字段，GPT 不识别 | 消息格式错误               |
| Compaction 模型硬编码        | `COMPACTION_MODEL = 'deepseek-v4-flash'`                   | 切换后 compaction 调用失败 |
| `developer` 角色语义丢失     | OpenAI-Compatible Provider 将 `developer` 映射为 `system`  | 提示词层级关系混乱         |

#### 1.2 根因分析

**根因 1: 双 Provider 协议不可逆转换**

```
OpenAI Provider (Responses API)          OpenAI-Compatible (Chat Completions)
┌─────────────────────────┐              ┌──────────────────────────┐
│ instructions (system)    │     ≠→      │ system role messages     │
│ function_call            │     ≠→      │ tool_calls array         │
│ function_call_output     │     ≠→      │ role: tool               │
│ previous_response_id    │     ≠→      │ (无对应概念)             │
│ store: true              │     ≠→      │ (无对应概念)             │
└─────────────────────────┘              └──────────────────────────┘
```

- `openai.provider.ts` 第 224-295 行：`system` → `instructions`，`tool_call` → `function_call`
- `openai-compatible.provider.ts` 第 206-284 行：`system`/`developer` → `system`，`tool_call` → `tool_calls[]`
- 两种格式在多条消息间来回转换时会**退化**：`developer` 角色信息在 Compatible 路径被合并进 `system`，再转回时无法还原

**根因 2: 缓存策略硬编码到 Provider 类型**

```typescript
// ai.service.helpers.ts 第 115-130 行
export function withRequestScopedCache(
  provider: AIProvider,
  req: StreamRequest,
  cacheOptions?: ProviderCacheOptions,
): StreamRequest {
  if (!(provider instanceof OpenAIProvider) || !cacheOptions?.previousResponseId) {
    return req; // 非 OpenAI 直接跳过，零缓存辅助
  }
  // ...
}
```

- `instanceof OpenAIProvider` 硬编码 → DeepSeek/Groq/Azure/国产模型永远拿不到缓存支持
- DeepSeek 的 Prefix Caching 是**被动的**（观察响应中的 `prompt_cache_hit_tokens`），系统不主动提供缓存提示

**根因 3: `reasoning_content` 跨模型污染**

```typescript
// openai-compatible.provider.ts 第 127-132 行
// DeepSeek: delta.reasoning_content 逐字流式
// 其他模型: 不存在此字段
// 但消息历史中 msg.reasoningContent 会被无条件传递给下一个 provider
```

- MiMo 强制要求回传 `reasoning_content`，否则 400 错误
- GPT 不认识 `reasoning_content`，包含此字段会触发消息格式验证失败
- MiniMax 有双模式推理输出（`reasoning_split` 参数控制）

**根因 4: Compaction 模型硬编码**

```typescript
// compact.ts 第 6 行
const COMPACTION_MODEL = 'deepseek-v4-flash';
```

- 切换主模型后 compaction 仍然调用 DeepSeek
- 后端 `provider-log-compaction.service.ts` 使用 `this.aiConfig.models.lite` 但配置可能不正确

#### 1.3 解决方案

**核心思路**: 引入 `ProviderCapabilities` 扩展 + `MessagePurifier` + `CacheStrategy` 三层抽象

##### 1.3.1 ProviderCapabilities 扩展

```typescript
interface ProviderCapabilities {
  // 现有字段
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsParallelToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoningEffort: boolean;
  supportsServerSideContext: boolean;

  // 新增字段
  reasoningMode: 'none' | 'passthrough' | 'required' | 'split';
  // none: GPT — 不支持推理内容
  // passthrough: DeepSeek — 有 reasoning_content 但不强制回传
  // required: MiMo — 必须回传，否则 400
  // split: MiniMax — reasoning_split 参数控制分离输出

  cacheStrategy: 'prefix' | 'response_id' | 'cache_control' | 'content_auto' | 'none';
  // prefix: DeepSeek — 自动前缀匹配
  // response_id: GPT — previous_response_id
  // cache_control: Qwen — cache_control 显式标记
  // content_auto: Kimi — 内容缓存自动命中
  // none: 无缓存支持

  requiresReasoningContentPassthrough: boolean; // MiMo 强制回传
  supportsDeveloperRole: boolean; // 是否保留 developer 角色语义
  toolCallFormat: 'function_call' | 'tool_calls'; // Responses API vs Chat Completions
  extraParams?: Record<string, unknown>; // 模型特有参数（如 Qwen 的 enable_thinking）
}
```

##### 1.3.2 MessagePurifier 消息净化器

```typescript
function purifyMessagesForModel(
  messages: ProviderMessage[],
  targetCapabilities: ProviderCapabilities,
): ProviderMessage[] {
  return messages.map((msg) => {
    const purified = { ...msg };

    // 1. reasoning_content 处理
    if (purified.reasoningContent) {
      if (targetCapabilities.reasoningMode === 'none') {
        // GPT: 完全移除
        delete purified.reasoningContent;
      } else if (targetCapabilities.reasoningMode === 'required') {
        // MiMo: 保留并确保回传
        // (已在流式处理中保留)
      }
      // passthrough/split: 保留
    }

    // 2. developer 角色处理
    if (purified.role === 'developer' && !targetCapabilities.supportsDeveloperRole) {
      purified.role = 'system';
      purified.content = `[Developer Instructions]\n${purified.content}`;
    }

    // 3. tool_call 格式转换已由各 Provider 内部处理

    return purified;
  });
}
```

##### 1.3.3 CacheStrategy 抽象接口

```typescript
interface CacheStrategy {
  type: string;

  // 请求前：注入缓存提示
  applyCacheHint(request: StreamRequest, context: CacheContext): StreamRequest;

  // 响应后：提取缓存标识
  extractCacheId(event: ProviderStreamEvent): string | null;

  // Compaction 后：决定是否清除缓存
  onCompaction(): CacheInvalidationDecision;
}

type CacheInvalidationDecision =
  | { action: 'clear' } // 前缀变化，必须清除
  | { action: 'preserve' } // 前缀未变，可保留
  | { action: 'rebuild' }; // 需要重建缓存上下文

// 实现类
class PrefixCacheStrategy implements CacheStrategy {
  /* DeepSeek */
}
class ResponseIdCacheStrategy implements CacheStrategy {
  /* GPT */
}
class CacheControlStrategy implements CacheStrategy {
  /* Qwen */
}
class ContentAutoCacheStrategy implements CacheStrategy {
  /* Kimi */
}
class NoCacheStrategy implements CacheStrategy {
  /* 无缓存模型 */
}
```

##### 1.3.4 具体国产模型适配

| 模型         | Provider 类      | reasoningMode | cacheStrategy   | 特殊处理                                              |
| ------------ | ---------------- | ------------- | --------------- | ----------------------------------------------------- |
| DeepSeek     | DeepSeekProvider | `passthrough` | `prefix`        | Prefix Caching 自动，观察 `prompt_cache_hit_tokens`   |
| GPT-4o/4.1   | OpenAIProvider   | `none`        | `response_id`   | Responses API，`previous_response_id` + `store: true` |
| MiMo         | MiMoProvider     | `required`    | `none`          | 强制回传 `reasoning_content`，否则 400                |
| MiniMax M2.7 | MiniMaxProvider  | `split`       | `none`          | `reasoning_split=True` 分离推理输出                   |
| Qwen         | QwenProvider     | `passthrough` | `cache_control` | `cache_control: {"type":"ephemeral"}` 标记，5min TTL  |
| Kimi         | KimiProvider     | `passthrough` | `content_auto`  | 自动内容缓存，无需显式标记                            |
| GLM          | GLMProvider      | `none`        | `none`          | `tool_stream` 流式参数                                |

#### 1.4 实施步骤

| 步骤 | 周次 | 任务                                                                        |
| ---- | ---- | --------------------------------------------------------------------------- |
| 1    | W1   | 定义 `ProviderCapabilities` 扩展接口，所有现有 Provider 声明能力            |
| 2    | W1   | 实现 `MessagePurifier.purifyMessagesForModel()`，覆盖 3 种 reasoning 模式   |
| 3    | W1   | 实现 `CacheStrategy` 接口及 5 个策略实现类                                  |
| 4    | W2   | 替换 `withRequestScopedCache()` 中的 `instanceof OpenAIProvider` 为策略模式 |
| 5    | W2   | 实现 `MiMoProvider` 和 `MiniMaxProvider`，集成 reasoning 处理               |
| 6    | W2   | 实现 `QwenProvider` 和 `KimenProvider`，集成缓存策略                        |
| 7    | W3   | 消除 `COMPACTION_MODEL` 硬编码，改为 `config.models.lite`                   |
| 8    | W3   | Compaction 后根据 `CacheStrategy.onCompaction()` 决定缓存清除策略           |
| 9    | W3   | 端到端测试：DeepSeek → GPT → DeepSeek 切换场景                              |

#### 1.5 验收标准

- [ ] 切换模型后连续 5 轮对话无错误（DeepSeek ↔ GPT ↔ MiMo）
- [ ] `reasoning_content` 不跨模型污染（GPT 请求中不含此字段）
- [ ] Compaction 模型跟随主模型配置，不再硬编码
- [ ] 每个 Provider 声明完整的 `ProviderCapabilities`
- [ ] 缓存命中率在 DeepSeek 上 ≥ 60%（多轮对话 3 轮后）
- [ ] GPT `previous_response_id` 在 compaction 前有效，compaction 后主动清除
- [ ] MiMo 强制回传 `reasoning_content` 场景通过测试

---

### P0-2: 缓存策略抽象与稳定化

**优先级**: P0  
**预估工期**: 2 周（与 P0-1 重叠 W2-W3）  
**负责模块**: `src/ai/core/compact/`, `backend/src/ai/services/provider-log-compaction.service.ts`

#### 2.1 问题定位

当前缓存机制存在两大问题：**compaction 破坏缓存**和**缓存策略不透明**。

| 现象                           | 触发条件                    | 影响                             |
| ------------------------------ | --------------------------- | -------------------------------- |
| Prefix Caching 命中率暴跌      | 任何 compact 操作           | DeepSeek 缓存从 ~80% 降至 ~10%   |
| `previous_response_id` 失效    | compaction 修改 system 消息 | GPT 有状态缓存完全失效           |
| 缓存统计不可见                 | 前端仅显示总命中率          | 无法诊断具体哪轮对话缓存失败     |
| 后端 Provider Log 折叠破坏前缀 | 日志超过 500K token         | 折叠后消息结构剧变，缓存全部失效 |

#### 2.2 根因分析

**根因 1: 前端 compact 直接修改 system 消息**

```typescript
// compact.ts 第 97-105 行
// applyCompaction 将摘要追加到最后一条 system 消息
const lastSystemMsgIdx = messages.findLastIndex((m) => m.role === 'system');
if (lastSystemMsgIdx >= 0) {
  messages[lastSystemMsgIdx].content += '\n\n' + summary;
}
```

- 修改 system 消息内容 → 前缀完全改变 → Prefix Caching 失效
- 注释承认了这一点："NOTE on prefix caching: Appending to the system message DOES change the message content, which invalidates the prefix cache"

**根因 2: 后端 Provider Log 折叠替换消息**

```typescript
// provider-log-compaction.service.ts 第 66-73 行
// 折叠将消息头部替换为单条摘要消息
const foldedMessages: ProviderMessage[] = [
  { role: 'assistant', content: PROVIDER_LOG_FOLD_MARKER + summary },
  ...tailMessages,
];
```

- 原始消息被替换为摘要消息 → 消息序列完全不同 → 缓存全部失效
- 折叠边界在 "user-turn" 处，随对话长度变化而移动 → 边界不稳定

**根因 3: `microCompact` 虽轻量但仍影响特定消息**

```typescript
// microCompact.ts 第 3-6 行
const DEFAULT_KEEP_RECENT = 6;
const LARGE_RESULT_THRESHOLD = 1000;
const TRUNCATE_HEAD = 200;
const TRUNCATE_TAIL = 80;
```

- 截断大型 tool_result 内容 → 该条消息内容变化 → 对应缓存行失效
- 但不会破坏整个前缀，影响范围较小

#### 2.3 解决方案

**核心思路**: 分离 Stable Prefix 与 Volatile Context，compact 只影响 volatile 部分

##### 2.3.1 消息结构重组

```
当前消息结构：
[system, system(+compact摘要), ...conversation, user]

优化后消息结构：
[system(stable), system(volatile_slot), ...conversation, user]
                              ↑ compact 只改这个 slot
```

具体实现：

```typescript
// 新增 VolatileContextSlot
interface CompactSafeMessages {
  // 稳定前缀：组件目录 + 设计规则（永不修改）
  stablePrefix: ProviderMessage[];

  // 可变插槽：compact 摘要写入此处（可整体替换）
  volatileSlot: ProviderMessage;

  // 对话历史 + 用户消息
  conversation: ProviderMessage[];
}

function applyCompactionSafe(messages: ProviderMessage[], summary: string): ProviderMessage[] {
  const [stableMsg, ...rest] = messages;

  return [
    stableMsg, // system: 不变
    { role: 'system', content: `[Context Summary]\n${summary}` }, // 替换 volatile slot
    ...rest.slice(1), // 其余不变
  ];
}
```

##### 2.3.2 后端 Provider Log 折叠优化

```typescript
// 优化策略：折叠时保持前缀稳定
function foldProviderLogSafe(
  messages: ProviderMessage[],
  summary: string,
  tailMessages: ProviderMessage[],
): ProviderMessage[] {
  // 不替换原始消息，而是在折叠边界插入一条 "checkpoint" 消息
  return [
    ...messages.slice(0, foldBoundary), // 保留原始前缀
    { role: 'user', content: `[History checkpoint]\n${summary}` },
    { role: 'assistant', content: 'Understood. I will continue from this checkpoint.' },
    ...tailMessages,
  ];
}
```

##### 2.3.3 缓存感知的 Compaction 决策

```typescript
interface CompactionDecision {
  shouldCompact: boolean;
  strategy: 'full' | 'micro' | 'skip';
  preservePrefix: boolean;
  cacheImpact: 'none' | 'partial' | 'full_invalidation';
}

function decideCompaction(
  currentTokenCount: number,
  maxTokens: number,
  cacheStrategy: CacheStrategy,
  recentCacheHitRate: number,
): CompactionDecision {
  // 如果缓存命中率 > 70%，延迟 compact
  if (recentCacheHitRate > 0.7 && currentTokenCount < maxTokens * 1.2) {
    return { shouldCompact: false, strategy: 'skip', preservePrefix: true, cacheImpact: 'none' };
  }

  // 如果只是轻微超限，用 microCompact
  if (currentTokenCount < maxTokens * 1.5) {
    return { shouldCompact: true, strategy: 'micro', preservePrefix: true, cacheImpact: 'partial' };
  }

  // 严重超限，执行 full compact 但保持前缀
  return { shouldCompact: true, strategy: 'full', preservePrefix: true, cacheImpact: 'full_invalidation' };
}
```

##### 2.3.4 缓存可观测性增强

```typescript
interface CacheDiagnosticReport {
  timestamp: string;
  provider: string;
  strategy: string;

  // 请求级
  requestPrefixHash: string; // 前缀哈希（用于诊断前缀变化）
  messageCount: number;
  totalInputTokens: number;

  // 响应级
  cacheHitTokens: number;
  cacheMissTokens: number;
  hitRate: string; // "65.3%"

  // Compaction 影响
  lastCompactionAt: string | null;
  compactionStrategy: 'full' | 'micro' | 'skip' | null;
  prefixChanged: boolean; // compaction 后前缀是否变化
}
```

#### 2.4 实施步骤

| 步骤 | 周次 | 任务                                                      |
| ---- | ---- | --------------------------------------------------------- |
| 1    | W2   | 实现 `CompactSafeMessages` 消息结构，分离 stable/volatile |
| 2    | W2   | 重构 `applyCompaction` 为 prefix-safe 版本                |
| 3    | W3   | 实现 `decideCompaction` 缓存感知决策函数                  |
| 4    | W3   | 优化后端 Provider Log 折叠为 checkpoint 模式              |
| 5    | W3   | 实现 `CacheDiagnosticReport`，前端展示逐轮缓存诊断        |
| 6    | W3   | 集成测试：compact 后缓存命中率恢复 >50%                   |

#### 2.5 验收标准

- [ ] DeepSeek 多轮对话（5轮）平均缓存命中率 ≥ 60%
- [ ] compact 后首轮缓存命中率 > 30%（当前约 10%）
- [ ] 前端可查看每轮对话的缓存诊断（前缀哈希、命中率、compaction 影响）
- [ ] 后端 Provider Log 折叠后前缀不变
- [ ] GPT `previous_response_id` 在 compact 后主动清除，不传失效 ID

---

### P0-3: 结构化 SSE 协议

**优先级**: P0  
**预估工期**: 2 周（与 P0-1/P0-2 并行，W3-W4）  
**负责模块**: `src/ai/core/providers/backend-proxy.provider.ts`, `backend/src/ai/agent-runner.service.ts`

#### 3.1 问题定位

当前 SSE 通信缺乏结构化进度信息，前端无法精确感知 AI 执行阶段。

| 现象                       | 触发条件                        | 影响                                 |
| -------------------------- | ------------------------------- | ------------------------------------ |
| 前端不知道 AI 在做什么     | 编辑器 AI 执行期间              | 用户只看到 loading，无法判断是否卡住 |
| `reasoning_content` 不转发 | DeepSeek 思考过程               | 用户看不到 AI 的推理过程             |
| 心跳缺失                   | 长时间 tool_call 执行           | 连接可能超时断开                     |
| 工具调用无中间状态         | `tool_start` → `tool_done` 之间 | 用户无法感知进度                     |

#### 3.2 根因分析

**根因 1: 前后端事件类型不匹配**

```
后端 AgentRunnerService 事件：          前端 BackendProxyProvider 期望：
┌───────────────────────┐              ┌────────────────────────┐
│ text                   │              │ text_delta             │
│ tool_start             │       ≠      │ tool_call              │
│ tool_done              │              │ done                   │
│ tool_error             │              │ error                  │
│ clarification          │              │                        │
│ error                  │              │                        │
│ done                   │              │                        │
└───────────────────────┘              └────────────────────────┘
```

- AgentRunner 事件仅用于 eval 路径，不用于实时 SSE
- 实时 SSE 走 `AiController` → Provider 直接转发，缺少 Agent 层事件

**根因 2: 缺少 `reasoning_delta` 事件转发**

```typescript
// backend-proxy.provider.ts 第 144-163 行
// 仅处理 text_delta, tool_call, done, error
// DeepSeek 的 reasoning_content delta 被忽略
```

**根因 3: 无心跳机制**

- Pipeline 生成一个模板可能耗时 30-60 秒
- SchemaGen 阶段 LLM 可能耗时 10-20 秒无输出
- 前端无法区分"正在工作"和"连接断开"

#### 3.3 解决方案

**核心思路**: 定义统一的 `StructuredSSEEvent` 协议，前后端共享事件类型

##### 3.3.1 事件类型定义

```typescript
// shared/agent/contracts/sse-events.ts

interface StructuredSSEEvent {
  seq: number; // 序列号
  timestamp: string; // ISO 8601
  type: SSEEventType;
  data: unknown;
}

type SSEEventType =
  // 文本生成
  | 'text_delta' // 文本增量
  | 'reasoning_delta' // 推理过程增量（DeepSeek/MiMo）

  // 工具调用
  | 'tool_call_start' // 工具调用开始（含工具名称）
  | 'tool_call_delta' // 工具参数增量
  | 'tool_call_end' // 工具调用完成（含结果摘要）
  | 'tool_error' // 工具调用错误

  // Pipeline 进度（模板生成专用）
  | 'pipeline_stage_start' // Pipeline 阶段开始
  | 'pipeline_stage_progress' // 阶段内进度（如 SchemaGen 迭代次数）
  | 'pipeline_stage_end' // 阶段完成

  // Agent 生命周期
  | 'agent_intent_plan' // 意图规划结果
  | 'agent_clarification' // 需要用户澄清

  // 缓存诊断
  | 'cache_diagnostic' // 缓存命中/未命中信息

  // 心跳
  | 'heartbeat' // 每 5 秒一次

  // 终止
  | 'done' // 完成含 usage 统计
  | 'error'; // 错误
```

##### 3.3.2 事件数据结构

```typescript
// 工具调用事件
interface ToolCallStartData {
  toolName: string; // 如 'editor_edit', 'generate_template'
  callId: string; // 调用 ID
  argsPreview?: string; // 参数摘要（前 200 字符）
}

interface ToolCallEndData {
  callId: string;
  success: boolean;
  resultPreview?: string; // 结果摘要
  durationMs: number;
}

// Pipeline 进度事件
interface PipelineStageStartData {
  stage: 'designer' | 'critic' | 'schema_gen' | 'verifier';
  attempt: number; // 第几次尝试
  maxAttempts: number;
}

interface PipelineStageProgressData {
  stage: string;
  iteration: number; // 当前迭代
  maxIterations: number;
  message: string; // 如 "SchemaGen iteration 3/8: fixing duplicate IDs"
}

// 缓存诊断事件
interface CacheDiagnosticData {
  provider: string;
  hitTokens: number;
  missTokens: number;
  hitRate: string;
  prefixHash: string;
}
```

##### 3.3.3 心跳机制

```
后端 → 前端（每 5 秒）:
event: heartbeat
data: {"seq": 42, "timestamp": "2026-06-03T04:00:00Z", "type": "heartbeat", "data": {"status": "working"}}

前端超时检测（15 秒无事件）:
→ 显示 "连接可能断开，点击重试"
```

#### 3.4 实施步骤

| 步骤 | 周次 | 任务                                                              |
| ---- | ---- | ----------------------------------------------------------------- |
| 1    | W3   | 定义 `shared/agent/contracts/sse-events.ts` 事件类型              |
| 2    | W3   | 后端 `AiController` 发出 `pipeline_stage_*` 和 `tool_call_*` 事件 |
| 3    | W4   | 后端转发 `reasoning_delta` 事件                                   |
| 4    | W4   | 实现心跳机制（后端 5s 间隔，前端 15s 超时）                       |
| 5    | W4   | 前端 `BackendProxyProvider` 解析新事件类型                        |
| 6    | W4   | 前端 UI 展示：Pipeline 进度条、工具调用状态、推理过程折叠面板     |

#### 3.5 验收标准

- [ ] 前端可展示 AI 当前执行阶段（如 "SchemaGen 迭代 3/8"）
- [ ] DeepSeek `reasoning_content` 在前端可折叠展示
- [ ] 长时间请求（>10s）有心跳，不断开
- [ ] Pipeline 生成过程可视化（4 阶段进度 + 重试次数）
- [ ] 工具调用显示名称和耗时（如 "editor_edit (1.2s)"）

---

## Phase 2: 夯实 (W6-W10)

> 目标：Pipeline 一次通过率 >70%，compaction 不破坏缓存，编辑操作可撤销。

---

### P1-1: Pipeline 成功率提升

**优先级**: P1  
**预估工期**: 3 周  
**负责模块**: `backend/src/ai-templates/`

#### 1.1 问题定位

| 现象                  | 数据                                           | 影响                                           |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- |
| SchemaGen 频繁失败    | 平均 1.5-2 次回滚                              | Pipeline 成功率低，成本高                      |
| 跨页重复 node ID      | LLM 高频生成                                   | `dedupeNodeIds()` 机械修复，但影响下游         |
| 遗漏 `biz-*` 组件声明 | LLM 常忘声明 `componentTemplates` 中的 `biz-*` | `autoBizComponents` 兜底但不完美               |
| 单阶段失败重启全部    | `MAX_PIPELINE_ATTEMPTS = 3`                    | 一次 SchemaGen 失败浪费 Designer + Critic 结果 |

#### 1.2 根因分析

**SchemaGen 失败的三大主因**（基于代码注释 `schema-generator.agent.ts`）：

1. **跨页重复 node ID**（第 218-221 行注释："LLM 高频生成跨页重复 id，实测 duplicate_node_id 是 SchemaGen 反复耗尽迭代的主因"）
2. **遗漏 biz-\* 组件声明**（第 153-155 行注释："LLM 常忘了在 components 目录声明它在 componentTemplates 定义的 biz-\* 模块"）
3. **生成非法 props**（`unknownProps` 校验，第 229 行注释："严格 unknownProps + 图片 URL / 本地化 / 中文文案 + render smoke"）

**Pipeline 整体设计的两个瓶颈**：

1. **单阶段失败 = 全部重来**：SchemaGen 抛出异常后，Pipeline 回到 Designer 重新开始（`pipeline.service.ts` 第 94-103 行）
2. **Critic 修正方向不精确**：Critic 返回 `reviseSuggestion`，但 LLM 不一定能精准修正

#### 1.3 解决方案

##### 1.3.1 SchemaGen 预验证 + 后置修复

```typescript
// 当前流程：
// LLM 输出 → parseAndValidate() → 失败 → 反馈 LLM → 重试（最多 8 次）

// 优化流程：
// LLM 输出 → 预修复() → parseAndValidate() → 失败 → 反馈 LLM → 重试

function preValidateAndFix(rawOutput: unknown): { document: ThemeLayoutDocument; fixes: string[] } {
  const fixes: string[] = [];

  // 1. 自动去重 node ID
  const { document: deduped, renameMap } = dedupeNodeIds(rawOutput);
  if (Object.keys(renameMap).length > 0) {
    fixes.push(`Auto-deduplicated ${renameMap.length} node IDs`);
  }

  // 2. 自动补全 biz-* 组件声明
  const bizFixes = autoBizComponents(deduped);
  if (bizFixes.length > 0) {
    fixes.push(`Auto-added ${bizFixes.length} biz-* component descriptors`);
  }

  // 3. 自动移除 unknown props
  const { document: cleaned, removedProps } = removeUnknownProps(deduped);
  if (removedProps.length > 0) {
    fixes.push(`Auto-removed ${removedProps.length} unknown props: ${removedProps.join(', ')}`);
  }

  // 4. 自动修复图片 URL
  const { document: urlFixed, badUrls } = fixImageUrls(cleaned);
  if (badUrls.length > 0) {
    fixes.push(`Auto-fixed ${badUrls.length} image URLs`);
  }

  return { document: urlFixed, fixes };
}
```

##### 1.3.2 Pipeline 单阶段重试

```typescript
// 当前：SchemaGen 失败 → 回到 Designer（浪费）
// 优化：SchemaGen 失败 → 仅重试 SchemaGen（保留 Designer + Critic 结果）

interface PipelineConfig {
  maxGlobalAttempts: number; // 全局重试次数（当前 3）
  maxStageAttempts: number; // 单阶段重试次数（新增，默认 3）
  stageRetryStrategy: {
    designer: 'global'; // Designer 失败必须全局重来
    critic: 'stage'; // Critic 失败仅重试 Critic
    schema_gen: 'stage'; // SchemaGen 失败仅重试 SchemaGen
    verifier: 'stage_then_global'; // Verifier 失败先重试，3次后全局重来
  };
}
```

##### 1.3.3 Critic 定向修正

```typescript
interface CriticReviseSuggestion {
  verdict: 'approve' | 'revise';

  // 新增：结构化修正指引（替代纯文本 suggestion）
  reviseActions?: [
    | { type: 'add_section'; afterRegion: string; sectionKind: string }
    | { type: 'replace_section'; regionKey: string; newKind: string }
    | { type: 'adjust_layout'; regionKey: string; direction: 'row' | 'column'; gap: number }
    | { type: 'improve_contrast'; regionKey: string; suggestion: string }
    | { type: 'add_navigation_item'; label: string; targetPage: string },
  ];

  reasoning: string;
}
```

#### 1.4 实施步骤

| 步骤 | 周次 | 任务                                                         |
| ---- | ---- | ------------------------------------------------------------ |
| 1    | W6   | 实现 `preValidateAndFix()` 预修复链                          |
| 2    | W6   | 重构 Pipeline 支持单阶段重试策略                             |
| 3    | W7   | 增强 Critic 输出结构化修正指引                               |
| 4    | W7   | SchemaGen prompt 优化：在 system prompt 中强调 ID 唯一性约束 |
| 5    | W8   | 收集 50 个失败 case，分析失败模式，针对性修复                |
| 6    | W8   | 集成测试：Pipeline 一次通过率 > 70%                          |

#### 1.5 验收标准

- [ ] Pipeline 一次通过率 > 70%（当前约 40-50%）
- [ ] SchemaGen 平均重试次数 < 2（当前 3-4 次）
- [ ] 单阶段失败不触发全局重启（除 Designer 外）
- [ ] 50 个历史失败 case 中 >80% 可通过预修复自动解决

---

### P1-2: 上下文管理与前缀稳定性

**优先级**: P1  
**预估工期**: 2 周  
**负责模块**: `src/ai/core/compact/`, `src/ai/agents/editorEditAgent.ts`

#### 2.1 问题定位

| 现象                     | 触发条件                    | 影响                      |
| ------------------------ | --------------------------- | ------------------------- |
| compact 后缓存命中率暴跌 | 对话 >5 轮触发 compact      | 每次成本增加 40-60%       |
| pageKind 推断不准        | 正则匹配 fallback 'unknown' | AI 无法定位页面           |
| 导航类型固定             | 总是 `bottom_tabs`          | 不支持侧边栏/顶部导航模板 |

#### 2.2 解决方案

##### 2.2.1 前缀稳定 Compact（详见 P0-2 的消息结构重组）

##### 2.2.2 pageKind 推断增强

```typescript
// 当前：buildTemplateProfile.ts 第 28-58 行，基于正则
// 优化：基于语义特征 + 组件结构推断

const PAGE_KIND_SIGNALS: Record<string, PageKindSignal> = {
  home: { hasHero: true, hasNav: true, hasFeatureGrid: true },
  product: { hasProductCard: true, hasPriceTag: true },
  order: { hasOrderList: true, hasStatusTag: true },
  category: { hasCategoryGrid: true, hasFilterBar: true },
  form: { hasFormFields: true, hasSubmitButton: true },
  profile: { hasAvatar: true, hasMenuList: true },
  // ... 更多
};

function inferPageKind(page: ThemeLayoutPage, profile: Partial<TemplateProfile>): string {
  // 1. 精确匹配 meta.pageKind
  if (page.meta?.pageKind) return page.meta.pageKind;

  // 2. 基于组件结构信号匹配
  const signals = detectPageSignals(page);
  const bestMatch = Object.entries(PAGE_KIND_SIGNALS)
    .map(([kind, expected]) => ({
      kind,
      score: computeSignalMatch(signals, expected),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return bestMatch.score > 0.5 ? bestMatch.kind : 'unknown';
}
```

##### 2.2.3 导航类型多样化

```typescript
// 当前：buildTemplateProfile.ts 第 129 行，硬编码 bottom_tabs
// 优化：基于页面数量和模板类型推断

type NavigationType = 'bottom_tabs' | 'side_drawer' | 'top_bar' | 'none';

function inferNavigationType(pages: ThemeLayoutPage[], device: TemplateDevice): NavigationType {
  if (pages.length <= 1) return 'none';
  if (device === 'mobile') return 'bottom_tabs';
  if (pages.length <= 5) return 'top_bar';
  return 'side_drawer';
}
```

#### 2.3 验收标准

- [ ] Compact 后 DeepSeek 缓存命中率 > 30%
- [ ] pageKind 推断 'unknown' 比例 < 5%（当前约 20%）
- [ ] 支持至少 3 种导航类型推断

---

### P1-3: Agent 断点续传与撤销

**优先级**: P1  
**预估工期**: 2 周  
**负责模块**: `src/ai/core/query-loop.ts`, `src/domain/editor/`

#### 3.1 问题定位

| 现象                   | 触发条件                 | 影响               |
| ---------------------- | ------------------------ | ------------------ |
| 编辑操作不可撤销       | AI 执行 `editor_edit` 后 | 用户只能手动改回   |
| 长对话中断后丢失上下文 | 网络断开或页面刷新       | 必须重新开始       |
| 半写入状态             | AI 编辑中途出错          | 文档处于不一致状态 |

#### 3.2 解决方案

##### 3.2.1 编辑操作撤销栈

```typescript
interface EditorUndoStack {
  // 在 AI 编辑前保存快照
  pushSnapshot(description: string, document: ThemeLayoutDocument): void;

  // 撤销到指定快照
  undoTo(snapshotId: string): ThemeLayoutDocument;

  // 获取可撤销的快照列表
  listSnapshots(): UndoSnapshot[];

  // 最大快照数（默认 20）
  maxSnapshots: number;
}

interface UndoSnapshot {
  id: string;
  timestamp: string;
  description: string; // 如 "AI: 修改首页 hero 区域标题"
  documentSnapshot: ThemeLayoutDocument;
}
```

##### 3.2.2 原子操作与半写入恢复

```typescript
// 当前：applyEditorInstructions 逐条应用
// 优化：先 dry-run 全部指令，再原子应用

async function applyInstructionsAtomic(
  instructions: SemanticEditorInstruction[],
  document: ThemeLayoutDocument,
): Promise<ApplyResult> {
  // Phase 1: Dry-run（不写入）
  const dryRunResults = instructions.map((inst) => compileAndValidate(inst, document));

  const allValid = dryRunResults.every((r) => r.success);
  if (!allValid) {
    return {
      success: false,
      partialResults: dryRunResults,
      message: `${dryRunResults.filter((r) => !r.success).length} instructions failed validation`,
    };
  }

  // Phase 2: 原子应用（全部成功才写入）
  const snapshot = deepClone(document);
  try {
    for (const result of dryRunResults) {
      applyCompiledInstruction(result.compiled!, document);
    }
    return { success: true, snapshot };
  } catch (e) {
    // 回滚到快照
    Object.assign(document, snapshot);
    return { success: false, error: e.message };
  }
}
```

##### 3.2.3 对话上下文持久化与恢复

```typescript
// 当前：editorAiPanelState.ts 持久化对话消息
// 优化：同时持久化 compact 状态和缓存上下文

interface PersistedConversationState {
  messages: ProviderMessage[];
  compactSummary: string | null;
  lastPrefixHash: string;
  cacheContext: {
    provider: string;
    previousResponseId: string | null;
    lastCacheHitRate: number;
  };
  intentPlan: IntentPlanResult | null;
  selectedNode: ThemeLayoutNode | null;
}
```

#### 3.3 验收标准

- [ ] AI 编辑后可通过 UI 撤销到编辑前状态
- [ ] 撤销栈最多保留 20 个快照
- [ ] 多条编辑指令要么全部成功，要么全部回滚
- [ ] 页面刷新后对话上下文可恢复

---

## Phase 3: 进阶 (W11-W16)

> 目标：自动化回归测试覆盖核心场景，语义工具覆盖 90% 编辑意图。

---

### P2-1: Agent 评测体系

**优先级**: P2  
**预估工期**: 3 周  
**负责模块**: `backend/src/ai/agent-runner.service.ts`, `shared/agent/testing/`

#### 1.1 问题定位

| 现象              | 影响                             |
| ----------------- | -------------------------------- |
| 无自动化回归测试  | 代码改动可能静默破坏 Agent 行为  |
| Mock 场景覆盖不足 | 仅覆盖编辑器基本操作             |
| 无 A/B 模型对比   | 无法量化模型切换对生成质量的影响 |
| 无性能基准        | 无法检测 Agent 响应时间退化      |

#### 1.2 解决方案

##### 1.2.1 评测矩阵

```typescript
interface AgentEvalSuite {
  // 编辑器 Agent 评测
  editor: {
    basic: EditorEvalCase[]; // 单步编辑（修改文字/图片/颜色）
    complex: EditorEvalCase[]; // 多步编辑（创建页面 + 填充 pattern）
    edge: EditorEvalCase[]; // 边界情况（不存在的 slotKey、非法 props）
  };

  // 模板生成 Agent 评测
  template: {
    singlePage: TemplateEvalCase[]; // 单页模板
    multiPage: TemplateEvalCase[]; // 多页模板
    edge: TemplateEvalCase[]; // 边界情况（极端布局、特殊行业）
  };

  // 模型对比评测
  modelComparison: {
    models: string[]; // 如 ['deepseek-v4', 'gpt-4.1', 'mimo']
    cases: EvalCase[]; // 统一测试用例
    metrics: ComparisonMetric[]; // 成功率、token 消耗、耗时
  };
}
```

##### 1.2.2 评测指标

```typescript
interface EvalMetrics {
  // 功能性
  successRate: number; // 完全成功的比例
  partialSuccessRate: number; // 部分成功的比例
  validationPassRate: number; // 校验通过率

  // 质量
  semanticAccuracy: number; // 语义操作准确率（是否操作了正确的目标）
  styleConsistency: number; // 风格一致性评分（0-1）

  // 效率
  avgTokenUsage: number; // 平均 token 消耗
  avgCacheHitRate: number; // 平均缓存命中率
  avgDurationMs: number; // 平均耗时

  // 稳定性
  retryRate: number; // 重试率
  errorRate: number; // 错误率
  regressionCount: number; // 相比上次评测的退步数量
}
```

##### 1.2.3 CI 集成

```yaml
# .github/workflows/agent-eval.yml
name: Agent Eval
on:
  pull_request:
    paths: ['src/ai/**', 'backend/src/ai/**', 'shared/agent/**']

jobs:
  mock-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm agent:eval:mock
      - name: Check regression
        run: pnpm agent:eval:regression-check

  live-eval:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm agent:eval:live
        env:
          AI_API_KEY: ${{ secrets.AI_API_KEY }}
```

#### 1.3 验收标准

- [ ] Mock 评测覆盖 30+ 场景
- [ ] CI 每次 PR 自动运行 mock 评测
- [ ] main 分支推送自动运行 live 评测
- [ ] 模型对比报告可量化不同模型的表现差异

---

### P2-2: 语义编译器扩展

**优先级**: P2  
**预估工期**: 3 周  
**负责模块**: `shared/agent/compiler/semanticInstructionCompiler.ts`, `shared/agent/template/`

#### 2.1 问题定位

| 现象                                 | 影响                                             |
| ------------------------------------ | ------------------------------------------------ |
| 仅 5 种语义指令                      | 复杂编辑意图无法表达（如"调整间距"、"添加动画"） |
| `EDITABLE_PROPS_BY_ALIAS` 静态注册表 | 新组件需手动更新                                 |
| pageKind 推断粗糙                    | AI 频繁引用不存在的 Key                          |
| 无跨页面操作                         | 无法表达"在所有页面添加底部导航"                 |

#### 2.2 解决方案

##### 2.2.1 新增语义指令

```typescript
type SemanticInstructionType =
  // 现有 5 种
  | 'submit_page_spec'
  | 'update_slot'
  | 'fill_pattern'
  | 'create_page_from_page_kind'
  | 'replace_section'
  // 新增
  | 'adjust_layout' // 调整布局参数（间距、对齐、方向）
  | 'apply_style' // 应用样式（颜色、字体、圆角、阴影）
  | 'add_interaction' // 添加交互（导航、弹窗、切换）
  | 'batch_update_slots' // 批量更新多个 slot
  | 'global_style_change'; // 全局样式变更（主题色、字体族）
```

##### 2.2.2 动态组件注册表

```typescript
// 替代静态 EDITABLE_PROPS_BY_ALIAS
interface DynamicComponentRegistry {
  // 从 ThemeLayoutDocument 自动推断
  buildFromDocument(document: ThemeLayoutDocument): ComponentEditabilityMap;

  // 运行时注册新组件
  register(alias: string, editableProps: string[]): void;

  // 查询
  getEditableProps(alias: string): string[];
  isContainer(alias: string): boolean;
}

type ComponentEditabilityMap = Map<
  string,
  {
    alias: string;
    editableProps: string[];
    isContainer: boolean;
    childAliases: string[];
  }
>;
```

##### 2.2.3 TemplateProfile 增量更新

```typescript
// 当前：每次编译时从文档重建 profile
// 优化：文档变更后增量更新 profile

interface TemplateProfileUpdater {
  // 文档变更时调用
  onDocumentChange(
    oldDocument: ThemeLayoutDocument,
    newDocument: ThemeLayoutDocument,
    currentProfile: TemplateProfile,
  ): TemplateProfile;

  // 仅更新受影响的部分
  updateAffectedPages(changedPageIds: string[]): Partial<TemplateProfile>;
  updateAffectedRegions(changedNodeIds: string[]): Partial<TemplateProfile>;
  updateAffectedSlots(changedNodeIds: string[]): Partial<TemplateProfile>;
}
```

#### 2.3 验收标准

- [ ] 语义指令覆盖 10 种类型（当前 5 种）
- [ ] 组件可编辑属性从文档自动推断，不需手动注册
- [ ] TemplateProfile 增量更新，不全量重建
- [ ] AI 编辑意图覆盖率 > 90%（基于评测矩阵统计）

---

## 附录

### A. 关键常量速查

| 常量                              | 值                    | 位置                                 | 备注                   |
| --------------------------------- | --------------------- | ------------------------------------ | ---------------------- |
| `MAX_ITERATIONS` (QueryLoop)      | 20                    | `query-loop.ts`                      | 前端循环上限           |
| `MAX_API_RETRIES`                 | 3                     | `query-loop.ts`                      | API 重试次数           |
| `MAX_CONSECUTIVE_ERRORS`          | 5                     | `query-loop.ts`                      | 连续错误上限           |
| `MAX_PIPELINE_ATTEMPTS`           | 3                     | `pipeline.service.ts`                | Pipeline 全局重试      |
| `maxIterations` (SchemaGen)       | 8                     | `schema-generator.agent.ts`          | SchemaGen 单次迭代上限 |
| `maxIterations` (EditorEditAgent) | 8                     | `editorEditAgent.ts`                 | 编辑器 Agent 迭代上限  |
| `MAX_PROVIDER_LOG_TOKENS`         | 500,000               | `provider-log-compaction.service.ts` | 日志 token 预算        |
| `PROVIDER_LOG_FOLD_TAIL_TOKENS`   | 180,000               | `provider-log-compaction.service.ts` | 折叠保留尾部           |
| `DEFAULT_MAX_CONTEXT_TOKENS`      | 500,000               | `compact.ts`                         | 前端上下文 token 上限  |
| `COMPACTION_MODEL`                | `'deepseek-v4-flash'` | `compact.ts`                         | **硬编码，需消除**     |
| `RATE_LIMIT_MAX`                  | 10                    | `ai.service.helpers.ts`              | AI 请求限流            |

### B. 文件影响范围

| Phase | 修改文件                                                                                       | 新增文件                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | `openai.provider.ts`, `openai-compatible.provider.ts`, `ai.service.helpers.ts`, `compact.ts`   | `provider-capabilities.ts`, `message-purifier.ts`, `cache-strategy.ts`, `mimo.provider.ts`, `minimax.provider.ts`, `qwen.provider.ts`, `kimi.provider.ts`, `glm.provider.ts` |
| P0-2  | `compact.ts`, `autoCompact.ts`, `provider-log-compaction.service.ts`, `token-usage.service.ts` | `cache-diagnostic.ts`, `compaction-decision.ts`                                                                                                                              |
| P0-3  | `backend-proxy.provider.ts`, `agent-runner.service.ts`, `ai.controller.ts`                     | `sse-events.ts` (shared)                                                                                                                                                     |
| P1-1  | `pipeline.service.ts`, `schema-generator.agent.ts`                                             | `pre-validate-fix.ts`                                                                                                                                                        |
| P1-2  | `buildTemplateProfile.ts`, `editorEditAgent.ts`                                                | `page-kind-inference.ts`, `navigation-inference.ts`                                                                                                                          |
| P1-3  | `query-loop.ts`, `applyEditorInstructions.ts`                                                  | `editor-undo-stack.ts`, `persisted-conversation-state.ts`                                                                                                                    |
| P2-1  | `agent-runner.service.ts`                                                                      | `agent-eval-suite.ts`, `eval-metrics.ts`, `.github/workflows/agent-eval.yml`                                                                                                 |
| P2-2  | `semanticInstructionCompiler.ts`, `templateProfile.ts`, `buildTemplateProfile.ts`              | `dynamic-component-registry.ts`, `template-profile-updater.ts`                                                                                                               |

### C. 风险与缓解

| 风险                          | 影响                          | 缓解策略                                                |
| ----------------------------- | ----------------------------- | ------------------------------------------------------- |
| 国产模型 API 变更             | 适配层需要持续维护            | Provider 抽象隔离变更影响；自动化评测快速发现兼容性回归 |
| 缓存策略优化影响精度          | compact-safe 可能降低压缩效果 | A/B 测试对比压缩率和缓存命中率                          |
| Pipeline 单阶段重试引入新 bug | 可能产生不一致状态            | 严格的快照对比验证 + 集成测试                           |
| SSE 协议变更影响现有客户端    | 前后端需同步更新              | 事件类型版本号 + 向后兼容解析                           |
| 语义指令扩展增加 LLM 复杂度   | 可能导致 LLM 选择错误工具     | 渐进式发布 + 评测矩阵覆盖                               |

### D. 里程碑时间线

```
W1   ────┬─── P0-1: ProviderCapabilities + MessagePurifier
W2   ────┤─── P0-1: CacheStrategy + 国产 Provider
         └─── P0-2: 消息结构重组 + prefix-safe compact
W3   ────┬─── P0-1: Compaction 模型配置化 + 端到端测试
         ├─── P0-2: 缓存感知决策 + 可观测性
         └─── P0-3: SSE 事件类型定义 + 后端发出
W4   ────┬─── P0-3: 前端解析 + 心跳 + 推理过程展示
W5   ────┴─── Phase 1 集成验收
W6   ────┬─── P1-1: SchemaGen 预修复 + Pipeline 单阶段重试
W7   ────┤─── P1-1: Critic 结构化修正 + prompt 优化
W8   ────┤─── P1-2: pageKind 推断增强 + 导航多样化
         └─── P1-3: 编辑撤销栈 + 原子操作
W9   ────┬─── P1-3: 对话上下文持久化
W10  ────┴─── Phase 2 集成验收
W11  ────┬─── P2-1: 评测矩阵 + Mock 场景
W12  ────┤─── P2-1: CI 集成 + 模型对比
W13  ────┤─── P2-2: 新增语义指令
W14  ────┤─── P2-2: 动态组件注册表
W15  ────┤─── P2-2: TemplateProfile 增量更新
W16  ────┴─── Phase 3 集成验收
```

---

_本文档将随项目进展持续更新，每个 Phase 完成后标记验收结果。_
