#!/usr/bin/env python3
"""Apply OCR-verified image mappings to deck JSON files."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MANIFEST = DATA / "manifest.json"

from chapter_image_maps import CHAPTER_CONFIG  # noqa: E402


def apply_chapter(ch: int) -> int:
    cfg = CHAPTER_CONFIG[ch]
    deck_path = DATA / cfg["deck"]
    deck = json.loads(deck_path.read_text(encoding="utf-8"))
    deck_id = f"ch{ch}"

    intro = cfg.get("intro")
    if intro:
        deck["introImage"], deck["introImageCaption"] = intro

    by_num = cfg.get("by_num", {})
    by_id = cfg.get("by_id", {})
    supplements = cfg.get("supplements", {})

    for section in deck["sections"]:
        for key in ("image", "imageCaption", "imageSupplement", "imageSupplementCaption"):
            section.pop(key, None)

        if by_num:
            key = section.get("number")
            if key in by_num:
                section["image"], section["imageCaption"] = by_num[key]
            if key in supplements:
                section["imageSupplement"], section["imageSupplementCaption"] = supplements[key]
        elif by_id:
            sid = section["id"]
            if sid in by_id:
                section["image"], section["imageCaption"] = by_id[sid]
            if sid in supplements:
                section["imageSupplement"], section["imageSupplementCaption"] = supplements[sid]

    deck_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2), encoding="utf-8")
    count = sum(1 for s in deck["sections"] if "image" in s)
    print(f"ch{ch}: {deck_path.name} — {count} sections with images")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for d in manifest["decks"]:
        if d["id"] == deck_id:
            d["hasImages"] = True
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply chapter image maps to deck JSON")
    parser.add_argument("--chapter", type=int, action="append", help="Chapter number (repeatable)")
    parser.add_argument("--all", action="store_true", help="Apply all chapters 1–10")
    args = parser.parse_args()

    chapters = list(range(1, 11)) if args.all else (args.chapter or [])
    if not chapters:
        print("Specify --chapter N or --all", file=sys.stderr)
        return 1

    for ch in sorted(set(chapters)):
        if ch not in CHAPTER_CONFIG:
            print(f"Unknown chapter {ch}", file=sys.stderr)
            return 1
        apply_chapter(ch)

    return 0


if __name__ == "__main__":
    sys.exit(main())
