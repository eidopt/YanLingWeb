# Current Implementation Status

Last updated: 2026-05-29

This page records the current codebase shape. Use it to disambiguate older plan
documents from implemented behavior. For a stage-level handoff, see
`reports/03-defects-stage-summary.md`.

## Workspace Rules

- Package manager is `pnpm` only. The root `packageManager` pins `pnpm@11.1.2`.
- `pnpm-lock.yaml` is authoritative; npm lockfiles are removed or ignored.
- Avoid `as unknown as`; use explicit guards or converters at JSON/data
  boundaries.
- Root `pnpm build` runs the shared agent frontend/backend boundary check,
  renderer registry check, docs current-status check, and Next build.
- Root `pnpm lint` runs the shared agent frontend/backend boundary check,
  renderer registry check, docs current-status check, and ESLint.
- Root ESLint flat config includes `@next/eslint-plugin-next` core-web-vitals
  rules for `src/app/**/*.{ts,tsx}` and `next.config.ts`.
- `prettier.config.mjs` derives Prettier `printWidth` from the root and backend
  ESLint `max-len` rules.
- `pnpm shared:module-format:check` enforces `shared/**/*.ts` as ESM-only source
  and rejects `require()`, `module.exports`, `exports.*`, and `export =`.
- `pnpm module-boundaries:audit` reports the remaining backend ESM and shared
  physical package-boundary blockers from current package/config/import graph
  evidence.

## Backend

- NestJS remains the backend framework.
- SQLite is the local default database driver; PostgreSQL is supported through
  `DATABASE_DRIVER=postgres` and TypeORM migrations.
- Production must use migrations with `DB_SYNCHRONIZE=false`.
- API version aliases exist under `/api/v1/*`; Swagger is available at
  `/api/docs` and `/api/v1/docs`.
- Global API success/error response wrappers are active through common
  interceptor/filter code.
- Global and route-specific throttling is configured for sensitive endpoints.
- Backend services consume repository/service ports for persistence boundaries.
  TypeORM `Repository<T>` access should stay inside `TypeOrm*Repository`
  adapters.

## Frontend

- Next.js 15 App Router and React 19 are used for the web UI.
- Frontend services are assembled through `ServiceContainer` and shared
  `HttpClient` helpers for JSON and SSE traffic.
- Authenticated-user state is centralized in `src/state/authState.ts` through
  `useSyncExternalStore`; components should consume `useAuthUser()` instead of
  wiring `AUTH_CHANGED_EVENT` and `storage` listeners directly.
- `src/state/stateDebugRegistry.ts` exposes registered frontend store snapshots
  and recent transitions at `window.__YANLING_STATE__` for browser-console
  debugging.
- `src/state/homeWorkspaceState.ts` centralizes HomeWorkspace search draft,
  submitted search, template view, category filters, platform filters, and search
  revision through `useSyncExternalStore`.
- `src/state/templatesPageState.ts` centralizes TemplatesPage search, debounced
  search, active category, and sort key through `useSyncExternalStore`.
- TemplatesPage search/category/sort preferences persist through localStorage
  using `src/state/statePersistence.ts`; `pnpm test:state-persistence` covers
  restore, invalid enum fallback, and corrupt JSON cleanup.
- `src/state/searchResultsState.ts` centralizes standalone SearchResults query,
  loading, result, create-intent, and error state through `useSyncExternalStore`.
- `src/state/editorPageState.ts` centralizes EditorPage template route loading
  and auto-generation status through `useSyncExternalStore`, keyed by
  route/generation intent so stale async work cannot overwrite the active page
  state.
- `src/state/editorDocumentState.ts` centralizes editor canvases, active canvas,
  selected node, and screen preset state through `useSyncExternalStore`.
- `src/state/editorAiPanelState.ts` centralizes editor AI panel conversation
  messages, prompt, run status, intent plan, and cache stats through
  `useSyncExternalStore`.
- Editor AI panel conversation history persistence, local restore, completed
  message filtering, and corrupt history cleanup live in
  `src/state/editorAiPanelState.ts` and reuse `src/state/statePersistence.ts`;
  `pnpm test:state-persistence` covers those paths.
- `src/state/editorBuilderUiState.ts` centralizes editor sidebar tab,
  interaction mode, export dialog visibility, and canvas scale through
  `useSyncExternalStore`.
- Editor builder sidebar tab and edit/preview mode preferences persist through
  localStorage. Export dialog visibility and canvas scale remain transient and
  are not restored from storage.
- `src/state/editorNodeDialogState.ts` centralizes node edit dialog draft and
  validation error state through `useSyncExternalStore`.
- `src/state/editorCanvasDragState.ts` centralizes editor canvas drag/reorder,
  drop-preview, relative pointer drag, absolute move/resize pointer interaction,
  and drag visual offset state through `useSyncExternalStore`.
- Browser-to-backend AI traffic goes through `/api/proxy/*`; legacy direct
  `/api/ai/editor` and `/api/ai/stream` routes have been removed.
- App-level error boundary UI wraps the shell.
- Editor autosave debounce, retry, comparison, and document merge logic live in
  `src/domain/editor/autosaveStrategy.ts`.
- Semantic editor instructions compile through
  `shared/agent/compiler/semanticInstructionCompiler.ts`; backend Jest coverage
  now proves slot update, invalid prop rejection, pattern fill, page-kind page
  creation, PageSpec section replacement, and PageSpec pattern-section paths.
- Semantic editor landmark resolution lives in
  `shared/agent/editor/semanticTargetResolver.ts`; editor prompt context and
  `AgentRunnerService` editor execution use the same resolver for targets such
  as `primary_cta`, `search_box`, `page_title`, and `page_footer_nav`.
- Semantic eval assertions run through
  `shared/agent/validation/semanticAssertions.ts`; backend Jest coverage now
  proves generated-app page/section assertions and `mustNotChange` invariants.
- `backend/src/ai/agent-runner.mock-scenarios.spec.ts` runs deterministic
  template-generation and editor-edit mock scenarios through `AgentRunnerService`,
  covering validation, semantic assertions, unrelated-diff gating, render smoke,
  tool-call capture, multi-domain generation, reference-page creation, inserted
  components, deletion, layout/frame/interaction patches, semanticTarget edits,
  preserved invariants, and unrelated-diff failure detection.
- `pnpm agent:live-smoke` runs a low-cost optional AgentRunner live-provider
  smoke through `scripts/agent-eval/run-live-smoke.js`. It samples one scenario
  by default, writes `output/agent-eval/live-smoke-latest.*`, skips cleanly when
  the backend/provider is unavailable, and can be made strict with
  `AGENT_EVAL_LIVE_SMOKE_REQUIRED=true`.
- Backend AI context compaction helpers now have focused Jest coverage for token
  estimation, micro-compaction of old large tool results, auto-compaction
  thresholds/failure backoff, over-budget summary compaction, provider-history
  folding, summary-provider failures, and no-safe-boundary fallbacks.
- `backend/src/auth/auth.service.spec.ts` covers challenge nonce single-use and
  expiry behavior, local registration conflicts/success, bcrypt and legacy
  password login paths, best-effort legacy hash upgrades, OAuth QR state
  generation, WeChat/QQ callback success paths, and invalid OAuth callback
  rejection.
- `backend/src/ai-templates/orchestrator/pipeline.service.spec.ts` covers
  successful four-stage template pipeline runs, external result DTO redaction of
  internal stage records, critic revision retries, schema-generation exception
  retries, and verifier-exhaustion failures with attached `lastSchema`
  debugging data.

## Shared Agent Boundary

- Browser-safe shared agent exports live behind `shared/agent/browser/*`,
  `shared/agent/contracts/*`, and `shared/agent/tools/*`.
- Frontend code must not import implementation segments such as
  `@shared/agent/runtime`, `compiler`, `context`, `editor`, `prompts`, `skills`,
  `specs`, `testing`, `fixtures`, `types`, or `validation` directly.
- Backend/eval shared agent imports should use `@shared/agent/runtime` for
  implementation surfaces, `@shared/agent/contracts/*` for contracts and
  validation helpers, and `@shared/agent/tools/*` for canonical tool schemas.
- `pnpm shared:boundary:check` enforces both frontend and backend/eval shared
  agent import surfaces.
- `docs/module-boundary-migration-audit.md` records the candidate physical split
  and the backend ESM migration blockers.
- A future physical package split into `shared-contracts`, `theme-layout`,
  `shared-agent-runtime`, and `shared-agent-browser` is still open.

## Renderer And Export

- Renderer component registration is generated/checked by
  `scripts/check-renderer-registry.cjs`.
- `core.html` uses tag/style allowlists and unsafe style-value rejection.
- `core.widget` uses safe renderer adapters and per-document widget policy
  capability allowlists.
- React source export emits maintainable source pages/components and a static
  widget preview component instead of executing third-party widget code.
- `docs/source-export-interaction-matrix.md` is the live source export
  interaction capability matrix for supported, degraded, unsupported, and next
  implementation batch behavior.
- `docs/source-export-async-data-design.md` records the implemented first-batch
  async-data source export contract: `dataSources`, node `props.dataBinding`,
  generated static/public JSON helpers, and `AsyncDataBoundary`.
- Exported `core.table`, `core.list`, and `core.widget` nodes can bind to
  `staticJson` or unauthenticated public JSON endpoint data sources. The
  generated source includes loading, error, empty, fallback, safe selector, and
  record display helper paths covered by `pnpm test:source-export`.
- Exported `core.tabs` nodes use a generated `InteractiveTabs` component so
  non-navigation tabs can switch active state locally while navigation tabs
  still call `onNavigate`.
- Exported `core.carousel` nodes use a generated `InteractiveCarousel`
  component with previous/next controls and local slide state.
- Exported `core.pagination` nodes use a generated `InteractivePagination`
  component with local current-page state.
- Exported `core.form` nodes use a generated `InteractiveForm` component that
  prevents default browser submit navigation and shows local submitted status.
- Exported `core.dialog` and `core.drawer` nodes use generated interactive
  components with initial visibility and local close state.
- Exported `interactions.onClick` supports simple `setVisibility` and
  `toggleVisibility` actions for page-level control of target `core.dialog` and
  `core.drawer` nodes, so a button can open a separate dialog or toggle a
  separate drawer in generated source.
- Exported closable `core.alert` nodes use a generated `InteractiveAlert`
  component with local close state.
- Exported `core.checkbox` and `core.radio` nodes use mutable uncontrolled
  inputs with `defaultChecked`; exported `core.switch` nodes use a generated
  `InteractiveSwitch` component with local checked state and switch ARIA.
- Exported `core.rate` nodes use a generated `InteractiveRate` component with
  local rating state and radio-group ARIA.
- Exported `core.screen` status/header actions and `core.empty` action buttons
  preserve `onStatusClick`/`onActionClick` navigation handlers.
- Hosted runtime publish, React source export, browser JSON export, and backend
  export records remain separate product paths.

## Testing And Quality Gates

- Root type checks:
  - `pnpm typecheck`
  - `pnpm typecheck:backend`
  - `pnpm typecheck:preview`
  - `pnpm typecheck:all`
- Backend tests:
  - `pnpm --dir backend test`
  - `pnpm --dir backend test:e2e`
  - `pnpm --dir backend test:coverage`
- Browser/source export checks:
  - `pnpm test:e2e:browser`
  - `pnpm test:source-export`
- Frontend state checks:
  - `pnpm test:state-persistence`
- Docs/status checks:
  - `pnpm docs:current:check`
- Agent eval checks:
  - `pnpm agent:live-smoke` (optional live-provider smoke; skipped without a
    running backend/provider unless `AGENT_EVAL_LIVE_SMOKE_REQUIRED=true`)
- Architecture audits:
  - `pnpm module-boundaries:audit`
- Next.js lint coverage:
  - `@next/eslint-plugin-next` core-web-vitals rules are active in root ESLint.
  - App Router internal navigation should use `next/link`; root layout does not
    inject Google font stylesheet links manually.
- Historical/strategy docs carry explicit `Document status` notices and point
  back to this current-status page plus the defect progress tracker. The
  database migration runbook is marked as a live runbook.
- Backend coverage is currently gated at the measured baseline:
  - Statements: 43%
  - Branches: 24%
  - Functions: 29%
  - Lines: 42%
    The latest measured backend run is Statements 43.46%, Branches 24.8%,
    Functions 29.92%, and Lines 42.54%.
- The long-term 80% backend coverage target is not reached yet. This phase is
  stopped instead of continuing broad coverage-fill work; the remaining
  measurable coverage TODOs and the coverage denominator diagnosis are recorded
  in `reports/03-defects-stage-summary.md`.

## Active Known Gaps

- Backend still builds as CommonJS while the root frontend workspace is ESM; the
  shared source contract is ESM-only and enforced, but full runtime module
  unification is not done. `docs/module-boundary-migration-audit.md` and
  `pnpm module-boundaries:audit` now capture the concrete backend ESM blockers:
  backend CommonJS TypeScript emit, CommonJS TypeORM migration CLI scripts,
  Jest/ts-jest configuration, source alias runtime mapping, extensionless
  relative imports, and ts-node/tsconfig-paths CLI usage.
- Auth state, HomeWorkspace search/filter/view state, TemplatesPage
  search/category/sort state, standalone SearchResults query/result state,
  EditorPage route template loading/auto-generation state, editor
  document/active-page/selection/screen-preset state, editor AI panel state,
  editor builder UI chrome state, node edit dialog draft/error state, and editor
  canvas drag/pointer/reorder preview state have dedicated stores and
  lightweight browser debug registry entries. TemplatesPage preferences and
  editor AI panel conversation history plus editor builder sidebar/mode
  preferences have localStorage restore coverage; remaining local state is
  limited to component-local loading/modal flags and animation/display counters.
- Semantic generation has style profiles, template pipeline support, semantic
  instruction compilation, core compiler tests, semantic assertion scoring tests,
  shared semanticTarget resolution, and deterministic AgentRunner mock scenario
  matrix tests plus optional live-provider smoke. Broader live-provider scenario
  coverage still needs expansion.
- Complex source-export interactions beyond generated local components and
  simple dialog/drawer visibility triggers are explicitly tracked in
  `docs/source-export-interaction-matrix.md`; first-batch async data is
  implemented for `staticJson`/public JSON endpoint bindings, while rich
  cross-component workflows, app-specific launch triggers, authenticated APIs,
  mutations, polling, realtime, and generated cache invalidation remain
  unsupported.
- Shared agent code is boundary-guarded for frontend imports through public
  `browser`, `contracts`, and `tools` surfaces, and backend/eval imports now use
  public `contracts`, `runtime`, and `tools` surfaces. The executable
  `pnpm shared:boundary:check` gate enforces those import surfaces. It is not
  physically split into separate packages yet, and is not physically separated
  today. The current candidate split is
  documented as `shared-contracts`, `theme-layout`, `shared-agent-runtime`, and
  `shared-agent-browser`.
- Backend coverage remains below the long-term 80% target because the current
  denominator includes most `backend/src/**/*.ts` files while unit Jest only runs
  `*.spec.ts`. Large services, adapters, provider files, and an e2e spec still
  dominate the uncovered line/branch gap. This is recorded as a TODO rather than
  continuing more tests in this phase.
