---
name: parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies — dispatch multiple subagents concurrently.
---
# Dispatching Parallel Agents

Delegate independent tasks to specialized subagents with isolated context, running concurrently.

**Core principle:** One subagent per independent problem domain. Let them work concurrently.

## When to Use

**Use when:**
- 2+ independent test failures with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**
- Failures are related (fixing one might fix others)
- Agents would interfere with each other (editing same files)
- You need to understand the full system state first

## The Pattern

### 1. Identify Independent Domains

Group failures/problems by what's broken. Each domain is independent.

### 2. Create Focused Agent Prompts

Each subagent gets:
- **Specific scope** — one test file, one subsystem, one problem
- **Clear goal** — "Make these tests pass" or "Investigate X"
- **Constraints** — "Don't change production code" or "Fix tests only"
- **Expected output** — summary of findings and changes

### 3. Dispatch Concurrently

Use `run_skill` with `[🧬 subagent]` skills in parallel (the subagent mechanism means they run independently). Dispatch all at once.

### 4. Review and Integrate

When subagents return:
- Read each summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

## Common Mistakes

- **Too broad:** "Fix all the tests" → agent gets lost. Scope to one file.
- **No context:** Missing error messages or test names → agent doesn't know where.
- **No constraints:** Agent might refactor everything → constrain scope.
- **Vague output:** "Fix it" → you don't know what changed. Request a summary.

## Verification

After subagents return:
1. Review each summary — understand what changed
2. Check for conflicts — did agents edit the same code?
3. Run full suite — verify all fixes work together
4. Spot check — subagents can make systematic errors
