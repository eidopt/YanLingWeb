---
name: indie-web-codebase-analyst
description: Existing web codebase analysis and onboarding for independent developers. Use when Codex needs to understand a website or web app repository, map architecture, trace frontend/backend/data flows, find where to change behavior, create a minimal-change implementation plan, or explain unfamiliar code before editing.
---

# Indie Web Codebase Analyst

## Overview

Use this skill before changing an unfamiliar web project. The goal is a factual map of how the code works, where the requested behavior lives, what can be changed safely, and how to verify the change.

This skill adapts and merges the Agency roles Codebase Onboarding Engineer, Minimal Change Engineer, Code Reviewer, Git Workflow Master, and Software Architect.

## Workflow

1. **Inventory the repository**
   - Start with `pwd`, `rg --files`, package manifests, framework config, routing files, server entry points, database/migration directories, and test config.
   - Identify app type: static site, SPA, SSR app, monorepo, API server, CMS theme/plugin, full-stack app, or hybrid.
   - Note package manager, build scripts, test commands, and dev-server commands.

2. **Trace entry points**
   - For frontend: routes, layout roots, state stores, API clients, rendering pipeline, component boundaries, styling system, and asset handling.
   - For backend: controllers/routes, services, models/entities, auth middleware, persistence, jobs, queues, and integrations.
   - For CMS: theme templates, block registration, plugin/module hooks, content models, and rendering path.

3. **Ground explanations in code**
   - Quote file paths and line numbers when explaining behavior.
   - Distinguish direct evidence from inference.
   - Avoid broad claims like "the app uses X everywhere" unless verified.

4. **Find the minimum change surface**
   - Identify the smallest set of files likely needed.
   - Preserve existing conventions even if another approach is personally preferred.
   - Call out nearby hazards: duplicated logic, generated files, migrations, shared components, cross-module contracts, or dirty user edits.

5. **Define verification**
   - Map each proposed change to tests, builds, screenshots, API checks, migrations, or manual flows.
   - If no test exists, propose the narrowest useful test or manual check.

## Rules

- Read code before proposing architecture.
- Do not rewrite to a preferred stack unless the user explicitly asks.
- Do not revert unrelated working tree changes.
- Prefer small diffs that satisfy the request.
- Surface scope expansion instead of silently doing it.
- When unsure, search more locally before asking the user.

## Output Template

```markdown
# Codebase Map

## 1-Line Summary
[What this repo is and how it is structured]

## Relevant Stack
- Frontend:
- Backend:
- Data:
- Build/test:

## Key Files
| Area | File | Why It Matters |
| --- | --- | --- |
| [Area] | [path] | [Role] |

## Execution Flow
1. [Request/user action enters here]
2. [Code path]
3. [Data/API/render outcome]

## Change Surface
- Primary files:
- Possible shared contracts:
- Generated or risky files:

## Minimal Plan
1. [Small change]
2. [Small change]

## Verification
- [Command or manual flow]
- [Expected result]
```

## Review Checklist

Use this when analyzing an existing diff:

- Correctness: Does the code implement the requested behavior, including edge cases?
- Maintainability: Does it follow local patterns and avoid unnecessary abstraction?
- Security: Are inputs validated, secrets protected, and authorization enforced?
- Performance: Does it avoid avoidable N+1, re-render loops, large bundles, and blocking work?
- Tests: Is there meaningful coverage for the changed behavior?

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for web codebase analysis and small-team execution.
