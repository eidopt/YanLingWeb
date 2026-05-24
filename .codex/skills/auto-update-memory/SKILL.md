---
name: auto-update-memory
description: Automatically review repository and conversation changes at the end of coding sessions and decide whether to update the YanLingWeb project memory. Use before the final response after code edits, architecture changes, new files, deleted files, dependency/script/config changes, AI tool/prompt changes, renderer/layout DSL changes, backend/frontend route changes, export pipeline changes, or when the user asks to update memory or the knowledge base.
---

# Auto Update Memory

## Purpose

Keep the Codex project memory aligned with the real YanLingWeb codebase without turning it into a changelog. Use this skill as the finalization pass for coding conversations that may have changed the product architecture, framework, or important implementation contracts.

Primary memory target:

- `C:\Users\Administrator\.codex\memories\YanLingWeb.md`

Treat repository `CLAUDE.md` and `.claude/skills/update-knowledge-base.md` as Claude-side documentation. Update them only when the user explicitly asks for Claude docs or when the current task already owns those files; verify encoding first because PowerShell output may show mojibake.

## Quick Workflow

1. Run `python .codex/skills/auto-update-memory/scripts/classify_memory_update.py --repo .` from the repository root.
2. Review the current conversation and `git diff --stat` for intent that the script cannot infer.
3. Decide whether memory needs an update using the rules below.
4. If updating, edit only the relevant sections of `YanLingWeb.md`; do not rewrite the full memory.
5. Run the classifier again. Inspect repository skill changes with `git diff -- .codex/skills/auto-update-memory`; for the external Codex memory file, read the edited snippets directly because it is outside the git repository.
6. In the final response, state whether memory was updated and why.

## Update Decision

Update memory when any changed file or conversation outcome affects a stable future-session assumption:

- Product architecture, main user flow, or canonical data contracts.
- `ThemeLayoutDocument`, layout aliases, validator behavior, renderer behavior, widget policy, or export behavior.
- AI agent tools, prompts, query loop, provider/cache behavior, or evaluation harness semantics.
- Frontend App Router pages, API routes, service boundaries, or editor service contracts.
- Backend modules, controllers, entities, auth, persistence, publish/export behavior, or public API shape.
- Package dependencies, package manager, scripts, build/test commands, tsconfig, Next/Nest/Electron config, or env variables.
- Security posture, known risks, verification commands, or "where to change things" guidance.
- Files/directories added, removed, or renamed in a way future agents should know.

Do not update memory for small local fixes that do not change future guidance:

- Pure styling or copy edits with no new conventions.
- Test-only fixture text changes that do not affect harness semantics.
- Bug fixes within an already documented component where the external contract is unchanged.
- Formatting, import sorting, or lint-only changes.

When uncertain, update a narrow note rather than adding a broad new section.

## Memory Editing Rules

- Prefer durable facts over session chronology.
- Replace stale statements instead of appending corrections.
- Keep security and caveat sections current when behavior changes.
- Preserve the existing structure and concise style.
- Do not copy secrets, local `.env*.local` values, or provider keys into memory.
- Avoid large rewrites when encoding looks suspicious; patch ASCII sections when possible.
- Keep "Last full repo scan" for full audits only. Update "Last implementation update" when a targeted architecture-relevant update is recorded.

## Classification Hints

Use the classifier output as a starting point:

- `must_update`: memory should normally be edited.
- `review`: inspect context; update only if the diff changes durable assumptions.
- `skip`: usually no memory update.

Important path categories:

- `package.json`, `pnpm-workspace.yaml`, `tsconfig*`, `next.config.*`, `vite*`, `electron*`: stack/config.
- `src/app/**`: routes and Next API surface.
- `src/ai/**`, `backend/src/ai/**`, `shared/agent/prompts/**`: AI behavior.
- `shared/agent/types.ts`, `shared/agent/validation/**`, `src/ui/layout/**`: layout contract and validation.
- `src/ui/renderer/**`: runtime renderer and core aliases.
- `src/ui/editor/**`: visual editor contracts.
- `backend/src/**`: backend API, persistence, auth, publish/export semantics.
- `src/exporters/**`, `src/services/ExportService.ts`, `electron/**`, `backend/src/exports/**`: export paths.
- `.codex/skills/**`, `C:\Users\Administrator\.codex\memories\**`: agent operating knowledge.

## Automation Boundary

A skill cannot by itself install a guaranteed after-conversation hook in the Codex runtime. The practical automation is: this skill is implicitly invocable, its description tells Codex to run it before final responses after code edits, and the project memory should remind future sessions to use it. If a true runtime hook becomes available, wire that hook to invoke this skill or its classifier script.
