#!/usr/bin/env python3
"""Report text-quality issues in deck JSON (truncated phrases, tables in text, etc.)."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# Word endings that suggest a line-wrap split (not normal medical terms ending in "receptor", etc.)
TRUNC_ENDINGS = (
    " biologic",
    " gene",
    " the",
    " and",
    " or",
    " to",
    " of",
    " in",
    " a",
    " an",
    " with",
    " from",
    " by",
    " for",
)


def collect_strings(deck: dict, out: list[tuple[str, str]]):
    did = deck.get("id", "?")

    def walk(obj, path: str):
        if isinstance(obj, str):
            out.append((did, path, obj))
        elif isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}[{i}]")

    walk(deck, "")


def main() -> int:
    issues: list[str] = []

    for path in sorted(DATA.glob("ch*.json")):
        deck = json.loads(path.read_text(encoding="utf-8"))
        did = deck.get("id", path.stem)

        for sec in deck.get("sections", []):
            for bi, block in enumerate(sec.get("blocks", [])):
                loc = f"{did} §{sec.get('number')} {sec.get('title', '')[:28]}"

                if block.get("type") == "group" and not block.get("items"):
                    issues.append(f"{loc}: empty group “{block.get('label', '')[:50]}”")

                if block.get("type") == "text":
                    c = block.get("content", "")
                    if "|" in c and c.count("|") >= 4:
                        issues.append(f"{loc}: table text not parsed ({c[:60]}…)")
                    if "See notes for details" in c:
                        issues.append(f"{loc}: placeholder text")

                for item in block.get("items") or []:
                    t = item.strip()
                    if t.rstrip().endswith(", or"):
                        continue
                    if any(t.endswith(end) for end in TRUNC_ENDINGS) and len(t) > 25:
                        issues.append(f"{loc}: possible truncated bullet “…{t[-45:]}”")
                    if re.match(r"^[a-z]{1,4},", t):
                        issues.append(f"{loc}: likely split word “{t[:50]}”")

        strings: list[tuple[str, str, str]] = []
        collect_strings(deck, strings)
        for _, path_s, text in strings:
            if re.search(r"\|[-:]{3,}\|", text.replace(" ", "")):
                issues.append(f"{did} {path_s}: raw markdown table in text")

    if not issues:
        print("✓ Proofread OK — no text issues detected across decks.")
        return 0

    print(f"Found {len(issues)} issue(s):\n")
    for line in issues:
        print(f"  • {line}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
