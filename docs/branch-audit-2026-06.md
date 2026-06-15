# 本地分支审计 (2026-06-12)

> **审计日期**: 2026-06-12
> **基准**: `origin/master` (8f05e77) + open PRs #21 #22 #23 #24 #25
> **目的**: 列出本地与 origin 已合并但仍残留在本地的分支，标注删除建议，便于 review 后清理。

## 背景

经过 5 月底-6 月初的一轮密集 PR 拆分（#1-#20 + #21-#25 5 个 open），本地累积了不少已合并/已关闭的 branch。本审计是 `chore/infra-cleanup` PR 的一部分，配合 `.nvmrc` 与 `pnpm test:shared` 一起落地。

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
