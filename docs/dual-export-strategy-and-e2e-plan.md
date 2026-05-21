# Dual Export Strategy and E2E Implementation Plan

## 1. Background

YanLingWeb needs to support two different delivery modes for AI-generated frontend UI:

1. **Hosted runtime deployment**
   - Users design and edit UI online through AI chat and manual template editing.
   - Users publish directly to a YanLingWeb-managed subdomain.
   - The exported/deployed app should avoid hand-written AI code as much as possible.
   - The canonical source remains the online template document.

2. **Maintainable React source export**
   - Users can export a React project that looks and feels like a human-maintained frontend codebase.
   - Users may continue development outside YanLingWeb.
   - Once users manually change exported source code, YanLingWeb does not need to preserve or merge those changes back into the online editor.

These modes must share the same template schema, but they must not share the same export implementation. Their goals are different:

| Mode | Primary Goal | Output | Later Changes |
| --- | --- | --- | --- |
| Hosted runtime | Stable one-click deployment with minimal AI-generated code | Runtime app + JSON/config | Edit online, redeploy |
| React source export | Human-readable project handoff | React source project | User maintains code manually |

## 2. Current Codebase Facts

Relevant current files:

- `src/ui/layout/types.ts`
  - Defines `ThemeLayoutDocument`, `ThemeLayoutNode`, pages, layout, frame, and interactions.
- `src/ui/renderer/renderTree.tsx`
  - Renders a `ThemeLayoutNode` tree through core aliases or component templates.
- `src/ui/renderer/coreAliases.tsx`
  - Maps `core.*` aliases to fixed renderer components.
- `src/ui/renderer/templateInterpreter.tsx`
  - Interprets `componentTemplates` and `$bind` values.
- `src/ui/renderer/components/*`
  - Implements the fixed runtime component library.
- `shared/agent/validation/themeLayoutValidator.ts`
  - Validates allowed aliases, page roots, props, navigation targets, and render smoke behavior.
- `src/services/ExportService.ts`
  - Currently generates a Vite scaffold that loads `layout.json` and renders it through `DynamicThemeRenderer`.
- `backend/src/exports/exports.service.ts`
  - Currently saves export records and writes `layout.json`, but does not build a full standalone app.

Important current limitation:

- The existing scaffold generation is close to the hosted-runtime direction, but it is not yet a robust standalone export/deployment artifact.
- The existing backend export path only writes JSON.
- There is no deterministic compiler that turns `ThemeLayoutDocument` into human-readable React pages/components.

## 3. Architecture Decision

### Decision

Keep `ThemeLayoutDocument` as the canonical source for the online editor and AI agent. Build two downstream output pipelines:

```text
ThemeLayoutDocument
  -> Hosted runtime deploy pipeline
  -> Maintainable React source export pipeline
```

The AI agent should continue generating and editing structured JSON/tool instructions, not arbitrary React source code.

### Consequences

- Hosted deployment remains stable because runtime and components are maintained by YanLingWeb.
- Source export can prioritize readability without needing to round-trip manual code edits back into the editor.
- The two output modes can evolve separately.
- Schema versioning and migration become critical infrastructure.

## 4. Hosted Runtime Deployment Mode

### Purpose

This mode is for one-click publishing to YanLingWeb-managed infrastructure, including future subdomain deployment.

### Desired Output

Hosted deployment should produce or store:

```text
published-app/
  manifest.json
  layout.json
  theme.json
  data.json
  runtime-version.lock
```

At runtime, the platform serves:

- A stable renderer runtime.
- A fixed component library.
- The user template document and config.
- Static assets referenced by the template.

### Runtime Rules

- AI-generated code should be avoided.
- AI should only generate or modify structured documents:
  - `layout.json`
  - `theme.json`
  - `data.json`
  - `app.config.json`
- `core.widget` or arbitrary code execution must remain disabled by default and should not be part of the reliable deployment path.
- Runtime version must be recorded for every published app.
- Old templates must be migrated through explicit schema migrations before rendering on newer runtimes.

### Backend Entities To Add Or Extend

Recommended entities:

| Entity | Purpose |
| --- | --- |
| `PublishedSite` | Owns deployed site metadata, subdomain, status, active revision |
| `PublishedSiteRevision` | Immutable snapshot of layout/theme/data/runtime version |
| `TemplateSchemaMigration` | Tracks schema upgrades if persisted separately |
| `DeploymentEvent` | Records publish/build/failure/rollback events |

Minimum fields for `PublishedSite`:

- `id`
- `ownerUserId`
- `templateId`
- `subdomain`
- `status`: `draft`, `publishing`, `published`, `failed`, `disabled`
- `activeRevisionId`
- `createdAt`
- `updatedAt`

Minimum fields for `PublishedSiteRevision`:

- `id`
- `siteId`
- `templateId`
- `schemaVersion`
- `runtimeVersion`
- `layoutJson`
- `themeJson`
- `dataJson`
- `manifestJson`
- `status`
- `errorMessage`
- `createdAt`

### Hosted API Contract

Suggested endpoints:

| Action | Route | Notes |
| --- | --- | --- |
| Publish template | `POST /api/sites` | Creates or updates a site from a template |
| Republish | `POST /api/sites/:id/revisions` | Creates a new immutable revision |
| Get site | `GET /api/sites/:id` | Owner-only management view |
| List sites | `GET /api/sites/mine` | Owner-only |
| Rollback | `POST /api/sites/:id/rollback` | Switch active revision |
| Resolve public site | `GET /api/public/sites/:subdomain` | Public render config |

Subdomain routing can initially be simulated locally by path routing:

```text
/sites/:subdomain
```

Later production can map:

```text
https://{subdomain}.yanling.example
```

### Hosted Runtime E2E Tests

Required end-to-end coverage:

1. **AI creates template, user publishes**
   - Generate or load a template.
   - Save it as an owned template.
   - Publish to a generated subdomain.
   - Open public site URL.
   - Assert page renders expected text, buttons, layout sections, and navigation.

2. **Manual edit, republish**
   - Open editor.
   - Manually change text/layout/component props.
   - Save template.
   - Republish.
   - Public site reflects the new version.

3. **AI edit, republish**
   - Start from an owned template.
   - Ask AI to modify a visible section.
   - Save final document.
   - Republish.
   - Public site reflects AI change.
   - Unrelated sections remain unchanged.

4. **Revision rollback**
   - Publish revision A.
   - Modify template and publish revision B.
   - Roll back to revision A.
   - Public site returns to revision A content.

5. **Subdomain uniqueness and auth**
   - User A claims a subdomain.
   - User B cannot claim the same subdomain.
   - User B cannot republish or roll back User A's site.

6. **Invalid template rejection**
   - Try publishing invalid `ThemeLayoutDocument`.
   - API returns validation error.
   - Existing public site remains unaffected.

7. **Runtime version lock**
   - Publish a site.
   - Assert the revision stores `runtimeVersion`.
   - Public renderer uses the expected runtime version or a compatible migration path.

## 5. Maintainable React Source Export Mode

### Purpose

This mode is for users who want to take the generated design and continue development outside YanLingWeb.

### Non-Goal

This mode does not need to support round-tripping arbitrary manual code changes back into the online editor.

### Desired Output

The exported project should look like a conventional React app:

```text
exported-react-app/
  package.json
  vite.config.ts
  tsconfig.json
  src/
    App.tsx
    main.tsx
    pages/
      HomePage.tsx
      ProductPage.tsx
    components/
      ProductCard.tsx
      BottomTabs.tsx
    theme/
      tokens.ts
      global.css
    data/
      mockData.ts
    generated/
      yanling-export-manifest.json
  README.md
```

### Compiler Rule

The source export must be deterministic:

- Do not ask the LLM to write React files.
- Compile `ThemeLayoutDocument` into source using codegen.
- Use stable naming:
  - Page names from `page.name`.
  - Component names from repeated/custom patterns where possible.
  - Fallback names from node alias and node id.
- Preserve readable props and labels.
- Generate comments only where a conversion is lossy.

### Source Export Phases

Phase 1 coverage:

- `core.screen`
- `core.panel`
- `core.stack`
- `core.row`
- `core.grid`
- `core.text`
- `core.button`
- `core.image`
- `core.tabs`
- `core.search`
- `core.input`
- `core.tag`
- `core.notice`
- `core.divider`
- `core.spacer`

Phase 1 fallback behavior:

- `core.html`: preserve as a small `HtmlBlock` component or inline sanitized markup.
- `core.widget`: generate a placeholder component with a warning comment.
- Unsupported interactions: generate TODO comments and preserve static UI.

Phase 2 coverage:

- Extract repeated card/list patterns into components.
- Generate typed mock data.
- Generate simple route navigation.
- Generate form shells.
- Generate style tokens from template/theme.

### React Source Export E2E Tests

Required end-to-end coverage:

1. **Basic project generation**
   - Export a simple multi-page template.
   - Assert project files exist.
   - Run install/build command or build against workspace dependencies.
   - Assert build succeeds.

2. **Rendered output parity**
   - Render original template through `DynamicThemeRenderer`.
   - Render exported React project.
   - Compare key visible text, buttons, nav labels, and page count.
   - Visual screenshot diff can be coarse; semantic parity is more important initially.

3. **Readable file structure**
   - Assert `src/pages/*.tsx` exists.
   - Assert repeated/custom sections become `src/components/*.tsx` when extraction is enabled.
   - Assert no large opaque JSON blob is used as the primary page source.

4. **Manual source edit smoke**
   - After export, modify a generated text string in `src/pages/HomePage.tsx`.
   - Rebuild.
   - Assert the changed text appears in the built app.

5. **Fallback behavior**
   - Export a template containing `core.widget`.
   - Build still succeeds.
   - Generated output contains a clear placeholder/TODO rather than failing silently.

6. **No LLM dependency**
   - Run source export in a test environment with no AI provider keys.
   - Assert export succeeds.

7. **Stable output**
   - Run export twice on the same template.
   - Assert generated files are identical except timestamps, if timestamps are intentionally included.

## 6. Shared Schema And Validation Requirements

Both export modes must depend on the same schema contract:

- `ThemeLayoutDocument`
- `ThemeLayoutNode`
- component descriptors
- interactions
- theme tokens
- data/config extensions

Required shared infrastructure:

1. `schemaVersion` on every document.
2. Migration functions:
   - `migrateThemeLayoutDocument(input): ThemeLayoutDocument`
   - versioned migrations such as `v1ToV2`, `v2ToV3`.
3. Strict validation before:
   - saving generated AI templates,
   - publishing hosted runtime sites,
   - exporting React source.
4. Render smoke validation for hosted runtime.
5. Codegen smoke validation for source export.

## 7. Recommended Implementation Sequence

### Milestone 1: Stabilize Hosted Runtime Export

- Make hosted/runtime export self-contained or platform-owned.
- Remove reliance on the local project `src/` path for standalone artifacts.
- Add runtime version and schema version metadata.
- Add public render route using stored published revisions.
- Add publish/republish API.
- Add hosted runtime E2E tests.

### Milestone 2: Add One-Click Subdomain Deployment

- Add `PublishedSite` and `PublishedSiteRevision`.
- Add subdomain reservation and validation.
- Add public site resolver.
- Add rollback.
- Add deployment event logs.
- Add auth and ownership tests.

### Milestone 3: Build Deterministic React Source Compiler

- Create a separate export module, for example:

```text
src/exporters/react-source/
  compileDocumentToReactProject.ts
  compilePage.ts
  compileNode.ts
  componentNamer.ts
  styleCompiler.ts
  templates/
```

- Cover core aliases first.
- Generate Vite React project.
- Generate README and manifest.
- Add source export E2E tests.

### Milestone 4: Improve Readability

- Extract repeated sections into components.
- Generate typed props for extracted components.
- Generate tokenized CSS.
- Generate mock data modules.
- Add snapshot tests for generated code style.

### Milestone 5: Productize Mode Selection

- In the UI, expose two clearly named actions:
  - `Publish online`
  - `Export maintainable React project`
- Add copy explaining:
  - Hosted apps should be edited online and republished.
  - React source export is for manual downstream development and is not guaranteed to round-trip.

## 8. Acceptance Criteria

Hosted runtime mode is acceptable when:

- A user can publish an owned template to a public URL.
- Manual edits and AI edits can be republished.
- Public render does not require AI calls.
- Public render uses a locked runtime/schema version.
- Invalid templates cannot replace a working published revision.
- Rollback works.

React source export mode is acceptable when:

- Export produces a buildable React project.
- Generated page files are readable without understanding the internal JSON renderer.
- Core aliases compile to normal React components or markup.
- The export works without AI provider keys.
- Repeated exports are deterministic.
- Unsupported runtime-only features degrade clearly and build successfully.

## 9. Risks And Guardrails

### Risk: Two Pipelines Drift Apart

Guardrail:

- Use shared schema validation fixtures.
- Add parity tests between runtime render and source export.

### Risk: Source Export Becomes Another AI Code Generator

Guardrail:

- Source export must be compiler-based.
- CI should run without AI keys.

### Risk: Hosted Runtime Is Hard To Debug

Guardrail:

- Store manifest, schema version, runtime version, and revision id.
- Add public debug endpoint for owners only.

### Risk: Users Expect Round-Trip From Manual Source Edits

Guardrail:

- Product copy and README must say manual exported source edits do not sync back.

### Risk: Arbitrary Widgets Break Safety

Guardrail:

- Keep widget execution disabled by default.
- Hosted deployment should reject or sandbox widgets until a safe runtime exists.
- Source export should emit placeholders for unsupported widgets.

## 10. Suggested Task Prompt For The Next Agent

Use this prompt when starting the long-running implementation agent:

```text
Read docs/dual-export-strategy-and-e2e-plan.md and implement the dual export direction incrementally.

Start with Milestone 1 unless instructed otherwise:
1. Make hosted runtime publishing self-contained/platform-owned.
2. Add publish/republish public render path with runtime/schema metadata.
3. Add E2E coverage for publish, manual edit republish, AI edit republish, invalid template rejection, and rollback if rollback is included in the same milestone.

Keep ThemeLayoutDocument as the canonical source.
Do not make the AI generate React source files.
Do not mix hosted runtime export with maintainable React source export.
Preserve existing user changes in the worktree.
After each milestone, run build and the relevant E2E tests, then report exact commands and results.
```

