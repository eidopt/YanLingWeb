---
name: code-review
description: Use when tasks are complete and you need review before proceeding — dispatch a reviewer subagent (requesting) OR when receiving review feedback from a human (receiving). Two sides of code review.
---
# Code Review

Two sides of code review: requesting review before merging, and receiving/handling review feedback from others.

**Core principle:** Review early, review often. Verify before implementing feedback.

---

## Part 1: Requesting Code Review

Dispatch a reviewer subagent to catch issues before they cascade.

### When to Request

- After each task in subagent-driven development
- After completing a major feature
- Before merge to main

### How to Request

Dispatch a subagent with:
1. **Description** — brief summary of what was built
2. **Requirements** — what it should do (plan task text or spec)
3. **Git range** — base SHA and head SHA (`git diff`)

### What the Reviewer Checks

- **Plan alignment** — matches requirements? Missing features?
- **Code quality** — separation of concerns, error handling, type safety, edge cases
- **Architecture** — sound design, scalability, security, integration
- **Testing** — real behavior (not mocks), edge cases, coverage
- **Production readiness** — backward compatibility, documentation

### Output Format

```
### Strengths
[What's well done?]

### Issues
#### Critical (Must Fix)
[Bugs, security issues, broken functionality]
#### Important (Should Fix)
[Architecture problems, missing features, test gaps]
#### Minor (Nice to Have)
[Style, optimization, polish]

### Assessment
**Ready to merge?** Yes | No | With fixes
```

### Acting on Feedback

- Fix Critical and Important issues immediately
- Minor issues can be noted for later
- Push back with technical reasoning if reviewer is wrong
- Show code/tests that prove it works

---

## Part 2: Receiving Code Review

When receiving review feedback from a human, evaluate technically before implementing.

### Response Pattern

```
1. READ complete feedback without reacting
2. UNDERSTAND — restate requirement in your own words (or ask)
3. VERIFY — check against codebase reality
4. EVALUATE — is it technically sound for THIS codebase?
5. RESPOND — technical acknowledgment or reasoned pushback
6. IMPLEMENT — one item at a time, test each
```

### Forbidden Responses

- "You're absolutely right!" / "Great point!" (performative agreement)
- "Let me implement that now" (before verification)

Instead: restate the technical requirement, ask clarifying questions, or push back with reasoning.

### Source-Specific Handling

**From your human partner (trusted):**
- Implement after understanding — still ask if scope is unclear
- No performative agreement — skip to action or technical acknowledgment

**From external reviewers:**
- Check: technically correct for this codebase? Breaks existing functionality?
- If suggestion seems wrong: push back with technical reasoning
- If conflicts with prior decisions: stop and discuss with human

### YAGNI Check

If reviewer says "implement properly" → grep for actual usage. If unused, suggest removal instead.

### Implementation Order

1. Clarify anything unclear FIRST
2. Then implement: blocking issues → simple fixes → complex fixes
3. Test each fix individually
4. Verify no regressions

### When to Push Back

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Conflicts with architectural decisions

Push back with technical reasoning, not defensiveness.

## Red Flags

- Skipping review because "it's simple"
- Ignoring Critical issues
- Proceeding with unfixed Important issues
- Performative agreement instead of technical evaluation
- Partial implementation of unclear feedback (clarify ALL items first)
