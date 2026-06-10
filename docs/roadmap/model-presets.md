# 国产模型预设配置模板

> **创建日期**: 2026-06-10
> **关联**: pr3-01 CacheStrategy 补全 + 国产 Provider

---

## 配置方式

所有模型通过环境变量配置，无需代码改动：

```bash
AI_PROVIDER=openaiCompatible
AI_API_KEY=your-api-key
AI_BASE_URL=https://api.example.com/v1
AI_MODEL=model-name
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=none
AI_EXTRA_PARAMS='{}'
```

---

## DeepSeek

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=prefix
```

**特性**:

- 被动前缀缓存 — 无需显式标记，自动匹配前缀
- 通过 `usage.prompt_cache_hit_tokens` 观察命中率
- `reasoning_content` 流式输出（逐字符）

---

## GPT-4o / GPT-4.1

```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4.1
AI_CACHE_STRATEGY=response_id
```

**特性**:

- 使用 Responses API（`openai` provider）
- `previous_response_id` + `store: true` 实现有状态缓存
- 不支持 `reasoning_content`

---

## MiMo

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://api.mimo.ai/v1
AI_MODEL=mimo-v2.5-pro
AI_REASONING_MODE=required
AI_CACHE_STRATEGY=none
```

**特性**:

- `reasoning_content` **必须回传**，否则 400 错误
- `messagePurifier` 自动为空 assistant 消息填充空字符串
- 无缓存支持

---

## MiniMax M2.7

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://api.minimax.chat/v1
AI_MODEL=MiniMax-M2.7
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=none
AI_EXTRA_PARAMS='{"reasoning_split": true}'
```

**特性**:

- `reasoning_split: true` 分离推理输出流
- `reasoning_content` 可选回传
- 无缓存支持

---

## Qwen (通义千问)

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-max
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=cache_control
AI_EXTRA_PARAMS='{"enable_thinking": true}'
```

**特性**:

- `cache_control: { type: "ephemeral" }` 显式标记前两条 system 消息
- 缓存 TTL 5 分钟
- `enable_thinking: true` 启用链式推理

---

## Kimi (月之暗面)

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://api.moonshot.cn/v1
AI_MODEL=kimi-k2
AI_REASONING_MODE=passthrough
AI_CACHE_STRATEGY=cache_key
```

**特性**:

- `prompt_cache_key` 参数实现缓存匹配
- 自动使用 conversationId 作为 cache key
- `reasoning_content` 可选回传

---

## GLM (智谱)

```bash
AI_PROVIDER=openaiCompatible
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_MODEL=glm-4-plus
AI_REASONING_MODE=none
AI_CACHE_STRATEGY=none
```

**特性**:

- 不支持 `reasoning_content`
- 使用 `tool_stream` 参数控制流式
- 无缓存支持

---

## 能力矩阵

| 模型     | reasoningMode | cacheStrategy | 特殊参数        | developer role |
| -------- | ------------- | ------------- | --------------- | -------------- |
| DeepSeek | passthrough   | prefix        | —               | ✅             |
| GPT-4o   | none          | response_id   | —               | ✅             |
| MiMo     | required      | none          | —               | ❌             |
| MiniMax  | passthrough   | none          | reasoning_split | ❌             |
| Qwen     | passthrough   | cache_control | enable_thinking | ❌             |
| Kimi     | passthrough   | cache_key     | —               | ❌             |
| GLM      | none          | none          | —               | ❌             |
