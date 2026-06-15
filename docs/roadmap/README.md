# YanLingWeb Roadmap

> **更新日期**: 2026-06-12
> **当前基准**: `master`（8f05e77 — PR-A #20 合并后）
> **状态**: 5 个 roadmap PR 全部到位（PR-A #20 已合并；PR-B #22 / PR-C #24 / PR-D #23 / PR-E #21 已开待 review）。剩余工作收敛为 PR 合并顺序、PR-C 配套工程和基建清理。

本目录现在作为"当前状态和剩余任务"的入口。早期的实施前计划已经被实际 PR 链取代，`execution-plan.md` 和 `next-steps-plan.md` 已删除，避免继续维护两套互相冲突的路线图。

## 文档索引

| 文档                                                                       | 用途                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`pr-plan.md`](./pr-plan.md)                                               | PR 实施状态追踪：开放 PR 链、原 pr3 拆分任务对照、P0-P3 follow-up           |
| [`multi-model-compatibility-plan.md`](./multi-model-compatibility-plan.md) | 多模型兼容、ProviderCapabilities、MessagePurifier、CacheStrategy 的实现说明 |
| [`node-addressing-design.md`](./node-addressing-design.md)                 | AI 编辑器节点候选集设计背景，已实现并归档                                   |
| [`model-presets.md`](./model-presets.md)                                   | 国产模型和 OpenAI-Compatible 模型配置模板                                   |

## 当前 PR 链状态

| PR  | 分支                                 | 当前状态           | Roadmap 覆盖                                                                                                       |
| --- | ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| #20 | （已合 master 8f05e77）              | **已合并**         | `cache_diagnostic` SSE 事件 + 前端 AI 面板 badge，token usage / cache hit / prefix hash / compaction strategy 闭环 |
| #21 | `feat/editor-session-persistence`    | 已完成，开放待合并 | 撤销栈持久化 + `editor_ai_conversations` +3 列（`compactSummary` / `lastPrefixHash` / `cacheContext`）             |
| #22 | `feat/pipeline-pre-validate-and-fix` | 已完成，开放待合并 | 失败分类器（schema / semantic / render / unrelated diff）+ Critic `reviseActions` prompt→parse→consume 闭环        |
| #23 | `feat/semantic-compiler-coverage`    | 已完成，开放待合并 | 5 entry point 语义编译器 + 24 边界用例（`shared/agent/compiler/semanticInstructionCompiler.spec.ts`）              |
| #24 | `feat/ci-agent-eval`                 | 已完成，开放待合并 | 第一次 GitHub Actions workflow（`.github/workflows/agent-eval.yml`），mock 100 场景、threshold 1.0、artifact 上传  |

历史 PR 链（#11–#16）已被 master 8f05e77 取代的 PR 链结构代替，不再单独追踪。

## 已完成能力

- **多模型兼容主路径**：配置驱动的 `OpenAICompatibleProvider` 替代早期"每个国产模型一个 Provider 类"方案。`ProviderCapabilities`、`MessagePurifier`、`CacheStrategy` 跨模型测试已落地。
- **节点定位**：上下文使用完整 ID、displayName、容器标记和候选集格式，测试在 `shared/agent/editor/nodeCandidateSet.spec.ts`。
- **结构化 SSE 协议**：合同事件名 `tool_start` / `tool_done` / `tool_error` / `reasoning_delta` / `pipeline_stage_start` / `pipeline_stage_end` / `usage_summary` / `clarification` / `edit_request` / `cache_diagnostic`。
- **编辑撤销栈 + 缓存上下文持久化**：`editor_ai_conversations` 表 +3 列（`compactSummary` / `lastPrefixHash` / `cacheContext`），8 个 service 单测覆盖幂等迁移。
- **Pipeline 预修复 + Critic 闭环**：`preValidateAndFix` 已接入 SchemaGen 前置修复，pipeline 覆盖 schema exception retry 和 `lastSchema` 调试；`submitDiversityVerdict` schema 新增 `reviseActions`，`parseReviseActions` 自由函数可单测。
- **失败分类器**：将失败报告按 schema / semantic / render / unrelated diff 分类，常见 schema failure 有 `preValidateAndFix` 规则和回归测试。
- **缓存感知 Compaction**：`decideCompaction` 根据 token ratio、cache hit rate、失败退避决定 skip/micro/full，`autoCompactIfNeeded` 已接入；`cache_diagnostic` SSE 事件 + 前端 badge 让用户可见。
- **Agent eval 体系**：`pnpm agent:evaluate` 100 mock 场景 + threshold 1.0 + markdown 报告；`pnpm agent:live-smoke` / `pnpm agent:cache-test` 留作可选严格模式。
- **5 entry point 语义编译器 + 24 边界测试**：覆盖 `submit_page_spec` / `update_slot` / `fill_pattern` / `create_page_from_page_kind` / `replace_section` 全部编译分支。

## 仍需完成

### P0: PR-A cache_diagnostic 回归测试

PR-A 已发出 `cache_diagnostic` 事件并接入前端 badge，但**端到端回归测试**还没补：

- 跨 session 时 `prefixChanged` 字段是否真的从 `false` 翻成 `true`（需要 PR-E #21 先合并提供 `lastPrefixHash`）。
- compact 后首轮 `cacheHitRate` 是否随 prompt prefix 重建而下降。
- provider log compaction 的 `cacheDiagnostics` 是否和前端 AI 面板一致。

### P0: 合并 #21 / #22 / #23 / #24

4 个 PR 都已开出来，等 review。建议合并顺序：

1. **#24 (PR-C)** — 最小（65 行新 workflow），零源码改动，最快给 master 加 CI 保护。
2. **#23 (PR-D)** — 纯测试（669 行新 spec），零源码改动，零风险。
3. **#22 (PR-B)** — 后端 9 个新单测 + 18 个分类器 case，零 schema 改动。
4. **#21 (PR-E)** — schema 加 3 列 + service 3 方法 + 8 个单测，幂等迁移但需要回归。

### P1: PR-C 配套工程

PR-C workflow 故意留下了几件未做的事：

- **guarded classifier step**（PR-B 合并后）——`node --test scripts/agent-eval/classifyFailure.spec.mjs`，用 `if: hashFiles(...) != ''` 守卫。
- **shared-agent 测试 step** ——把 `npx tsx --test shared/agent/template/buildTemplateProfile.spec.ts`、`shared/agent/compiler/semanticInstructionCompiler.spec.ts`、`src/ai/core/compact/compactionDecision.spec.ts` 加进 workflow。可独立 `pnpm test:shared` 脚本包装。
- **live-smoke workflow**（`workflow_dispatch` 触发，可选）——`pnpm agent:live-smoke` 需要 backend + LLM key，不进 PR-CI；单独 workflow `agent-eval-live.yml`，manual 触发。
- **cache hit-rate workflow**（`workflow_dispatch` 触发）——`pnpm agent:cache-test` 直接打 DeepSeek，token 成本高；单独 `agent-eval-cache.yml`，manual + 周更 schedule。
- **sticky PR comment**（`peter-evans/create-or-update-comment`）——把 markdown 报告贴到 PR 评论。需要 `pull-requests: write` scope。
- **branch protection required_status_checks**——`agent-eval` 跑过才允许合 master。

### P1: 会话缓存上下文完整化

PR-E (#21) 已落库 `compactSummary` / `lastPrefixHash` / `cacheContext` 三列。剩余：

- **cacheContext 在前端 `useCacheContext()` 中的实际消费路径**——目前只是 `prefill` 写回，前端 hook 拿不到历史值跨 session。
- **过期清理策略**——`compactSummary` 写多了会膨胀；`editor_ai_conversations` 表没设 cron 清理。

### P2: 基建清理

- **`.nvmrc`** 加 `22`——本地开发对得上 CI。
- **stale 分支清理**——`feat/cache-diagnostics`（PR-A 已合入 master，留着无意义）、`feat/editor-session-persistence`（合并后）、`feat/pipeline-prevalidate`（旧名，被 `feat/pipeline-pre-validate-and-fix` 取代）、`feat/sse-backend-integration`（已合入）等本地分支可以删。
- **跨模型矩阵聚合器**——`scripts/agent-eval/aggregateReports.js` 雏形，缺一个把多次跨模型跑分聚成可对比 markdown 表格的工具。

### P2: Agent 评测体系增强

基础评测脚本和 mock 场景已存在，Phase 3 仍未完整收口：

- 把 agent eval 纳入 CI 的稳定子集，保留 live smoke 为可选严格模式（PR-C 已部分完成）。
- 输出跨模型对比报告，包含 task score、cache hit、token cost、semantic failure 分类。
- 扩展语义编译器和语义断言覆盖，让"编辑意图"能更稳定地转成工具调用和验收条件（PR-D 已覆盖 5 entry point 边界，但更复杂的 intent 路由还没补）。

## 当前设计决策

- 多模型支持以配置驱动为主：除非某个模型的 API 行为无法通过 `AI_REASONING_MODE`、`AI_CACHE_STRATEGY`、`AI_EXTRA_PARAMS` 表达，否则不再要求新增 `MiMoProvider`、`MiniMaxProvider`、`QwenProvider`、`KimiProvider` 独立类。
- 结构化 SSE 以现有 `sse.v1` 合同为准：旧文档里的 `tool_call_start`、`tool_call_end` 不再作为目标事件名。
- 失败分类（schema / semantic / render / unrelated diff）以 PR-B #22 引入的 `pipeline.failureClassifier.ts` 为准；旧文档里"按 PR3 拆分"的失败分类方案不再保留。
- 语义编译器以 PR-D #23 引入的 5 entry point 入口为准（`submit_page_spec` / `update_slot` / `fill_pattern` / `create_page_from_page_kind` / `replace_section`）；旧"自然语言直接编 tool call"路径仅作为 fallback。
- `execution-plan.md` 和 `next-steps-plan.md` 的内容已被当前 PR 状态和本文件替代，不再保留。
