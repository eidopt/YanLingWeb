---
name: finishing-development
description: Use when implementation tasks are complete, all tests pass, and you need to decide how to integrate the work — merge, PR, keep, or discard.
---
# Finishing Development

Guide the completion of development work by verifying tests and presenting clear integration options.

**Core principle:** Verify tests → Present options → Execute choice.

**Announce:** "I'm using the finishing-development skill to complete this work."

## Step 1: Verify Tests

Run the project's test suite. If tests fail, stop and fix before proceeding.

## Step 2: Present Options

```
Implementation complete. All tests passing.

1. Merge back to main/master locally
2. Push and create a Pull Request
3. Keep the branch as-is (handle later)
4. Discard this work
```

For detached HEAD (externally managed workspace), omit option 1.

## Step 3: Execute Choice

### Option 1: Merge Locally
- Checkout base branch, pull, merge feature branch
- Verify tests on merged result
- Delete feature branch

### Option 2: Push and Create PR
- Push branch to origin
- Create PR with summary and test plan
- Do NOT clean up — the branch is needed for PR feedback iteration

### Option 3: Keep As-Is
- Report branch name and path
- No cleanup

### Option 4: Discard
- **Require typed confirmation:** "Type 'discard' to confirm."
- Only proceed on exact match
- Force-delete branch

## Quick Reference

| Option | Merge | Push | Keep Worktree | Delete Branch |
|--------|-------|------|---------------|---------------|
| 1. Merge locally | ✅ | — | — | ✅ |
| 2. Create PR | — | ✅ | ✅ | — |
| 3. Keep as-is | — | — | ✅ | — |
| 4. Discard | — | — | — | ✅ (force) |

## Red Flags

- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Push/force-push without explicit request
- Clean up worktrees you didn't create
