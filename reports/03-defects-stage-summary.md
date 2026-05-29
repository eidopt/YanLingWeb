# 03 Defects Stage Summary

Last updated: 2026-05-29

Source report copy: `docs/architect-refactor.md`.

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
| RESOLVED | 1.2 Frontend/backend module system mismatch | Shared source is enforced as ESM-only and frontend imports have a guard; backend still builds CommonJS. `docs/module-boundary-migration-audit.md` and `pnpm module-boundaries:audit` identify the concrete ESM blockers. | DECIDED (2026-05-29): accept the documented dual-system boundary (CommonJS backend + ESM shared) rather than a full backend ESM migration. The boundary is enforced by the ESM-only shared guard and the module-boundary audit; treat this as the accepted resolution, not an open migration. See `docs/module-boundary-migration-audit.md`. |
| RESOLVED | 9.5 shared physical split | Frontend imports now use package-style public `@shared/agent/browser/*`, `@shared/agent/contracts/*`, and `@shared/agent/tools/*` surfaces, and direct frontend imports from implementation `types`, `validation`, `editor`, and backend-only segments are rejected. Backend/eval imports now use public `@shared/agent/contracts/*`, `@shared/agent/runtime`, and `@shared/agent/tools/*` surfaces. `pnpm shared:boundary:check` enforces both sides. `shared/agent` is still one physical package containing contracts plus backend/eval implementation. | DECIDED (2026-05-29): keep the enforced public-barrel boundary; the physical workspace-package split is intentionally deferred until a concrete need arises. The guarded barrel surfaces are the accepted boundary mechanism. |
| P1 | 4.3 semantic generation scenario matrix | Deterministic mock scenario matrix now covers 10 cases. `pnpm agent:live-smoke` is optional and skips when no backend/provider is available. | Expand a live-provider scenario suite only in environments with a real provider; default checks should not require real API calls. |
| P1 | 5.1 source export complex interactions | Common core aliases, local interactions, action navigation, dialog/drawer cross-component visibility triggers, and first-batch async data export now exist. | Only expand richer workflows after a generated-state contract is documented, for example tab/chart coupling or multi-step flows. |
| P2 | 2.1 state persistence boundary | Main state is centralized. TemplatesPage, editor AI, and builder preferences have restore coverage; remaining local state is mostly modal/loading/animation. | Decide which remaining state should persist, then either add restore coverage or document why it remains transient. |
| P-last | 6.1 test coverage | The previously-listed measurable coverage gap is now closed: every backend controller has unit tests (`ai`, `auth`, `ai-templates`, `agent-eval`, `sites`, `templates` added to the existing exports/themes/search/users) and every TypeORM repository adapter named in the prior TODO has adapter tests (export-record, token-usage, editor-conversation, template-persistence, template-read, published-site, user-account). Measured backend coverage rose from the prior baseline to Statements 52.74%, Branches 28.12%, Functions 45.55%, Lines 51.63%; `backend/jest.config.js` thresholds were raised to the new measured floor (52/27/45/51). | The 80% long-term target is still a separate, explicitly-gated decision (see TODO 4). No further blind test-fill without choosing a coverage policy. |

## Coverage Conclusion

The measurable controller + repository-adapter coverage gap previously recorded
here has been closed. New unit tests were added for the six untested controllers
(`ai`, `auth`, `ai-templates`, `agent-eval`, `sites`, `templates`) and the seven
TypeORM repository adapters (export-record, token-usage, editor-conversation,
template-persistence, template-read, published-site, user-account), following the
project's direct-instantiation convention (no `Test.createTestingModule`; mocked
service subclasses / faked ports for controllers, mocked `Repository`/`QueryBuilder`/
`manager.transaction` for adapters). 122 new tests across 13 files.

Latest backend coverage run: Statements 52.74% (2180/4133), Branches 28.12%
(672/2389), Functions 45.55% (364/799), Lines 51.63% (2037/3945), up from the prior
baseline of 43.46 / 24.8 / 29.92 / 42.54. `backend/jest.config.js` thresholds were
raised to the new measured floor (Statements 52%, Branches 27%, Functions 45%,
Lines 51%) so coverage cannot silently regress.

The long-term 80% target remains a separate, explicitly-gated decision. The
denominator is still broad: `collectCoverageFrom` includes most
`backend/src/**/*.ts` while the unit config only runs `*.spec.ts`, so large
service/provider files (`ai.service.ts`, `agent-runner.service.ts`,
`editor-clarification.ts`, OpenAI provider adapters, `database/data-source.ts`) and
the e2e-only `search.e2e-spec.ts` still dominate the gap. Closing it to 80%
requires either a large service/provider coverage campaign or redefining what unit
coverage collects — see TODO 4. That decision is not taken here.

Known pre-existing red: `pnpm --dir backend test:coverage` currently reports 3
failing assertions in `templates.service.spec.ts` ("Template JSON Files" block).
These are caused by the untracked CLI-generated `templates_json/fresh-grocery-delivery.json`,
whose `{ ..., layoutDocument }` wrapper shape does not match the flat
`{ version, themeId, pages, ... }` shape that test asserts for every file in the
import inbox. This is independent of the coverage tests added above and is not
part of this defect report; it should be resolved by either aligning the CLI
output shape with the inbox loader's expected shape or excluding generated
artifacts from that test scan.

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

1. 9.5 physical packages — DECIDED 2026-05-29: keep the enforced public-barrel
   boundary; the workspace/package split (`shared-contracts`, `theme-layout`,
   `shared-agent-runtime`, `shared-agent-browser`) is intentionally deferred until
   a concrete need arises. No action unless that need is raised.
2. Remaining decision-gated items and their dispositions:
   - 1.2 module system — DECIDED 2026-05-29: accept the documented dual-system
     boundary (CommonJS backend + ESM shared); no full backend ESM migration.
   - 4.3 broader live-provider scenarios — still requires a real provider
     environment; out of scope for default/offline checks. Open only when a live
     provider is available.
   - 5.1 richer source-export workflows — still gated on documenting a
     generated-state contract first. Open.
   - 2.1 remaining state persistence — remaining local state is modal/loading/
     animation and is intentionally transient (documented); no further action
     unless a specific store is prioritized to persist.
3. For 6.1 coverage, the measurable controller + adapter slice is now DONE:
   all six remaining controllers (`ai`, `auth`, `ai-templates`, `agent-eval`,
   `sites`, `templates`) and all seven named TypeORM repository adapters
   (template persistence/read, sites, users, AI token/editor conversation,
   export records) have unit tests, in addition to the previously-done
   `ai-templates/orchestrator/run-stage.ts`, exports/themes/search/users
   controllers. Coverage thresholds were raised to the new measured floor. No
   remaining quantifiable controller/adapter coverage items.
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

New coverage tests (2026-05-29), all passing (122 tests across 13 specs) and
lint-clean under the backend ESLint config:

- Controllers: `ai.controller.spec.ts`, `auth.controller.spec.ts`,
  `ai-templates.controller.spec.ts`, `agent-eval.controller.spec.ts`,
  `sites.controller.spec.ts`, `templates.controller.spec.ts`
- Repository adapters: `typeorm-token-usage.repository.spec.ts`,
  `typeorm-editor-conversation.repository.spec.ts`,
  `typeorm-export-record.repository.spec.ts`,
  `typeorm-user-account.repository.spec.ts`,
  `typeorm-published-site.repository.spec.ts`,
  `typeorm-template-read.repository.spec.ts`,
  `typeorm-template-persistence.repository.spec.ts`
