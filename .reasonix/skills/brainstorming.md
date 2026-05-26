---
name: brainstorming
description: Use BEFORE any creative/implementation work — features, refactors, new components. Explores user intent, requirements, and design before code is written. HARD-GATE against implementation without approved design.
---
# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs through collaborative dialogue.

**Core principle:** Explore before build. Design before code.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, or take any implementation action until you have presented a design AND the user has approved it. This applies to EVERY task regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

"Simple" projects are where unexamined assumptions waste the most work. The design can be short, but you MUST present it and get approval.

## Process

1. **Explore context** — check current project files, docs, recent changes
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria. Prefer multiple-choice.
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design** — sections scaled to complexity, get user approval per section
5. **Transition** — once design is approved, invoke `writing-plans` to create an implementation plan

## Key Principles

- **One question at a time** — don't overwhelm
- **YAGNI ruthlessly** — remove unnecessary features
- **Explore alternatives** — always propose 2-3 approaches
- **Incremental validation** — present design section by section
- **Never start implementation** without an approved design

## Red Flags

- "This is too simple" → use the process anyway
- "Let me just check one thing first" → check skills before gathering info
- Proposing code changes during brainstorming → STOP, HARD-GATE
