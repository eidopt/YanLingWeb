---
name: indie-web-quality-auditor
description: Quality auditing for websites and web apps. Use when Codex needs to test or review accessibility, responsive UI, visual evidence, API behavior, integration flows, performance, Core Web Vitals, release readiness, regression risk, test results, or production confidence before shipping a web project.
---

# Indie Web Quality Auditor

## Overview

Use this skill to verify that a website or web app actually works. Favor evidence over optimistic summaries: commands, screenshots, logs, API responses, accessibility checks, and exact reproduction steps.

This skill adapts and merges the Agency roles Accessibility Auditor, Evidence Collector, Reality Checker, API Tester, Performance Benchmarker, Test Results Analyzer, Code Reviewer, and Security Engineer.

## Workflow

1. **Establish the runnable state**
   - Identify dev/build/test commands, required env vars, seed data, test accounts, and local URLs.
   - If the app cannot run, report the blocker and what was verified statically.

2. **Run automated checks**
   - Run the narrowest relevant tests first, then broader lint/typecheck/build/test suites when feasible.
   - Capture failures with the exact command and key output.

3. **Collect visual evidence**
   - Inspect desktop and mobile viewports for the primary flow.
   - Check layout overlap, text overflow, broken assets, loading states, empty states, error states, and console errors.

4. **Audit accessibility**
   - Test keyboard navigation, focus visibility, labels, headings, landmarks, color contrast, reduced motion, and screen reader-critical semantics.
   - Automated accessibility tools are useful but insufficient; include manual checks.

5. **Validate API and data flows**
   - Test success, validation failure, unauthorized, forbidden, not found, conflict, and retry/idempotency cases where relevant.
   - Confirm frontend states match backend errors.

6. **Check performance**
   - Look for obvious bundle, image, layout shift, N+1, slow query, and blocking-call issues.
   - For production claims, require Lighthouse/WebPageTest/field data or local profiling evidence.

7. **Make a release decision**
   - Use PASS only when evidence supports it.
   - Use NEEDS WORK when critical evidence is missing.
   - Separate blockers from follow-ups.

## Severity Scale

- **Critical**: Blocks core task, data loss, security issue, payment/auth failure, inaccessible core path.
- **Serious**: Major user impact with workaround, broken mobile primary flow, unreliable API, severe performance issue.
- **Moderate**: Noticeable friction, incomplete edge state, content/SEO issue, limited accessibility problem.
- **Minor**: Polish or maintainability issue that does not block release.

## Audit Report Template

```markdown
# Web Quality Audit

## Scope
Product/page/flow:
Environment:
Commands run:
Browsers/viewports:

## Decision
PASS / NEEDS WORK / BLOCKED

## Evidence
- Build/tests:
- Screenshots/manual flows:
- API checks:
- Accessibility:
- Performance:

## Findings
### [Severity] [Title]
Location:
Evidence:
Impact:
Recommended fix:
Verification:

## Release Gate
- Critical issues:
- Serious issues:
- Missing evidence:
- Required next steps:
```

## Default Checks

- Primary journey works from entry to success state.
- No new console errors on primary screens.
- Mobile layout is usable without horizontal scroll.
- All interactive controls are keyboard reachable and visibly focused.
- Forms have labels, validation, error recovery, and success states.
- Protected data cannot be accessed across users/tenants.
- Builds/tests relevant to the change pass.
- Rollback or mitigation exists for risky release changes.

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for web QA and release readiness.
