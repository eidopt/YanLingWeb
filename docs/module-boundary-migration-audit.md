# Module Boundary Migration Audit

Document status: Live migration audit.

Last updated: 2026-05-29

This audit covers the remaining defect-report boundary items:

- `1.2` frontend/backend module system mismatch.
- `9.5` physical split between browser-safe contracts and backend/eval agent
  implementation.

The executable audit entrypoint is:

```powershell
pnpm module-boundaries:audit
```

The script is intentionally informational. It exits non-zero only when expected
evidence cannot be inspected; the presence of blockers is the current state, not
a script failure.

## Current Evidence

`scripts/audit-module-boundaries.cjs` reads the current package/config/import
graph and reports:

- Backend package module type.
- Backend TypeScript `compilerOptions.module`.
- TypeORM migration scripts still using the CommonJS CLI wrapper.
- Root scripts still using `ts-node` or `tsconfig-paths`.
- Jest `ts-jest` and `moduleNameMapper` usage.
- Backend relative imports that would need ESM extension handling.
- Frontend/backend `@shared/agent/*` segment usage. Frontend imports are now
  limited to public `browser`, `contracts`, and `tools` surfaces; backend/eval
  imports are now limited to public `contracts`, `runtime`, and `tools`
  surfaces.

## Backend ESM Migration Blockers

| Area              | Current state                                                              | Migration requirement                                                                                     |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Package type      | Root package is ESM, backend package is still not marked as ESM.           | Decide whether backend becomes `"type": "module"` in one step or through dual output.                     |
| TypeScript emit   | `backend/tsconfig.json` emits `commonjs`.                                  | Move backend to `NodeNext`/ESM-compatible emit and verify Nest decorators, metadata, and path resolution. |
| TypeORM CLI       | Migration scripts use `typeorm-ts-node-commonjs`.                          | Switch to an ESM-capable migration runner or build migrations before CLI execution.                       |
| Jest              | Backend Jest uses `ts-jest` with CommonJS-oriented config.                 | Add a backend ESM Jest config or migrate to a runner path that handles ESM TypeScript reliably.           |
| `@shared/*` alias | Backend compile/runtime and Jest map `@shared/*` directly to source.       | Prefer package exports or built artifacts before removing CommonJS compatibility assumptions.             |
| Relative imports  | Many backend relative imports omit file extensions.                        | Use TypeScript config/tooling that rewrites extensions, or migrate source imports explicitly.             |
| CLI scripts       | Root `templates:generate` still uses `ts-node -r tsconfig-paths/register`. | Convert CLI scripts to `tsx`, compiled JS, or an ESM-aware runner with equivalent path handling.          |

## Shared Physical Split Candidate

Target shape:

| Package                | Owns                                                                                                 | Consumers                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `shared-contracts`     | DTOs, provider/query-loop contracts, `ThemeLayoutDocument`, search types, pure validation contracts. | Frontend, backend, source export, tests.                              |
| `theme-layout`         | Document boundary, migrations, style manifest/profile, visual assets, renderer-safe layout helpers.  | Frontend renderer/editor/export, backend template persistence/import. |
| `shared-agent-runtime` | Agent compiler, runtime query loop implementation, prompts, skills, testing fixtures, eval helpers.  | Backend and offline eval only.                                        |
| `shared-agent-browser` | Browser facade for prompt/context excerpts and UI intent routing.                                    | Frontend AI/editor code only.                                         |

This split should be implemented through package/export boundaries before large
file moves. The current `scripts/check-shared-boundaries.cjs` frontend guard now
rejects direct imports from implementation `types`, `validation`, and `editor`
segments in addition to backend-only runtime segments. Backend/eval
implementation imports now go through `@shared/agent/runtime`. These are
temporary public surfaces, not the final physical package boundary.

## Migration Sequence

1. Keep current guards:
   `pnpm shared:module-format:check` and `pnpm shared:boundary:check`.
2. Done: introduce package-style public barrels for browser-safe contract
   surfaces without moving files yet. Current frontend public surfaces are
   `@shared/agent/browser/*`, `@shared/agent/contracts/*`, and
   `@shared/agent/tools/*`.
3. Done: move frontend imports from broad `@shared/agent/types`, validation,
   and editor paths to explicit contract/browser barrels.
4. Done: move backend/eval implementation imports from direct `compiler`,
   `context`, `editor`, `fixtures`, `prompts`, `skills`, `template`, `testing`,
   `types`, and `validation` paths to public `@shared/agent/runtime` and
   `@shared/agent/contracts/*` barrels. Current audit evidence reports backend
   segments only as `contracts`, `runtime`, and `tools`.
5. Done: `pnpm shared:boundary:check` now fails unless frontend imports are
   limited to `browser/contracts/tools`, backend/eval imports are limited to
   `contracts/runtime/tools`, and backend/eval runtime implementation imports
   use the `@shared/agent/runtime` barrel instead of runtime subpaths.
6. Only after import graph separation is stable, decide whether to physically
   move files into separate workspace packages.
7. Run backend ESM migration after the package/export boundaries are explicit,
   because the ESM migration otherwise has to solve path aliases and physical
   package split at the same time.

## Acceptance Evidence

The `1.2` module-system item can be closed only when one of these is true:

- Backend is actually ESM-compatible at runtime, including Nest start, Jest,
  TypeORM migration run/revert, CLI scripts, and production start.
- Or the project explicitly chooses a documented dual-system architecture where
  shared source remains ESM-only, backend CommonJS is an intentional runtime
  boundary, and package/export checks prove shared code does not depend on
  CommonJS behavior.

The `9.5` physical package-boundary item can be closed only when:

- Browser-safe contracts are imported through explicit contract/browser
  surfaces.
- Backend/eval implementation imports go through explicit runtime/contract/tool
  surfaces.
- Backend/eval implementation surfaces are not reachable from frontend imports.
- The check is executable in `pnpm lint` or `pnpm build`.
- Current docs and memory identify the chosen package boundary.

The remaining backend ESM choice, live-provider scenario breadth, state
persistence scope, and richer source-export workflow scope are decision tasks.
Do not implement them without a concrete, objectively verifiable target.
