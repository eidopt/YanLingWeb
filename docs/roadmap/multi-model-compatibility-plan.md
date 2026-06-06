# 多模型兼容支持方案报告

> **版本**: v1.0  
> **日期**: 2026-06-03  
> **状态**: 方案设计  
> **关联**: `docs/roadmap/README.md` P0-1, `docs/roadmap/execution-plan.md` 第三批

---

## 1. 现状分析

### 1.1 当前 Provider 架构

```
backend/src/ai/ai.service.ts
  ├── config.ai.provider === 'openai-compatible'
  │     → OpenAICompatibleProvider  (Chat Completions API)
  │     → 用于: DeepSeek, Groq, Azure, 国产模型
  └── else
        → OpenAIProvider  (Responses API)
        → 用于: GPT-4o, GPT-4.1
```

两个 Provider 共享同一个 `AIProvider` 接口：

```typescript
// shared/agent/contracts/provider.ts
interface AIProvider {
  readonly name: string;
  getCapabilities(): ProviderCapabilities;
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
  cancel(): void;
}
```

### 1.2 两个 Provider 的关键差异

| 维度           | OpenAIProvider (Responses API)           | OpenAICompatibleProvider (Chat Completions) |
| -------------- | ---------------------------------------- | ------------------------------------------- |
| API 端点       | `/v1/responses`                          | `/v1/chat/completions`                      |
| 系统消息       | `instructions` 字段                      | `role: 'system'` 消息                       |
| developer 角色 | 原生支持                                 | 合并进 `role: 'system'`                     |
| 工具调用格式   | `function_call` / `function_call_output` | `tool_calls[]` / `role: 'tool'`             |
| 上下文缓存     | `previous_response_id` + `store: true`   | 无主动支持（DeepSeek 被动前缀缓存）         |
| reasoning 输出 | 不返回 reasoning                         | `delta.reasoning_content` 逐字流式          |
| reasoning 回传 | 不需要                                   | 某些模型（MiMo）强制要求回传                |

### 1.3 内部消息格式 (ProviderMessage)

```typescript
interface ProviderMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string | ContentPart[];
  toolCallId?: string;
  toolName?: string;
  toolArguments?: string;
  reasoningContent?: string; // ← 关键字段
}
```

这是两个 Provider 之间的"通用语言"。问题出在**转换的有损性**：

```
OpenAI Provider 输出:
  assistant 消息（无 reasoningContent）
  tool_call 格式: function_call
  ↓
存入 ProviderMessage[]（对话历史）
  ↓
OpenAI Compatible Provider 读取:
  assistant 消息（有 reasoningContent → 附加到 reasoning_content）
  tool_call 格式: tool_calls[]
```

**不可逆信息丢失**：

- `developer` 角色 → Compatible 路径合并为 `system` → 再转回时无法还原
- `reasoningContent` 从 DeepSeek 历史中产生 → 传给 GPT 时 GPT 不认识 `reasoning_content` → 400 错误

### 1.4 缓存策略现状

```
withRequestScopedCache() @ ai.service.helpers.ts:115-130
  if (!(provider instanceof OpenAIProvider) || !cacheOptions?.previousResponseId)
    return req;  // 非 OpenAI 直接跳过，零缓存辅助
  → 只有 GPT 能用 previous_response_id
  → DeepSeek 的前缀缓存是被动的（系统不主动做任何事）
```

### 1.5 需要支持的目标模型

所有国产模型均使用 **OpenAI Chat Completions 兼容接口**（`/v1/chat/completions`），差异体现在以下维度：

#### 1.5.1 模型能力矩阵

| 模型           | 厂商     | API Base URL             | 推理输出                    | 推理控制参数                          | 缓存机制                                       | tool_calls                    |
| -------------- | -------- | ------------------------ | --------------------------- | ------------------------------------- | ---------------------------------------------- | ----------------------------- |
| GPT-4o/4.1     | OpenAI   | `api.openai.com`         | 无                          | `reasoning.effort`                    | `previous_response_id` + `store: true`         | Responses API `function_call` |
| DeepSeek V3/V4 | DeepSeek | `api.deepseek.com`       | `reasoning_content`（可选） | 无                                    | 被动前缀缓存（观察 `prompt_cache_hit_tokens`） | `tool_calls[]`                |
| MiMo           | 小米     | `api.xiaomimimo.com`     | `reasoning_content`（强制） | 无（always on）                       | 无                                             | `tool_calls[]`                |
| MiniMax M2.7   | MiniMax  | `api.minimax.chat`       | `reasoning_content`         | `thinking.budget_tokens`              | 无                                             | `tool_calls[]`                |
| Kimi K2        | 月之暗面 | `api.moonshot.cn`        | `reasoning_content`         | `thinking.type: "enabled"/"disabled"` | `prompt_cache_key` + 响应 `cached_tokens`      | `tool_calls[]`                |
| GLM-4.6        | 智谱     | `open.bigmodel.cn`       | `reasoning_content`         | 无                                    | 无                                             | `tool_calls[]`                |
| Qwen 3         | 阿里     | `dashscope.aliyuncs.com` | `reasoning_content`         | `enable_thinking: true`               | `cache_control: {type: "ephemeral"}`           | `tool_calls[]`                |

#### 1.5.2 reasoning_content 关键差异

**相同点**：所有模型的 reasoning 输出都在流式 delta 的 `reasoning_content` 字段中，最终结果在 message 的 `reasoning_content` 中。

**差异点**：

```
DeepSeek:  reasoning_content 可有可无，不回传不会报错
MiMo:      reasoning_content 必须回传到后续对话历史，否则 400
MiniMax:   thinking.budget_tokens 控制推理预算，0 = 关闭推理
Kimi:      thinking.type 控制开关，disabled 时不返回 reasoning_content
Qwen:      enable_thinking 参数控制，开启后 reasoning_content 必须回传
GLM:       无控制参数，模型自行决定是否推理
```

**这意味着**：

- 从 DeepSeek/GPT 切换到 MiMo/Qwen 时，如果历史中缺少 reasoning_content → MiMo/Qwen 可能报错
- 从 MiMo 切换到 GPT 时，如果历史中有多余的 reasoning_content → GPT 报错

#### 1.5.3 缓存机制差异

```
GPT:       服务端存储上一轮响应（store: true），下一轮通过 previous_response_id 引用
           → 主动缓存，需要显式传参

DeepSeek:  自动前缀匹配——只要本轮请求的前 N 条消息与上一轮相同，自动命中缓存
           → 被动缓存，无需传参，通过 usage.prompt_cache_hit_tokens 观察

Kimi:      prompt_cache_key 参数指定缓存键（类似 session ID），
           响应 usage.cached_tokens 返回命中 token 数
           → 半主动缓存，需要传 key

Qwen:      在 messages 中用 cache_control: {"type": "ephemeral"} 标记缓存边界
           → 显式标记，TTL 5 分钟

MiMo:      无缓存支持
MiniMax:   无缓存支持
GLM:       无缓存支持
```

#### 1.5.4 当前代码中的模型注册

```typescript
// backend/src/ai/core/utils/tokens.ts — 已注册的上下文窗口
'claude-haiku-4-5': 200_000,
'gpt-5': 400_000,
'gpt-5.4': 400_000,
'deepseek-v4-flash': 1_000_000,
'deepseek-v4-pro': 1_000_000,
'deepseek-chat': 1_000_000,
'deepseek-reasoner': 1_000_000,
'kimi-k2': 128_000,
'glm-4.6': 128_000,
// 缺少: MiMo, MiniMax, Qwen
```

```typescript
// backend/src/config/config.factory.ts — 当前只支持两种 provider
AI_PROVIDER=openai           → OpenAIProvider (Responses API)
AI_PROVIDER=openai-compatible → OpenAICompatibleProvider (Chat Completions)
// 国产模型统一用 openai-compatible + 不同的 BASE_URL/API_KEY
```

---

## 2. 问题定义

### 2.1 reasoning_content 跨模型污染

**触发路径**：

```
用户用 DeepSeek 对话 5 轮
  → 对话历史中 assistant 消息包含 reasoningContent
  → 用户切换到 GPT
  → OpenAICompatibleProvider.convertMessages() 第 237-238 行:
      if (msg.reasoningContent) {
        assistantMsg.reasoning_content = msg.reasoningContent;  // GPT 不认识!
      }
  → GPT API 返回 400: 消息格式验证失败
```

**反向问题**：

```
用户用 GPT 对话 5 轮
  → 对话历史中 assistant 消息没有 reasoningContent
  → 用户切换到 MiMo
  → MiMo 要求每条 assistant 消息都回传 reasoning_content
  → MiMo API 返回 400
```

### 2.2 instanceof OpenAIProvider 硬编码

**影响**：`withRequestScopedCache()` 只对 `OpenAIProvider` 生效。所有走 `OpenAICompatibleProvider` 的模型（DeepSeek、MiMo、Qwen、Kimi、GLM）永远拿不到缓存辅助。

**但**：`OpenAICompatibleProvider` 不支持 `previous_response_id`，所以即使注入了 cache 字段也不会生效。真正的问题是：**系统缺少一个按 Provider 能力分发缓存策略的机制**。

### 2.3 developer 角色语义丢失

`openai-compatible.provider.ts:212-214`：

```typescript
case 'system':
case 'developer':
  result.push({ role: 'system', content: msg.content as string });
```

`developer` 和 `system` 被合并。再转回 OpenAI Provider 时无法区分。

---

## 3. 方案设计

### 3.1 核心思路

引入三层抽象：

```
ProviderCapabilities（声明能力）
    ↓
MessagePurifier（消息净化器）
    ↓
CacheStrategy（缓存策略）
```

**每个 Provider 声明自己的能力**，系统根据能力决定：

- 消息格式转换时保留/删除哪些字段
- 使用哪种缓存策略
- 如何处理 developer 角色

### 3.2 ProviderCapabilities 扩展

```typescript
// shared/agent/contracts/provider.ts
interface ProviderCapabilities {
  // 现有字段（保留）
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsParallelToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoningEffort: boolean;
  supportsServerSideContext: boolean;

  // ── 新增字段 ──

  /** reasoning_content 处理模式 */
  reasoningMode: 'none' | 'passthrough' | 'required';
  // none:        GPT/GLM — 不认识 reasoning_content 或模型自行决定
  // passthrough: DeepSeek/Kimi/Qwen/MiniMax — 有则保留，没有不强求
  // required:    MiMo — 必须回传，否则 400

  /** 缓存策略类型 */
  cacheStrategy: 'response_id' | 'prefix' | 'cache_key' | 'cache_control' | 'content_auto' | 'none';
  // response_id:   GPT — previous_response_id + store: true
  // prefix:        DeepSeek — 被动前缀缓存，系统观察 prompt_cache_hit_tokens
  // cache_key:     Kimi — prompt_cache_key 参数指定缓存键，响应 cached_tokens 统计
  // cache_control: Qwen — cache_control: {type: "ephemeral"} 显式标记
  // content_auto:  已废弃，合并到 prefix
  // none:          MiMo/GLM/MiniMax — 无缓存支持

  /** 是否保留 developer 角色（不合并为 system） */
  supportsDeveloperRole: boolean;
}
```

各模型声明：

| 模型       | reasoningMode | cacheStrategy   | supportsDeveloperRole |
| ---------- | ------------- | --------------- | --------------------- |
| GPT-4o/4.1 | `none`        | `response_id`   | `true`                |
| DeepSeek   | `passthrough` | `prefix`        | `false`               |
| MiMo       | `required`    | `none`          | `false`               |
| MiniMax    | `passthrough` | `none`          | `false`               |
| Qwen       | `passthrough` | `cache_control` | `false`               |
| Kimi       | `passthrough` | `cache_key`     | `false`               |
| GLM        | `none`        | `none`          | `false`               |

### 3.3 MessagePurifier 消息净化器

在 Provider 的 `convertMessages()` 之前，根据目标 Provider 的能力净化消息：

```typescript
// backend/src/ai/core/providers/messagePurifier.ts
function purifyMessages(messages: ProviderMessage[], targetCaps: ProviderCapabilities): ProviderMessage[] {
  return messages.map((msg) => {
    const clean = { ...msg };

    // 1. reasoning_content 处理
    if (clean.reasoningContent) {
      switch (targetCaps.reasoningMode) {
        case 'none':
          // GPT/GLM: 删除 reasoning_content，目标模型不识别或不关心
          delete clean.reasoningContent;
          break;
        case 'required':
          // MiMo: 保留，确保回传。如果缺失则填充空字符串
          break;
        case 'passthrough':
          // DeepSeek/Kimi/Qwen/MiniMax: 有则保留
          break;
      }
    } else if (targetCaps.reasoningMode === 'required') {
      // MiMo 要求每条 assistant 消息都有 reasoning_content
      // 如果历史中缺失，填充空字符串避免 400
      clean.reasoningContent = '';
    }

    // 2. developer 角色处理
    if (clean.role === 'developer' && !targetCaps.supportsDeveloperRole) {
      clean.role = 'system';
      // 不修改 content — Provider 内部已经处理了合并
    }

    return clean;
  });
}
```

**调用位置**：在每个 Provider 的 `stream()` 方法入口处，或者在 `QueryLoop.buildRequest()` 中统一调用。

### 3.4 CacheStrategy 策略接口

```typescript
// backend/src/ai/core/providers/cacheStrategy.ts
interface CacheStrategy {
  /** 请求前：注入缓存提示到 request */
  applyToRequest(request: StreamRequest, cacheOpts?: ProviderCacheOptions): StreamRequest;

  /** 响应后：从 usage 中提取缓存命中信息 */
  extractCacheMetrics(usage: { cacheHitTokens?: number; cacheMissTokens?: number }): {
    hitTokens: number;
    missTokens: number;
    hitRate: number;
  };
}

class ResponseIdCacheStrategy implements CacheStrategy {
  // GPT: 注入 previous_response_id
  applyToRequest(req, cacheOpts) {
    if (!cacheOpts?.previousResponseId) return req;
    return { ...req, cache: { previousResponseId: cacheOpts.previousResponseId } };
  }
  extractCacheMetrics(usage) { /* 从 OpenAI 响应中提取 */ }
}

class PrefixCacheStrategy implements CacheStrategy {
  // DeepSeek: 不注入任何东西，只观察 prompt_cache_hit_tokens
  applyToRequest(req) { return req; }
  extractCacheMetrics(usage) {
    return {
      hitTokens: usage.cacheHitTokens ?? 0,
      missTokens: usage.cacheMissTokens ?? 0,
      hitRate: /* 计算 */,
    };
  }
}

class CacheKeyStrategy implements CacheStrategy {
  // Kimi: 注入 prompt_cache_key（用 conversationId），从 usage.cached_tokens 统计
  applyToRequest(req, cacheOpts) {
    if (!cacheOpts?.conversationId) return req;
    return { ...req, cacheKey: cacheOpts.conversationId };
  }
  extractCacheMetrics(usage) {
    // Kimi 返回 cached_tokens 在 usage 中
    const cached = (usage as Record<string, unknown>).cachedTokens as number ?? 0;
    return { hitTokens: cached, missTokens: usage.inputTokens - cached, hitRate: /* 计算 */ };
  }
}

class CacheControlStrategy implements CacheStrategy {
  // Qwen: 在 system 消息中标记 cache_control: {type: "ephemeral"}
  applyToRequest(req) {
    // 在 messages 的前两条 system 消息上附加 cache_control 标记
    // 由 Provider 内部处理
    return req;
  }
  extractCacheMetrics(usage) { /* 从 Qwen 响应中提取 */ }
}

class NoCacheStrategy implements CacheStrategy {
  applyToRequest(req) { return req; }
  extractCacheMetrics() { return { hitTokens: 0, missTokens: 0, hitRate: 0 }; }
}
```

### 3.5 withRequestScopedCache 重构

```typescript
// before
export function withRequestScopedCache(provider, req, cacheOptions) {
  if (!(provider instanceof OpenAIProvider) || !cacheOptions?.previousResponseId) {
    return req;
  }
  return { ...req, cache: { previousResponseId: cacheOptions.previousResponseId } };
}

// after
export function withRequestScopedCache(provider, req, cacheOptions) {
  const caps = provider.getCapabilities();
  const strategy = createCacheStrategy(caps.cacheStrategy);
  return strategy.applyToRequest(req, cacheOptions);
}
```

### 3.6 消息转换中的不可逆问题

**当前问题**：`developer` → `system` 合并后不可逆。

**解决方案**：不在转换时合并，而是在 `ProviderMessage` 中保留 `developer` 角色，由 MessagePurifier 在发送前根据目标能力决定是否合并。

但 `ProviderMessage.role` 的联合类型已经是 `'system' | 'developer' | 'user' | 'assistant' | 'tool_call' | 'tool_result'`——`developer` 已经在类型中了。

所以真正的修复是：**`openai-compatible.provider.ts` 的 `convertMessages()` 不要无条件合并 `developer` 和 `system`，而是保留原始 role，让 MessagePurifier 来处理。**

```typescript
// openai-compatible.provider.ts convertMessages()
case 'system':
  result.push({ role: 'system', content: msg.content as string });
  break;
case 'developer':
  // 如果目标支持 developer role，保留；否则合并为 system
  if (msg.role === 'developer') {
    result.push({ role: 'system', content: msg.content as string });
    // 注: Chat Completions API 不支持 developer role，只能合并
    // 但 MessagePurifier 已经在上游处理了，这里不需要特殊逻辑
  }
  break;
```

实际上 Chat Completions API 本身就不支持 `developer` 角色，所以合并是不可避免的。**真正需要做的是：在从 Chat Completions 响应构建 `ProviderMessage` 时，不要丢失"这条消息原本是 developer"的信息。**

解决办法：在 `ProviderMessage` 中新增一个可选字段：

```typescript
interface ProviderMessage {
  // ... 现有字段
  /** 原始角色标记（当 role 被降级时保留原始值） */
  originalRole?: 'developer';
}
```

这样当消息从 GPT → DeepSeek → 再回到 GPT 时，如果原始消息是 `developer`，可以通过 `originalRole` 还原。

---

## 4. 实施计划

### Phase 1: 接口扩展 + reasoning 净化（1 周）

**目标**：解决 reasoning_content 跨模型污染，消除 GPT/MiMo 切换报错。

| 步骤 | 任务                                                                                  | 文件                                 | 改动量    |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------ | --------- |
| 1.1  | `ProviderCapabilities` 新增 `reasoningMode`、`cacheStrategy`、`supportsDeveloperRole` | `shared/agent/contracts/provider.ts` | ~10 行    |
| 1.2  | `OpenAIProvider` 和 `OpenAICompatibleProvider` 声明完整 capabilities                  | 两个 provider 文件                   | 各 ~5 行  |
| 1.3  | 实现 `MessagePurifier.purifyMessages()`                                               | 新文件 `messagePurifier.ts`          | ~40 行    |
| 1.4  | 在 `ai.service.ts` 的 `stream()` 和 `streamEditor()` 入口调用 purifier                | `ai.service.ts`                      | ~10 行    |
| 1.5  | 删除 `openai-compatible.provider.ts` 中的硬编码 reasoning_content 传递                | `openai-compatible.provider.ts`      | ~5 行删除 |

**验收**：DeepSeek → GPT → DeepSeek 切换后连续 5 轮对话无格式错误。

### Phase 2: 缓存策略重构（1 周）

**目标**：消除 `instanceof OpenAIProvider` 硬编码，让每个模型用正确的缓存策略。

| 步骤 | 任务                                            | 文件                      | 改动量 |
| ---- | ----------------------------------------------- | ------------------------- | ------ |
| 2.1  | 实现 `CacheStrategy` 接口及 4 个策略类          | 新文件 `cacheStrategy.ts` | ~80 行 |
| 2.2  | 重构 `withRequestScopedCache()` 为策略模式      | `ai.service.helpers.ts`   | ~15 行 |
| 2.3  | 在 `ai.service.ts` 中根据 capabilities 选择策略 | `ai.service.ts`           | ~10 行 |
| 2.4  | DeepSeek prefix cache 观察 + 统计               | `token-usage.service.ts`  | ~20 行 |

**验收**：DeepSeek 多轮对话可观察到 `prompt_cache_hit_tokens > 0`；GPT `previous_response_id` 正常工作。

### Phase 3: 逐模型适配（2 周）

**目标**：逐个适配目标模型，每个模型端到端验证。

#### 3.1 基础设施：ProviderCapabilities 声明

每个模型的 capabilities 声明（基于实际 API 文档）：

```typescript
// DeepSeek
const DEEPSEEK_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'passthrough', // reasoning_content 可选
  cacheStrategy: 'prefix', // 被动前缀缓存
  supportsDeveloperRole: false,
};

// MiMo (小米)
const MIMO_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'required', // reasoning_content 必须回传
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

// MiniMax M2.7
const MINIMAX_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'passthrough', // thinking.budget_tokens 控制
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

// Kimi K2 (月之暗面)
const KIMI_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'passthrough', // thinking.type 控制开关
  cacheStrategy: 'cache_key', // prompt_cache_key 参数
  supportsDeveloperRole: false,
};

// GLM-4.6 (智谱)
const GLM_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'none', // 模型自行决定
  cacheStrategy: 'none',
  supportsDeveloperRole: false,
};

// Qwen 3 (阿里)
const QWEN_CAPS: ProviderCapabilities = {
  ...DEFAULT_CAPS,
  reasoningMode: 'passthrough', // enable_thinking 控制
  cacheStrategy: 'cache_control', // cache_control: {type: "ephemeral"}
  supportsDeveloperRole: false,
};
```

#### 3.2 适配顺序（按用户量和紧急度）

| 步骤 | 模型    | 关键适配点                                                               | 测试重点                                 |
| ---- | ------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| 3.2  | MiMo    | `reasoningMode: 'required'` — MessagePurifier 必须保留 reasoning_content | 从 DeepSeek 切换到 MiMo 后多轮对话不报错 |
| 3.3  | Kimi    | `cacheStrategy: 'cache_key'` — 注入 `prompt_cache_key` 参数              | 缓存命中率 > 0（观察 `cached_tokens`）   |
| 3.4  | Qwen    | `cacheStrategy: 'cache_control'` — messages 中标记 cache_control         | 缓存标记正确注入                         |
| 3.5  | MiniMax | `reasoningMode: 'passthrough'` + `thinking.budget_tokens`                | reasoning 输出正确传递                   |
| 3.6  | GLM     | `reasoningMode: 'none'` — 最简单                                         | 基础对话 + tool_calls 正常               |

#### 3.3 每个模型的 API 适配细节

**MiMo（小米）**：

```typescript
// 请求: 标准 Chat Completions，无特殊参数
// 响应: delta.reasoning_content 强制存在
// 关键: 对话历史中每条 assistant 消息必须包含 reasoning_content
//       如果缺失 → HTTP 400
// 适配: MessagePurifier 对 reasoningMode='required' 的模型不删除 reasoningContent
//       如果历史中某条消息缺少 reasoningContent，填充空字符串
```

**Kimi（月之暗面）**：

```typescript
// 请求: 标准 Chat Completions + thinking.type 控制推理
//       可选 prompt_cache_key 指定缓存键
// 响应: usage.cached_tokens 返回缓存命中数
// 适配: CacheStrategy 注入 prompt_cache_key（用 conversationId）
//       从 usage 中提取 cached_tokens 统计缓存命中率
```

**MiniMax**：

```typescript
// 请求: 标准 Chat Completions + thinking.budget_tokens 控制推理预算
//       budget_tokens=0 关闭推理
// 响应: delta.reasoning_content 仅在 budget_tokens > 0 时出现
// 适配: 默认不传 thinking 参数（让模型自行决定）
//       如果用户显式关闭推理，传 thinking: {budget_tokens: 0}
```

**GLM（智谱）**：

```typescript
// 请求: 标准 Chat Completions，基本无特殊参数
// 响应: 模型自行决定是否返回 reasoning_content
// 适配: 最简单，reasoningMode='none' 意味着不主动管理 reasoning
//       收到 reasoningContent 就保留，没收到就不管
```

#### 3.4 端到端测试矩阵

每个模型适配后跑通以下场景：

| 场景           | 描述                            | 通过标准                 |
| -------------- | ------------------------------- | ------------------------ |
| 单轮对话       | 发送 1 条消息，验证响应格式     | 正常返回，无 400         |
| 多轮对话       | 连续 5 轮对话                   | 每轮正常返回             |
| 跨模型切换     | DeepSeek → 目标模型 → DeepSeek  | 切换后不报错             |
| compaction     | 对话超过 token 限制后触发压缩   | 压缩后继续正常对话       |
| tool_calls     | 调用 editor_update_props 工具   | 工具正确执行             |
| reasoning 输出 | 观察 reasoning_content 流式输出 | 有推理能力的模型输出正常 |

---

## 5. 不改什么

| 不改                                         | 原因                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `ProviderMessage` 的整体结构                 | 现有结构够用，只加 `originalRole` 一个可选字段    |
| `QueryLoop` 核心逻辑                         | MessagePurifier 在 QueryLoop 外层调用，不侵入循环 |
| 前端 Provider（`backend-proxy.provider.ts`） | 前端只做代理，不直接调用模型 API                  |
| `openai` npm 包版本                          | 当前版本已支持 Responses API 和 Chat Completions  |

---

## 6. 风险与缓解

| 风险                                                     | 影响                      | 缓解                                                                          |
| -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| 国产模型 API 变更（如 MiMo 修改 reasoning_content 行为） | 适配层需更新              | ProviderCapabilities 抽象隔离变更；自动化测试快速发现回归                     |
| MessagePurifier 误删字段                                 | 模型返回意外错误          | 每个 reasoningMode 都有单元测试覆盖；保留 `passthrough` 作为默认              |
| CacheStrategy 改动影响已有 GPT 缓存                      | GPT 缓存命中率下降        | `ResponseIdCacheStrategy` 行为与当前 `instanceof OpenAIProvider` 逻辑完全一致 |
| `originalRole` 增加消息大小                              | 对话历史占用更多 token    | `originalRole` 仅在 role=system 且原始为 developer 时设置，极少见             |
| MiniMax `reasoning_split` 模式复杂度                     | 需要 MiniMax SDK 特殊参数 | Phase 3 逐个适配，不阻塞 Phase 1/2                                            |

---

## 7. 工期估算

| Phase                     | 周期     | 核心交付                     |
| ------------------------- | -------- | ---------------------------- |
| Phase 1: 接口 + reasoning | 1 周     | GPT/MiMo/DeepSeek 切换不报错 |
| Phase 2: 缓存策略         | 1 周     | 每个模型用正确的缓存策略     |
| Phase 3: 逐模型适配       | 2 周     | 7 个模型全部端到端通过       |
| **总计**                  | **4 周** | 多模型无缝切换               |

---

## 8. 与原路线图的关系

本方案是 `docs/roadmap/README.md` P0-1 的细化实现版本，采用 `execution-plan.md` 的"先止血、再抽象"原则：

- Phase 1 对应"止血"：用最小改动解决 reasoning_content 污染
- Phase 2 对应"稳基"：把 instanceof 硬编码替换为策略模式
- Phase 3 对应"补能"：逐个适配目标模型

原路线图 P0-2（缓存策略抽象与稳定化）和 P0-3（结构化 SSE 协议）在本方案中部分覆盖（缓存策略），其余部分（SSE 协议、compaction 前缀保护）已在前序改动中完成或独立处理。
