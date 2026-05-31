#!/usr/bin/env python3
"""Scan deck JSON for common conversion/render issues."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def audit_deck(path: Path) -> list[tuple[str, str, str]]:
    deck = json.loads(path.read_text(encoding="utf-8"))
    deck_id = deck.get("id", path.stem)
    issues: list[tuple[str, str, str]] = []

    nums = [s.get("number") for s in deck.get("sections", [])]
    for n in sorted(set(nums)):
        if nums.count(n) > 1:
            issues.append((deck_id, "sections", f"duplicate section number {n}"))

    for sec in deck.get("sections", []):
        sid = sec["id"]
        for bi, block in enumerate(sec.get("blocks", [])):
            bt = block.get("type")
            if bt == "text":
                c = block.get("content", "")
                if c.count("|") >= 4 and len(c) > 60:
                    pipes = len(re.findall(r"\|[^|]+\|[^|]+\|", c))
                    if pipes >= 2 or re.search(r"\|[-:]{2,}", c):
                        issues.append((deck_id, sid, f"block#{bi} table-like text"))
            if bt == "group" and not block.get("items"):
                issues.append((deck_id, sid, f"block#{bi} empty group: {block.get('label', '')[:50]}"))
            if bt == "text" and "See notes for details" in c:
                issues.append((deck_id, sid, f"block#{bi} placeholder text"))

    return issues


def main():
    all_issues: list[tuple[str, str, str]] = []
    for path in sorted(DATA.glob("ch*.json")):
        all_issues.extend(audit_deck(path))

    if not all_issues:
        print("All decks OK — no issues found.")
        return 0

    print(f"Found {len(all_issues)} issue(s):\n")
    for deck_id, loc, msg in all_issues:
        print(f"  [{deck_id}] {loc}: {msg}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
