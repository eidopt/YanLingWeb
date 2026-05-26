---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing — before committing, creating PRs, or expressing satisfaction. Run verification first, then claim.
---
# Verification Before Completion

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

## The Gate Function

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, exit code, failure count
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying.
```

## What Each Claim Requires

| Claim | Requires |
|-------|----------|
| "Tests pass" | Test command output: 0 failures |
| "Linter clean" | Linter output: 0 errors |
| "Build succeeds" | Build command: exit 0 |
| "Bug fixed" | Test original symptom: passes |
| "Requirements met" | Line-by-line checklist against plan |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Relying on "I'm confident" (confidence ≠ evidence)
- Partial verification ("linter passed" ≠ compiler passed)

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |

## Apply BEFORE

- ANY variation of success/completion claims
- ANY expression of satisfaction
- Committing, PR creation, task completion
- Moving to next task

Run the command. Read the output. THEN claim the result.
