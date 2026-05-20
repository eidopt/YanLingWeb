---
name: indie-web-architecture-planner
description: Technical architecture planning for websites, SaaS products, and full-stack web apps. Use when Codex needs to choose a stack, define frontend/backend boundaries, design APIs, data models, auth, integrations, infrastructure, security posture, ADRs, or implementation sequencing before writing code.
---

# Indie Web Architecture Planner

## Overview

Use this skill to turn product scope into a technical plan that can be built and operated by an independent developer. Favor boring, proven architecture unless the product requirement demands otherwise.

This skill adapts and merges the Agency roles Software Architect, Backend Architect, Database Optimizer, Security Engineer, AI Engineer, SRE, and DevOps Automator.

## Workflow

1. **Clarify system boundaries**
   - Identify user roles, permissions, data ownership, external services, and trust boundaries.
   - Separate static content, interactive UI, server-rendered pages, APIs, jobs, realtime, and admin workflows.

2. **Choose architecture**
   - Start with the simplest deployable shape: static site, Jamstack, full-stack framework, API plus SPA, CMS, or monolith.
   - Add queues, microservices, realtime, search, or ML only when the use case justifies the operational cost.

3. **Define data model**
   - List entities, relationships, lifecycle states, retention needs, and migration strategy.
   - Define unique constraints, indexes, transactional boundaries, and backup expectations.

4. **Design contracts**
   - Specify API endpoints or server actions, request/response shapes, validation, errors, pagination, authorization, rate limits, and idempotency.
   - For frontend integration, define loading, empty, error, and optimistic update behavior.

5. **Address security and reliability**
   - Threat-model auth, secrets, input handling, file uploads, webhooks, payments, admin access, and third-party APIs.
   - Define observability, rollback, failure modes, and manual recovery steps.

6. **Sequence implementation**
   - Build foundation first: env config, database, auth/session, routes, API clients, tests, CI.
   - Defer polish and scale work until after the primary journey works.

## Architecture Rules

- Prefer one deployable application until separation clearly reduces risk.
- Prefer managed services for solo developers when they reduce operational burden.
- Keep data migrations reversible or accompanied by explicit rollback notes.
- Treat authorization as a domain rule, not a UI condition.
- Never expose secrets to browser code.
- Design for failure: third-party APIs, email, payments, file storage, and AI calls must have visible error paths.
- Document non-decisions: what is intentionally not being built now.

## Deliverables

```markdown
# Architecture Brief

## Recommended Shape
[Stack and deployment model with reasoning]

## System Boundaries
| Boundary | Responsibility | Notes |
| --- | --- | --- |
| Frontend | [Role] | [Framework/routes] |
| Backend | [Role] | [API/server actions] |
| Data | [Role] | [DB/storage] |
| External | [Role] | [Service] |

## Data Model
| Entity | Fields | Relationships | Constraints |
| --- | --- | --- | --- |

## API / Contract
| Action | Method/Route | Input | Output | Auth | Errors |
| --- | --- | --- | --- | --- | --- |

## Security Notes
- Auth/authz:
- Sensitive data:
- Input validation:
- Abuse/rate limits:
- Secrets:

## Operational Notes
- Deployment:
- Monitoring:
- Backups:
- Rollback:
```

```markdown
# Architecture Decision Record

## Status
Proposed / Accepted / Rejected

## Context
[Problem and constraints]

## Decision
[Chosen approach]

## Consequences
[Benefits, costs, risks, follow-ups]
```

## Quality Gate

Before handing off to implementation, confirm:

- The primary user flow has a complete frontend/backend/data path.
- Auth and authorization decisions are explicit.
- Database constraints match business rules.
- External services have failure handling.
- Verification plan includes tests or manual checks for critical paths.

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for independent web architecture.
