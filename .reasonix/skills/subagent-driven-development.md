---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks — dispatches a fresh subagent per task with two-stage review (spec then quality). Fallback to inline execution when subagents unavailable.
---
# Subagent-Driven Development

Execute a plan by dispatching a fresh subagent per task, with two-stage review after each: spec compliance first, then code quality.

**Core principle:** Fresh subagent per task + two-stage review = high quality, fast iteration.

**Continuous execution:** Do NOT pause between tasks. Execute all tasks without stopping for progress checks. The only reasons to stop are: BLOCKED status you cannot resolve, ambiguity preventing progress, or all tasks complete.

## When to Use This vs Inline

| Situation | Use |
|-----------|-----|
| Subagents available | Subagent-Driven Development (this skill) |
| No subagent support, or tightly coupled tasks | Inline Execution (section at bottom) |

## Process

### 1. Prepare

- Read the plan file once
- Extract ALL tasks with full text, file paths, and context
- Cross-reference: each file mentioned in any task gets noted as shared or exclusive
- Create a `todo_write` with all task entries (first marked `in_progress`)

### 2. Per-Task Loop

For EACH task:

**A. Dispatch implementer subagent**

Use `run_skill` with a `[🧬 subagent]` skill. Provide:
- Full task text (don't make the subagent read the plan file)
- Architecture context: where this task fits, what came before
- File paths and expected interfaces
- "Implement exactly what's specified, write tests (TDD), commit"

Wait for the implementer report. Handle status:
- **DONE** → proceed to review
- **DONE_WITH_CONCERNS** → read concerns, address if needed, then review
- **NEEDS_CONTEXT** → provide context, re-dispatch
- **BLOCKED** → assess: more context? bigger model? smaller task? escalate?

**B. Two-Stage Review — Stage 1: Spec Compliance**

Dispatch a reviewer subagent with the task spec and implementer's report. Ask:
- Did they implement everything requested?
- Did they add unrequested features?
- Any misunderstandings?

If issues found → dispatch implementer to fix → re-review.
Only proceed when spec compliance is ✅.

**C. Two-Stage Review — Stage 2: Code Quality**

Dispatch a code quality reviewer subagent. Check:
- Clean separation of concerns
- Proper error handling
- Edge cases covered
- Tests verify real behavior (not mocks)
- No over-engineering

If issues found → fix → re-review.

**D. Mark task complete**

### 3. Final Review & Finish

After all tasks complete:
- Dispatch a final code reviewer for the entire implementation
- Then use the `finishing-development` skill

## Inline Execution (Fallback)

Use when subagents are NOT available or tasks are tightly coupled.

### Process

1. **Load and review plan** — read critically, raise concerns
2. **Execute each task step by step** — follow exactly, run verifications
3. **Complete** — use `finishing-development` skill

### When to Stop

- Blockers (missing dependency, test fails, unclear instruction)
- Critical plan gaps
- Repeated verification failures

## Red Flags

- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Start implementation on main/master branch without consent
- Let implementer self-review replace formal review (both needed)
- Start code quality review before spec compliance is ✅
- Ignore subagent questions — answer before letting them proceed
