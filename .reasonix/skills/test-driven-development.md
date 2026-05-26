---
name: test-driven-development
description: Use when implementing any feature or bugfix, BEFORE writing implementation code. Write the test first, watch it fail, write minimal code to pass, refactor.
---
# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass. Refactor.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen.

Good test qualities:
- Tests ONE behavior (if name has "and", split it)
- Clear name describing behavior
- Uses real code (mocks only if unavoidable)

### Verify RED — Watch It Fail

**MANDATORY.** Run the test. Confirm:
- Test fails (not errors)
- Fails because feature is missing (not typos)

### GREEN — Minimal Code

Write the simplest code to pass the test. Don't add features, refactor other code, or "improve" beyond what the test requires.

### Verify GREEN — Watch It Pass

**MANDATORY.** Run the test. Confirm:
- Test passes
- Other tests still pass

### REFACTOR — Clean Up

Only after green: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat

Next failing test for the next behavior.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Already manually tested" | No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code = technical debt. |
| "TDD is dogmatic" | TDD is pragmatic. Finds bugs before commit, prevents regressions. |

## Red Flags

- Code written before test
- Test passes immediately on first run
- Can't explain why test failed
- "Keep as reference" when rewriting

All of these mean: delete code, start over with TDD.

## Verification Checklist

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass
- [ ] Edge cases and errors covered
