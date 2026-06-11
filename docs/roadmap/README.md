# YanLingWeb Roadmap

> **更新日期**: 2026-06-10
> **当前基准**: `feat/cache-aware-compaction`（PR #16）
> **状态**: 当前开放 PR 链已覆盖 Phase 1 和 Phase 2 的主体能力，剩余工作收敛为诊断可视化、失败闭环和 Phase 3 评测增强。

本目录现在作为“当前状态和剩余任务”的入口。早期的实施前计划已经被实际 PR 链取代，`execution-plan.md` 和 `next-steps-plan.md` 已删除，避免继续维护两套互相冲突的路线图。

## 文档索引

| 文档                                                                       | 用途                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`pr-plan.md`](./pr-plan.md)                                               | 当前 PR 链和原 pr3 拆分任务的完成状态                                       |
| [`multi-model-compatibility-plan.md`](./multi-model-compatibility-plan.md) | 多模型兼容、ProviderCapabilities、MessagePurifier、CacheStrategy 的实现说明 |
| [`node-addressing-design.md`](./node-addressing-design.md)                 | AI 编辑器节点候选集设计背景，已实现并归档                                   |
| [`model-presets.md`](./model-presets.md)                                   | 国产模型和 OpenAI-Compatible 模型配置模板                                   |

## 当前 PR 链状态

| PR        | 分支                                | 当前状态                       | Roadmap 覆盖                                                                      |
| --------- | ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| #11       | `feat/ai-semantic-editing`          | 已完成，开放待合并             | 语义编辑工具、节点定位候选集、语义断言基础                                        |
| #12       | `feat/structured-sse-phase1`        | 已完成，开放待合并             | 结构化 SSE envelope 和事件合同                                                    |
| #13       | `feat/sse-phase2-edit-undo-cleanup` | 已完成，开放待合并             | SSE 前端消费、编辑应用清理、撤销栈基础                                            |
| #14       | `feat/cache-strategy-providers`     | 已完成，开放待合并             | ProviderCapabilities、MessagePurifier、CacheStrategy、跨模型测试                  |
| #15       | `feat/pipeline-prevalidate`         | 已完成主要能力，开放待合并     | SchemaGen `preValidateAndFix`、pipeline retry/lastSchema 调试                     |
| #16       | `feat/cache-aware-compaction`       | 已完成当前 PR 范围，开放待合并 | compaction 决策、auto compact、缓存感知跳过/微压缩                                |
| follow-up | `codex/roadmap-pr3-followup`        | 本次同步                       | 修复 #16 micro compaction 行为、SSE heartbeat open handle、后端验证依赖和 roadmap |

## 已完成能力

- 多模型兼容主路径已落地：`ProviderCapabilities`、`MessagePurifier`、`CacheStrategy` 和配置驱动的 `OpenAICompatibleProvider` 已替代“每个国产模型一个 Provider 类”的早期方案。
- 节点定位硬伤已修复：上下文使用完整 ID、displayName、容器标记和候选集格式，相关测试在 `shared/agent/editor/nodeCandidateSet.spec.ts`。
- 结构化 SSE 已落地：当前合同事件名为 `tool_start`、`tool_done`、`tool_error`、`reasoning_delta`、`pipeline_stage_start`、`pipeline_stage_end`、`usage_summary`、`clarification`、`edit_request`。
- 编辑撤销栈已落地：后端会话持久化 `undoStack`，并有数据库迁移和服务层测试覆盖。
- Pipeline 预修复已落地：`backend/src/ai-templates/stages/preValidateFix.ts` 已接入 SchemaGen 前置修复，pipeline 测试覆盖重试和 `lastSchema` 调试数据。
- Agent eval 基础已存在：`pnpm agent:evaluate`、`pnpm agent:live-smoke`、`pnpm agent:cache-test` 覆盖 mock eval、live smoke、缓存命中率脚本和失败报告输出。
- 缓存感知 compaction 当前 PR 范围已落地：`decideCompaction` 根据 token ratio、cache hit rate、失败退避决定 skip/micro/full，`autoCompactIfNeeded` 已接入。

## 仍需完成

### P0: 缓存诊断和 compaction 可观测性

当前已有 token usage、cache hit token、AgentRunner `cacheDiagnostics` 和编辑器日志里的 prefix hash，但还没有形成编辑器用户可见的完整诊断闭环。

下一步任务：

- 定义并落地编辑器侧 `cache_diagnostic` SSE 事件，或明确复用现有 `usage_summary` 的扩展字段。
- 在前端 AI 面板展示 prefix hash、cache hit rate、compaction strategy、prefix changed 等诊断信息。
- 将 provider log compaction 与前端 compaction 的关键指标统一到同一份诊断报告里。
- 为 compact 后首轮缓存命中率和 prefix 变化补充端到端验证。

### P1: Pipeline 失败样本到修复策略闭环

当前失败报告和 `preValidateAndFix` 都已存在，但两者还没有形成明确的数据闭环。

下一步任务：

- 把 `scripts/agent-eval` 输出的失败样本分类映射到 `preValidateAndFix` 可修复规则。
- 明确 `CriticVerdict.reviseActions` 的 prompt 生产、解析和消费路径。目前类型已存在，但运行时闭环仍需补齐。
- 为常见 SchemaGen 失败模式增加回归样例，避免预修复规则只覆盖单点 case。

### P1: 会话状态和缓存上下文持久化

撤销栈已经持久化，但早期 roadmap 提到的 `compactSummary`、`lastPrefixHash`、`cacheContext` 尚未成为会话状态的一部分。

下一步任务：

- 判断这些字段是否仍然需要持久化。如果只用于诊断，应归入诊断报告而不是长期会话状态。
- 如果需要跨会话恢复缓存上下文，扩展 `editor_ai_conversations` 记录结构并补充迁移和兼容测试。

### P2: Agent 评测体系增强

基础评测脚本和 mock 场景已存在，Phase 3 仍未完整收口。

下一步任务：

- 把 agent eval 纳入 CI 的稳定子集，保留 live smoke 为可选严格模式。
- 输出跨模型对比报告，包含 task score、cache hit、token cost、semantic failure 分类。
- 扩展语义编译器和语义断言覆盖，让“编辑意图”能更稳定地转成工具调用和验收条件。

## 当前设计决策

- 多模型支持以配置驱动为主：除非某个模型的 API 行为无法通过 `AI_REASONING_MODE`、`AI_CACHE_STRATEGY`、`AI_EXTRA_PARAMS` 表达，否则不再要求新增 `MiMoProvider`、`MiniMaxProvider`、`QwenProvider`、`KimiProvider` 独立类。
- 结构化 SSE 以现有 `sse.v1` 合同为准：旧文档里的 `tool_call_start`、`tool_call_end` 不再作为目标事件名。
- `execution-plan.md` 和 `next-steps-plan.md` 的内容已被当前 PR 状态和本文件替代，不再保留。
