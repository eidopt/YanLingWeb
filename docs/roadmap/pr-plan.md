# PR 实施状态追踪

> **更新日期**: 2026-06-15
> **基准分支**: `master`（3b0822f — PR-A/B/C/D/E 全部合并后）
> **用途**: 追踪 PR-A/B/C/D/E 落地后的剩余工作与基础设施 cleanup 状态。

## PR-A/B/C/D/E + 基建 cleanup PR 状态

| PR   | 分支                                 | 状态       | 验收摘要                                                                                                                 | 链接 |
| ---- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| PR-A | （已合 master 8f05e77）              | **已合并** | `cache_diagnostic` SSE 事件 + 前端诊断面板 badge；token usage、cache hit、prefix hash、compaction strategy 可见          | #20  |
| PR-B | `feat/pipeline-pre-validate-and-fix` | **已合并** | 失败报告按 schema / semantic / render / unrelated diff 分类；Critic `reviseActions` prompt→parse→consume 闭环            | #22  |
| PR-C | `feat/ci-agent-eval`                 | **已合并** | 第一次 GitHub Actions workflow（`agent-eval`），mock 100 场景、threshold 1.0、artifact 上传                              | #24  |
| PR-D | `feat/semantic-compiler-coverage`    | **已合并** | 5 entry point 语义编译器 + 24 边界用例（`shared/agent/compiler/semanticInstructionCompiler.spec.ts`）                    | #23  |
| PR-E | `feat/editor-session-persistence`    | **已合并** | `editor_ai_conversations` +3 列（`compactSummary` / `lastPrefixHash` / `cacheContext`），8 个 service 单测               | #21  |
| 基建 | `chore/infra-cleanup`                | **已合并** | `.nvmrc` 锁 Node 22；`pnpm test:shared` 包装共享层测试；`docs/branch-audit-2026-06.md` 列出 16 个可安全删除的 stale 分支 | #26  |

历史 PR 链（#11–#16）已被 master `8f05e77 → 3b0822f` 的 PR 链结构代替；本批 5+1 全部合并后，下一批拆分见末尾"仍需完成"。

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

PR-A 已发出 `cache_diagnostic` 事件并接入前端 badge，PR-E 已落库 `lastPrefixHash`，依赖齐了。**端到端回归测试**还没补：

- 跨 session 时 `prefixChanged` 字段是否真的从 `false` 翻成 `true`（直接消费 PR-E 的 `lastPrefixHash` 持久化）。
- compact 后首轮 `cacheHitRate` 是否随 prompt prefix 重建而下降。
- provider log compaction 的 `cacheDiagnostics` 是否和前端 AI 面板一致。

### P1: PR-C 配套工程

PR-C workflow 故意留下了几件未做的事，按依赖顺序：

- **guarded classifier step**（PR-B 已合并）——`node --test scripts/agent-eval/classifyFailure.spec.mjs`，用 `if: hashFiles('scripts/agent-eval/classifyFailure.spec.mjs') != ''` 守卫。
- **shared-agent 测试 step** ——`pnpm test:shared` 脚本已在 #26 落地，加进 workflow 即可。
- **live-smoke workflow**（`workflow_dispatch` 触发，可选）——`pnpm agent:live-smoke` 需要 backend + LLM key，不进 PR-CI；单独 workflow `agent-eval-live.yml`，manual 触发。
- **cache hit-rate workflow**（`workflow_dispatch` 触发）——`pnpm agent:cache-test` 直接打 DeepSeek，token 成本高；单独 `agent-eval-cache.yml`，manual + 周更 schedule。
- **sticky PR comment**（`peter-evans/create-or-update-comment`）——把 markdown 报告贴到 PR 评论。需要 `pull-requests: write` scope。
- **branch protection required_status_checks**——`agent-eval` 跑过才允许合 master。

### P1: PR-E 配套工程

PR-E (#21) 已落库 `compactSummary` / `lastPrefixHash` / `cacheContext` 三列。剩余：

- **cacheContext 在前端 `useCacheContext()` 中的实际消费路径**——目前只是 `prefill` 写回，前端 hook 拿不到历史值跨 session。
- **过期清理策略**——`compactSummary` 写多了会膨胀；`editor_ai_conversations` 表没设 cron 清理。

### P2: 基础设施 cleanup

- **stale 分支清理**（执行 #26 `docs/branch-audit-2026-06.md` 里的 `git branch -d` 命令）——16 个本地/远端 stale 分支在 PR 合并后已无意义。
- **PR 链接补齐**——本文件表头"## PR-A/B/C/D/E + 基建 cleanup PR 状态"段已更新，但 `git log --grep` 的旧 chain 形态（如 `feat/ai-semantic-editing` / `feat/structured-sse-phase1`）仍可补一段说明这部分已被 master 取代。
- **跨模型矩阵聚合器**——`scripts/agent-eval/aggregateReports.js` 雏形，缺一个把多次跨模型跑分聚成可对比 markdown 表格的工具。

### P3: Phase 3 评测增强

`pr-plan.md` 第 71-77 行历史草案剩下两条验收（"live smoke 保持可选"和"报告输出 task score、semantic failure 分类、token usage、cache hit、模型维度"）还没做。`pnpm agent:evaluate` 报告已经够细（`scripts/agent-eval/aggregateReports.js` 雏形），缺一个跨模型矩阵聚合器（同 P2）。
