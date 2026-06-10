# PR 实施状态追踪

> **更新日期**: 2026-06-10
> **基准分支**: `feat/cache-aware-compaction`（PR #16）
> **用途**: 对齐当前开放 PR 链和原 pr3 拆分计划，明确哪些任务已完成、哪些任务仍需后续 PR。

## 当前开放 PR 链

```
master
  └─ #11 feat/ai-semantic-editing
       └─ #12 feat/structured-sse-phase1
            └─ #13 feat/sse-phase2-edit-undo-cleanup
                 └─ #14 feat/cache-strategy-providers
                      └─ #15 feat/pipeline-prevalidate
                           └─ #16 feat/cache-aware-compaction
                                └─ codex/roadmap-pr3-followup
```

| PR        | 分支                                | Base     | 完成状态         | 说明                                                                              |
| --------- | ----------------------------------- | -------- | ---------------- | --------------------------------------------------------------------------------- |
| #11       | `feat/ai-semantic-editing`          | `master` | 完成             | 语义编辑、节点候选集、semantic assertions 和相关测试                              |
| #12       | `feat/structured-sse-phase1`        | #11      | 完成             | `sse.v1` envelope、结构化事件合同、兼容消费                                       |
| #13       | `feat/sse-phase2-edit-undo-cleanup` | #12      | 完成             | 前端结构化事件消费、编辑应用清理、撤销栈基础                                      |
| #14       | `feat/cache-strategy-providers`     | #13      | 完成             | 配置驱动多模型能力、消息净化、缓存策略、跨模型测试                                |
| #15       | `feat/pipeline-prevalidate`         | #14      | 主要能力完成     | `preValidateAndFix` 已接入，剩余 reviseActions 闭环和失败样本映射                 |
| #16       | `feat/cache-aware-compaction`       | #15      | 当前 PR 范围完成 | compaction decision 和 auto compact 已落地，完整缓存诊断仍在后续                  |
| follow-up | `codex/roadmap-pr3-followup`        | #16      | 本次 PR          | 修复 micro compaction 行为、SSE heartbeat open handle、后端验证依赖、roadmap 同步 |

## 原 pr3 拆分任务对照

| 原计划                                    | 当前结果                                                                                                                                               | 后续处理                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| pr3-01 CacheStrategy 补全 + 国产 Provider | CacheStrategy、MessagePurifier、ProviderCapabilities 和跨模型测试已完成。独立 Provider 类方案已被配置驱动 `OpenAICompatibleProvider` 取代。            | 除非模型 API 无法通过配置表达，否则不再新增模型专属 Provider 类。                                     |
| pr3-02 preValidateAndFix + SchemaGen 增强 | `preValidateAndFix` 已在 SchemaGen parse 前执行，pipeline 覆盖 schema exception retry 和 `lastSchema` 调试。`CriticVerdict.reviseActions` 类型已存在。 | 补齐 Critic prompt/解析/消费闭环，并把 agent eval 失败样本映射到预修复规则。                          |
| pr3-03 缓存感知 Compaction + 可观测性     | `decideCompaction` 和 `autoCompactIfNeeded` 已实现 skip/micro/full 策略，当前 follow-up 修复 micro 分支使用 prefix-safe 微压缩。                       | 仍需编辑器 `cache_diagnostic` 或等价诊断扩展、前端诊断面板、provider log 和前端 compaction 指标统一。 |
| pr3-04 结构化 SSE 协议                    | 已在 #12/#13 完成。当前事件名是 `tool_start`、`tool_done`、`tool_error`，不是旧计划里的 `tool_call_start/end`。                                        | 仅保留新增缓存诊断事件或 `usage_summary` 扩展。                                                       |
| pr3-05 编辑撤销栈 + 原子操作              | 撤销栈持久化、服务层测试和编辑应用清理已完成。                                                                                                         | `compactSummary`、`lastPrefixHash`、`cacheContext` 尚未持久化，需要先确认是诊断数据还是会话恢复数据。 |

## 本次 follow-up PR 内容

- 修复 `src/ai/core/compact/autoCompact.ts`：`micro` 策略现在调用 `microcompactMessages()`，不再误走 LLM 摘要 compaction。
- 新增 `src/ai/core/compact/autoCompact.spec.ts`：覆盖 micro compaction 的 prefix-safe 行为，确保 system 前缀保留、旧 tool result 被截断、最近 tool result 不被截断。
- 修复 `backend/src/ai/ai.controller.ts`：SSE heartbeat interval 调用 `unref()`，避免 Jest open handle。
- 补齐 `backend/package.json` 直接 devDependencies，并更新 pnpm allowBuilds，使 `pnpm --dir backend test` 和 `pnpm lint:backend` 在当前工作区可重复执行。
- 同步 `docs/roadmap`，删除已过期的实施前计划文档。

## 下一批建议拆分

### 1. Cache diagnostics PR

目标：把已有 token usage、cache hit、prefix hash 和 compaction strategy 变成可观测产品能力。

验收：

- SSE 合同包含 `cache_diagnostic`，或 `usage_summary` 明确扩展缓存诊断字段。
- 前端 AI 面板能展示每轮 cache hit rate、prefix hash、compaction strategy、prefix changed。
- provider log compaction 和前端 auto compact 共享诊断结构。
- 测试覆盖 compact 后 prefix 是否变化、缓存命中率字段是否传到前端。

### 2. Pipeline failure loop PR

目标：把 agent eval 失败输出转成可复现、可修复、可回归的 pipeline 输入。

验收：

- agent eval 失败报告按 schema、semantic、render、unrelated diff 分类输出。
- 常见 schema failures 有对应 `preValidateAndFix` 规则和回归测试。
- Critic `reviseActions` 从 prompt 到 pipeline 消费路径完整可测。

### 3. Agent eval CI PR

目标：让 Phase 3 的评测体系进入可持续运行状态。

验收：

- CI 中运行稳定 mock eval 子集。
- live smoke 继续保持可选，并可通过环境变量升级为严格模式。
- 报告输出 task score、semantic failure 分类、token usage、cache hit 和模型维度。

### 4. Semantic compiler PR

目标：提升语义编辑覆盖率，减少模型直接猜工具参数。

验收：

- 常见编辑意图先转成结构化 semantic target，再编译为工具调用。
- 新增语义断言覆盖页面、节点、交互、样式和不相关 diff。
- mock scenarios 证明语义工具覆盖率提升。
