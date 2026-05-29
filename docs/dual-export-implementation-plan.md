# Dual Export Implementation Plan

> Document status: Historical implementation plan. For current implementation
> facts, start with `docs/current-implementation-status.md` and
> `reports/03-code-framework-defects-progress.md`.

This document captures the current implementation plan derived from
`docs/dual-export-strategy-and-e2e-plan.md` and the current codebase shape.

## Current Assessment

YanLingWeb already has the foundation for the hosted runtime path, but it does
not yet have two clean export pipelines.

- Runtime rendering exists in `src/ui/renderer/DynamicThemeRenderer.tsx`.
- Layout schema and normalization exist in `src/ui/layout/types.ts`.
- Shared validation exists in `shared/agent/validation/themeLayoutValidator.ts`.
- Frontend export logic in `src/services/ExportService.ts` currently resembles a
  runtime scaffold, but it still depends on the local project `src/` path.
- Backend export logic in `backend/src/exports/exports.service.ts` currently
  saves an export record and writes `layout.json`; it is not yet a publishable
  standalone app or hosted-site pipeline.
- Template ownership, update, and validation already exist in
  `backend/src/templates/templates.service.ts`.

The recommended first implementation target is Milestone 1: stabilize hosted
runtime publishing. The maintainable React source compiler should remain a
separate pipeline and be built after hosted publishing is stable.

## Implementation Framework

### 1. Shared Schema Foundation

Add a shared schema/migration layer used by template save, hosted publish, and
source export.

Planned work:

- Clarify whether the existing `ThemeLayoutDocument.version` is the schema
  version, or add an explicit `schemaVersion`.
- Add a migration entry point, for example:
  - `shared/theme-layout/migrations/index.ts`
  - `migrateThemeLayoutDocument(input): ThemeLayoutDocument`
- Add versioned migrations such as `v1ToV2` when schema changes are introduced.
- Require the same flow before save, publish, and source export:
  - normalize
  - migrate
  - validate
  - smoke-check

### 2. Hosted Runtime Publishing Pipeline

Add a platform-owned publishing path that stores immutable published revisions
and serves them through a public resolver.

Planned backend module:

```text
backend/src/sites/
  sites.module.ts
  sites.controller.ts
  sites.service.ts
  entities/
    published-site.entity.ts
    published-site-revision.entity.ts
```

Planned entities:

- `PublishedSite`
- `PublishedSiteRevision`
- `DeploymentEvent` can be added after the initial publish flow works.

Minimum `PublishedSite` fields:

- `id`
- `ownerUserId`
- `templateId`
- `subdomain`
- `status`
- `activeRevisionId`
- `createdAt`
- `updatedAt`

Minimum `PublishedSiteRevision` fields:

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

Planned API:

| Action              | Route                              | Auth   |
| ------------------- | ---------------------------------- | ------ |
| Publish template    | `POST /api/sites`                  | Owner  |
| Republish           | `POST /api/sites/:id/revisions`    | Owner  |
| List my sites       | `GET /api/sites/mine`              | Owner  |
| Get site            | `GET /api/sites/:id`               | Owner  |
| Rollback            | `POST /api/sites/:id/rollback`     | Owner  |
| Resolve public site | `GET /api/public/sites/:subdomain` | Public |

Planned frontend public route:

```text
src/app/sites/[subdomain]/page.tsx
```

The route should load public site config and render through
`DynamicThemeRenderer`.

Hosted runtime rules:

- Public render must not call AI.
- Publish must store a `runtimeVersion`.
- Publish must store a schema version.
- Invalid templates must not replace the currently active public revision.
- `core.widget` should remain disabled or rejected for the reliable hosted path
  until a safe runtime exists.

### 3. Maintainable React Source Export Pipeline

Build this as a separate deterministic compiler. Do not reuse the hosted runtime
scaffold as the source export implementation.

Planned module:

```text
src/exporters/react-source/
  compileDocumentToReactProject.ts
  compilePage.ts
  compileNode.ts
  componentNamer.ts
  styleCompiler.ts
  templates/
```

Phase 1 compiler coverage:

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

Fallback behavior:

- `core.html`: generate a small `HtmlBlock` component or sanitized inline block.
- `core.widget`: generate a placeholder component with a clear TODO.
- Unsupported interactions: preserve static UI and generate TODO comments only
  where the conversion is lossy.

Compiler rules:

- Do not ask an LLM to generate React source files.
- Generate stable names from page names, aliases, node ids, and repeated
  patterns.
- Keep output buildable and readable.
- Do not use a large opaque JSON blob as the primary page source.

### 4. Product Entry Points

Update the export/publish UI so users see two distinct actions:

- `Publish online`
- `Export maintainable React project`

Required copy:

- Hosted apps should be edited online and republished.
- React source export is for downstream manual development and is not guaranteed
  to round-trip back into YanLingWeb.

## Recommended Execution Order

1. Add schema/migration/runtime-version foundation.
2. Add the backend `sites` module and public resolver.
3. Add the frontend `/sites/:subdomain` public render route.
4. Add hosted runtime tests for publish, republish, invalid template rejection,
   ownership, and rollback.
5. Stabilize hosted publishing before starting source export.
6. Add the deterministic React source compiler.
7. Add source export tests and output readability checks.
8. Update UI mode selection and user-facing copy.

## Testing Plan

### Existing Baseline Checks

Run these before and after major changes:

```bash
pnpm build
cd backend && npm run build
pnpm test:integration
```

### Hosted Runtime API Integration Tests

Add integration coverage for:

- Login and authenticated publish.
- Duplicate a marketplace template into an owned template.
- Publish to a subdomain.
- Resolve `GET /api/public/sites/:subdomain`.
- Assert active revision, `runtimeVersion`, schema version, layout, theme, and
  manifest data.
- Modify the owned template and republish.
- Assert public config reflects the new revision.
- Try publishing an invalid layout.
- Assert the API returns a validation error and the previous public revision
  remains active.
- Roll back to a previous revision.
- Assert public config returns to the previous content.
- Assert subdomain uniqueness.
- Assert user B cannot republish or roll back user A's site.

### Hosted Runtime Browser E2E Tests

Once browser E2E tooling is added or enabled, cover:

- Start backend and Next.
- Visit `/sites/:subdomain`.
- Assert expected title, text, buttons, tabs, layout sections, and navigation
  labels render.
- Perform a manual template edit, republish, and refresh the public site.
- Perform an AI template edit, republish, and verify the public site changed
  while unrelated sections remain stable.
- Roll back and verify the public site returns to revision A.

Suggested future location:

```text
e2e/hosted-runtime.spec.ts
```

### React Source Export Tests

Add after the hosted runtime path is stable:

- Basic project generation:
  - export a multi-page template
  - assert project files exist
  - build the generated app
- Rendered output parity:
  - compare key visible text, buttons, nav labels, and page count with the
    runtime renderer
- Readable file structure:
  - assert `src/pages/*.tsx` exists
  - assert extracted components appear under `src/components/*.tsx` when
    extraction is enabled
  - assert the generated page source is not just an opaque JSON renderer
- Manual edit smoke:
  - edit text in `src/pages/HomePage.tsx`
  - rebuild
  - assert changed text appears
- Fallback behavior:
  - export a template containing `core.widget`
  - assert build succeeds with a clear placeholder/TODO
- No LLM dependency:
  - run export without AI provider keys
  - assert export succeeds
- Stable output:
  - run export twice on the same template
  - assert generated files are identical except intentional timestamps, if any

## Acceptance Gate For First Implementation Milestone

Milestone 1 is complete when:

- An owned template can be published to a public local URL.
- Public render does not require AI calls.
- The published revision stores runtime and schema metadata.
- Manual edits can be republished.
- Invalid templates cannot replace a working public revision.
- Public resolver returns the active immutable revision.
- The relevant build and integration tests pass.
