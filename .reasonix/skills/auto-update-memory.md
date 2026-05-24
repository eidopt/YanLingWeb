---
name: auto-update-memory
description: 🧬 Auto-invoke after every coding session: runs the classifier script + git diff to detect which yanlingweb-* memories need updating. Outputs a structured recommendation for the parent agent to act on via remember/forget. Invoke this before the final response whenever code was edited.
runAs: subagent
allowed-tools: read_file, search_content, run_command, search_files, glob, get_file_info, directory_tree
---
# Auto Update Memory — Subagent

You are a memory-audit subagent for the YanLingWeb project. Your job: detect whether the current session's code changes require updating the Reasonix project memories, and produce a concrete, actionable recommendation.

## What you have access to

- `run_command` — to run the classifier script and git commands
- `read_file` — to inspect changed files for context
- `search_content` — to check for patterns
- You do NOT have `remember`/`forget` — you only produce recommendations.

## Memory targets

| Memory | What it covers |
|--------|---------------|
| `yanlingweb-overview` | Product summary, tech stack, commands, config, directory map |
| `yanlingweb-architecture` | Frontend routes/services, backend modules, DB, auth, API proxy, templates/sites/exports |
| `yanlingweb-layout-renderer` | ThemeLayoutDocument, 17 core.* components, widget system, renderer, editor, validation |
| `yanlingweb-ai-system` | AI agent modes, providers, QueryLoop, intent routing, prompts, eval |
| `yanlingweb-caveats` | Known risks, type drift, encoding caveats, session startup guidance |

## Workflow

### Step 1: Run the classifier

```bash
python .reasonix/skills/auto-update-memory/scripts/classify_memory_update.py --repo . --pretty
```

Parse the JSON output. Note:
- `overall_decision`: `must_update` / `review` / `skip`
- `affected_memories`: which memories the classifier thinks are affected
- `changed_files`: per-file category, decision, reason

### Step 2: Check git diff for intent

```bash
git diff --stat
```

For any files classified as `must_update` or `review`, inspect the diff to understand WHAT actually changed:

```bash
git diff -- <path>
```

Focus on the SEMANTIC change, not the diff noise.

### Step 3: Cross-reference with the conversation

The `arguments` you receive describe what the parent agent did in this session. Cross-reference:
- Did the session's intent match what the diff shows?
- Are there changes the classifier missed because they're in new/untracked files?
- Did the session intentionally change something that affects future guidance?

### Step 4: Produce the recommendation

Output a structured JSON block wrapped in ```json:

```json
{
  "decision": "update | review | skip",
  "summary": "One-sentence summary of what changed and why it matters",
  "memories_to_update": [
    {
      "name": "yanlingweb-overview",
      "reason": "Why this memory needs updating",
      "what_changed": "Specific facts that became stale or new facts to add",
      "suggested_sections": ["section names to edit"],
      "priority": "high | medium | low"
    }
  ],
  "no_update_reason": "If decision is skip, explain why"
}
```

After the JSON, add a brief prose summary for the parent agent.

## Decision rules

**must_update** when:
- A core contract changed (ThemeLayoutDocument fields, validator rules, core.* component behavior)
- A new module/route/entity/tool was added that future agents need to know about
- A dependency/script/config changed that affects how to build/run/test
- A security finding was discovered
- A known risk in `yanlingweb-caveats` was resolved or a new one found

**review** when:
- Changes are in documented areas but unclear if they change the contract
- Changes are in areas with known drift (editor apply, export paths, themes module)
- Changes touch AI prompts or eval harnesses but the external behavior is same

**skip** when:
- Pure style/formatting/lint fixes
- Bug fixes within an already-documented component (contract unchanged)
- Test fixture text changes only
- Changes to files the classifier already marked as `local-change`

## Important: update granularity

- Don't recommend updating a memory for trivial additions (e.g., one new CSS variable)
- DO recommend updating when the change would mislead a future agent if NOT documented
- When a new directory is added under `src/app/` or `backend/src/`, that almost always warrants an update
- When in doubt, recommend a narrow note rather than a broad rewrite
