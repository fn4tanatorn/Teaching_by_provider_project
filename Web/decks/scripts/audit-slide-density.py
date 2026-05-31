#!/usr/bin/env python3
"""Flag deck sections likely to overflow (scroll) on split slides with images."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

MAX_W_IMAGE = 3
MAX_LIST_IMG = 4
MAX_GROUP_IMG = 5
MAX_TABLE_ROWS_IMG = 5


def block_weight(block: dict) -> float:
    t = block.get("type")
    if t == "list" or t == "ordered":
        return 1.2 + len(block.get("items") or []) * 0.45
    if t == "group":
        return 1.4 + len(block.get("items") or []) * 0.45
    if t == "text":
        c = block.get("content") or ""
        if "```" in c:
            return 3.2
        if len(c) > 140:
            return 2.6
        return 1.3
    if t == "table":
        return 2 + len(block.get("rows") or []) * 0.45
    if t == "example":
        return 2
    if t == "subheading":
        return 1.2
    return 1


def section_risk(sec: dict) -> list[str]:
    notes = []
    has_img = bool(sec.get("image"))
    blocks = sec.get("blocks") or []
    if not blocks:
        return notes

    total_w = sum(block_weight(b) for b in blocks)
    if has_img and total_w > MAX_W_IMAGE * 2:
        notes.append(f"heavy section (weight≈{total_w:.1f})")

    for bi, block in enumerate(blocks):
        t = block.get("type")
        if t == "list" and has_img and len(block.get("items") or []) > MAX_LIST_IMG:
            notes.append(f"list[{bi}] {len(block['items'])} items")
        if t == "group" and has_img and len(block.get("items") or []) > MAX_GROUP_IMG:
            notes.append(f"group[{bi}] {len(block['items'])} items “{block.get('label', '')[:40]}”")
        if t == "table" and has_img and len(block.get("rows") or []) > MAX_TABLE_ROWS_IMG:
            notes.append(f"table[{bi}] {len(block['rows'])} rows")

    if re.search(r"rapid\s+review", sec.get("title", ""), re.I) and has_img:
        has_table = any(b.get("type") == "table" for b in blocks)
        if has_table:
            notes.append("rapid review + table + summary image (now auto-split)")

    return notes


def main() -> int:
    flagged = []
    for path in sorted(DATA.glob("ch*.json")):
        if path.name.startswith("katzung"):
            continue
        deck = json.loads(path.read_text(encoding="utf-8"))
        did = deck.get("id", path.stem)
        for sec in deck.get("sections", []):
            notes = section_risk(sec)
            if notes:
                flagged.append(
                    (did, sec.get("number"), sec.get("title", "")[:36], notes)
                )

    if not flagged:
        print("✓ No high-density sections detected (static scan).")
        return 0

    print(f"Sections to spot-check ({len(flagged)}):\n")
    for did, num, title, notes in flagged:
        print(f"  {did} §{num} {title}")
        for n in notes:
            print(f"      · {n}")
    print(
        "\nRun in browser after hard refresh — renderer now splits long lists/groups/tables."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
