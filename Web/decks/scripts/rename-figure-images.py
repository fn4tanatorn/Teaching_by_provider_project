#!/usr/bin/env python3
"""
Rename screenshot files used by the web decks to textbook order.

Used files → 01-fig-9-1.png, 02-table-9-1.png, … (sorted by FIGURE/TABLE number).
Updates scripts/chapter_image_maps.py paths and writes data_N/figures-index.json.

Unused PNGs: run scripts/archive-unused-images.py --all → data_N/_unused/
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPS_PATH = ROOT / "scripts" / "chapter_image_maps.py"

FIG_RE = re.compile(r"^(FIGURE|TABLE)\s+(\d+)-(\d+)", re.IGNORECASE)
PATH_RE = re.compile(r"data_(\d+)/([^\s\"']+\.png)")


def parse_caption(caption: str) -> tuple[str, int, int, str]:
    m = FIG_RE.match(caption.strip())
    if m:
        kind = "fig" if m.group(1).upper() == "FIGURE" else "table"
        return kind, int(m.group(2)), int(m.group(3)), caption
    low = caption.lower()
    if "summary" in low or "rapid review" in low:
        return "summary", 9_999, 0, caption
    if "preparation" in low:
        return "prep", 9_998, 0, caption
    return "other", 9_997, 0, caption


def sort_key(item: tuple) -> tuple:
    kind, ch, num = item[0], item[1], item[2]
    kind_order = {"fig": 0, "table": 1, "summary": 2, "prep": 3, "other": 4}
    # Same textbook index (e.g. 9-1): figure before table, then by sub-number.
    return (ch, num, kind_order.get(kind, 5))


def collect_used_assets() -> dict[int, dict[str, tuple[str, str]]]:
    """chapter -> { old_rel_path: (caption, abs_path) }"""
    text = MAPS_PATH.read_text(encoding="utf-8")
    by_ch: dict[int, dict[str, tuple[str, str]]] = {}

    for m in re.finditer(
        r'"(data_(\d+)/[^"]+\.png)"\s*,\s*(?:"([^"]+)"|\n\s*"([^"]+)")',
        text,
    ):
        rel, ch_s, caption = m.group(1), m.group(2), m.group(3) or m.group(4)
        ch = int(ch_s)
        by_ch.setdefault(ch, {})
        if rel not in by_ch[ch]:
            by_ch[ch][rel] = (caption, str(ROOT / rel))

    return by_ch


def build_rename_plan(ch: int, assets: dict[str, tuple[str, str]]) -> list[tuple[Path, Path, str]]:
    """Returns [(old_abs, new_abs, caption), ...]"""
    parsed = []
    for rel, (caption, abs_path) in assets.items():
        kind, fig_ch, num, cap = parse_caption(caption)
        parsed.append((kind, fig_ch, num, cap, rel, Path(abs_path)))

    parsed.sort(key=sort_key)

    folder = ROOT / f"data_{ch}"
    plan: list[tuple[Path, Path, str]] = []
    seen_names: set[str] = set()

    for i, (kind, fig_ch, num, cap, _rel, old_abs) in enumerate(parsed, start=1):
        if kind in ("fig", "table"):
            base = f"{i:02d}-{kind}-{fig_ch}-{num}.png"
        elif kind == "summary":
            base = f"{i:02d}-summary.png"
        elif kind == "prep":
            base = f"{i:02d}-preparations.png"
        else:
            slug = re.sub(r"[^a-z0-9]+", "-", cap[:40].lower()).strip("-") or "misc"
            base = f"{i:02d}-{slug}.png"

        while base in seen_names:
            stem, ext = base.rsplit(".", 1)
            base = f"{stem}-dup.png" if ext == "png" else f"{base}-dup"
        seen_names.add(base)

        new_abs = folder / base
        if old_abs.resolve() != new_abs.resolve():
            plan.append((old_abs, new_abs, cap))

    return plan


def apply_renames(plan: list[tuple[Path, Path, str]], dry_run: bool) -> dict[str, str]:
    """old_rel -> new_rel (project-relative)"""
    if dry_run:
        return {str(o.relative_to(ROOT)): str(n.relative_to(ROOT)) for o, n, _ in plan}

    mapping: dict[str, str] = {}
    pending: list[tuple[Path, Path, str]] = []

    for old, new, _ in plan:
        if not old.exists():
            print(f"  skip missing: {old.relative_to(ROOT)}", file=sys.stderr)
            continue
        if old.resolve() == new.resolve():
            continue
        if new.exists():
            print(f"  conflict: {new.relative_to(ROOT)} already exists", file=sys.stderr)
            continue
        rel_old = str(old.relative_to(ROOT))
        tmp = old.parent / f"__renaming__{old.name}"
        old.rename(tmp)
        pending.append((tmp, new, rel_old))

    for tmp, new, rel_old in pending:
        tmp.rename(new)
        mapping[rel_old] = str(new.relative_to(ROOT))

    return mapping


def update_maps(path_map: dict[str, str], dry_run: bool) -> None:
    text = MAPS_PATH.read_text(encoding="utf-8")
    for old, new in sorted(path_map.items(), key=lambda x: -len(x[0])):
        text = text.replace(f'"{old}"', f'"{new}"')
    if dry_run:
        return
    MAPS_PATH.write_text(text, encoding="utf-8")


def write_index(ch: int, plan: list[tuple[Path, Path, str]], path_map: dict[str, str]) -> None:
    entries = []
    for old, new, cap in plan:
        rel_old = str(old.relative_to(ROOT))
        rel_new = path_map.get(rel_old, str(new.relative_to(ROOT)))
        entries.append({"file": rel_new, "was": rel_old, "caption": cap})
    index_path = ROOT / f"data_{ch}" / "figures-index.json"
    index_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rename web-used figures to textbook order")
    parser.add_argument("--chapter", type=int, action="append")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-apply", action="store_true", help="Do not run apply_images.py after")
    args = parser.parse_args()

    chapters = list(range(1, 11)) if args.all else (args.chapter or [])
    if not chapters:
        print("Use --chapter N or --all", file=sys.stderr)
        return 1

    all_maps: dict[str, str] = {}
    by_ch = collect_used_assets()

    for ch in sorted(set(chapters)):
        assets = by_ch.get(ch, {})
        if not assets:
            print(f"ch{ch}: no mapped images")
            continue
        plan = build_rename_plan(ch, assets)
        print(f"ch{ch}: {len(plan)} file(s) to rename")
        for old, new, cap in plan:
            print(f"  {old.name} → {new.name}  ({cap[:50]}…)" if len(cap) > 50 else f"  {old.name} → {new.name}  ({cap})")
        path_map = apply_renames(plan, args.dry_run)
        all_maps.update(path_map)
        if not args.dry_run:
            write_index(ch, plan, path_map)

    if all_maps and not args.dry_run:
        update_maps(all_maps, False)
        print(f"\nUpdated {MAPS_PATH.name} ({len(all_maps)} paths)")
        if not args.skip_apply:
            import subprocess

            subprocess.run([sys.executable, str(ROOT / "scripts" / "apply_images.py"), "--all"], check=True)
    elif args.dry_run and all_maps:
        print(f"\n[dry-run] would update {len(all_maps)} paths in chapter_image_maps.py")

    return 0


if __name__ == "__main__":
    sys.exit(main())
