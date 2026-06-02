# 言灵项目执行策略：稳定优先路线图

> **版本**: v1.0
> **创建日期**: 2026-06-03
> **基准文档**: `docs/roadmap/README.md`
> **目标**: 先让系统能稳定跑起来，再谈优化和扩展

---

## 核心原则

1. **不提前抽象** — 先用最少代码解决阻断性问题，验证思路对了再抽象
2. **每批结束都可上线** — 每一步都是可交付的，不依赖后续工作
3. **断开依赖链** — 小改动独立推进，不被大设计阻塞
4. **止血 → 稳基 → 补能** — 三步走，每步 2 周

---

## 第一批：止血（W1-W2）

> 目标：消除"系统不能用"的阻断性问题。改动最小、风险最低。

### 1.1 消除 `COMPACTION_MODEL` 硬编码

**问题**: 切换主模型后 compaction 仍调用 DeepSeek，直接报错。
**改动**: `src/ai/core/compact/compact.ts` + `backend/src/ai/core/compact/compact.ts`，各改一行。

```ts
// before (line 6)
const COMPACTION_MODEL = 'deepseek-v4-flash';

// after
const COMPACTION_MODEL = config.models.lite ?? 'deepseek-v4-flash';
```

**验收**: 切换到 GPT 后 compaction 不报错。
**工期**: 0.5 天

### 1.2 `reasoning_content` 跨模型净化

**问题**: DeepSeek 对话历史包含 `reasoning_content`，GPT 不认识此字段，第二轮对话返回 400。
**改动**: `backend/src/ai/core/providers/openai-compatible.provider.ts` 的 `convertMessages()` 方法。

```ts
function stripReasoningIfNeeded(messages: ProviderMessage[], targetModel: string): ProviderMessage[] {
  const needsReasoning = ['mimo', 'deepseek'].some((m) => targetModel.includes(m));
  if (needsReasoning) return messages;
  return messages.map((msg) => {
    const { reasoningContent, ...rest } = msg;
    return rest;
  });
}
```

**验收**: DeepSeek → GPT 切换后连续 5 轮对话无格式错误。
**工期**: 1 天

### 1.3 SSE 心跳机制

**问题**: Pipeline 生成耗时 30-60 秒，中间无输出导致连接超时断开。
**改动**: `backend/src/ai/ai.controller.ts`，在 SSE 端点添加定时器。

```ts
// 在 SSE Observable 订阅时启动心跳
const heartbeat = setInterval(() => {
  observer.next({ data: ':heartbeat\n\n' });
}, 5000);

// 在 complete/error 时清除
return () => clearInterval(heartbeat);
```

前端不需要改——浏览器 `EventSource` 自动忽略 SSE 注释行但会重置超时计时器。
**验收**: 长时间请求（>30s）不断开。
**工期**: 0.5 天

### 第一批总工期: 2 天

### 第一批完成后的系统状态

- 切换模型后 compaction 正常工作
- 多模型对话不会因 `reasoning_content` 污染报错
- 长时间 AI 请求不会超时断开
- **系统基本可用了**

---

## 第二批：稳基（W3-W4）

> 目标：解决"跑了但不稳定"的问题，提升 Pipeline 成功率和缓存效率。

### 2.1 `preValidateAndFix()` 预修复链（ROI 最高）

**问题**: SchemaGen 的 `dedupeNodeIds()` 和 `autoBizComponents()` 在验证之后才执行，导致本可自动修复的问题白白浪费一轮 LLM 重试。
**改动**: `backend/src/ai-templates/stages/schema-generator.agent.ts`，调整调用顺序。

```
当前：LLM 输出 → parseAndValidate() → 失败 → dedupe/autoFix → 反馈 LLM → 重试
改为：LLM 输出 → dedupe/autoFix → parseAndValidate() → 失败 → 反馈 LLM → 重试
```

代码已经存在（`dedupeNodeIds` 在 68-95 行，`autoBizComponents` 在 152-169 行），只是调用顺序问题。
**预期收益**: Pipeline 一次通过率从 ~50% 提升到 65%+，零额外成本。
**工期**: 1 天

### 2.2 Pipeline 单阶段重试

**问题**: SchemaGen 失败后 `pipeline.service.ts` 第 102 行 `continue` 跳回 Designer 重跑，浪费 Designer + Critic 结果。
**改动**: `backend/src/ai-templates/orchestrator/pipeline.service.ts`，为 SchemaGen 增加独立重试循环。

```ts
// SchemaGen 阶段独立重试，不回退到 Designer
let schemaRecord;
let schemaGenSucceeded = false;
for (let stageRetry = 0; stageRetry < 3; stageRetry++) {
  try {
    schemaRecord = await this.schemaGenerator.run(brief, attempt);
    schemaGenSucceeded = true;
    break;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`SchemaGen stage retry ${stageRetry + 1}/3: ${msg}`);
    if (stageRetry === 2) {
      // 3 次都失败才设置 reviseSuggestion，触发全局重试
      reviseSuggestion = `Stage 3 schema generation failed: ${msg}`;
      lastError = `schema gen throw: ${msg}`;
    }
  }
}
if (!schemaGenSucceeded) continue; // 此时才回到 Designer
```

**预期收益**: SchemaGen 失败不再浪费 Designer + Critic 的调用成本。
**工期**: 1 天

### 2.3 `instanceof OpenAIProvider` 替换

**问题**: `ai.service.helpers.ts` 第 120 行用 `instanceof OpenAIProvider` 硬编码判断缓存支持，DeepSeek 等模型永远拿不到缓存。
**改动**: 改为检查 provider 能力标志。

```ts
// before
if (!(provider instanceof OpenAIProvider) || !cacheOptions?.previousResponseId) {
  return req;
}

// after
if (!cacheOptions?.previousResponseId && !provider.supportsPrefixCache) {
  return req;
}
```

不需要完整的 `CacheStrategy` 抽象——先让 DeepSeek 的 Prefix Caching 能工作。
**工期**: 1 天

### 2.4 缓存感知的 Compaction 决策

**问题**: `compact.ts` 第 97-101 行直接修改 system 消息内容，破坏 Prefix Caching。
**改动**: 实现消息结构分离（`CompactSafeMessages`），compact 只改 volatile slot。

```ts
// 新增 volatile slot，compact 摘要写入此处
function applyCompactionSafe(messages: ProviderMessage[], summary: string): ProviderMessage[] {
  const [stableMsg, ...rest] = messages;
  return [
    stableMsg, // system: 不变
    { role: 'system', content: `[Context Summary]\n${summary}` }, // 替换 volatile slot
    ...rest.slice(1),
  ];
}
```

**预期收益**: DeepSeek 多轮对话缓存命中率从 ~10% 恢复到 >30%。
**工期**: 2 天

### 第二批总工期: 5 天

### 第二批完成后的系统状态

- Pipeline 一次通过率 >65%
- SchemaGen 失败不再浪费整轮 Pipeline
- DeepSeek 缓存开始工作
- **系统稳定可用了**

---

## 第三批：补能（W5-W6）

> 目标：补全缺失的模型适配和用户可见能力。

### 3.1 `ProviderCapabilities` 接口 + 逐个适配国产模型

前两批已经解决了阻断性问题。这时候从容定义接口，逐个添加 Provider：

```ts
interface ProviderCapabilities {
  reasoningMode: 'none' | 'passthrough' | 'required' | 'split';
  cacheStrategy: 'prefix' | 'response_id' | 'cache_control' | 'content_auto' | 'none';
  requiresReasoningContentPassthrough: boolean;
  supportsDeveloperRole: boolean;
  toolCallFormat: 'function_call' | 'tool_calls';
}
```

**适配顺序**（按用户量和紧急度）:

| 顺序 | 模型       | 理由                                   |
| ---- | ---------- | -------------------------------------- |
| 1    | DeepSeek   | 已在用，需规范化                       |
| 2    | GPT        | 已在用，需修复缓存                     |
| 3    | MiMo       | reasoning_content 强制回传，容易出 bug |
| 4    | Qwen       | 用户量大，cache_control 支持           |
| 5    | MiniMax    | reasoning_split 特殊处理               |
| 6    | Kimi / GLM | 按需添加                               |

每加一个都跑通端到端测试再加下一个。
**工期**: 2 周

### 3.2 结构化 SSE 事件

心跳已经有了，这时候逐步添加结构化事件：

- `reasoning_delta` — DeepSeek/MiMo 推理过程展示
- `pipeline_stage_start/end` — Pipeline 阶段进度
- `tool_call_start/end` — 工具调用状态

前端可以逐步消费——新事件类型是纯增量，不破坏已有逻辑。
**工期**: 1 周

### 3.3 缓存策略抽象化

有了 `ProviderCapabilities` 后，把第一批里的临时实现统一收敛到 `CacheStrategy` 策略模式。重构而非重写。
**工期**: 1 周

### 第三批总工期: 4 周

### 第三批完成后的系统状态

- 多模型切换无缝工作，每个模型有正确的缓存策略
- 前端可看到 AI 推理过程和 Pipeline 进度
- **系统能力完整了**

---

## 后续工作（W7+）

稳定和补能完成后，再推进以下工作：

| 优先级 | 课题                                      | 理由                       |
| ------ | ----------------------------------------- | -------------------------- |
| P1     | P1-1 Pipeline 成功率（Critic 结构化修正） | 在预修复链基础上进一步提升 |
| P2     | P1-3 撤销栈                               | 用户高频需求，实现相对独立 |
| P3     | P2-1 Agent 评测体系                       | 质量保障基础设施           |
| P4     | P1-2 pageKind 推断增强                    | 收益有限，降优先级         |
| P5     | P1-3 原子操作 + 持久化                    | 复杂度高，需充分设计       |
| P6     | P2-2 语义编译器扩展                       | 长期收益，渐进添加         |

---

## 与原路线图的差异

| 原路线图            | 本执行策略                         | 原因                             |
| ------------------- | ---------------------------------- | -------------------------------- |
| P0-1 在 W1-W3，3 周 | 第三批再做完整抽象                 | 先用小改动止血，不阻塞其他工作   |
| P0-2 在 W2-W3       | 拆分：W4 做消息分离，W6 做完整策略 | 降低单批次复杂度                 |
| P0-3 在 W3-W4       | 拆分：W1 做心跳，W5 做结构化事件   | 心跳是刚需，结构化事件可后做     |
| P1-1 在 W6-W8       | 提前到 W3                          | 预修复链改动小、收益大，应尽早做 |
| P1-2 在 W8          | 降级到后续                         | pageKind 推断收益有限            |
| P1-3 在 W8-W9       | 拆分：撤销栈提前，原子操作推后     | 降低风险                         |

---

## 风险与缓解

| 风险                               | 缓解                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| 第一批改动过于临时，后续重构成本高 | 明确第一批是"止血"而非"设计"，第三批会收敛为正式抽象                       |
| SchemaGen 预修复可能引入新 bug     | 修复逻辑已有代码基础（dedupeNodeIds、autoBizComponents），只是调用顺序变化 |
| 单阶段重试可能产生不一致状态       | SchemaGen 是纯函数式生成，不修改共享状态，重试安全                         |
| 缓存策略临时实现不够通用           | 第三批会收敛为正式接口，临时实现作为 fallback 保留                         |

---

## 里程碑

```
W1-W2  ──── 第一批：止血
             ✓ compaction 模型配置化
             ✓ reasoning_content 净化
             ✓ SSE 心跳
             → 系统基本可用

W3-W4  ──── 第二批：稳基
             ✓ SchemaGen 预修复链
             ✓ Pipeline 单阶段重试
             ✓ 缓存逻辑开放给 DeepSeek
             ✓ compact 前缀保护
             → 系统稳定可用

W5-W6  ──── 第三批：补能（前半）
             ✓ ProviderCapabilities 接口
             ✓ 国产模型逐个适配
             ✓ 结构化 SSE 事件
             → 系统能力完整

W7-W8  ──── 第三批：补能（后半）
             ✓ 缓存策略抽象化
             ✓ 缓存可观测性
             → 系统可观测

W9+    ──── 后续迭代
             ✓ Pipeline Critic 结构化修正
             ✓ 编辑撤销栈
             ✓ Agent 评测体系
             ✓ 语义编译器扩展
```

---

_本文档是 `docs/roadmap/README.md` 的执行策略补充，侧重"先做什么"而非"做什么"。_
