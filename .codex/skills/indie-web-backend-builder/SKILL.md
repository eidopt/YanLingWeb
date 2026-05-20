---
name: indie-web-backend-builder
description: Backend and API implementation for web products. Use when Codex needs to build or modify server routes, REST or GraphQL APIs, auth, authorization, database schemas, migrations, service layers, jobs, webhooks, integrations, validation, tests, or backend performance for a website, SaaS, or full-stack app.
---

# Indie Web Backend Builder

## Overview

Use this skill to implement backend functionality that is secure, testable, and aligned with the existing web app architecture. Favor explicit contracts and clear failure handling over clever abstractions.

This skill adapts and merges the Agency roles Backend Architect, Database Optimizer, Security Engineer, API Tester, Data Engineer, and Software Architect.

## Workflow

1. **Read the existing backend shape**
   - Identify framework, routing, services, entities/models, migrations, auth middleware, validation, tests, env config, background jobs, and integrations.
   - Match local naming, layering, error handling, and dependency injection patterns.

2. **Define the contract**
   - Specify route/action, method, input schema, output shape, auth requirement, status codes, and error body.
   - Coordinate with frontend loading/error states when applicable.

3. **Design data changes**
   - Add migrations, constraints, indexes, and rollback notes where needed.
   - Preserve data integrity with transactions for multi-step writes.
   - Avoid nullable or free-form fields unless they represent real domain states.

4. **Implement service logic**
   - Validate at the boundary.
   - Enforce authorization server-side.
   - Keep business rules in services/domain code rather than controllers.
   - Make external calls time-bounded and recoverable.

5. **Test**
   - Add unit tests for domain logic and integration/API tests for routes.
   - Include auth, validation, not-found, conflict, and permission cases.
   - For webhooks or jobs, test idempotency and retry behavior.

6. **Document**
   - Update OpenAPI, typed clients, README, or local docs when the project maintains them.
   - Note new env vars, migrations, and operational steps.

## Backend Rules

- Authorization is mandatory for any user-owned or privileged data.
- Never trust browser-provided role, owner, price, tenant, or status values.
- Prefer typed validation schemas at API boundaries.
- Use consistent error codes and messages.
- Avoid N+1 queries, unbounded list endpoints, and missing pagination.
- Protect secrets and credentials from logs, responses, and client bundles.
- Make destructive actions explicit and auditable.

## API Checklist

```markdown
## API Contract
Route:
Method:
Auth:
Input:
Output:
Errors:
Rate/idempotency:

## Data
Migration:
Constraints:
Indexes:
Backfill:
Rollback:

## Verification
- [ ] Valid request succeeds
- [ ] Invalid input fails clearly
- [ ] Unauthorized request fails
- [ ] Forbidden cross-user/tenant access fails
- [ ] Not-found/conflict cases handled
- [ ] Tests run or limitation documented
```

## Performance Notes

- Check query plans for new high-volume filters or joins.
- Add indexes that match real query predicates, not speculative future needs.
- Use cursor pagination for large ordered lists.
- Batch external calls when possible.
- Cache only after correctness and invalidation are clear.

## Handoff Summary

When finishing, state:

- Routes/services/migrations changed
- New env vars or operational steps
- Tests and API checks run
- Security or data risks remaining

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for backend web implementation.
