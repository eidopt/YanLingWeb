# PR 实施状态追踪

> **更新日期**: 2026-06-12
> **基准分支**: `master`（8f05e77）
> **用途**: 追踪当前开放 PR 链、原 pr3 拆分任务的完成状态，以及 PR-A/B/C/D/E 落地后的剩余工作。

## 已实现并开放的 PR 链

```
master (8f05e77 — cache_diagnostic SSE event + panel badge, PR-A)
  │
  ├─ #21 feat/editor-session-persistence       PR-E: 跨 session cache 上下文持久化
  ├─ #22 feat/pipeline-pre-validate-and-fix    PR-B: Critic reviseActions + 失败分类器
  ├─ #23 feat/semantic-compiler-coverage       PR-D: 语义编译器 24 个边界测试
  └─ #24 feat/ci-agent-eval                    PR-C: 第一次 GitHub Actions workflow
```

| PR   | 分支                                 | 状态       | 验收（按 pr-plan.md 历史草案）                                                                                                                                                        | 链接 |
| ---- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PR-A | （已合 master 8f05e77）              | **已合并** | `cache_diagnostic` SSE 事件 + 前端诊断面板 badge；token usage、cache hit、prefix hash、compaction strategy 可见                                                                       | #20  |
| PR-B | `feat/pipeline-pre-validate-and-fix` | **开放**   | 失败报告按 schema / semantic / render / unrelated diff 分类；常见 schema failure 有 `preValidateAndFix` 规则和回归测试；Critic `reviseActions` 从 prompt 到 pipeline 消费路径完整可测 | #22  |
| PR-C | `feat/ci-agent-eval`                 | **开放**   | CI 中运行稳定 mock eval 子集（100 场景、hermetic、threshold 1.0）                                                                                                                     | #24  |
| PR-D | `feat/semantic-compiler-coverage`    | **开放**   | 常见编辑意图先转成结构化 semantic target，再编译为工具调用；新增 24 个语义编译器边界测试覆盖 5 个 entry point                                                                         | #23  |
| PR-E | `feat/editor-session-persistence`    | **开放**   | 撤销栈已持久化；`compactSummary` / `lastPrefixHash` / `cacheContext` 也已落库（`editor_ai_conversations` 加 3 列）                                                                    | #21  |

## 原 pr3 拆分任务对照

| 原计划                                    | 当前结果                                                                                                                                                                                                                                                                                                                                              | 后续处理                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| pr3-01 CacheStrategy 补全 + 国产 Provider | CacheStrategy、MessagePurifier、ProviderCapabilities 和跨模型测试已完成。独立 Provider 类方案已被配置驱动 `OpenAICompatibleProvider` 取代。                                                                                                                                                                                                           | 除非模型 API 无法通过配置表达，否则不再新增模型专属 Provider 类。                                |
| pr3-02 preValidateAndFix + SchemaGen 增强 | `preValidateAndFix` 已在 SchemaGen parse 前执行，pipeline 覆盖 schema exception retry 和 `lastSchema` 调试。**PR-B 已补齐 Critic prompt→parse→consume 闭环**：`submitDiversityVerdict` 工具 schema 新增 `reviseActions`，`parseReviseActions` 自由函数可单测，`pipeline.service.buildCriticReviseSuggestion` 把存活动作格式化为带类型的项目符号列表。 | PR-B 合并后即可视为完成；剩余 follow-up 是把分类后的失败样本回归到预修复规则（已在 PR-B 落地）。 |
| pr3-03 缓存感知 Compaction + 可观测性     | `decideCompaction` 和 `autoCompactIfNeeded` 已实现 skip/micro/full 策略，PR-A 把 `cache_diagnostic` SSE 事件和前端 badge 落地，**完整可观测性闭环**已就位。                                                                                                                                                                                           | 剩余是回归测试（见下"P0 follow-up"）。                                                           |
| pr3-04 结构化 SSE 协议                    | 已在 #12/#13 完成。当前事件名是 `tool_start`、`tool_done`、`tool_error`，不是旧计划里的 `tool_call_start/end`。                                                                                                                                                                                                                                       | 仅保留新增缓存诊断事件或 `usage_summary` 扩展。                                                  |
| pr3-05 编辑撤销栈 + 原子操作              | 撤销栈持久化、服务层测试和编辑应用清理已完成。**PR-E** 把 `compactSummary` / `lastPrefixHash` / `cacheContext` 也落库，会话恢复数据齐了。                                                                                                                                                                                                             | 仍需确认：诊断数据与长期会话状态是否需要并存（PR-E 已统一到一个表里）。                          |

## 本次 follow-up PR 内容（历史的"### Cache diagnostics PR"段，现已由 PR-A 落地）

- 修复 `src/ai/core/compact/autoCompact.ts`：`micro` 策略现在调用 `microcompactMessages()`，不再误走 LLM 摘要 compaction。
- 新增 `src/ai/core/compact/autoCompact.spec.ts`：覆盖 micro compaction 的 prefix-safe 行为。
- 修复 `backend/src/ai/ai.controller.ts`：SSE heartbeat interval 调用 `unref()`，避免 Jest open handle。
- 补齐 `backend/package.json` 直接 devDependencies，并更新 pnpm allowBuilds。
- 同步 `docs/roadmap`，删除已过期的实施前计划文档。

## 仍需完成

### P0: PR-A cache_diagnostic 回归测试

PR-A 已发出 `cache_diagnostic` 事件并接入前端 badge，但**端到端回归测试**还没补：

- 跨 session 时 `prefixChanged` 字段是否真的从 `false` 翻成 `true`（需要 PR-E 先合并提供 `lastPrefixHash`）。
- compact 后首轮 `cacheHitRate` 是否随 prompt prefix 重建而下降。
- provider log compaction 的 `cacheDiagnostics` 是否和前端 AI 面板一致。

### P0: 合并 #21/#22/#23/#24

4 个 PR 都已开出来，等 review。建议合并顺序：

1. **#24 (PR-C)** — 最小（65 行新 workflow），零源码改动，最快给 master 加 CI 保护。
2. **#23 (PR-D)** — 纯测试（669 行新 spec），零源码改动，零风险。
3. **#22 (PR-B)** — 后端 9 个新单测 + 18 个分类器 case，零 schema 改动。
4. **#21 (PR-E)** — schema 加 3 列 + service 3 方法 + 8 个单测，幂等迁移但需要回归。

### P1: PR-C 配套工程

PR-C workflow 故意留下了几件未做的事，按依赖顺序：

- **guarded classifier step**（PR-B 合并后）——`node --test scripts/agent-eval/classifyFailure.spec.mjs`，用 `if: hashFiles('scripts/agent-eval/classifyFailure.spec.mjs') != ''` 守卫。
- **shared-agent 测试 step** ——把 `npx tsx --test shared/agent/template/buildTemplateProfile.spec.ts`、`shared/agent/compiler/semanticInstructionCompiler.spec.ts`、`src/ai/core/compact/compactionDecision.spec.ts` 加进 workflow。可独立 `pnpm test:shared` 脚本包装。
- **live-smoke workflow**（`workflow_dispatch` 触发，可选）——`pnpm agent:live-smoke` 需要 backend + LLM key，不进 PR-CI；单独 workflow `agent-eval-live.yml`，manual 触发。
- **cache hit-rate workflow**（`workflow_dispatch` 触发）——`pnpm agent:cache-test` 直接打 DeepSeek，token 成本高；单独 `agent-eval-cache.yml`，manual + 周更 schedule。
- **sticky PR comment**（`peter-evans/create-or-update-comment`）——把 markdown 报告贴到 PR 评论。需要 `pull-requests: write` scope。
- **branch protection required_status_checks**——`agent-eval` 跑过才允许合 master。

### P2: 基础设施 cleanup

- **`.nvmrc`** 加 `22`——本地开发对得上 CI。
- **stale 分支清理**——`feat/cache-diagnostics`（PR-A 已合入 master，留着无意义）、`feat/editor-session-persistence`（合并后）、`feat/pipeline-prevalidate`（旧名，被 `feat/pipeline-pre-validate-and-fix` 取代）、`feat/sse-backend-integration`（已合入）等本地分支可以删。
- **PR 链接补齐**——本文件表头"## 已实现并开放的 PR 链"段里，PR-A 的 4 个本地 branch 名字（`feat/ai-semantic-editing` / `feat/structured-sse-phase1` / ...）只显示老 chain 形态，可以补一段说明这部分已被 master 取代。

### P3: Phase 3 评测增强

`pr-plan.md` 第 71-77 行历史草案剩下两条验收（"live smoke 保持可选"和"报告输出 task score、semantic failure 分类、token usage、cache hit、模型维度"）还没做。`pnpm agent:evaluate` 报告已经够细（`scripts/agent-eval/aggregateReports.js` 雏形），缺一个跨模型矩阵聚合器。
