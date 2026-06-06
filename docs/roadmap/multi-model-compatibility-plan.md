# 多模型兼容支持方案报告

> **版本**: v2.0
> **日期**: 2026-06-03
> **状态**: 已实现
> **关联**: `docs/roadmap/README.md` P0-1, `docs/roadmap/execution-plan.md` 第三批

---

## 1. 设计原则

**零硬编码模型名** — 代码中不出现任何模型名称。新增模型只需配置环境变量，零代码改动。

---

## 2. 架构

### 2.1 Provider 结构

```
backend/src/ai/ai.service.ts
  ├── AI_PROVIDER=openai           → OpenAIProvider (Responses API)
  │     capabilities: 固定（reasoningMode=none, cacheStrategy=response_id）
  │
  └── AI_PROVIDER=openai-compatible → OpenAICompatibleProvider (Chat Completions)
        capabilities: 从环境变量动态构建
```

### 2.2 能力配置方式

`OpenAICompatibleProvider` 的 capabilities 通过环境变量控制：

| 环境变量                     | 可选值                                                            | 默认值          | 说明                       |
| ---------------------------- | ----------------------------------------------------------------- | --------------- | -------------------------- |
| `AI_REASONING_MODE`          | `none` / `passthrough` / `required`                               | `passthrough`   | reasoning_content 处理方式 |
| `AI_CACHE_STRATEGY`          | `response_id` / `prefix` / `cache_key` / `cache_control` / `none` | `none`          | 缓存策略                   |
| `AI_SUPPORTS_DEVELOPER_ROLE` | `true` / `false`                                                  | `false`         | 是否保留 developer 角色    |
| `AI_CONTEXT_WINDOW`          | 数字                                                              | `1000000`（1M） | 上下文窗口大小             |

### 2.3 消息净化器 (MessagePurifier)

每个 Provider 的 `stream()` 方法入口处调用 `purifyMessages()`，根据 capabilities 自动处理：

- **reasoningMode=none**: 删除 assistant 消息中的 `reasoningContent`
- **reasoningMode=passthrough**: 保留（有则保留，无则不加）
- **reasoningMode=required**: 确保每条 assistant 消息都有 `reasoningContent`（缺失时填空字符串）

### 2.4 缓存策略 (CacheStrategy)

`withRequestScopedCache()` 根据 `cacheStrategy` 自动注入缓存参数：

- **response_id**: 注入 `previous_response_id`（GPT）
- **prefix**: 不注入（被动前缀缓存，观察响应中的命中 token）
- **cache_key**: 注入 `cacheKey`（Kimi 的 `prompt_cache_key`）
- **cache_control**: 由 Provider 内部在消息中标记（Qwen）
- **none**: 不做任何缓存操作

---

## 3. 使用方式

### 3.1 切换模型

只需修改 `.env` 文件，零代码改动：

```env
# DeepSeek
AI_PROVIDER=openai-compatible
AI_MODEL=deepseek-v4-pro
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=sk-xxx
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=prefix
AI_CONTEXT_WINDOW=1000000

# MiMo (小米)
AI_PROVIDER=openai-compatible
AI_MODEL=mimo-v2.5-pro
AI_BASE_URL=https://api.xiaomimimo.com/v1
AI_API_KEY=sk-xxx
AI_REASONING_MODE=required

# MiniMax
AI_PROVIDER=openai-compatible
AI_MODEL=minimax-m3
AI_BASE_URL=https://api.minimax.chat/v1
AI_API_KEY=sk-xxx

# Kimi (月之暗面)
AI_PROVIDER=openai-compatible
AI_MODEL=kimi-v2.6
AI_BASE_URL=https://api.moonshot.cn/v1
AI_API_KEY=sk-xxx
AI_CACHE_STRATEGY=cache_key

# GLM (智谱)
AI_PROVIDER=openai-compatible
AI_MODEL=glm-5.1
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_API_KEY=sk-xxx
AI_REASONING_MODE=none

# Qwen (阿里)
AI_PROVIDER=openai-compatible
AI_MODEL=qwen-3.7
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=sk-xxx
AI_CACHE_STRATEGY=cache_control

# GPT-5.5
AI_PROVIDER=openai
AI_MODEL=gpt-5.5
AI_API_KEY=sk-xxx
# OpenAIProvider 固定 capabilities，无需额外配置
```

### 3.2 添加新模型

新模型上市时，只需在 `.env` 中配置对应参数，代码零改动。

---

## 4. 已实现的文件

| 文件                                                          | 改动                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `shared/agent/contracts/provider.ts`                          | `ProviderCapabilities` 新增 `reasoningMode`、`cacheStrategy`、`supportsDeveloperRole` |
| `backend/src/ai/core/providers/messagePurifier.ts`            | 新增 — 消息净化器                                                                     |
| `backend/src/ai/core/providers/cacheStrategy.ts`              | 新增 — 缓存策略接口 + 5 个实现                                                        |
| `backend/src/ai/core/providers/modelCapabilities.ts`          | 新增 — 从环境变量构建 capabilities                                                    |
| `backend/src/ai/core/providers/openai-compatible.provider.ts` | 改造 — 接入 MessagePurifier + 动态 capabilities                                       |
| `backend/src/ai/core/providers/openai.provider.ts`            | 改造 — 接入 MessagePurifier + 声明 capabilities                                       |
| `backend/src/ai/ai.service.helpers.ts`                        | 改造 — `withRequestScopedCache()` 用策略模式替代 `instanceof`                         |
| `backend/src/ai/core/utils/tokens.ts`                         | 改造 — 默认 1M，`AI_CONTEXT_WINDOW` 覆盖                                              |
| `src/ai/core/utils/tokens.ts`                                 | 改造 — 删除硬编码表，默认 1M                                                          |
| `backend/src/config/config.factory.ts`                        | 更新默认模型名                                                                        |

---

## 5. 测试覆盖

| 测试文件                    | 数量   | 覆盖                                                         |
| --------------------------- | ------ | ------------------------------------------------------------ |
| `messagePurifier.spec.ts`   | 16     | 3 种 reasoning 模式 + developer 角色 + 跨模型切换 + 不可变性 |
| `modelCapabilities.spec.ts` | 8      | 环境变量覆盖 + 默认值 + 无效值处理                           |
| `nodeCandidateSet.spec.ts`  | 18     | 节点候选集格式对比 + 场景模拟                                |
| **总计**                    | **42** |                                                              |
