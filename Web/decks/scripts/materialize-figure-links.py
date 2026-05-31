#!/usr/bin/env python3
"""Replace broken symlinks in data_N/ with real PNG copies from teach-unused-images."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = ROOT.parent / "teach-unused-images"


def materialize_chapter(ch: int) -> int:
    folder = ROOT / f"data_{ch}"
    archive = ARCHIVE_ROOT / f"data_{ch}" / "_unused"
    if not folder.is_dir():
        return 0
    fixed = 0
    for path in sorted(folder.glob("*.png")):
        if not path.is_symlink():
            continue
        target = Path(os.readlink(path))
        source = archive / target.name
        if not source.is_file():
            # already materialized or missing archive
            if path.is_symlink() and not path.exists():
                print(f"  missing archive for {path.name} -> {target.name}", file=sys.stderr)
            continue
        path.unlink()
        shutil.copy2(source, path)
        fixed += 1
        print(f"  {path.name} <- {source.name}")
    return fixed


def main() -> int:
    total = 0
    for ch in range(1, 11):
        n = materialize_chapter(ch)
        if n:
            print(f"ch{ch}: {n} symlink(s) materialized")
        total += n
    if not total:
        print("No broken symlinks materialized.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
