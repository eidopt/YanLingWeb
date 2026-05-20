---
name: indie-web-product-planner
description: Product discovery and planning for independent web developers. Use when Codex needs to turn a website, SaaS, web app, landing page, or CMS idea into a buildable MVP scope, PRD, roadmap, user stories, acceptance criteria, prioritized backlog, or sprint plan before implementation.
---

# Indie Web Product Planner

## Overview

Use this skill to convert fuzzy web product intent into a small, testable, buildable plan. Optimize for a solo or very small team: clear scope, explicit non-goals, short feedback loops, and tasks that can be implemented without hidden coordination.

This skill adapts and merges the Agency roles Product Manager, Sprint Prioritizer, Trend Researcher, Feedback Synthesizer, UX Researcher, and Senior Project Manager.

## Intake

Collect only what is needed to make scope decisions:

- Product or site concept, target user, and primary job-to-be-done
- Business goal: leads, paid conversion, self-serve signup, content reach, retention, internal efficiency, or validation
- Deadline, budget, solo/team capacity, preferred stack, deployment target, and must-keep constraints
- Existing evidence: users interviewed, analytics, competitors, support tickets, sales notes, screenshots, current repo state
- Definition of launch: public URL, usable prototype, beta, migration, redesign, internal demo, or production release

When key information is missing, make a conservative assumption and label it. Ask only when the missing answer could materially change architecture, legal risk, timeline, or data handling.

## Workflow

1. **Frame the problem**
   - State the user, pain, current workaround, and desired outcome in one paragraph.
   - Separate confirmed evidence from assumptions.
   - Identify the single riskiest assumption to validate first.

2. **Define the smallest useful release**
   - Choose one primary user journey.
   - List table-stakes features, differentiators, and explicit non-goals.
   - Cut admin panels, dashboards, automations, integrations, and analytics until they are required by the launch definition.

3. **Prioritize**
   - Use RICE or value/effort scoring when there are many ideas.
   - Prefer tasks that reduce market, usability, or technical uncertainty.
   - Create Now / Next / Later buckets instead of a long undifferentiated backlog.

4. **Write implementation-ready tasks**
   - Each task must include user value, exact deliverable, files or modules likely involved if known, acceptance criteria, and verification.
   - Keep tasks small enough for one focused coding pass.
   - Mark dependencies and parallelizable work.

5. **Plan validation**
   - Define success metrics that can be measured within the release horizon.
   - Include qualitative validation when analytics volume will be low.
   - Add a kill, pivot, or continue decision rule for experiments.

## Decision Rules

- Prefer a working narrow path over a broad partial platform.
- Scope features around user journeys, not internal components.
- Preserve the developer's time: every task should earn its place.
- Treat "nice polish" as launch-blocking only when it affects trust, accessibility, conversion, or core comprehension.
- For existing projects, align tasks to the current architecture and avoid rewriting unless the rewrite is the requested product.

## Deliverables

Use these formats as needed.

```markdown
# MVP Brief

## One-Line Product
[What this web product/site does, for whom, and why now]

## Primary User Journey
1. [Entry point]
2. [Main action]
3. [Success state]

## Goals
- [Outcome metric]
- [User behavior metric]
- [Quality metric]

## Non-Goals
- [Explicit cut]
- [Explicit cut]

## Assumptions To Validate
| Assumption | Why It Matters | Validation Method | Decision Rule |
| --- | --- | --- | --- |
| [Assumption] | [Risk] | [Test] | [Continue/pivot/cut] |
```

```markdown
# Build Backlog

## Now
### Task: [Name]
User value: [Why this matters]
Deliverable: [Concrete output]
Acceptance criteria:
- [Observable behavior]
- [Edge case]
Verification: [Command, test, screenshot, manual flow]

## Next
- [Deferred but likely]

## Later
- [Not needed for first release]
```

## Quality Gate

Before handing off to design or engineering, verify:

- The primary user journey is clear.
- Non-goals are explicit.
- Tasks include acceptance criteria and verification.
- Risks are ranked.
- The plan is plausible for an independent developer's available time.

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for web product planning and independent developer execution.
