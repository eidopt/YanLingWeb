---
name: update-knowledge-base
description: >
  Review code changes from this session and update the project knowledge base
  (memory files) if anything significant changed. Invoke at end of conversations
  involving code changes, or when the user explicitly asks.
---

# Update Knowledge Base Skill

## Purpose

Keep the project memory files in sync with the actual codebase. After each
session that modifies the project, review what changed and update the relevant
memory files.

## Memory Files to Maintain

All files live in:
`/Users/shaunxiao/.claude/projects/-Users-shaunxiao-Documents-projects-ai-app/memory/`

| File | Content |
|------|---------|
| `MEMORY.md` | Index of all memory files (keep concise, ≤200 lines) |
| `project-overview.md` | Tech stack, dir structure, dev scripts, env vars |
| `frontend-pages.md` | Next.js pages, API routes, views, services, hooks |
| `backend-architecture.md` | NestJS modules, all REST endpoints, DB entities |
| `ai-agent-system.md` | Two agent modes, QueryLoop, all tools, prompts |
| `theme-layout-document.md` | Core data model, node types, layout, interactions |
| `renderer-system.md` | 18 core.* components, 48+ nodes, widget system |
| `editor-system.md` | Visual editor, AI copilot panel, editor tools |

## When to Update

Update memory when ANY of these changes:

1. **New files/directories** — new modules, components, services, tools
2. **Files deleted or renamed** — removed or reorganized code
3. **New dependencies** — `package.json` or `backend/package.json`
4. **New npm scripts** added
5. **New `core.*` components** added to the renderer
6. **New AI tools** (template generation or editor edit tools)
7. **New backend modules/controllers/entities**
8. **New App Router pages or API routes**
9. **New widget renderers/libraries** on the allowlist
10. **Architecture changes** — data flow, state management patterns
11. **Configuration changes** — env vars, ESLint rules, tsconfig paths

## Decision Process

### Step 1: Check what changed this session

```bash
cd /Users/shaunxiao/Documents/projects/ai-app
git diff --stat HEAD          # staged + unstaged changes
git status                    # new/untracked files
```

### Step 2: Determine affected memory files

| Change type | Files to update |
|------------|----------------|
| New AI tool or agent | `ai-agent-system.md` |
| New renderer component | `renderer-system.md` |
| New backend module/endpoint | `backend-architecture.md` |
| New page or API route | `frontend-pages.md` |
| New dependency or script | `project-overview.md` |
| New data type or validation | `theme-layout-document.md` |
| Editor changes | `editor-system.md` |
| No structural changes (just bug fixes, style tweaks) | **Skip — no update needed** |

### Step 3: Read current memory file + new source files

Read the affected memory file to understand what currently exists.
Read the new/changed source files to understand what was added.

### Step 4: Make targeted updates

Use `Edit` (not `Write`) for targeted updates to memory files. Only add/change
what actually changed — don't rewrite entire files.

For the MEMORY.md index: only update if the set of memory files changed.

### Step 5: Verify no dead references

If a file was deleted, remove all references to it across memory files.

## Rules

- Be precise — only document what actually exists in code
- Don't speculate about future plans
- Remove outdated info rather than appending corrections
- Don't duplicate info across files — each file has clear scope
- If only bug fixes or style tweaks happened: **don't update** (no structural change)
- Keep each memory file under ~150 lines for readability
