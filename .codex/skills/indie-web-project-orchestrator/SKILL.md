---
name: indie-web-project-orchestrator
description: End-to-end independent web project orchestration using Codex skills and subagents. Use when the user asks Codex to coordinate a complete website, SaaS, landing page, CMS, or web app project across analysis, product planning, UX/UI design, architecture, frontend, backend, content/SEO, QA, testing, launch, or parallel specialist subagent work.
---

# Indie Web Project Orchestrator

## Overview

Use this skill to run a complete independent web project workflow. The orchestrator owns the critical path, uses specialist skills for depth, and delegates bounded sidecar work to subagents when the user has asked for orchestration, delegation, or parallel subagent execution.

This skill adapts and merges the Agency Agents Orchestrator, Startup MVP workflow, Landing Page workflow, and phase playbooks, converted to Codex's subagent and skill model.

## Operating Principles

- Keep one owner: the main Codex thread integrates decisions, edits, verification, and final reporting.
- Delegate only concrete, bounded tasks that can run in parallel without blocking the immediate next local step.
- Give workers disjoint file ownership when they edit code.
- Tell workers they are not alone in the codebase and must not revert others' edits.
- Use explorers for read-only codebase questions and workers for bounded implementation.
- Avoid duplicated work between the main thread and subagents.
- Use quality gates before advancing from plan to implementation and from implementation to launch.
- Preserve the user's dirty worktree and never revert unrelated changes.

## Skill Team Map

Use these skills as specialist modes:

- `$indie-web-product-planner`: product framing, MVP scope, PRD, backlog, sprint plan
- `$indie-web-codebase-analyst`: repository map, execution flow, minimal change surface
- `$indie-web-ux-ui-designer`: user flow, IA, design system, components, handoff specs
- `$indie-web-architecture-planner`: stack, boundaries, API, schema, auth, risks
- `$indie-web-frontend-builder`: UI implementation, components, responsive behavior, frontend integration
- `$indie-web-backend-builder`: APIs, database, auth, jobs, backend tests
- `$indie-web-cms-builder`: WordPress, Drupal, headless CMS, content models
- `$indie-web-content-seo`: copy, SEO, conversion, AI visibility, structured data
- `$indie-web-quality-auditor`: accessibility, API, performance, visual evidence, release gate
- `$indie-web-launch-operator`: deployment, CI/CD, monitoring, rollback, runbooks

## Pipeline

### 1. Intake and Local Orientation

Do locally first:

- Read the user's latest request and define the actual objective.
- Inspect repo state with `pwd`, `git status --short`, `rg --files`, and relevant manifests/configs.
- Identify whether this is greenfield, existing-code change, redesign, landing page, CMS work, or launch hardening.
- Create or update a concise plan with current phase and verification expectations.

### 2. Parallel Discovery

Spawn sidecar subagents only when their outputs can be produced independently.

Useful parallel set for greenfield or major new work:

- Product scope: MVP, non-goals, backlog, acceptance criteria
- UX/UI: IA, primary flow, components, responsive design
- Architecture: stack, data/API/auth/security plan
- Content/SEO: landing copy, metadata, conversion path

Useful parallel set for existing code:

- Codebase analyst: map current architecture and change surface
- Quality auditor: identify current breakage and test baseline
- Architecture planner: assess technical constraints and risk

### 3. Merge and Decide

Integrate subagent outputs into one build plan:

- Resolve conflicts explicitly.
- Cut scope until the plan is shippable.
- Convert recommendations into implementation tasks with ownership, file areas, and verification.
- Identify tasks that can be parallelized safely.

### 4. Implementation Tracks

Delegate implementation only with disjoint ownership:

- Frontend worker: routes/components/styles/tests
- Backend worker: API/services/entities/migrations/tests
- CMS worker: theme/plugin/module/templates/content model
- Content/SEO worker: copy, metadata, schema, sitemap/robots updates
- Launch worker: CI/deployment/env/monitoring docs

Keep the main thread on integration, conflict resolution, and critical blockers.

### 5. Dev-QA Loop

For each implemented slice:

1. Run targeted verification.
2. Have quality review happen in parallel with other non-overlapping work when useful.
3. Feed concrete findings back to the responsible worker or fix locally if it is faster and within the same ownership area.
4. Limit retries to keep momentum; after repeated failure, escalate with exact blocker and options.

### 6. Launch or Handoff

Finish with:

- Files changed
- User-visible behavior
- Verification commands/results
- Remaining risks
- Launch checklist or next operational steps when relevant

## Subagent Prompt Templates

Use short, concrete prompts. Include file ownership for workers.

```text
Use $indie-web-codebase-analyst to map this repository for [feature/project].
Return: stack summary, key files, execution flow, change surface, and verification commands.
Do not edit files.
```

```text
Use $indie-web-frontend-builder to implement [specific UI task].
You own only: [paths/modules].
You are not alone in the codebase; do not revert edits outside your ownership area.
Follow existing project patterns and list changed files plus verification results.
```

```text
Use $indie-web-quality-auditor to review [URL/flow/diff].
Return a PASS / NEEDS WORK / BLOCKED decision with evidence, findings by severity, and exact reproduction or verification steps.
Do not edit files.
```

## Handoff Package

When handing work between phases or agents, include:

- Objective and launch definition
- Relevant constraints and non-goals
- Source files or URLs
- Current implementation state
- Decisions already made
- Required output format
- Verification expectations

## Failure Handling

- If a subagent is blocked, ask it for the smallest useful artifact it can still provide.
- If outputs conflict, prefer code evidence, product constraints, and user goals over preference.
- If verification cannot run, document the environment blocker and provide manual checks.
- If the task grows beyond the user's request, stop and surface the scope tradeoff.

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for Codex skill invocation and subagent orchestration.
