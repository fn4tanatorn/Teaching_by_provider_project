#!/usr/bin/env python3
"""Move PNG files not referenced by web decks into data_N/_unused/ (local staging).

After review, move teach/data_N/_unused/ outside the repo (see ../teach-unused-images/).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAPS_PATH = ROOT / "scripts" / "chapter_image_maps.py"

PATH_RE = re.compile(r"data_(\d+)/([^\"'\s]+\.png)")


def collect_used_paths() -> set[str]:
    used: set[str] = set()

    text = MAPS_PATH.read_text(encoding="utf-8")
    for m in PATH_RE.finditer(text):
        used.add(f"data_{m.group(1)}/{m.group(2)}")

    for deck_path in DATA.glob("ch*.json"):
        if deck_path.name.startswith("katzung"):
            continue
        blob = deck_path.read_text(encoding="utf-8")
        for m in PATH_RE.finditer(blob):
            used.add(f"data_{m.group(1)}/{m.group(2)}")

    # Keep symlink targets (e.g. 01-fig-1-1.png → Screenshot ….png)
    for ch in range(1, 11):
        folder = ROOT / f"data_{ch}"
        if not folder.is_dir():
            continue
        for path in folder.glob("*.png"):
            if path.is_symlink():
                try:
                    target = path.resolve()
                    if target.is_file():
                        used.add(str(target.relative_to(ROOT)))
                except OSError:
                    pass
            rel = str(path.relative_to(ROOT))
            if rel in used and path.is_symlink():
                target_name = os.readlink(path)
                if not target_name.startswith("/"):
                    used.add(f"data_{ch}/{Path(target_name).name}")

    return used


def archive_chapter(ch: int, used: set[str], dry_run: bool) -> tuple[int, int]:
    folder = ROOT / f"data_{ch}"
    if not folder.is_dir():
        return 0, 0

    archive = folder / "_unused"
    kept = 0
    moved = 0

    skip_names = {"figures-index.json", "README.txt"}
    for path in sorted(folder.iterdir()):
        if path.name in skip_names or path.name == "_unused":
            continue
        if path.is_dir():
            continue
        if path.suffix.lower() != ".png":
            continue
        # Include broken symlinks (is_file() is False when target is missing).
        if not path.is_file() and not path.is_symlink():
            continue
        rel = f"data_{ch}/{path.name}"
        if rel in used:
            kept += 1
            continue

        dest = archive / path.name
        if dry_run:
            print(f"  would move: {path.name}")
            moved += 1
            continue

        archive.mkdir(exist_ok=True)
        if dest.exists():
            stem = path.stem
            suffix = path.suffix
            n = 2
            while dest.exists():
                dest = archive / f"{stem}__dup{n}{suffix}"
                n += 1
        shutil.move(str(path), str(dest))
        moved += 1

    return kept, moved


def write_readme(ch: int, kept: int, moved: int) -> None:
    archive = ROOT / f"data_{ch}" / "_unused"
    if not archive.is_dir():
        return
    readme = archive / "README.txt"
    readme.write_text(
        f"Archived screenshots not used by the web slides (chapter {ch}).\n"
        f"Moved: {moved} file(s). Active in parent folder: {kept} PNG(s).\n"
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
        f"Restore: move a file back to ../ and update scripts/chapter_image_maps.py if needed.\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive unused chapter screenshots")
    parser.add_argument("--chapter", type=int, action="append")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    chapters = list(range(1, 11)) if args.all else (args.chapter or [])
    if not chapters:
        print("Use --chapter N or --all", file=sys.stderr)
        return 1

    used = collect_used_paths()
    print(f"Web references {len(used)} unique image path(s)\n")

    total_kept = total_moved = 0
    for ch in sorted(set(chapters)):
        print(f"data_{ch}:")
        kept, moved = archive_chapter(ch, used, args.dry_run)
        total_kept += kept
        total_moved += moved
        print(f"  active: {kept}, archived: {moved}")
        if not args.dry_run and moved:
            write_readme(ch, kept, moved)

    print(f"\nTotal: {total_kept} kept, {total_moved} archived")
    return 0


if __name__ == "__main__":
    sys.exit(main())
