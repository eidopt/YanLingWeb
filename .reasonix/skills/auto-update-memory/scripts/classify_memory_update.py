#!/usr/bin/env python3
"""Classify repository changes for YanLingWeb Reasonix memory updates.

Adapted from .codex/skills/auto-update-memory/scripts/classify_memory_update.py
for the Reasonix memory system.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Rule:
    prefix: str
    category: str
    decision: str
    reason: str


ROOT_FILES = {
    "package.json": ("stack-config", "must_update", "root dependencies or scripts changed"),
    "pnpm-workspace.yaml": ("stack-config", "must_update", "workspace package layout changed"),
    "next.config.ts": ("stack-config", "must_update", "Next configuration changed"),
    "tsconfig.json": ("stack-config", "must_update", "TypeScript configuration changed"),
    "eslint.config.mjs": ("stack-config", "review", "lint policy changed"),
    "CLAUDE.md": ("knowledge-base", "review", "project knowledge base changed"),
}

PREFIX_RULES = [
    Rule(".reasonix/skills/", "agent-knowledge", "must_update", "Reasonix skill behavior changed"),
    Rule(".codex/skills/", "agent-knowledge", "review", "Codex skill behavior changed (consider syncing)"),
    Rule(".claude/skills/", "agent-knowledge", "review", "Claude-side automation changed"),
    Rule("src/app/", "frontend-routes", "must_update", "App Router or Next API surface changed"),
    Rule("src/ai/", "ai-system", "must_update", "frontend AI behavior changed"),
    Rule("backend/src/ai/", "ai-system", "must_update", "backend AI behavior changed"),
    Rule("shared/agent/prompts/", "ai-system", "must_update", "shared AI prompts changed"),
    Rule("shared/agent/validation/", "layout-contract", "must_update", "layout validation contract changed"),
    Rule("shared/agent/types.ts", "layout-contract", "must_update", "shared layout/agent types changed"),
    Rule("src/ui/layout/", "layout-contract", "must_update", "frontend layout types changed"),
    Rule("src/ui/renderer/", "renderer", "must_update", "runtime renderer behavior changed"),
    Rule("src/ui/editor/", "editor", "review", "visual editor behavior changed"),
    Rule("backend/src/", "backend", "must_update", "backend API or persistence behavior changed"),
    Rule("src/exporters/", "export", "must_update", "source export compiler changed"),
    Rule("src/services/ExportService.ts", "export", "must_update", "export service contract changed"),
    Rule("electron/", "desktop-export", "must_update", "Electron runtime or export behavior changed"),
    Rule("scripts/agent-eval/", "agent-eval", "review", "agent evaluation harness changed"),
    Rule("docs/", "docs", "review", "project documentation changed"),
]

# Map classifier categories to Reasonix memory names
CATEGORY_TO_MEMORY = {
    "stack-config": ["yanlingweb-overview"],
    "frontend-routes": ["yanlingweb-architecture"],
    "ai-system": ["yanlingweb-ai-system"],
    "layout-contract": ["yanlingweb-layout-renderer"],
    "renderer": ["yanlingweb-layout-renderer"],
    "editor": ["yanlingweb-layout-renderer"],
    "backend": ["yanlingweb-architecture"],
    "export": ["yanlingweb-architecture", "yanlingweb-layout-renderer"],
    "desktop-export": ["yanlingweb-architecture"],
    "agent-eval": ["yanlingweb-ai-system"],
    "agent-knowledge": ["yanlingweb-caveats"],
    "knowledge-base": ["yanlingweb-overview"],
    "docs": ["yanlingweb-overview"],
    "claude-knowledge": ["yanlingweb-caveats"],
}


def run_git(repo: Path, args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed.stdout


def changed_files(repo: Path) -> list[str]:
    files: set[str] = set()

    status = run_git(repo, ["status", "--porcelain=v1", "-uno"])
    for line in status.splitlines():
        path = line[3:].strip()
        if " -> " in path:
            old_path, new_path = path.split(" -> ", 1)
            files.add(old_path.replace("\\", "/"))
            files.add(new_path.replace("\\", "/"))
        elif path:
            files.add(path.replace("\\", "/"))

    untracked = run_git(repo, ["ls-files", "--others", "--exclude-standard"])
    for line in untracked.splitlines():
        path = line.strip()
        if path:
            files.add(path.replace("\\", "/"))

    return sorted(files)


def classify(path: str) -> dict[str, str]:
    normalized = path.replace("\\", "/")
    if normalized in ROOT_FILES:
        category, decision, reason = ROOT_FILES[normalized]
        memories = CATEGORY_TO_MEMORY.get(category, [])
        return {
            "path": normalized,
            "category": category,
            "decision": decision,
            "reason": reason,
            "affected_memories": memories,
        }

    for rule in PREFIX_RULES:
        if normalized == rule.prefix.rstrip("/") or normalized.startswith(rule.prefix):
            memories = CATEGORY_TO_MEMORY.get(rule.category, [])
            return {
                "path": normalized,
                "category": rule.category,
                "decision": rule.decision,
                "reason": rule.reason,
                "affected_memories": memories,
            }

    if normalized.endswith((".config.ts", ".config.js", ".config.mjs")):
        return {
            "path": normalized,
            "category": "stack-config",
            "decision": "review",
            "reason": "configuration file changed",
            "affected_memories": ["yanlingweb-overview"],
        }

    return {
        "path": normalized,
        "category": "local-change",
        "decision": "skip",
        "reason": "path does not usually affect durable memory guidance",
        "affected_memories": [],
    }


def strongest(decisions: list[str]) -> str:
    if "must_update" in decisions:
        return "must_update"
    if "review" in decisions:
        return "review"
    return "skip"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".", help="Repository root")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    files = changed_files(repo)
    classifications = [classify(path) for path in files]

    # Collect all unique affected memories
    all_memories: set[str] = set()
    for item in classifications:
        for m in item.get("affected_memories", []):
            all_memories.add(m)

    result = {
        "repo": str(repo),
        "overall_decision": strongest([item["decision"] for item in classifications]),
        "affected_memories": sorted(all_memories),
        "memory_store": "Reasonix project memories (yanlingweb-*)",
        "action_hint": (
            "Use 'recall_memory' to read, 'forget' + 'remember' to update."
            if all_memories
            else "No memory update needed."
        ),
        "changed_files": classifications,
    }
    print(json.dumps(result, indent=2 if args.pretty else None, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
