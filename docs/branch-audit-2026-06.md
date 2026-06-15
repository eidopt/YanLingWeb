# 本地分支审计 (2026-06-12) + 执行报告 (2026-06-15)

> **审计日期**: 2026-06-12
> **执行日期**: 2026-06-15
> **基准**: `origin/master` (8f05e77) + open PRs #21 #22 #23 #24 #25（审计时）→ `origin/master` (3b0822f)（执行时，所有 roadmap PR 已合并）
> **目的**: 列出本地与 origin 已合并但仍残留在本地的分支，标注删除建议，便于 review 后清理。

## 背景

经过 5 月底-6 月初的一轮密集 PR 拆分（#1-#20 + #21-#25 5 个 open），本地累积了不少已合并/已关闭的 branch。本审计是 `chore/infra-cleanup` PR (#26) 的一部分，配合 `.nvmrc` 与 `pnpm test:shared` 一起落地。2026-06-15 实际执行时所有 roadmap PR 全部已合并，本报告同时记录执行结果。

## 审计方法

对每个本地 + origin 分支，运行 `git branch -r --merged origin/master` 检查是否已合 master；并对未合并的分支，跑 `git log master..BRANCH --oneline` 看是否仍含未发布工作。然后交叉对照 GitHub PR 列表的 `state` 字段。

## 安全可删除（已合入 master）

下列 16 个分支对应的 PR 已合并或被新 PR 取代，工作已合入 master，本地副本可删：

| 分支                                    | 对应 PR               | 状态   | 备注                                               |
| --------------------------------------- | --------------------- | ------ | -------------------------------------------------- |
| `feat/cache-diagnostics`                | #20                   | merged | 4 天前合并；master 含 `cache_diagnostic` SSE 事件  |
| `feat/cache-aware-compaction`           | #16                   | merged | `decideCompaction` 已在 master                     |
| `feat/structured-sse-phase1`            | #12                   | merged | 已被 #13 后续增强                                  |
| `feat/sse-phase2-edit-undo-cleanup`     | #13                   | merged | 编辑撤销栈 + SSE UI 消费闭环                       |
| `feat/cache-strategy-providers`         | #14                   | merged | 跨模型 CacheStrategy 实现                          |
| `feat/ai-semantic-editing`              | #11                   | merged | 5 entry point 语义工具已合并                       |
| `feat/pipeline-prevalidate`             | #15                   | merged | **已被 `feat/pipeline-pre-validate-and-fix` 取代** |
| `codex/roadmap-pr3-followup`            | #17                   | merged | `autoCompact.micro` 修复 + roadmap 同步            |
| `fix/pr3-followup-polish`               | #18                   | merged | biz-\* fallback + 跨模型 e2e                       |
| `fix/security-followup-1`               | #19                   | merged | URL sanitization + biz-\* 命名空间                 |
| `refactor/ai-agent-optimization`        | #1                    | merged | 1 周前合并；优化 provider 抽象层                   |
| `split/pr2-01-provider-capabilities`    | #4                    | merged | 第二轮 PR 拆分 1/4                                 |
| `split/pr2-02-editor-template-pipeline` | #5, #8                | merged | 第二轮 PR 拆分 2/4 (superseded + final)            |
| `split/pr2-03-roadmap-docs`             | #6, #9                | merged | 第二轮 PR 拆分 3/4 (superseded + final)            |
| `split/pr2-04-camelcase-renames`        | #7, #10               | merged | 第二轮 PR 拆分 4/4 (superseded + final)            |
| `pr-2-review`                           | （#2 的 review 分支） | merged | 5 月合并的 #2 review 副本                          |

## 必须保留（仍在开放 PR 中）

| 分支                                 | PR      | 状态 |
| ------------------------------------ | ------- | ---- |
| `feat/ci-agent-eval`                 | #24     | open |
| `feat/editor-session-persistence`    | #21     | open |
| `feat/pipeline-pre-validate-and-fix` | #22     | open |
| `feat/semantic-compiler-coverage`    | #23     | open |
| `docs/roadmap-post-pr-a-e`           | #25     | open |
| `chore/infra-cleanup`                | (本 PR) | open |

## 建议删除命令

合并本 PR 之后，由仓库维护者执行：

```bash
# 安全删除已合并的本地分支（仅 merged）
git branch -d \
  feat/cache-diagnostics \
  feat/cache-aware-compaction \
  feat/structured-sse-phase1 \
  feat/sse-phase2-edit-undo-cleanup \
  feat/cache-strategy-providers \
  feat/ai-semantic-editing \
  feat/pipeline-prevalidate \
  codex/roadmap-pr3-followup \
  fix/pr3-followup-polish \
  fix/security-followup-1 \
  refactor/ai-agent-optimization \
  split/pr2-01-provider-capabilities \
  split/pr2-02-editor-template-pipeline \
  split/pr2-03-roadmap-docs \
  split/pr2-04-camelcase-renames \
  pr-2-review

# 已合并的 origin 远端分支也可清（--merged 守卫确保不会误删）
git remote prune origin
```

## 风险与回退

- 删除本地分支只是删除指针，commit 对象仍在 reflog 保留 90 天。
- 如果误删，reflog 恢复：`git reflog | grep <sha>` 找 commit → `git checkout -b <branch> <sha>`。
- 不建议用 `git branch -D`（强制删除）；本审计推荐的 `-d` 会在分支有未合并改动时拒绝，更安全。

## 不在本审计范围

- 暂未列出 GitHub 远端已 close 但本地未追踪的 PR（这些没有本地分支可清）。
- 已 close 的 PR 清单：#1-#20 全部 merged；#21 #22 #23 #24 #25 全部 open。
- `feat/editor-ai-improvements` 这种"在 #2 之前"的 chain 本地不存在，无需清理。

---

# 执行报告 (2026-06-15)

执行时 master 已推进至 `3b0822f`（PR-A/B/C/D/E + #26 全部合并后），所有原 "open PR" 已 close。运行建议删除命令的实际结果如下。

## 执行结果

| 审计列出的 16 个分支                    | 执行时本地存在？ | 删除方式        | 结果                                                         |
| --------------------------------------- | ---------------- | --------------- | ------------------------------------------------------------ |
| `feat/cache-diagnostics`                | 否               | —               | `--delete-branch` 在 #20 合并时已自动清；审计时已不存在      |
| `feat/cache-aware-compaction`           | 否               | —               | `--delete-branch` 在 #16 合并时已自动清                      |
| `feat/structured-sse-phase1`            | 否               | —               | `--delete-branch` 在 #12 合并时已自动清                      |
| `feat/sse-phase2-edit-undo-cleanup`     | 否               | —               | `--delete-branch` 在 #13 合并时已自动清                      |
| `feat/cache-strategy-providers`         | 否               | —               | `--delete-branch` 在 #14 合并时已自动清                      |
| `feat/ai-semantic-editing`              | 否               | —               | `--delete-branch` 在 #11 合并时已自动清                      |
| `feat/pipeline-prevalidate`             | 否               | —               | `--delete-branch` 在 #15 合并时已自动清                      |
| `codex/roadmap-pr3-followup`            | 否               | —               | `--delete-branch` 在 #17 合并时已自动清                      |
| `fix/pr3-followup-polish`               | 否               | —               | `--delete-branch` 在 #18 合并时已自动清                      |
| `fix/security-followup-1`               | 否               | —               | `--delete-branch` 在 #19 合并时已自动清                      |
| `refactor/ai-agent-optimization`        | 是               | `git branch -d` | ✅ 已删除（tip `b3b95a5` 是 master 的祖先，merged）          |
| `split/pr2-01-provider-capabilities`    | 否               | —               | `--delete-branch` 在 #4 合并时已自动清                       |
| `split/pr2-02-editor-template-pipeline` | 否               | —               | `--delete-branch` 在 #8 合并时已自动清                       |
| `split/pr2-03-roadmap-docs`             | 否               | —               | `--delete-branch` 在 #9 合并时已自动清                       |
| `split/pr2-04-camelcase-renames`        | 否               | —               | `--delete-branch` 在 #10 合并时已自动清                      |
| `pr-2-review`                           | **是**           | **保留**        | ⚠️ **审计错误**：tip `b3a6387` 有 15 个未合 master 的 commit |

## 审计修正

`pr-2-review` 的"merged"标注与实际 git 状态不符：

- 分支 tip 是 `b3a6387 refactor: rename all kebab-case files to camelCase (144 files) + update all import paths`
- 该 tip **不是** master 的祖先
- 相对 master 有 238 文件 / +3124 / -595 的 diff，说明包含未发布工作
- 推测：是 5 月 #2 review 阶段的工作副本，最后的 refactor 落地走了 `split/pr2-04-camelcase-renames` 路径（#10 合并），但本地这个分支保留了 review 中间态

**结论**：`pr-2-review` 暂不删除，由仓库维护者人工 review 决定去留。

## 执行阶段额外发现

执行时发现 2 个 audit 未列出的 stale 分支，均为 squash-merged PR 的工作副本：

| 分支                           | tip       | 实际状态                                                                                                           | 删除方式        | 结果                                       |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------ |
| `feat/sse-backend-integration` | `35da053` | tip 与 PR #16 `feat/cache-aware-compaction` 的原 tip 同 SHA；squash-merged 到 master via #16                       | `git branch -D` | ✅ 已删除（force，原因：内容已 in master） |
| `pr22`                         | `43c37bf` | tip 是 PR #22 squash 前的原始 tip；与 `feat/pipeline-pre-validate-and-fix` 同 SHA；squash-merged to master via #22 | `git branch -D` | ✅ 已删除（force，原因：内容已 in master） |

两个分支的 tip commit 都不是 master 的祖先（squash-merge 丢弃了原始 commit 的可达性），但 diff 显示 0 唯一内容——所有改动都已通过对应的 squash 合并落到 master。`-D` 是处理 squash-merged 旧工作副本的标准做法。

## 后续

- ✅ 14 个 audit 分支：不存在本地（合并时自动清）
- ✅ 1 个 audit 分支：`refactor/ai-agent-optimization` 已 `git branch -d` 删除
- ⚠️ 1 个 audit 分支：`pr-2-review` 保留待人工 review
- ✅ 2 个 audit 未列出的 stale 分支：均已 `git branch -D` 删除（squash-merged 副本）
- 远端分支清理：`gh pr merge --delete-branch` 在 #20-#26 合并时已自动清；建议维护者跑 `git remote prune origin` 收尾（本会话因网络原因未执行）
