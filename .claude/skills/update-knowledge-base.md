---
name: update-knowledge-base
description: >
  Review the current conversation for project structure changes and update
  the project knowledge base (CLAUDE.md + memory files) accordingly.
  This skill should be invoked at the end of a conversation that involved
  significant code changes, or when the user explicitly asks to update
  the knowledge base.
---

# Update Knowledge Base Skill

## Purpose

Keep the project knowledge base in sync with the actual codebase. After each
conversation that modifies the project, review what changed and update the
relevant documentation files.

## Knowledge Base Files

| File | Content |
|------|---------|
| `CLAUDE.md` (project root) | Comprehensive project documentation |
| `memory/project-overview.md` | Project identity, tech stack, architecture |
| `memory/ai-agent-system.md` | AI agent modes, QueryLoop, tools, prompts |
| `memory/theme-layout-document.md` | Core data format, types, validation |
| `memory/renderer-system.md` | 18 core components, widget system |
| `memory/editor-system.md` | Visual editor, drag-and-drop, services |
| `memory/backend-architecture.md` | NestJS modules, entities, database |
| `memory/frontend-pages.md` | Next.js routes, API handlers, views |
| `memory/MEMORY.md` | Index of all memory files |

## When to Update

Update the knowledge base when ANY of these changes:

1. **New files/directories created** — new modules, components, services, tools
2. **Files/directories deleted or renamed** — removed or reorganized code
3. **New dependencies** added to `package.json` or `backend/package.json`
4. **New npm scripts** added
5. **New core.* components** added to the renderer
6. **New AI tools** added (template generation or editor edit)
7. **New backend modules/controllers/entities** created
8. **New App Router pages or API routes** added
9. **New widget renderers/libraries** added to the allowlist
10. **Architecture changes** — communication patterns, data flow, state management
11. **Configuration changes** — new env vars, ESLint rules, tsconfig paths

## How to Update

### Step 1: Identify changes

Review the conversation to identify what was modified:
- Use `git diff --stat` to see changed files
- Use `git status` to see new/untracked files
- Review the conversation for the intent behind changes

### Step 2: Determine affected knowledge files

Map the changes to the knowledge base files that need updating:

| Change type | Files to update |
|------------|----------------|
| New AI tool or agent | `ai-agent-system.md`, `CLAUDE.md` |
| New renderer component | `renderer-system.md`, `CLAUDE.md` |
| New backend module | `backend-architecture.md`, `CLAUDE.md` |
| New page or API route | `frontend-pages.md`, `CLAUDE.md` |
| New dependency or script | `project-overview.md`, `CLAUDE.md` |
| New data type or validation | `theme-layout-document.md` |
| Editor changes | `editor-system.md`, `CLAUDE.md` |
| Architecture change | Multiple files + `CLAUDE.md` |

### Step 3: Read current files

Read the affected knowledge base files to understand what currently exists.
Read any new source files to understand what was added.

### Step 4: Update the files

Use `Edit` to make targeted updates to the knowledge base files. Do NOT
rewrite entire files unless the changes are extensive.

For `CLAUDE.md`:
- Add new directories to the directory tree
- Add new components to the core components table
- Add new scripts to the development commands
- Update the tech stack if dependencies changed
- Add new modules/services to the architecture section

For memory files:
- Add new sections for new features
- Update existing sections with new information
- Keep the "Why:" sections if the rationale is important

### Step 5: Verify consistency

Ensure all cross-references between memory files remain valid.
Ensure MEMORY.md index still accurately describes each file.

## Rules

- Be precise — only document what actually exists in the code
- Don't speculate about future plans or intentions
- Keep the "Why:" sections focused on non-obvious design decisions
- Remove outdated information rather than appending corrections
- If a file was deleted, remove all references to it from the knowledge base
- Don't duplicate information across files — each file has a clear scope
