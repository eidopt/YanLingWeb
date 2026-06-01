# YanLingWeb Docs

Start with `current-implementation-status.md` when you need the current codebase
shape. Several older files in this directory are design or migration plans, not
always live implementation facts.

## Current Source Of Truth

- `current-implementation-status.md`: maintained summary of the current
  architecture, package manager rules, verification commands, and known gaps.
- `../reports/03-code-framework-defects-progress.md`: active progress tracker
  for the code framework defects report.
- `../reports/03-defects-stage-summary.md`: stage-level handoff summary with
  completed items, open gaps, doc index, and next TODOs.
- `source-export-interaction-matrix.md`: live capability matrix for React source
  export interactions, degradations, unsupported cases, and next batch scope.
- `source-export-async-data-design.md`: accepted design for the first
  async-data source export implementation batch.
- `module-boundary-migration-audit.md`: live audit for the remaining backend
  ESM and shared physical package-boundary work.
- `C:\Users\Administrator\.codex\memories\YanLingWeb.md`: cross-session Codex
  memory for durable implementation notes.

## Planning And Runbooks

- `database-migration-runbook.md`: live database migration and rollback runbook.
- `dual-export-strategy-and-e2e-plan.md`: historical export strategy and E2E
  plan.
- `dual-export-implementation-plan.md`: historical staged export implementation
  plan; check `current-implementation-status.md` before treating older
  "planned" sections as current.
- `agent-low-code-generation-plan.md`: historical semantic generation plan; some
  parts are now implemented and some remain planned work.
- `architect-refactor.md`: repo-local copy of the task-start architecture defect
  report. Use the defect progress tracker for current remediation status.
- `deepseek-high-cache-hit-strategy.md`: strategy note for AI prompt and
  provider-cache changes.

## Maintenance Rule

When code changes affect architecture, API routes, persistence boundaries,
renderer/export behavior, package scripts, or verification gates, update
`current-implementation-status.md` and the defect progress tracker
(`reports/03-code-framework-defects-progress.md`) in the same change, bumping the
`Last updated:` date on both. This is a review convention, not a build/lint gate.
