---
name: indie-web-launch-operator
description: Launch, deployment, CI/CD, observability, reliability, documentation, and operational readiness for independent web projects. Use when Codex needs to prepare or implement deployment workflows, env config, hosting setup, rollback plans, monitoring, SLOs, runbooks, release checklists, Git workflows, or post-launch operations.
---

# Indie Web Launch Operator

## Overview

Use this skill when a web project needs to move from working locally to safely running for users. Optimize for repeatable deployment, clear rollback, useful monitoring, and documentation a solo developer can maintain.

This skill adapts and merges the Agency roles DevOps Automator, SRE, Git Workflow Master, Technical Writer, Incident Response Commander, Security Engineer, and Project Shepherd.

## Workflow

1. **Preflight**
   - Identify hosting target, package manager, build command, runtime, database, storage, queues, cron/jobs, domains, DNS, env vars, secrets, and third-party services.
   - Confirm production data and credentials are not used in local tests.

2. **Make the build repeatable**
   - Ensure install, lint/typecheck/test/build commands are documented and CI-friendly.
   - Pin runtime versions where the platform supports it.
   - Fail builds on missing required env vars.

3. **Configure deployment**
   - Use the platform-native path first: Vercel, Netlify, Cloudflare, Railway, Render, Fly, Docker, or cloud provider.
   - Define preview/staging/production behavior.
   - Include database migrations and seed/backfill steps.

4. **Plan rollback**
   - Document how to revert code, database, feature flags, DNS, and external-service config.
   - For risky database migrations, include backup and restore steps.

5. **Add observability**
   - Configure logs, error tracking, uptime checks, basic metrics, and alerts for user-impacting failures.
   - Define golden signals: latency, traffic, errors, saturation, and business-critical conversion events.

6. **Prepare launch**
   - Verify domain, SSL, redirects, sitemap, robots, analytics, email deliverability, backups, legal pages, and support/contact paths.
   - Create a launch-day checklist and incident runbook.

7. **Operate**
   - Review errors and conversion data after launch.
   - Schedule dependency/security updates and backup verification.
   - Record known risks and follow-up work.

## Rules

- Rollback is part of the release, not an afterthought.
- Do not commit secrets or production credentials.
- Keep deployment steps executable by a tired solo developer.
- Prefer managed backups and platform logs when they are reliable and easy to restore.
- Treat migrations, payments, auth, email, and DNS as launch-risk areas.
- Do not claim production readiness without evidence from the actual deployment path.

## Launch Checklist

```markdown
# Launch Checklist

## Build and CI
- [ ] Install command works
- [ ] Tests/typecheck/lint/build pass
- [ ] Runtime version pinned
- [ ] Required env vars documented

## Deployment
- [ ] Hosting configured
- [ ] Production env vars set
- [ ] Database migrations planned
- [ ] Preview/staging verified
- [ ] Rollback steps documented

## Production Readiness
- [ ] Domain and SSL
- [ ] Redirects/canonical URLs
- [ ] Error tracking
- [ ] Uptime check
- [ ] Logs accessible
- [ ] Backups configured and restore path known
- [ ] Analytics/conversion events
- [ ] Legal/support/contact pages

## Launch Day
- [ ] Deploy window
- [ ] Smoke test flow
- [ ] Monitoring watch
- [ ] Rollback owner/action
- [ ] Post-launch review time
```

## Runbook Template

```markdown
# Runbook: [Service/Site]

## Symptoms
[What users or alerts show]

## First Checks
1. [Command/dashboard]
2. [Command/dashboard]

## Mitigation
1. [Rollback/flag/scale/retry]

## Recovery
1. [Permanent fix or data repair]

## Escalation
[Who/what service/docs]
```

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for web launch and operations.
