---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior — BEFORE proposing fixes. Root cause investigation first. Symptom fixes are failure.
---
# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

1. **Read Error Messages Carefully** — full stack traces, line numbers, error codes
2. **Reproduce Consistently** — reliable trigger? exact steps? every time?
3. **Check Recent Changes** — git diff, recent commits, new dependencies
4. **Trace Data Flow** — where does the bad value originate? Trace backward through the call chain until you find the source.
5. **Gather Evidence** — add diagnostic logging at component boundaries. Run once to see WHERE it breaks, THEN analyze.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — similar working code in the same codebase
2. **Compare** — what's different between working and broken? List every difference.
3. **Understand Dependencies** — what other components, config, environment does this need?

### Phase 3: Hypothesis & Testing

1. **Form single hypothesis** — "I think X is the root cause because Y"
2. **Test minimally** — smallest change to test hypothesis. One variable at a time.
3. **Verify** — did it work? Yes → Phase 4. No → new hypothesis.

### Phase 4: Implementation

1. **Create failing test case** — simplest possible reproduction
2. **Implement single fix** — address the root cause. ONE change at a time.
3. **Verify fix** — test passes? No regressions?
4. **If fix doesn't work** — count attempts. < 3 → return to Phase 1. ≥ 3 → question the architecture.

## The 3+ Fix Rule

After 3 failed fix attempts, STOP and question fundamentals:
- Is this pattern fundamentally sound?
- Should we refactor architecture instead of continuing to fix symptoms?
- Discuss with your human partner before attempting more fixes.

This is NOT a failed hypothesis — this is a wrong architecture.

## Red Flags

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Skip the test, I'll manually verify"
- "One more fix attempt" (when already tried 2+)
- Each fix reveals a new problem in a different place

All of these mean: STOP. Return to Phase 1.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| 1. Root Cause | Read errors, reproduce, trace data flow | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare | Identify differences |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Create test, fix, verify | Bug resolved, tests pass |
