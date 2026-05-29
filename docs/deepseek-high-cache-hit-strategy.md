# DeepSeek 模型高缓存命中率实现方案

> **目标**: 本文档详细阐述如何为 DeepSeek 系列模型（v4-flash / v4-pro）实现 60-90%+ 的 prompt 缓存命中率，大幅降低 API 调用成本。  
> **参考实现**: [Reasonix](https://github.com/esengine/DeepSeek-Reasonix) — 一个专为 DeepSeek 设计的 AI 编码代理。  
> **收益**: DeepSeek 的 cache-hit 定价是 cache-miss 的 **1/50 ~ 1/120**（flash: $0.0028 vs $0.14 / 1M tokens；pro: $0.003625 vs $0.435 / 1M tokens），因此缓存策略是成本控制的核心。

---

## 目录

1. [核心原理：DeepSeek 的 Prefix Caching](#1-核心原理deepseek-的-prefix-caching)
2. [架构总览：Cache-First 设计](#2-架构总览cache-first-设计)
3. [模块一：不可变前缀 ImmutablePrefix](#3-模块一不可变前缀-immutableprefix)
4. [模块二：上下文管理 ContextManager](#4-模块二上下文管理-contextmanager)
5. [模块三：Schema 扁平化](#5-模块三-schema-扁平化)
6. [模块四：会话持久化与修复](#6-模块四会话持久化与修复)
7. [模块五：定价与成本核算](#7-模块五定价与成本核算)
8. [完整数据流：一次典型请求](#8-完整数据流一次典型请求)
9. [实现清单：从头构建](#9-实现清单从头构建)

---

## 1. 核心原理：DeepSeek 的 Prefix Caching

### 1.1 缓存如何工作

DeepSeek API 使用 **前缀缓存（prefix caching）** 机制：

- 当请求的 `messages` 数组的 **前缀部分** 与之前的请求完全一致时，该前缀的 token 被标记为 `prompt_cache_hit_tokens`
- 缓存 key = 消息列表中 **从前到后** 的连续精确匹配
- **任何中间插入或修改**都会使从该点开始到末尾的所有内容 misses cache

```
请求 1: [系统提示词 A][工具定义 B][记忆 C][用户消息 1] → 全部 miss
请求 2: [系统提示词 A][工具定义 B][记忆 C][用户消息 2] → A+B+C hit！只新用户消息1→2的变化部分 miss
请求 3: [系统提示词 A][工具定义 B][记忆 C][用户消息 3] → A+B+C hit！
请求 4: [系统提示词 A][工具定义 B+x][记忆 C][用户消息 4] → A+B中的A hit，B+x由于变化→从B+x开始全部 miss！
```

### 1.2 缓存失效的代价

| 模型     | 场景       | 每 1M token 价格 |
| -------- | ---------- | ---------------- |
| v4-flash | cache hit  | **$0.0028**      |
| v4-flash | cache miss | **$0.14**        |
| v4-pro   | cache hit  | **$0.003625**    |
| v4-pro   | cache miss | **$0.435**       |

一个完整会话的系统提示词 + 工具定义通常在 **3K-10K tokens**。如果这个前缀每次都命中，每轮对话只付新用户输入的 tokens 费用。若前缀频繁变化，每次都要为几千 tokens 付全价。

---

## 2. 架构总览：Cache-First 设计

### 2.1 设计原则

```
┌──────────────────────────────────────────────────────────────┐
│                    CACHE-FIRST 设计原则                        │
│                                                              │
│  1. 前缀永不变化 — 系统提示词 + 工具定义，一旦构建即冻结        │
│  2. 追加不修改 — 用户消息、助手回复只追加在消息列表末尾          │
│  3. 折叠不改前缀 — 旧消息折叠为摘要，尾部最新消息保留            │
│  4. 扁平化 Schema — 避免 DeepSeek 因深度嵌套丢参数              │
│  5. 指纹追踪 — SHA-256 检测任何前缀漂移，防止无意的缓存失效      │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件关系

```
                        启动时构建
ImmutablePrefix ────────────────────┐
  ├─ system prompt (冻结)           │
  ├─ tool specs (冻结)               │  每次请求
  ├─ few-shot examples (冻结)        ├────────► ContextManager.prepare()
  └─ fingerprint (SHA-256)          │              │
                                    │              ▼
AppendOnlyLog ──────────────────────┘      ChatMessage[]
  ├─ 用户消息 (追加)                         系统提示词
  ├─ 助手回复 (追加)                         + 工具定义
  ├─ 工具结果 (追加)                         + 历史消息
  └─ 折叠摘要 (替换旧消息)                     + 当前用户消息
                                                  │
                                                  ▼
                                          DeepSeek API
                                          POST /chat/completions
                                          { messages: [...], tools: [...] }
```

### 2.3 缓存稳定性的关键

| 操作                  | 对缓存的影响          | 备注                      |
| --------------------- | --------------------- | ------------------------- |
| 添加/移除工具         | ❌ 前缀改变 → 全 miss | 仅 MCP 热桥接时发生       |
| `/new` 重建系统提示词 | ❌ 前缀改变 → 全 miss | 明确接受成本              |
| 追加用户消息          | ✅ 缓存命中           | 前缀不变，尾部增加        |
| 追加助手回复          | ✅ 缓存命中           | 前缀不变，尾部增加        |
| 追加工具结果          | ✅ 缓存命中           | 前缀不变，尾部增加        |
| 会话折叠 (fold)       | ✅ 缓存命中           | 仅替换前缀之后的旧消息    |
| 修复已加载消息 (heal) | ✅ 缓存命中           | 仅修改历史，不改变前缀    |
| `/compact` 压缩会话   | ✅ 缓存命中           | 使用模型对话摘要替换      |
| 扁平化 Schema         | ✅ 提升命中率         | 减少工具定义的 token 波动 |

---

## 3. 模块一：不可变前缀 ImmutablePrefix

### 3.1 源码位置 & 职责

```
src/memory/runtime.ts — ImmutablePrefix 类
```

这是 **整个缓存策略的核心**。它管理系统提示词和工具定义，确保它们在会话期间不发生变化。

### 3.2 类定义

```typescript
class ImmutablePrefix {
  system: string; // 系统提示词（冻结）
  private _toolSpecs: ToolSpec[]; // 工具定义（冻结）
  readonly fewShots: readonly ChatMessage[]; // few-shot 示例（冻结）
  private _fingerprintCache: string | null; // 指纹缓存
}
```

### 3.3 核心方法

#### 构建消息列表 (`toMessages()`)

```typescript
/** 返回 [system message, ...fewShot messages] —— 前缀部分 */
toMessages(): ChatMessage[] {
  return [
    { role: "system", content: this.system },
    ...this.fewShots.map((m) => ({ ...m }))
  ];
}
```

这是每次 API 请求中 **不变的头部**。

#### 系统提示词替换 (`replaceSystem()`)

```typescript
replaceSystem(s: string): boolean {
  if (this.system === s) return false;  // 完全相同 → 无需操作
  this.system = s;
  this._fingerprintCache = null;        // 无效化指纹
  return true;                          // 返回 true 表示调用者应接受缓存 miss
}
```

仅在 `/new` 时调用。方法名本身就暗示了代价：「替换系统提示词 → 接受缓存未命中」。

#### 工具管理 (`addTool()` / `removeTool()`)

```typescript
addTool(spec: ToolSpec): boolean {
  const name = spec.function?.name;
  if (!name) return false;
  if (this._toolSpecs.some((t) => t.function?.name === name)) return false;  // 去重
  this._toolSpecs.push(spec);
  this._fingerprintCache = null;  // 工具列表变化 → 缓存失效
  return true;
}

removeTool(name: string): boolean {
  const idx = this._toolSpecs.findIndex((t) => t.function?.name === name);
  if (idx < 0) return false;
  this._toolSpecs.splice(idx, 1);
  this._fingerprintCache = null;
  return true;
}
```

**缓存代价文档化**: 注释中说明 `Each addTool costs one cache-miss turn`（每次添加工具付出一次缓存未命中的代价）。

#### 指纹追踪 (`fingerprint`)

```typescript
get fingerprint(): string {
  if (this._fingerprintCache !== null) return this._fingerprintCache;
  this._fingerprintCache = this.computeFingerprint();
  return this._fingerprintCache;
}

private computeFingerprint(): string {
  const blob = JSON.stringify({
    system: this.system,
    tools: this._toolSpecs,
    shots: this.fewShots,
  });
  return createHash("sha256").update(blob).digest("hex").slice(0, 16);
}
```

SHA-256 取前 16 位作为指纹。任何前缀变化都会被检测到。`verifyFingerprint()` 在开发/测试时断言缓存一致性。

### 3.4 系统提示词的构建顺序

来自 `src/code/prompt.ts` 的 `codeSystemPrompt()` 函数：

```
1. CODE_SYSTEM_TEMPLATE        ← 固定的基础提示词模板（~10KB）
2. __ESCALATION_CONTRACT__     ← 模型升级合约（基于 modelId 插值）
3. TUI_FORMATTING_RULES        ← 格式化规则（固定）
4. SEMANTIC_SEARCH_ROUTING     ← 搜索路由（可选，注册了 semantic_search 时追加）
5. applyMemoryStack()          ← 注入用户/项目记忆
6. .gitignore                  ← 读取并追加到提示词末尾
7. systemAppend / systemAppendFile  ← 用户配置的追加内容
```

**关键点**: 这些内容在 **会话启动时一次性构建**，之后 `ImmutablePrefix.system` 冻结不变。

---

## 4. 模块二：上下文管理 ContextManager

### 4.1 源码位置 & 职责

```
src/context-manager.ts — ContextManager 类
```

**管理提示词上下文的增长**，确保前缀稳定性的同时控制上下文窗口。

### 4.2 消息构建流程

在 `CacheFirstLoop.step()` 主循环中：

```typescript
private buildMessages(pendingUser: string | null): ChatMessage[] {
  const healedMessages = this.healActiveLogBeforeSend();  // 1. 修复当前日志
  const msgs: ChatMessage[] = [
    ...this.prefix.toMessages(),   // 2. 前缀部分（缓存命中核心）
    ...healedMessages,              // 3. 历史消息
  ];
  if (pendingUser !== null) {
    msgs.push({ role: "user", content: pendingUser });  // 4. 当前用户输入
  }
  return msgs;
}
```

**最终的消息结构**：

```
[preamble: system prompt + tool specs + memories + .gitignore]
        ↑ 缓存命中的关键 — 这一整块每次请求都完全相同
[log entry 1: user message]    ← 追加
[log entry 2: assistant reply] ← 追加
[log entry 3: tool result]     ← 追加
...                            ← 更多追加（或折叠后的摘要）
[log entry N: current user input] ← 新消息
```

### 4.3 后请求决策：缓存命中率监控

`decideAfterUsage()` 在每轮 API 调用后运行：

```typescript
decideAfterUsage(usage, model, alreadyFoldedThisTurn): PostUsageDecision {
  const ctxMax = DEEPSEEK_CONTEXT_TOKENS[model];  // v4-flash/pro: 1M
  const ratio = usage.promptTokens / ctxMax;

  if (ratio > 0.8)  → 退出并生成强制摘要（exit-with-summary）
  if (ratio > 0.7)  → 激进折叠（aggressive fold, tail=10% ctxMax）
  if (ratio > 0.5)  → 正常折叠（fold, tail=20% ctxMax）
  否则 → 继续（none）
}
```

**逻辑**: 当 `prompt_tokens` 超过上下文窗口的 50% 时，触发历史折叠，为下一轮对话腾空间，同时保持前缀不变。

### 4.4 前请求预检：防止超限

`decidePreflight()` 在每次 API 调用前运行：

```typescript
decidePreflight(messages, toolSpecs, model): PreflightDecision {
  const ctxMax = DEEPSEEK_CONTEXT_TOKENS[model];
  const estimate = estimateRequestTokens(messages, toolSpecs, true);  // 本地估计
  return {
    needsAction: estimate / ctxMax > 0.95,  // 超过 95% 触发紧急处理
    estimateTokens: estimate,
    ctxMax,
  };
}
```

当超过 95% 时，`mechanicalTruncate()` 会就地截断最旧的消息（保留最近的用户消息），避免 API 400 错误。

### 4.5 历史折叠（Context Fold）

`fold()` 方法用模型生成的摘要替换早期消息：

```typescript
async fold(model: string, opts?): Promise<FoldResult> {
  // 1. 计算尾部保留预算（默认 20% ctxMax）
  const tailBudget = ...;

  // 2. 从后向前扫描，累积 token，停在第一个用户消息边界
  //    这样 tail 总以用户消息开头，模型看到的是完整对话轮次

  // 3. 提取 pinned skills 内容（不参与摘要，原样保留）
  const { stubbedHead, pinnedBodies } = extractPinnedSkills(head);

  // 4. 用 flash 模型对早期消息生成摘要
  const summary = await this.summarizeForFold(stubbedHead);

  // 5. 构造折叠后的消息列表：
  //    [summary + pinned skills + original tail]
  const summaryMsg = buildAssistantMessage(
    HISTORY_FOLD_MARKER + summary.content + memoTail,
    [], model, summary.reasoningContent
  );
  const replacement = [summaryMsg, ...tail];

  // 6. 替换内存中的日志，同步写入会话文件
  this.deps.log.compactInPlace(replacement);
  this.persistRewrite(replacement);
}
```

**折叠对缓存的影响**:

- 前缀部分（ImmutablePrefix）**完全不变** → 缓存命中
- 只替换了历史消息部分 → 下一次请求的前缀仍然是缓存命中的
- 折叠本身使用 flash 模型，成本极低（~100-200 tokens 输出）

---

## 5. 模块三：Schema 扁平化

### 5.1 源码位置 & 职责

```
src/repair/flatten.ts — flattenSchema(), analyzeSchema(), nestArguments()
```

### 5.2 为什么需要扁平化

DeepSeek 在处理深度 >2 层或叶子 >10 个的 JSON Schema 时会 **静默丢弃部分参数**。这意味着：

- 模型指示了 `write_file`，但参数 `content` 被丢弃 → 写入空文件
- 缓存虽然命中，但工具执行结果错误

### 5.3 实现逻辑

```typescript
/** 分析是否需要扁平化 */
function analyzeSchema(schema): FlattenDecision {
  let leafCount = 0,
    maxDepth = 0;
  walk(schema, 0, (depth, isLeaf) => {
    if (isLeaf) leafCount++;
    if (depth > maxDepth) maxDepth = depth;
  });
  return {
    shouldFlatten: leafCount > 10 || maxDepth > 2, // 超过阈值 → 需要扁平化
    leafCount,
    maxDepth,
  };
}

/** 递归展开为 flat 的点路径键名 */
function flattenSchema(schema): JSONSchema {
  const flatProps = {};
  const required: string[] = [];
  collect('', schema, flatProps, required, true);
  // 输入: { path: string, content: string, encoding: string }
  // 不扁平（浅层且叶子少）
  // 输入: { operation: { type: string, target: { path: string, range: string } } }
  // 扁平为: { "operation.type": string, "operation.target.path": string, "operation.target.range": string }
  return { type: 'object', properties: flatProps, required };
}

/** 工具调度时重建嵌套结构 */
function nestArguments(flatArgs): Record<string, unknown> {
  const out = {};
  for (const [key, value] of Object.entries(flatArgs)) {
    setByPath(out, key.split('.'), value); // "operation.target.path" → out.operation.target.path
  }
  return out;
}
```

### 5.4 对缓存的影响

- **扁平化的 schema 每次生成一致** → 工具定义部分缓存命中
- 避免 DeepSeek 静默修改参数导致的重试循环 → 间接提高缓存效率（减少额外请求）

---

## 6. 模块四：会话持久化与修复

### 6.1 会话存储

```
src/memory/session.ts
```

- 使用 **JSONL** 格式（每行一个 JSON 消息）
- `appendSessionMessage()` → 追加（保持磁盘与内存同步）
- `rewriteSession()` → 重写整个文件（折叠/修复后调用）
- `archiveSession()` → 归档当前会话（`/new` 时调用）

### 6.2 恢复时修复 (`healLoadedMessages`)

从磁盘恢复会话时：

```typescript
// 1. 加载消息
const prior = loadSessionMessages(sessionName);

// 2. 修复超大工具结果（防止下一轮 API 400）
const shrunk = healLoadedMessagesByTokens(prior, MAX_RESULT_TOKENS);

// 3. 补全 thinking 模式缺失的 reasoning_content
const stamped = stampMissingReasoningForThinkingMode(shrunk.messages, model);

// 4. 追加到日志
for (const msg of stamped.messages) this.log.append(msg);
```

### 6.3 会话间缓存持续性

当用户在 `/new` 后继续对话时：

```
旧会话: [prefix A][历史消息...] → 前缀缓存命中
  ↓ /new 归档旧会话
新会话: [prefix A (相同!)][新历史...] → 前缀缓存命中！
```

由于 ImmutablePrefix 不变，即使是新会话，前缀部分也命中缓存。

---

## 7. 模块五：定价与成本核算

### 7.1 定价表

```typescript
const DEEPSEEK_PRICING = {
  'deepseek-v4-flash': {
    inputCacheHit: 0.0028, // $0.0028 / 1M tokens
    inputCacheMiss: 0.14, // $0.14 / 1M tokens (50x)
    output: 0.28, // $0.28 / 1M tokens
  },
  'deepseek-v4-pro': {
    inputCacheHit: 0.003625, // $0.003625 / 1M tokens
    inputCacheMiss: 0.435, // $0.435 / 1M tokens (120x)
    output: 0.87, // $0.87 / 1M tokens
  },
};
```

### 7.2 成本计算

```typescript
function costUsd(model: string, usage: Usage): number {
  const p = pricingFor(model);
  return (
    (usage.promptCacheHitTokens * p.inputCacheHit + // 缓存命中部分 → 几乎免费
      usage.promptCacheMissTokens * p.inputCacheMiss + // 缓存未命中部分 → 全价
      usage.completionTokens * p.output) / // 输出部分
    1_000_000
  );
}
```

### 7.3 缓存命中率追踪

```typescript
class Usage {
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;

  get cacheHitRatio(): number {
    const denom = this.promptCacheHitTokens + this.promptCacheMissTokens;
    return denom > 0 ? this.promptCacheHitTokens / denom : 0;
  }
}

class SessionStats {
  get aggregateCacheHitRatio(): number {
    // 累计所有轮次的 hit/miss，计算加权平均
    return hit / (hit + miss);
  }
}
```

以一个 10 轮对话为例：

- 每轮前缀 ~5K tokens（系统提示词 + 工具定义）
- 第一轮: 5K miss + 用户输入 ~200 tokens → 缓存命中率 ~0%
- 第二轮起: 5K hit + 用户输入 ~200 tokens → 缓存命中率 ~96%
- 10 轮总计: 缓存命中率约 86%

---

## 8. 完整数据流：一次典型请求

### 8.1 启动阶段

```
用户运行 reasonix code
  │
  ├─ 1. 加载配置 → model: deepseek-v4-flash
  ├─ 2. 加载环境变量 → DEEPSEEK_API_KEY
  ├─ 3. 读取记忆 → .reasonix/memory/* + 项目记忆
  ├─ 4. 构建 ImmutablePrefix：
  │     ┌─────────────────────────────────────┐
  │     │ ImmutablePrefix {                    │
  │     │   system: "You are Reasonix Code..." │  ← 固定模板 ~10KB
  │     │          + memory stack              │  ← 用户/项目记忆 ~1KB
  │     │          + .gitignore content        │  ← 项目配置 ~1KB
  │     │   _toolSpecs: [read_file, ...]       │  ← 扁平化后的工具定义 ~3KB
  │     │   _fingerprintCache: "a1b2c3d4..."   │  ← SHA-256 指纹
  │     │ }                                    │  总计 ~15KB
  │     └─────────────────────────────────────┘
  │
  └─ 5. 启动 TUI，等待用户输入
```

### 8.2 第一轮请求（Cache Miss）

```
用户输入: "读取 package.json"

CacheFirstLoop.step():
  ├─ 回合重置 (_turn++, repair.resetStorm())
  ├─ 持久化用户消息 (appendAndPersist → 日志 + 磁盘 JSONL)
  ├─ 构建消息列表:
  │     [ImmutablePrefix.toMessages()]  ← ~15KB, 全部为 promptCacheMissTokens
  │     + [用户消息]                      ← 少量
  │
  ├─ API 调用 POST /chat/completions
  │     usage: {
  │       prompt_tokens: 15500,
  │       prompt_cache_hit_tokens: 0,     ← 第一轮没有缓存
  │       prompt_cache_miss_tokens: 15500,
  │       completion_tokens: 120
  │     }
  │     cost: $0.00217 + $0.000034 = $0.0022
  │
  ├─ 修复管线 (scavenge → truncation → storm)
  ├─ contextManager.decideAfterUsage():
  │     15500 / 1000000 = 1.5% < 50% → 继续，不折叠
  │
  └─ 返回结果给用户
```

### 8.3 第二轮请求（Cache Hit！）

```
用户输入: "修改 package.json 的 name 字段"

CacheFirstLoop.step():
  ├─ 回合重置
  ├─ 持久化用户消息
  ├─ 构建消息列表:
  │     [ImmutablePrefix.toMessages()]  ← 完全相同！缓存命中！
  │     + [第一轮对话历史]
  │     + [第二轮用户消息]
  │
  ├─ API 调用 POST /chat/completions
  │     usage: {
  │       prompt_tokens: 15800,
  │       prompt_cache_hit_tokens: 15000,  ← 前缀命中！
  │       prompt_cache_miss_tokens: 800,   ← 仅新增对话部分
  │       completion_tokens: 200
  │     }
  │     cost: $0.000042 + $0.000112 + $0.000056 = $0.00021
  │           ↑ 命中部分  ↑ miss部分    ↑ 输出
  │     相比第一轮 $0.0022 → $0.00021，降为 1/10！
  │
  └─ 继续下一轮...
```

### 8.4 第 50 轮：需要折叠

```
用户输入: "再加一个测试"

CacheFirstLoop.step() 前置检查:

contextManager.decideAfterUsage():
  promptTokens: 520000 / 1000000 = 52% > 50% → 触发折叠！

  ├─ contextManager.fold():
  │     ├─ 尾部保留预算: 200000 tokens (20% of ctxMax)
  │     ├─ 从后向前扫描: 最后 8 轮对话在预算内
  │     ├─ 前 42 轮历史 → 用 flash 模型生成摘要
  │     │    系统提示词: "You compress conversation history..."
  │     │    耗时: ~3s, 成本: ~$0.0001
  │     ├─ 提取 pinned skills 内容（如果有）
  │     └─ 构建新消息列表:
  │           [summary: 2KB] + [tail: 8 轮对话] + [当前用户消息]
  │
  ├─ 下一轮 API 调用:
  │     [ImmutablePrefix]  ← 缓存命中！从未改变
  │     + [折叠摘要 + tail]  ← 历史部分变了（摘要替代原始消息）
  │     + [当前用户消息]
  │
  │     prompt_cache_hit_tokens: 15000  ← 前缀命中！
  │     prompt_cache_miss_tokens: 5000  ← 折叠后的历史（少量新 token）
  │
  └─ 继续...
```

---

## 9. 实现清单：从头构建

### 9.1 最小可行实现

要复现 DeepSeek 高缓存命中率，你需要以下组件：

#### Step 1: ImmutablePrefix — 缓存命中的根基

```typescript
class ImmutablePrefix {
  private system: string;
  private toolSpecs: ToolSpec[];
  private fingerprint: string;

  constructor(system: string, tools: ToolSpec[]) {
    this.system = system;
    this.toolSpecs = tools;
    this.fingerprint = this.compute();
  }

  toMessages(): ChatMessage[] {
    return [{ role: 'system', content: this.system }];
  }

  tools(): ToolSpec[] {
    return structuredClone(this.toolSpecs);
  }

  /** 仅在需要重建系统提示词时调用（例如 /new） */
  replaceSystem(s: string): boolean {
    if (this.system === s) return false;
    this.system = s;
    this.fingerprint = this.compute();
    return true;
  }

  private compute(): string {
    return createHash('sha256')
      .update(JSON.stringify({ system: this.system, tools: this.toolSpecs }))
      .digest('hex')
      .slice(0, 16);
  }
}
```

#### Step 2: AppendOnlyLog — 只追加不修改

```typescript
class AppendOnlyLog {
  private entries: ChatMessage[] = [];

  append(msg: ChatMessage): void {
    this.entries.push(msg);
  }

  /** 唯一允许修改路径 — 折叠后调用 */
  compactInPlace(replacement: ChatMessage[]): void {
    this.entries = [...replacement];
  }

  toMessages(): ChatMessage[] {
    return this.entries.map((e) => ({ ...e }));
  }

  get length(): number {
    return this.entries.length;
  }
}
```

#### Step 3: 消息构建

```typescript
function buildMessages(prefix: ImmutablePrefix, log: AppendOnlyLog, currentUserInput: string): ChatMessage[] {
  return [
    ...prefix.toMessages(), // 缓存命中的关键 — 不变的前缀
    ...log.toMessages(), // 历史消息（或折叠后的摘要）
    { role: 'user', content: currentUserInput },
  ];
}
```

#### Step 4: 缓存命中率追踪

```typescript
class Usage {
  constructor(
    public promptTokens: number,
    public completionTokens: number,
    public promptCacheHitTokens: number,
    public promptCacheMissTokens: number,
  ) {}

  get cacheHitRatio(): number {
    const total = this.promptCacheHitTokens + this.promptCacheMissTokens;
    return total > 0 ? this.promptCacheHitTokens / total : 0;
  }
}

// API 响应反序列化
function usageFromApi(raw: any): Usage {
  return new Usage(
    raw.prompt_tokens ?? 0,
    raw.completion_tokens ?? 0,
    raw.prompt_cache_hit_tokens ?? 0,
    raw.prompt_cache_miss_tokens ?? 0,
  );
}
```

### 9.2 进阶优化

#### 上下文折叠

```typescript
async function foldHistory(log: AppendOnlyLog, client: DeepSeekClient, ctxMax: number = 1_000_000): Promise<boolean> {
  const all = log.toMessages();
  if (all.length === 0) return false;

  // 1. 保留尾部 20% token 预算
  const tailBudget = Math.floor(ctxMax * 0.2);

  // 2. 从后向前扫描，停在用户消息边界
  let cumTokens = 0,
    boundary = all.length;
  for (let i = all.length - 1; i >= 0; i--) {
    const tokens = countTokens(all[i].content);
    if (cumTokens + tokens > tailBudget) break;
    cumTokens += tokens;
    if (all[i].role === 'user') boundary = i;
  }
  if (boundary <= 0) return false;

  const head = all.slice(0, boundary);
  const tail = all.slice(boundary);

  // 3. 用模型生成摘要
  const summary = await client.chat({
    model: 'deepseek-v4-flash',
    messages: [
      { role: 'system', content: '你对对话历史生成纯文本摘要...' },
      ...head,
      { role: 'user', content: '总结以上对话，保留关键决策和结果。' },
    ],
  });

  // 4. 替换日志
  const replacement = [{ role: 'assistant', content: `[摘要] ${summary.content}` }, ...tail];
  log.compactInPlace(replacement);
  return true;
}
```

#### Schema 扁平化

```typescript
function flattenSchema(schema: JSONSchema): JSONSchema {
  const flatProps: Record<string, JSONSchema> = {};
  const required: string[] = [];

  function collect(prefix: string, s: JSONSchema) {
    if (s.type === 'object' && s.properties) {
      for (const [key, child] of Object.entries(s.properties)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        collect(nextPrefix, child);
      }
      return;
    }
    flatProps[prefix] = s;
  }

  collect('', schema);
  return { type: 'object', properties: flatProps, required };
}
```

### 9.3 完整的 API 客户端

```typescript
class DeepSeekClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY!;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    this.timeoutMs = 660_000; // 11 min — DeepSeek LB 最长排队 10min
  }

  async *stream(model: string, messages: ChatMessage[], tools?: ToolSpec[]) {
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        stream: true,
        extra_body: { thinking: { type: 'enabled' } }, // 启用思维链
      }),
    });

    // 使用 eventsource-parser 解析 SSE 流
    const parser = createParser({
      onEvent: (ev) => {
        /* 解析 delta */
      },
    });
    // yield 每个 StreamChunk...
  }
}
```

### 9.4 主循环框架

```typescript
class CacheFirstLoop {
  readonly prefix: ImmutablePrefix;
  readonly log = new AppendOnlyLog();
  readonly client: DeepSeekClient;

  async *step(userInput: string) {
    this.log.append({ role: 'user', content: userInput });

    const messages = [
      ...this.prefix.toMessages(), // ← 缓存命中的关键
      ...this.log.toMessages(),
    ];

    const toolSpecs = this.prefix.tools();
    let assistantContent = '';

    for await (const chunk of this.client.stream('deepseek-v4-flash', messages, toolSpecs)) {
      // 处理流式块，生成事件...
      yield chunk;
    }

    // 检查是否需要折叠
    const ratio = usage.promptTokens / 1_000_000;
    if (ratio > 0.5) {
      await foldHistory(this.log, this.client);
    }
  }
}
```

### 9.5 部署清单

| #   | 组件                    | 必要性  | 说明                                 |
| --- | ----------------------- | ------- | ------------------------------------ |
| 1   | `ImmutablePrefix`       | ⭐ 必需 | 缓存命中的根基 — 确保前缀永不变化    |
| 2   | `AppendOnlyLog`         | ⭐ 必需 | 只追加日志，避免修改前缀后的内容     |
| 3   | `buildMessages()`       | ⭐ 必需 | 合并前缀 + 历史 + 当前输入           |
| 4   | 缓存命中率追踪          | ⭐ 必需 | 验证策略是否有效                     |
| 5   | 上下文折叠              | 🔶 推荐 | 防止长对话超出窗口，保持缓存命中     |
| 6   | Schema 扁平化           | 🔶 推荐 | 防止 DeepSeek 丢参数导致工具调用失败 |
| 7   | 会话持久化 (JSONL)      | 🔶 推荐 | 恢复时前缀缓存仍有效                 |
| 8   | 恢复时修复 (heal)       | 🔶 推荐 | 防止加载损坏消息导致 API 400         |
| 9   | 前请求预检              | 🔷 可选 | 防止超限导致的 API 错误              |
| 10  | 风暴抑制 (StormBreaker) | 🔷 可选 | 防止模型重复调用浪费 tokens          |

---

## 附录：关键文件索引

| 文件                     | 作用                                      |
| ------------------------ | ----------------------------------------- |
| `src/memory/runtime.ts`  | ImmutablePrefix + AppendOnlyLog 实现      |
| `src/context-manager.ts` | 上下文折叠、预检、后决策                  |
| `src/loop.ts`            | CacheFirstLoop 主循环                     |
| `src/client.ts`          | DeepSeek API 客户端 + Usage 类            |
| `src/telemetry/stats.ts` | 定价、成本计算、缓存命中率聚合            |
| `src/code/prompt.ts`     | 系统提示词构建（前缀内容）                |
| `src/repair/flatten.ts`  | Schema 扁平化                             |
| `src/repair/index.ts`    | 修复管线（scavenge → truncation → storm） |
| `src/memory/session.ts`  | 会话持久化                                |

---

## 10. 当前项目 Agent 实现分析

### 10.1 架构总览

本项目实现了一个 **前端+后端** 分离的 Agent 系统，用于可视化编辑器的 AI 辅助功能：

```
用户输入 (prompt)
  │
  ▼
┌─ Frontend (src/ai/) ─────────────────────────────────────┐
│  EditorEditAgent                                          │
│    ├─ 规划意图 (ui-intent-router)                          │
│    ├─ 构建消息列表 (系统提示词 + 上下文 + 对话历史)          │
│    └─ 运行 QueryLoop (循环处理工具调用)                    │
│         │                                                  │
│         ▼                                                  │
│    BackendProxyProvider                                    │
│    └─ 通过 HTTP POST /api/ai/stream 转发请求到后端          │
└───────────────────────────────────────────────────────────┘
         │  HTTP SSE Stream
         ▼
┌─ Backend (backend/src/ai/) ──────────────────────────────┐
│  AiService                                                │
│    ├─ rate limit 检查                                     │
│    ├─ 注入 cache 选项 (previousResponseId)                 │
│    └─ 转发到 provider.stream()                             │
│         │                                                  │
│         ▼                                                  │
│  OpenAICompatibleProvider                                  │
│    └─ POST /v1/chat/completions → OpenAI SDK stream        │
└───────────────────────────────────────────────────────────┘
         │ SSE events (text_delta, tool_call, done, error)
         ▼
  DeepSeek / OpenAI / 其他 LLM API
```

### 10.2 前端 Agent 代码位置与职责

| 文件                                              | 职责                                            | 与缓存相关                               |
| ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `src/ai/agents/editorEditAgent.ts`                | EditorEditAgent 编排 — 构建消息、调用 QueryLoop | ⚠️ 每次重建系统提示词                    |
| `src/ai/core/query-loop.ts`                       | QueryLoop 主循环 — 流式调用、工具执行、compact  | ✅ 已有 compact 但无 prefix 缓存         |
| `src/ai/core/providers/backend-proxy.provider.ts` | 代理转发到后端 API                              | ⚠️ 支持 previousResponseId 但仅限 OpenAI |
| `src/ai/core/providers/types.ts`                  | Provider 类型定义                               | ⚠️ 缺少 cache metrics                    |
| `src/ai/core/compact/autoCompact.ts`              | 自动 compact 阈值检测                           | ✅ 已有但简单                            |
| `src/ai/core/compact/compact.ts`                  | 对话压缩：保留最近 20 条                        | ✅ 已有 Compact                          |
| `src/ai/core/compact/microCompact.ts`             | 微压缩：仅截断超大工具结果                      | ✅ 已有 micro-compact                    |
| `src/ai/core/utils/tokens.ts`                     | Token 计数 + 上下文窗口表                       | ⚠️ DeepSeek 窗口写为 128K（应为 1M）     |

### 10.3 后端 Agent 代码位置与职责

| 文件                                                          | 职责                                    | 与缓存相关                         |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| `backend/src/ai/ai.service.ts`                                | AI 服务：路由、速率限制、token 用量记录 | ✅ 已有 usage 持久化，但无缓存统计 |
| `backend/src/ai/agent-runner.service.ts`                      | Agent 评测运行器                        | —                                  |
| `backend/src/ai/core/query-loop.ts`                           | 后端 QueryLoop（与前端几乎相同）        | ⚠️ 同样缺少 prefix 缓存            |
| `backend/src/ai/core/providers/openai-compatible.provider.ts` | OpenAI 兼容流式客户端                   | ⚠️ 未传递 cache 参数到 DeepSeek    |
| `backend/src/ai/core/providers/openai.provider.ts`            | OpenAI Responses API 客户端             | ✅ 支持 previousResponseId         |
| `backend/src/ai/core/compact/compact.ts`                      | 后端 compact（与前端类似）              | ✅                                 |
| `backend/src/ai/core/compact/microCompact.ts`                 | 后端 micro-compact                      | ✅                                 |

### 10.4 当前实现与高缓存命中方案的差距

| 维度                   | 当前实现                                                                                | 理想方案                              | 差距              |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- | ----------------- |
| **系统提示词稳定性**   | 每次 `agent.run()` 都重新构建 EDITOR_COPILOT_SYSTEM_PROMPT + intentPlan + editorContext | ImmutablePrefix：启动时固定，永不变化 | 🔴 每次调用都变   |
| **工具定义的稳定性**   | 硬编码在 agent 构建中，每次一样的工具但 schema 存在于每次请求的 tools 参数              | ImmutablePrefix 统一管理，不变化      | 🟡 有效但不稳定   |
| **Prefix Cache 利用**  | 完全未考虑                                                                              | 前缀部分每次都相同，确保缓存命中      | 🔴 完全缺失       |
| **previousResponseId** | 仅 OpenAI Provider 支持，DeepSeek 未实现                                                | 所有 provider 都传递 cache 上下文     | 🟡 部分实现       |
| **缓存命中率追踪**     | 无                                                                                      | SessionStats.aggregateCacheHitRatio   | 🔴 完全缺失       |
| **上下文折叠策略**     | 纯本地 compact（丢弃旧消息而非摘要）                                                    | 用 LLM 生成摘要，保留语义             | 🟡 已实现但可优化 |
| **Schema 扁平化**      | 无                                                                                      | 深度 >2 或叶子 >10 展平               | 🔴 完全缺失       |
| **会话持久化**         | 仅编辑器对话保存到 DB，agent 会话不持久化                                               | JSONL 持久化，恢复时也命中缓存        | 🟡 部分实现       |
| **指纹追踪**           | 无                                                                                      | SHA-256 指纹检测前缀漂移              | 🔴 完全缺失       |

### 10.5 当前消息构建流程（问题所在）

```typescript
// src/ai/agents/editorEditAgent.ts — 每次 agent.run() 都重新构建
const messages: ProviderMessage[] = [
  { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },           // ← 每次相同但不在 prefix 缓存中
  { role: 'system', content: formatUiIntentPlanForPrompt(intentPlan) }, // ← 每次不同！（意图计划每次不同）
  { role: 'system', content: buildEditorContext(currentDocument, ...) }, // ← 每次不同！（文档内容变化）
  ...conversationMessages,                                              // ← 每次不同
  { role: 'user', content: input.prompt },                              // ← 每次不同
];
```

**根本问题**: 所有内容（包括系统提示词、意图计划、编辑器上下文）每次 `agent.run()` 都重新构建，没有任何缓存区。DeepSeek 的 prefix cache 完全无法生效。

---

## 11. 当前项目改造方案

### 11.1 总体架构改动

引入 **CacheFirst 架构**，将消息列表分为三层：

```
┌─────────────────────────────────────────────────────────┐
│  第1层 L0 — 稳定前缀 CACHED                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ system: EDITOR_COPILOT_SYSTEM_PROMPT (冻结)       │   │  ← 缓存命中
│  │ system: 工具定义 Schema (冻结 + 扁平化)            │   │  ← 缓存命中
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  第2层 L1 — 轮次上下文 (随对话变化但增量追加)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ system: 意图计划 + 编辑器上下文 (每轮更新)         │   │  ← 缓存 MISS（但可控）
│  │ user: 对话历史消息 #1                             │   │
│  │ assistant: 回复 #1                               │   │
│  │ tool_result: 工具结果 #1                          │   │
│  │ ...                                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  第3层 L2 — 当前输入 (每轮不同)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ user: 当前 prompt                                 │   │  ← 必须 MISS
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 11.2 具体改造步骤

#### Step 1: 创建 ImmutablePrefix（前端）

**目标**: 在 `src/ai/core/` 下创建 `immutable-prefix.ts`，使系统提示词和工具定义在 Agent 生命周期内不变化。

```typescript
// src/ai/core/immutable-prefix.ts
import { createHash } from 'node:crypto';
import type { ProviderMessage, ProviderTool } from './providers/types';

/**
 * 不可变前缀 —— 缓存命中的根基。
 * 系统提示词 + 工具定义一旦构建即冻结，指纹追踪任何变化。
 */
export class ImmutablePrefix {
  system: string;
  private _toolSpecs: ProviderTool[];
  /** 可重建的上下文块（意图计划 + 编辑器上下文）—— 每次 run() 时重新注入 */
  private _contextBlocks: string[] = [];
  private _fingerprintCache: string | null = null;

  constructor(system: string, toolSpecs: ProviderTool[]) {
    this.system = system;
    this._toolSpecs = [...toolSpecs];
  }

  /** 重建系统提示词 —— 仅在配置变化时调用，明确接受 cache miss */
  replaceSystem(s: string): boolean {
    if (this.system === s) return false;
    this.system = s;
    this._fingerprintCache = null;
    return true;
  }

  get toolSpecs(): readonly ProviderTool[] {
    return this._toolSpecs;
  }

  /** 设置上下文块（意图计划 + 编辑器上下文），这些不在 cache 前缀中 */
  setContextBlocks(blocks: string[]): void {
    this._contextBlocks = [...blocks];
  }

  /** 生成前缀部分消息（缓存命中的关键） */
  toPrefixMessages(): ProviderMessage[] {
    return [
      { role: 'system', content: this.system },
      ...this._toolSpecs.map((spec) => ({
        role: 'system' as const,
        content: `Tool: ${spec.name}\nDescription: ${spec.description}\nParameters: ${JSON.stringify(spec.parameters)}`,
      })),
    ];
  }

  /** 生成上下文部分消息（每轮不同，但不在前缀中） */
  toContextMessages(): ProviderMessage[] {
    return this._contextBlocks.map((content) => ({
      role: 'system' as const,
      content,
    }));
  }

  get fingerprint(): string {
    if (this._fingerprintCache !== null) return this._fingerprintCache;
    this._fingerprintCache = this.computeFingerprint();
    return this._fingerprintCache;
  }

  private computeFingerprint(): string {
    const blob = JSON.stringify({
      system: this.system,
      tools: this._toolSpecs.map((t) => ({ name: t.name, params: t.parameters })),
    });
    return createHash('sha256').update(blob).digest('hex').slice(0, 16);
  }
}
```

#### Step 2: 修改 Provider 传递缓存参数（后端）

**Goal**: 修改 `OpenAICompatibleProvider` 支持 DeepSeek 的 previous_response_id 缓存机制。

DeepSeek 官方支持通过 `previous_response_id` 实现 prompt caching：

```typescript
// backend/src/ai/core/providers/openai-compatible.provider.ts
// 在 stream() 方法中注入 cache 参数

async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
  // ... existing code ...

  // DeepSeek/OpenAI 的 cache 机制：传递 previous_response_id
  const body: Record<string, unknown> = {
    model: request.model,
    messages: convertMessages(request.messages),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (request.tools?.length) {
    body.tools = convertTools(request.tools);
  }

  // 注入 previous_response_id 以启用 prompt caching
  if (request.cache?.previousResponseId) {
    // DeepSeek 使用这个字段来维持前缀缓存
    // OpenAI 使用这个字段来启用 Prompt Caching
    (body as any).previous_response_id = request.cache.previousResponseId;
  }

  // ... rest of stream implementation ...
```

当前 `withRequestScopedCache()` 在 `ai.service.ts` 中只对 `OpenAIProvider` 生效，需要扩展到 `OpenAICompatibleProvider`：

```typescript
// backend/src/ai/ai.service.ts
private withRequestScopedCache(
  req: StreamRequest,
  cacheOptions?: { conversationId?: string; previousResponseId?: string; },
): StreamRequest {
  // 对所有 provider 类型都注入 cache 参数
  if (!cacheOptions?.previousResponseId) return req;

  return {
    ...req,
    cache: {
      previousResponseId: cacheOptions.previousResponseId,
    },
  };
}
```

#### Step 3: 重构 Agent 消息构建逻辑（核心改动）

```typescript
// src/ai/agents/editorEditAgent.ts — 改造后的消息构建

// 在 Agent 初始化时创建 ImmutablePrefix（仅一次！）
const prefix = new ImmutablePrefix(EDITOR_COPILOT_SYSTEM_PROMPT, [APPLY_EDITOR_EDITS_TOOL]);
// 可选：对工具 schema 做扁平化
// flattenToolSchemas(prefix.toolSpecs);

// 每次 agent.run() 时：
const messages: ProviderMessage[] = [
  // L0 — 稳定前缀（缓存命中）
  ...prefix.toPrefixMessages(),

  // L1 — 轮次上下文（随对话变化）
  ...prefix.toContextMessages(),
  ...conversationMessages,

  // L2 — 当前输入
  { role: 'user', content: input.prompt },
];
```

#### Step 4: 修改 BackendProxyProvider 传递缓存上下文

```typescript
// src/ai/core/providers/backend-proxy.provider.ts
// 在 stream() 中添加 x-previous-response-id header

async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
  // ... existing setup ...

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-conversation-id': conversationId,
  };

  // 注入 previousResponseId 以利用 DeepSeek 的 prompt caching
  if (previousResponseId) {
    headers['x-previous-response-id'] = previousResponseId;
  }

  // ... rest of stream ...
```

#### Step 5: 添加缓存命中率追踪（前端 + 后端）

**前端** — 修改 `backend-proxy.provider.ts` 从响应头读取缓存指标：

```typescript
// 从 SSE done event 中提取 usage
// 后端需要将 cacheHitTokens / cacheMissTokens 填入 done event

export interface StreamEventDone {
  type: 'done';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number; // ← 新增
    cacheMissTokens?: number; // ← 新增
  };
  // ...
}
```

**后端** — 从 DeepSeek API 响应中读取缓存指标：

```typescript
// backend/src/ai/core/providers/openai-compatible.provider.ts
// 在流式响应的 usage chunk 中提取缓存数据

// DeepSeek API 返回格式：
// {
//   "usage": {
//     "prompt_tokens": 1500,
//     "completion_tokens": 200,
//     "prompt_cache_hit_tokens": 1200,   // ← 提取此字段
//     "prompt_cache_miss_tokens": 300    // ← 提取此字段
//   }
// }

// 在流式处理中：
if (chunk.usage) {
  usage = {
    inputTokens: chunk.usage.prompt_tokens ?? 0,
    outputTokens: chunk.usage.completion_tokens ?? 0,
    cacheHitTokens: chunk.usage.prompt_cache_hit_tokens,
    cacheMissTokens: chunk.usage.prompt_cache_miss_tokens,
  };
}
```

**后端** — 持久化缓存统计到 DB：

```typescript
// backend/src/ai/ai.service.ts
// 在 recordTokenUsage 中记录缓存指标

private async recordTokenUsage(
  ownerUserId: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheHitTokens?: number; cacheMissTokens?: number },
  endpoint: AiTokenUsageEndpoint,
): Promise<void> {
  // ... existing code ...

  // 新增缓存相关字段
  const cacheHitTokens = sanitizeOptionalTokenCount(usage.cacheHitTokens);
  const cacheMissTokens = sanitizeOptionalTokenCount(usage.cacheMissTokens);

  // 计算缓存命中率
  const cacheHitRatio = cacheHitTokens !== null && cacheMissTokens !== null
    ? cacheHitTokens / (cacheHitTokens + cacheMissTokens)
    : null;

  // 记录到数据库...
}
```

#### Step 6: 添加 TokenUsage 实体扩展

```typescript
// backend/src/ai/entities/ai-token-usage.entity.ts
// 添加缓存统计字段

@Entity('ai_token_usage')
export class AiTokenUsageEvent {
  // ... existing fields ...

  @Column({ type: 'int', nullable: true })
  cacheHitTokens?: number;

  @Column({ type: 'int', nullable: true })
  cacheMissTokens?: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  cacheHitRatio?: number;
}
```

#### Step 7: 使用 LLM 驱动的上下文折叠

将当前纯本地的 `compactConversation()` 升级为 LLM 摘要折叠：

```typescript
// src/ai/core/compact/compact.ts — 增强版

async function semanticCompactConversation(
  messages: ProviderMessage[],
  provider: AIProvider,
  model: string,
): Promise<ProviderMessage[]> {
  if (messages.length <= KEEP_RECENT + 1) return messages;

  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const recent = nonSystem.slice(-KEEP_RECENT);
  const old = nonSystem.slice(0, -KEEP_RECENT);

  // 用 LLM 生成摘要
  const summary = await generateSummary(old, provider, model);

  return [...system, { role: 'user', content: `[对话摘要] ${summary}` }, ...recent];
}

async function generateSummary(messages: ProviderMessage[], provider: AIProvider, model: string): Promise<string> {
  const summaryRequest: ProviderRequest = {
    model: 'deepseek-chat', // 使用便宜的模型做摘要
    messages: [
      {
        role: 'system',
        content: '你压缩对话历史。输出纯文本摘要，保留目标、决策、已完成的工具调用和文件修改。不要做任何工具调用。',
      },
      ...messages,
      { role: 'user', content: '压缩以上对话。' },
    ],
  };

  let summary = '';
  for await (const event of provider.stream(summaryRequest)) {
    if (event.type === 'text_delta') {
      summary += event.text;
    }
  }
  return summary;
}
```

#### Step 8: 工具 Schema 扁平化

将 DeepSeek 可能丢弃的深层 schema 展平：

```typescript
// src/ai/core/flatten-schema.ts
// 移植自 Reasonix 的 src/repair/flatten.ts

interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
}

function shouldFlatten(schema: JSONSchema): boolean {
  let leafCount = 0,
    maxDepth = 0;
  walk(schema, 0, (depth, isLeaf) => {
    if (isLeaf) leafCount++;
    if (depth > maxDepth) maxDepth = depth;
  });
  return leafCount > 10 || maxDepth > 2;
}

function flattenSchema(schema: JSONSchema): JSONSchema {
  const flatProps: Record<string, JSONSchema> = {};
  const required: string[] = [];
  collect('', schema, flatProps, required, true);
  return { type: 'object', properties: flatProps, required };
}

function nestArguments(flatArgs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flatArgs)) {
    setByPath(out, key.split('.'), value);
  }
  return out;
}

// 示例：write_file 的 schema 可能有深嵌套
// {
//   file: { path: string, content: string },
//   options: { encoding: string, mode: string }
// }
// 扁平化为：
// {
//   "file.path": { type: "string" },
//   "file.content": { type: "string" },
//   "options.encoding": { type: "string" },
//   "options.mode": { type: "string" }
// }
```

### 11.3 改造优先级与路线图

| 优先级    | 改动                                                     | 影响                         | 工作量 |
| --------- | -------------------------------------------------------- | ---------------------------- | ------ |
| 🚨 **P0** | Agent 消息分层（L0/L1/L2）— 将系统提示词与轮次上下文分离 | **直接影响缓存命中率**       | 2-3天  |
| 🚨 **P0** | Provider 传递 previousResponseId                         | 启用 DeepSeek prefix caching | 1天    |
| 🚨 **P0** | 缓存命中率追踪（usage.cacheHitTokens）                   | 验证策略效果的前提           | 1-2天  |
| 🔶 **P1** | 使用 LLM 驱动的上下文折叠                                | 长对话场景必要               | 2-3天  |
| 🔶 **P1** | ImmutablePrefix 指纹追踪                                 | 防止无意前缀漂移             | 0.5天  |
| 🔷 **P2** | Schema 扁平化                                            | 防止 DeepSeek 丢参数         | 1天    |
| 🔷 **P2** | 会话持久化 + 恢复时 heal                                 | 跨会话缓存利用               | 2天    |
| 🔷 **P2** | 成本核算面板                                             | 可视化缓存收益               | 1天    |

### 11.4 改动文件清单

```
前端:
  └── src/ai/
      ├── core/
      │   ├── immutable-prefix.ts        [NEW] 不可变前缀
      │   ├── flatten-schema.ts           [NEW] Schema 扁平化
      │   ├── query-loop.ts               [MOD] 集成 prefix + 缓存追踪
      │   ├── providers/
      │   │   ├── types.ts                [MOD] StreamEventDone 添加 cache 字段
      │   │   └── backend-proxy.provider.ts [MOD] 透传 previousResponseId + 缓存指标
      │   ├── compact/
      │   │   └── compact.ts              [MOD] 增加 LLM 语义折叠
      │   └── utils/
      │       └── tokens.ts               [MOD] DeepSeek 窗口修正: 128K → 1M
      ├── agents/
      │   └── editorEditAgent.ts          [MOD] 使用 ImmutablePrefix 重建消息构建
      └── editor-ai.service.ts            [MOD] 传入 prefix 到 agent

后端:
  └── backend/src/ai/
      ├── ai.service.ts                   [MOD] 扩展 cache 注入到所有 provider 类型
      ├── core/
      │   ├── query-loop.ts               [MOD] 缓存统计集成
      │   ├── providers/
      │   │   ├── types.ts                [MOD] ProviderRequest 添加 cache 字段
      │   │   ├── openai-compatible.provider.ts [MOD] 解析 cache 参数 + 提取缓存指标
      │   │   └── openai.provider.ts       [MOD] 同上
      │   └── compact/
      │       └── compact.ts              [MOD] 可选：LLM 摘要折叠
      └── entities/
          └── ai-token-usage.entity.ts     [MOD] 添加缓存统计字段
```

---

## 12. 本地测试与验证方案

### 12.1 验证缓存命中率的关键指标

| 指标                                                   | 说明                                                      | 理想值               |
| ------------------------------------------------------ | --------------------------------------------------------- | -------------------- |
| `cacheHitRatio`                                        | 缓存命中 tokens / (命中 + 未命中)                         | >60% (第二轮起 >90%) |
| `cacheHitTokens`                                       | 每轮被缓存命中的 token 数                                 | 稳定 = 前缀大小      |
| `cacheMissTokens`                                      | 每轮实际计算的 token 数                                   | 仅限增量部分         |
| `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` | DeepSeek Chat Completions 当前可观测的权威缓存字段        | 作为本项目主指标     |
| `x-model-cached-token`                                 | 历史或代理层可能出现的响应头；当前 DeepSeek v4 实测未返回 | 不作为主指标         |
| 单轮成本                                               | `hit*0.0028 + miss*0.14 + output*0.28` (flash)            | 第一轮后降至 1/10    |

### 12.2 测试方案 A：手动验证（DL）

#### A.1 添加控制台日志

```typescript
// backend/src/ai/core/providers/openai-compatible.provider.ts
// 在收到 usage chunk 时打印缓存数据

if (chunk.usage) {
  const hit = chunk.usage.prompt_cache_hit_tokens ?? 0;
  const miss = chunk.usage.prompt_cache_miss_tokens ?? 0;
  const ratio = hit + miss > 0 ? ((hit / (hit + miss)) * 100).toFixed(1) : 'N/A';

  console.log(`[Cache] model=${request.model} hit=${hit} miss=${miss} ratio=${ratio}%`);
  console.log(`[Cache] prefix=${request.messages[0]?.content?.toString().slice(0, 50) ?? ''}...`);
}
```

#### A.2 测试步骤

```bash
# 1. 启动后端（开启调试日志）
cd backend && npm run start:dev

# 2. 启动前端
cd .. && npm run dev

# 3. 打开浏览器 → 编辑器页面
# 4. 打开浏览器开发者工具 → Network tab
# 5. 连续两次发送相同的 AI 请求（例如 "把标题改为红色"）

# 观察：
# - 第一次请求：cache_hit=0, cache_miss=大量 → 说明前缓存为空
# - 第二次请求（相同会话）：cache_hit > 0 → 前缀缓存正在工作
# - 如果第二次 cache_hit 仍为 0 → 前缀在变化，需检查消息构建
```

#### A.3 预期输出示例

```
第一次请求:
  [Cache] model=deepseek-chat hit=0 miss=4521 ratio=0.0% ← 无缓存

第二次请求（相同对话）:
  [Cache] model=deepseek-chat hit=3800 miss=921 ratio=80.5% ← 前缀命中！

第三次请求（新 prompt）:
  [Cache] model=deepseek-chat hit=3800 miss=1050 ratio=78.4% ← 继续命中

换模板（新 conversationId）:
  [Cache] model=deepseek-chat hit=0 miss=4600 ratio=0.0% ← 新会话，无缓存

同模板第二轮:
  [Cache] model=deepseek-chat hit=3800 miss=950 ratio=80.0% ← 恢复命中
```

### 12.3 测试方案 B：自动化测试脚本

在 `scripts/` 下创建 `test-cache-hitrate.ts`：

```typescript
// scripts/test-cache-hitrate.ts
/**
 * 缓存命中率自动化验证脚本
 *
 * 运行方式：
 *   npx tsx scripts/test-cache-hitrate.ts
 *
 * 功能：
 *   1. 连续发送 5 轮请求到 AI API
 *   2. 每次增加一条对话历史
 *   3. 记录每轮的 cacheHitRatio
 *   4. 输出汇总报告
 */

import { OpenAICompatibleProvider } from '../backend/src/ai/core/providers/openai-compatible.provider';
import type { ProviderRequest } from '../backend/src/ai/core/providers/types';

const API_KEY = process.env.DEEPSEEK_API_KEY!;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

async function runTest() {
  const provider = new OpenAICompatibleProvider(API_KEY, BASE_URL, 'deepseek-test');

  // 稳定的系统提示词（模拟 ImmutablePrefix）
  const SYSTEM_PROMPT = `你是 Reasonix Code，一个测试助手。请简短回答。
  
  规则：
  - 保持回答简洁
  - 不要使用工具调用
  - 回答完毕后直接结束`;

  const results: Array<{
    turn: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    ratio: string;
    previousResponseId?: string;
  }> = [];

  let previousResponseId: string | undefined;
  const conversationHistory: Array<{ role: string; content: string }> = [];

  const testPrompts = [
    '你好，请介绍一下你自己。',
    '请问 1+1 等于多少？',
    '请用 Python 写一个冒泡排序。',
    '请把这个排序改成 TypeScript 版本。',
    '请为上面的代码添加注释。',
  ];

  for (let turn = 0; turn < testPrompts.length; turn++) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }, // ← 缓存前缀
      ...conversationHistory, // ← 增量追加
      { role: 'user', content: testPrompts[turn] }, // ← 新消息
    ];

    const request: ProviderRequest = {
      model: 'deepseek-chat',
      messages,
      cache: previousResponseId ? { previousResponseId } : undefined,
    };

    let usage: { cacheHitTokens?: number; cacheMissTokens?: number } | undefined;
    let responseText = '';
    let responseId: string | undefined;

    for await (const event of provider.stream(request)) {
      if (event.type === 'text_delta') {
        responseText += event.text;
      }
      if (event.type === 'done') {
        if (event.usage) {
          usage = {
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            cacheHitTokens: event.usage.cacheHitTokens,
            cacheMissTokens: event.usage.cacheMissTokens,
          };
        }
        if ((event as any).response_id) {
          responseId = (event as any).response_id;
        }
      }
    }

    const hit = usage?.cacheHitTokens ?? 0;
    const miss = usage?.cacheMissTokens ?? 0;
    const ratio = hit + miss > 0 ? ((hit / (hit + miss)) * 100).toFixed(1) : 'N/A';

    results.push({
      turn: turn + 1,
      cacheHitTokens: hit,
      cacheMissTokens: miss,
      ratio: `${ratio}%`,
      previousResponseId: responseId,
    });

    console.log(`\n=== Turn ${turn + 1}: ${testPrompts[turn].slice(0, 30)} ===`);
    console.log(`  Response: ${responseText.slice(0, 100)}...`);
    console.log(`  Cache: hit=${hit} miss=${miss} ratio=${ratio}%`);
    console.log(`  ResponseID: ${responseId ?? '(none)'}`);

    // 追加到对话历史
    conversationHistory.push({ role: 'user', content: testPrompts[turn] });
    conversationHistory.push({ role: 'assistant', content: responseText });
    previousResponseId = responseId;
  }

  // 输出汇总报告
  console.log('\n═══════════════════════════════════════');
  console.log('        缓存命中率测试报告');
  console.log('═══════════════════════════════════════');
  console.log('│ Turn │  Hit  │ Miss  │ Ratio  │');
  console.log('├──────┼───────┼───────┼────────┤');
  for (const r of results) {
    console.log(
      `│  ${r.turn}   │ ${String(r.cacheHitTokens).padStart(5)} │ ${String(r.cacheMissTokens).padStart(5)} │ ${r.ratio.padStart(6)} │`,
    );
  }
  console.log('═══════════════════════════════════════');

  const avgRatio =
    results
      .filter((r) => r.cacheHitTokens + r.cacheMissTokens > 0)
      .reduce((sum, r, _, arr) => {
        const ratio = r.cacheHitTokens / (r.cacheHitTokens + r.cacheMissTokens);
        return sum + (isNaN(ratio) ? 0 : ratio);
      }, 0) / results.filter((r) => r.cacheHitTokens + r.cacheMissTokens > 0).length;

  const totalHit = results.reduce((s, r) => s + r.cacheHitTokens, 0);
  const totalMiss = results.reduce((s, r) => s + r.cacheMissTokens, 0);
  const totalRatio = totalHit + totalMiss > 0 ? ((totalHit / (totalHit + totalMiss)) * 100).toFixed(1) : 'N/A';

  console.log(`\n汇总:`);
  console.log(`  总命中: ${totalHit} tokens`);
  console.log(`  总未命中: ${totalMiss} tokens`);
  console.log(`  综合缓存命中率: ${totalRatio}%`);
  console.log(`  轮次平均命中率: ${(avgRatio * 100).toFixed(1)}%`);

  if (parseFloat(totalRatio) > 50) {
    console.log('\n✅ 结论：缓存命中率 > 50%，策略有效！');
  } else {
    console.log('\n⚠️ 结论：缓存命中率低于预期，请检查：');
    console.log('  1. 系统提示词是否每次请求保持一致');
    console.log('  2. previous_response_id 是否正确传递');
    console.log('  3. 使用的模型是否支持 prefix caching');
  }
}

runTest().catch(console.error);
```

### 12.4 测试方案 C：集成测试（前后端联调）

#### C.1 使用编辑器 AI 功能重复测试

```bash
# 1. 启动所有服务
cd backend && npm run start:dev &
cd .. && npm run dev &

# 2. 打开浏览器 → 登录 → 进入编辑器
# 3. 打开模板，点击 AI 按钮

# 4. 发送一条指令（例如"添加一个标题组件"）
# 5. 等待 AI 完成
# 6. 再发送一条指令（例如"把标题改为蓝色"）
# 7. 观察后端日志
```

#### C.2 后端日志分析

在 `backend/src/ai/ai.service.ts` 中添加缓存命中统计日志：

```typescript
// 在 runEditorStream 或 stream 方法中
private async runStream(ownerUserId: string, req: StreamRequest, ...) {
  // ... existing code ...

  for await (const event of this.provider.stream(request)) {
    if (event.type === 'done' && event.usage) {
      const hitTokens = event.usage.cacheHitTokens ?? 0;
      const missTokens = event.usage.cacheMissTokens ?? 0;
      const total = hitTokens + missTokens;
      const ratio = total > 0 ? (hitTokens / total * 100).toFixed(1) : 'N/A';

      this.logger.log(
        `[Cache] user=${ownerUserId.slice(0,8)} model=${req.model} ` +
        `hit=${hitTokens} miss=${missTokens} ratio=${ratio}%`
      );

      // 如果命中率低于 30%，给出警告
      if (total > 0 && hitTokens / total < 0.3) {
        this.logger.warn(
          `[Cache] ⚠️ 缓存命中率低 (${ratio}%) — 检查消息前缀是否稳定`
        );
      }
    }

    await this.recordTokenUsage(ownerUserId, req.model, event.usage, 'stream');
  }
}
```

### 12.5 缓存命中率 Dashboard

在后端添加一个简单的 REST API 端点查看缓存命中率统计：

```typescript
// backend/src/ai/ai.controller.ts

@Get('cache-stats')
async getCacheStats(@Req() req: AuthenticatedRequest) {
  const stats = await this.aiService.getCacheStats(req.user.userId);
  return stats;
}

// backend/src/ai/ai.service.ts

async getCacheStats(userId: string) {
  const records = await this.tokenUsageRepo.find({
    where: { ownerUserId: userId, cacheHitTokens: Not(IsNull()) },
    order: { createdAt: 'DESC' },
    take: 100,
  });

  const totalHit = records.reduce((s, r) => s + (r.cacheHitTokens ?? 0), 0);
  const totalMiss = records.reduce((s, r) => s + (r.cacheMissTokens ?? 0), 0);

  // 按端点分组
  const byEndpoint: Record<string, { count: number; hit: number; miss: number }> = {};
  for (const r of records) {
    const ep = r.endpoint ?? 'unknown';
    if (!byEndpoint[ep]) byEndpoint[ep] = { count: 0, hit: 0, miss: 0 };
    byEndpoint[ep].count++;
    byEndpoint[ep].hit += r.cacheHitTokens ?? 0;
    byEndpoint[ep].miss += r.cacheMissTokens ?? 0;
  }

  return {
    totalRequests: records.length,
    totalCacheHitTokens: totalHit,
    totalCacheMissTokens: totalMiss,
    overallCacheHitRate: totalHit + totalMiss > 0
      ? (totalHit / (totalHit + totalMiss) * 100).toFixed(1) + '%'
      : 'N/A',
    byEndpoint: Object.entries(byEndpoint).map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      hitRate: data.hit + data.miss > 0
        ? (data.hit / (data.hit + data.miss) * 100).toFixed(1) + '%'
        : 'N/A',
    })),
    recentRequests: records.slice(0, 20).map(r => ({
      timestamp: r.createdAt,
      model: r.model,
      hit: r.cacheHitTokens,
      miss: r.cacheMissTokens,
      ratio: ((r.cacheHitTokens ?? 0) + (r.cacheMissTokens ?? 0)) > 0
        ? ((r.cacheHitTokens ?? 0) / ((r.cacheHitTokens ?? 0) + (r.cacheMissTokens ?? 0)) * 100).toFixed(1) + '%'
        : 'N/A',
    })),
  };
}
```

### 12.6 验证检查清单

```
□ 基础功能验证
  □ 改造后 AI 编辑功能正常运行
  □ 所有工具调用正常
  □ 流式响应正常

□ 缓存功能验证（DL 日志）
  □ 第 1 次请求 cache_hit=0
  □ 第 2 次请求（同对话）cache_hit > 0
  □ cache_hit_tokens ≈ 系统提示词 + 工具定义的总 token 数
  □ 每轮 cache_miss_tokens 仅增长增量部分

□ 自动化测试
  □ 测试脚本正常运行
  □ 5 轮测试后综合命中率 > 50%
  □ 第二轮起单轮命中率 > 80%

□ 稳定性验证
  □ 消息前缀指纹未漂移
  □ DeepSeek Chat Completions 不依赖 previous_response_id；缓存依据请求前缀自动命中
  □ 会话恢复后缓存依然生效

□ 性能验证
  □ 第二轮起 API 响应时间明显缩短
  □ 工具 Schema 扁平化后参数未丢失
  □ 长对话（>20轮）上下文中折叠正常工作
```

---

## 附录 B：当前项目文件索引

| 路径                                                          | 说明                       | 改造状态  |
| ------------------------------------------------------------- | -------------------------- | --------- |
| `src/ai/core/immutable-prefix.ts`                             | 不可变前缀（新建）         | 📝 待创建 |
| `src/ai/core/flatten-schema.ts`                               | Schema 扁平化（新建）      | 📝 待创建 |
| `src/ai/core/query-loop.ts`                                   | 前端主循环（改造）         | 🔧 需改造 |
| `src/ai/core/providers/types.ts`                              | Provider 类型（改造）      | 🔧 需改造 |
| `src/ai/core/providers/backend-proxy.provider.ts`             | 后端代理（改造）           | 🔧 需改造 |
| `src/ai/core/compact/compact.ts`                              | 对话压缩（改造）           | 🔧 需改造 |
| `src/ai/core/utils/tokens.ts`                                 | Token 工具（改造）         | 🔧 需改造 |
| `src/ai/agents/editorEditAgent.ts`                            | 编辑器 Agent（改造）       | 🔧 需改造 |
| `src/ai/editor-ai.service.ts`                                 | 编辑器 AI 服务（改造）     | 🔧 需改造 |
| `backend/src/ai/ai.service.ts`                                | 后端 AI 服务（改造）       | 🔧 需改造 |
| `backend/src/ai/core/query-loop.ts`                           | 后端主循环（改造）         | 🔧 需改造 |
| `backend/src/ai/core/providers/openai-compatible.provider.ts` | DeepSeek Provider（改造）  | 🔧 需改造 |
| `backend/src/ai/core/providers/types.ts`                      | 后端 Provider 类型（改造） | 🔧 需改造 |
| `backend/src/ai/entities/ai-token-usage.entity.ts`            | Token 用量实体（改造）     | 🔧 需改造 |
| `scripts/test-cache-hitrate.ts`                               | 缓存测试脚本（新建）       | 📝 待创建 |

---

## 13. 2026-05-21 修正记录：本项目实际落地方案

### 13.1 原建议中不正确或需调整的点

1. **`previous_response_id` 不应作为 DeepSeek Chat Completions 的 P0 前提**  
   DeepSeek 的上下文缓存默认开启，命中依据是后续请求与已持久化缓存单元之间的重叠前缀，而不是 OpenAI Responses API 的 `previous_response_id`。因此，本项目不应向 `openai-compatible` / DeepSeek Chat Completions 强行注入 `previous_response_id`。该字段可以继续保留给 `OpenAIProvider` 使用，但 DeepSeek 路径的关键是稳定请求前缀，并记录 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。

2. **“新建 ImmutablePrefix 文件”不是当前项目的最小正确改动**  
   本项目的编辑器 Agent 每次请求都是前端重新组装 `ProviderMessage[]`，后端 `QueryLoop` 已按追加方式处理工具调用。最小有效改动不是照搬 Reasonix 的 `ImmutablePrefix` 类，而是把消息结构改成 L0 固定系统提示词/组件目录/工具定义、L1 历史对话、L2 本轮意图/画布快照/用户请求。

3. **动态上下文不能放在稳定前缀中间**  
   当前 `EditorEditAgent` 原结构是 `[固定 system][动态 intent][动态 canvas][history][user]`。第二条消息开始每轮都变，DeepSeek 只能命中很短的固定开头。修正后动态上下文进入尾部 user 消息，稳定组件目录留在第二个 system 消息中。

4. **自动化验证目标更新为本任务要求的 95%**  
   原文脚本示例以 50% / 80% 为阈值，不满足本任务目标。新增脚本使用 `scripts/agent-eval/scenarios.json` 的约 100 个样例，默认目标为综合缓存命中率 95%，可设置最多 5 轮验证。

### 13.2 已实施改动

| 文件                                                                  | 状态    | 说明                                                                      |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `shared/agent/context/editorContext.ts`                               | ✅ 已改 | 拆分 `buildEditorStablePrefixContext()` 与 `buildEditorVolatileContext()` |
| `src/ai/agents/editorEditAgent.ts`                                    | ✅ 已改 | 将稳定上下文前置，动态本轮上下文放到尾部 user 消息                        |
| `backend/src/ai/agent-runner.service.ts`                              | ✅ 已改 | live eval 使用稳定前缀，并在结果中收集 cache usage                        |
| `src/ai/core/providers/types.ts`                                      | ✅ 已改 | 前端 provider usage 增加 `cacheHitTokens/cacheMissTokens`                 |
| `backend/src/ai/core/providers/openai-compatible.provider.ts`         | ✅ 已改 | 解析 DeepSeek usage cache 字段，缺 miss 时按 prompt-hit 回退              |
| `backend/src/ai/ai.service.ts`                                        | ✅ 已改 | 记录缓存命中日志，提供最近 100 次 cache stats 聚合                        |
| `backend/src/ai/ai.controller.ts`                                     | ✅ 已改 | 新增 `GET /api/ai/cache-stats`                                            |
| `src/ai/core/utils/tokens.ts` / `backend/src/ai/core/utils/tokens.ts` | ✅ 已改 | DeepSeek v4/chat/reasoner 上下文窗口按 1,000,000 处理                     |
| `scripts/agent-eval/run-agent-eval.js`                                | ✅ 已改 | 汇总 live eval 返回的缓存命中率                                           |
| `scripts/agent-eval/report-writer.js`                                 | ✅ 已改 | 报告输出缓存命中率                                                        |
| `scripts/agent-eval/run-cache-hitrate.js`                             | ✅ 新增 | 使用 100 个 agent eval 样例直接测 DeepSeek prefix cache                   |
| `package.json`                                                        | ✅ 已改 | 新增 `npm run agent:cache-test`                                           |

### 13.3 当前验证命令

```bash
npm run agent:cache-test -- --limit 100 --rounds 5 --target 0.95
```

脚本会读取 `backend/.env*` 或根目录 `.env*` 中的 `DEEPSEEK_API_KEY` / `AI_API_KEY`，每轮输出每个样例的 `cacheHitTokens` / `cacheMissTokens`、每轮综合 `cacheHitRate`，并写入 `output/agent-eval/cache-hitrate-latest.json` 与 `output/agent-eval/cache-hitrate-latest.md`。

### 13.4 2026-05-25 实测补充：API 观测字段与模型名

前九章的 prefix caching 策略仍作为本项目缓存设计依据：稳定前缀前置、动态上下文后置、使用 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 计算命中率。2026-05-25 对当前 DeepSeek v4 API 的实测补充如下：

1. **模型名以当前 API 为准**
   - `deepseek-v4` 裸模型名当前不可用，API 返回 `400 invalid_request_error`。
   - 当前可用模型名为 `deepseek-v4-pro` 和 `deepseek-v4-flash`。
   - 因此后端配置应继续使用 `AI_PRO_MODEL=deepseek-v4-pro`、`AI_LITE_MODEL=deepseek-v4-flash`。

2. **缓存命中率主指标仍是 usage 字段**
   - 当前实测响应未返回 `x-model-cached-token`，该 header 不应作为本项目判断缓存是否命中的主指标。
   - 当前实测响应包含 `usage.prompt_cache_hit_tokens` 与 `usage.prompt_cache_miss_tokens`，本项目 provider、日志、统计脚本应继续以这两个字段为准。
   - 响应头里观察到 `eo-cache-status: MISS`，但它不能替代 token 级命中率统计。

3. **直连缓存样本**

   使用稳定 system 前缀连续请求 `deepseek-v4-pro` 三次：

   | Round | prompt tokens | cache hit | cache miss | hit rate |
   | ----: | ------------: | --------: | ---------: | -------: |
   |     1 |          5071 |         0 |       5071 |     0.0% |
   |     2 |          5071 |      4992 |         79 |    98.4% |
   |     3 |          5071 |      4992 |         79 |    98.4% |

   该结果与前九章的核心结论一致：首轮通常全量 miss，后续请求只要前缀稳定，就会命中大部分稳定 token。

4. **真实 agent 编辑流程样本**

   使用后端 `AgentRunnerService.runLiveScenario()` 真实调用 DeepSeek，跑 5 个编辑场景（新增、删除、更新、导航、跨页新增）：
   - 通过率：5/5。
   - 节点语义命中率：100%。
   - 每个场景工具调用次数：1。
   - `QueryLoop` 均为 `iter=1 tools=1`，未观察到死循环。
   - 累计缓存：`cacheHitTokens=102016`、`cacheMissTokens=20420`，综合命中率约 83.3%。

   另补测一个带 `selectedNodeId=home-search` 的非澄清路径，结果为 `passed`，一次 `editor_update_props` 完成，`iterations=1`。

5. **压缩质量样本**

   使用 `compactConversationWithLLM()` 与 `deepseek-v4-flash` 构造超长历史并实际压缩，摘要保留了以下关键信息：
   - node ID：`home-panel-extra-text`、`home-search`、`missing-node-404`。
   - 成功结果：`insert_node:home-panel-extra-text`、`update_props:home-search`。
   - 错误上下文：`node not found missing-node-404`、`semantic target failed before delete`。
   - 防重复执行语义：不要重复删除 `missing-node-404`。

结论：前九章缓存策略仍然成立；后续落地章节应以当前 API 实测为准，尤其不要把 `x-model-cached-token` 作为必需观测字段。

---

> **文档生成日期**: 2026-05-21  
> **参考代码库**: [esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)  
> **本项分析基于**: 当前项目的前后端 Agent 实现  
> **许可**: MIT
> Document status: Strategy note. For current AI/provider implementation facts,
> start with `docs/current-implementation-status.md` and
> `reports/03-code-framework-defects-progress.md`.
