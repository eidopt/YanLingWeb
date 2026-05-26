---
name: writing-plans
description: Use when you have an approved design/spec and need a multi-step implementation plan — creates bite-sized TDD tasks with exact file paths, code, and test commands.
---
# Writing Implementation Plans

Write comprehensive implementation plans with bite-sized TDD tasks. Each task is 2-5 minutes: write failing test → run → implement → run → commit.

**Core principle:** Each step is one action you can verify independently.

**Announce:** "I'm using the writing-plans skill to create the implementation plan."

## Scope Check

If the design covers multiple independent subsystems, flag this and suggest separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Plan Structure

```markdown
# [Feature] Implementation Plan

> **Goal:** One sentence
> **Architecture:** 2-3 sentences on approach
> **Tech Stack:** Key technologies

---
```

### Bite-Sized Task Granularity

Each step is 2-5 minutes:
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code" — step
- "Run the tests to make sure they pass" — step
- "Commit" — step

### Task Template

```markdown
### Task N: [Component Name]

**Files:** `src/path/to/file.ts`, `tests/path/to/test.ts`

- [ ] **Step 1: Write failing test**
  ```typescript
  test('does specific thing', () => {
    // test code
  });
  ```
- [ ] **Step 2: Verify it fails**
  Run: `npm test -- tests/path.test.ts`
- [ ] **Step 3: Write minimal implementation**
  (actual implementation code)
- [ ] **Step 4: Verify it passes**
  Run: `npm test -- tests/path.test.ts`
- [ ] **Step 5: Commit**
  `git add ... && git commit -m "feat: add specific feature"`
```

## No Placeholders

Every step must contain actual content. Never write:
- "TBD", "TODO", "fill in details"
- "Add appropriate error handling" (without specifics)
- "Write tests" (without actual test code)
- "Similar to Task N" (repeat the code)

## Self-Review

After writing, check:
1. **Spec coverage** — does every requirement from the design map to a task?
2. **Placeholder scan** — any TBDs or vague instructions?
3. **Type consistency** — do types/methods referenced in later tasks match earlier ones?

Fix issues inline.

## Execution Handoff

When plan is saved to `docs/plans/<feature>.md`, present two options:

> **Plan complete. Two execution options:**
> 1. **Subagent-Driven (recommended)** — fresh subagent per task + two-stage review
> 2. **Inline Execution** — execute tasks in this session

If Subagent-Driven chosen → use `subagent-driven-development` skill.
If Inline chosen → use `executing-plans` section of that skill.
