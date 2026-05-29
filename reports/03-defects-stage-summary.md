# 03 Defects Stage Summary

Last updated: 2026-05-29

Source report copy: `docs/architect-refactor.md`. Original source path:
`C:\Users\Administrator\Desktop\03-代码框架局限性与缺陷分析.md`.

This is the phase-level handoff for the task that started from
`docs/architect-refactor.md`. It does not replace the detailed progress table;
current facts remain in `reports/03-code-framework-defects-progress.md` and
`docs/current-implementation-status.md`.

## Current Rules

- Package manager is `pnpm` only.
- Production code should avoid `as unknown as`; use explicit guards or
  converters at JSON/data boundaries.
- Partial implementation is not counted as complete without current code and
  verification evidence.
- Historical plan docs are background; use `docs/current-implementation-status.md`
  for current implementation facts.

## Completed Or Substantially Fixed

| Stage | Completed scope | Main evidence |
| --- | --- | --- |
| Database and config | SQLite production limitation is mitigated through PostgreSQL runtime/CLI support, dialect-aware migrations, production `db:init` protection, and a migration runbook. | `docs/database-migration-runbook.md`, backend migration specs |
| API versioning and responses | `/api/v1/*` aliases, dual Swagger paths, common success/error envelopes, and global filter/interceptor code exist. | `backend/src/common/*`, backend common specs |
| Backend security and transactions | Global and route-specific throttling exist; publish/rollback and template multi-table writes have transaction boundaries. | `backend/src/sites`, `backend/src/templates` tests |
| Frontend state baseline | Auth, HomeWorkspace, TemplatesPage, SearchResults, EditorPage, editor document, editor AI panel, builder UI, node dialog, and canvas drag state moved to external stores with debug registry support. | `src/state/*`, `pnpm test:state-persistence` |
| Frontend service abstraction | `ServiceContainer` and `HttpClient` centralize service creation, JSON/SSE, auth headers, and response envelope unwrapping; product AI traffic uses `/api/proxy/*`. | `src/services/*`, `src/app/api/proxy/[...path]/route.ts` |
| Renderer and safety | Renderer registry guard exists; `core.html` has tag/style allowlists; widgets use allowlist and per-document policy validation. | `scripts/check-renderer-registry.cjs`, `shared/agent/validation/widgetSafety.ts` |
| Source export baseline | Static widget preview, local tabs/carousel/pagination/form/dialog/drawer/alert/switch/rate controls, checkbox/radio defaults, action navigation, simple dialog/drawer visibility triggers, and first-batch async data export are implemented. | `src/exporters/react-source/*`, `docs/source-export-interaction-matrix.md`, `pnpm test:source-export` |
| Module-boundary audit | Remaining backend ESM and shared physical split work now has an executable audit and migration document; frontend shared-agent imports have been moved to public `browser`, `contracts`, and `tools` surfaces, while backend/eval imports have been moved to public `contracts`, `runtime`, and `tools` surfaces. | `docs/module-boundary-migration-audit.md`, `pnpm module-boundaries:audit`, `pnpm shared:boundary:check` |
| AI tool contracts | `generate_template` and editor edit tools have canonical shared definitions reused by wrappers. | `shared/agent/tools/*` |
| Semantic generation baseline | Semantic compiler, semanticTarget resolver, semantic assertions, and AgentRunner mock scenario matrix cover multi-domain generation, reference pages, insert/delete, layout/frame/interaction patches, and unrelated-diff failure. Optional live-provider smoke exists. | `backend/src/ai/*semantic*.spec.ts`, `agent-runner.mock-scenarios.spec.ts`, `pnpm agent:live-smoke` |
| Backend DIP/repositories | Main services depend on repository/service ports; TypeORM access is isolated in `TypeOrm*Repository` adapters. | `backend/src/**/repositories/*`, service specs, `rg` audits |
| AiTemplates decoupling | Pipeline controller returns external results; stage agents depend on `AI_TEMPLATE_PIPELINE_PROVIDER`. | `backend/src/ai-templates/*` |
| Testing and quality | Browser E2E, source export smoke, backend e2e, backend coverage gate, Prettier/lint-staged/pre-commit/docs guard, and Next ESLint core-web-vitals guard exist. | `pnpm lint`, `pnpm build`, `pnpm --dir backend test:coverage` |
| Docs entrypoint | `docs/README.md`, `docs/current-implementation-status.md`, defect progress, stage summary, and Codex memory are established. | `pnpm docs:current:check` |

## Unfinished Or Needs Stronger Evidence

| Priority | Item | Current state | Next decision |
| --- | --- | --- | --- |
| P0 | 1.2 Frontend/backend module system mismatch | Shared source is enforced as ESM-only and frontend imports have a guard; backend still builds CommonJS. `docs/module-boundary-migration-audit.md` and `pnpm module-boundaries:audit` identify the concrete ESM blockers. | Decide whether to execute a full backend ESM migration or explicitly accept a documented dual-system boundary with stronger package/export checks. |
| P1 | 9.5 shared physical split | Frontend imports now use package-style public `@shared/agent/browser/*`, `@shared/agent/contracts/*`, and `@shared/agent/tools/*` surfaces, and direct frontend imports from implementation `types`, `validation`, `editor`, and backend-only segments are rejected. Backend/eval imports now use public `@shared/agent/contracts/*`, `@shared/agent/runtime`, and `@shared/agent/tools/*` surfaces. `pnpm shared:boundary:check` enforces both sides. `shared/agent` is still one physical package containing contracts plus backend/eval implementation. | Physical package movement is measurable by workspace/package exports, but should wait for an explicit package-boundary decision. |
| P1 | 4.3 semantic generation scenario matrix | Deterministic mock scenario matrix now covers 10 cases. `pnpm agent:live-smoke` is optional and skips when no backend/provider is available. | Expand a live-provider scenario suite only in environments with a real provider; default checks should not require real API calls. |
| P1 | 5.1 source export complex interactions | Common core aliases, local interactions, action navigation, dialog/drawer cross-component visibility triggers, and first-batch async data export now exist. | Only expand richer workflows after a generated-state contract is documented, for example tab/chart coupling or multi-step flows. |
| P2 | 2.1 state persistence boundary | Main state is centralized. TemplatesPage, editor AI, and builder preferences have restore coverage; remaining local state is mostly modal/loading/animation. | Decide which remaining state should persist, then either add restore coverage or document why it remains transient. |
| P-last | 6.1 test coverage | Backend coverage has baseline gates plus AuthService, template pipeline, runStructuredStage, exports/themes/search/users controller tests. The latest measured coverage remains far below the long-term 80% target and this phase is stopped instead of looping on broad test-fill work. | Keep the coverage conclusion and remaining measurable work in TODO. Do not continue coverage work in this phase unless explicitly resumed. |

## Coverage Stop Conclusion

Coverage work is intentionally stopped for this phase. The latest backend
coverage run is Statements 43.46%, Branches 24.8%, Functions 29.92%, and Lines
42.54%, with `backend/jest.config.js` thresholds set only to the measured floor:
Statements 43%, Branches 24%, Functions 29%, and Lines 42%.

The long-term 80% target is not reachable through the small controller tests
already added because the current coverage denominator is broad:
`collectCoverageFrom` includes most `backend/src/**/*.ts` files while the Jest
unit config only runs `*.spec.ts`. Large low-coverage or uncovered files still
dominate the denominator, including `templates.service.ts`, `ai.service.ts`,
`agent-runner.service.ts`, `editor-clarification.ts`, OpenAI provider adapters,
`database/data-source.ts`, TypeORM repository adapters, remaining controllers,
and `search.e2e-spec.ts` even though e2e specs are not run by the unit coverage
command.

Approximate remaining gap to 80% with the current denominator is about 1,451
additional covered lines, 1,485 statements, and 1,286 branch outcomes. Closing
that gap requires either a large, explicit coverage campaign or an explicit
decision to redefine what unit coverage should collect. Neither should continue
in this phase without human direction.

## Required Doc Index

| Purpose | Document |
| --- | --- |
| Current implementation facts | `docs/current-implementation-status.md` |
| Defect-by-defect progress | `reports/03-code-framework-defects-progress.md` |
| Phase summary | `reports/03-defects-stage-summary.md` |
| Docs index and maintenance rules | `docs/README.md` |
| Source export interaction matrix | `docs/source-export-interaction-matrix.md` |
| Source export async data contract | `docs/source-export-async-data-design.md` |
| Module boundary migration audit | `docs/module-boundary-migration-audit.md` |
| Database migration and rollback | `docs/database-migration-runbook.md` |
| Repo-local task-start report copy | `docs/architect-refactor.md` |
| Codex cross-session memory | `C:\Users\Administrator\.codex\memories\YanLingWeb.md` |

## Historical Planning Docs

These docs are background only and must not be treated as current
implementation facts:

| Document | Use |
| --- | --- |
| `docs/agent-low-code-generation-plan.md` | Semantic generation and low-code planning background |
| `docs/dual-export-strategy-and-e2e-plan.md` | Dual-export strategy and E2E planning |
| `docs/dual-export-implementation-plan.md` | Dual-export phased implementation notes |
| `docs/deepseek-high-cache-hit-strategy.md` | DeepSeek cache/prompt notes |
| `docs/architect-refactor.md` | Repo-local copy of the task-start architecture defect report |

## Next TODO

1. If the project still wants physical packages, move from public barrels to
   measurable workspace/package exports for `shared-contracts`,
   `theme-layout`, `shared-agent-runtime`, and `shared-agent-browser`.
2. Stop instead of implementing non-quantifiable decision tasks without human
   direction: the 1.2 choice between full backend ESM and documented dual-system
   boundary, broader live-provider scenario scope, remaining state-persistence
   product decisions, and richer source-export workflow scope.
3. For 6.1 coverage, do not continue in this phase; keep the remaining
   measurable work here:
   add tests for remaining controllers (`ai.controller.ts`,
   `auth.controller.ts`, `ai-templates.controller.ts`,
   `agent-eval.controller.ts`, `sites.controller.ts`, `templates.controller.ts`)
   and TypeORM repository adapters (template persistence/read, sites, users, AI
   token/editor conversation, export records) only if coverage work is
   explicitly resumed. The `ai-templates/orchestrator/run-stage.ts`, exports
   controller, themes controller, search controller, and users controller
   coverage slices are done.
4. If the 80% backend coverage target is explicitly resumed, first choose one
   measurable coverage policy: either keep the current broad denominator and run
   a large service/adapter/provider coverage campaign, or redefine unit coverage
   collection so e2e specs, bootstrap/data-source files, DTO-only files, or
   external-provider adapters are handled by separate commands. Do not continue
   this decision implicitly.

## Recent Verification Baseline

- `pnpm lint`
- `pnpm build`
- `pnpm build:backend`
- `pnpm typecheck:backend`
- `pnpm module-boundaries:audit`
- `pnpm --dir backend test:coverage`
- `pnpm test:source-export`
- `pnpm test:state-persistence`
- `rg -n "as unknown as" backend\src shared src tests scripts templates_json\preview -g "*.ts" -g "*.tsx" -g "*.cjs"`
