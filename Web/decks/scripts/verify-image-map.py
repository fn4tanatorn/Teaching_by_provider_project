#!/usr/bin/env python3
"""OCR figure/table labels in data_N/ and compare to current figure captions."""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def ocr_label(png: Path) -> str | None:
    txt = subprocess.run(
        ["tesseract", str(png), "stdout", "--psm", "3"],
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.replace("–", "-").replace("—", "-")
    m = re.search(r"(FIGURE|TABLE)\s*(\d+)\s*[- ]\s*(\d+)", txt, re.I)
    if m:
        kind = "FIGURE" if m.group(1).upper().startswith("FIG") else "TABLE"
        return f"{kind} {m.group(2)}-{m.group(3)}"
    if "SUMMARY" in txt.upper()[:200]:
        return "SUMMARY"
    return None


def chapter_from_script(path: Path) -> int | None:
    m = re.search(r"apply-ch(\d+)-images", path.name)
    return int(m.group(1)) if m else None


def load_mapping(script: Path, chapter: int) -> dict[str, str]:
    index_path = ROOT / f"data_{chapter}" / "figures-index.json"
    if index_path.exists():
        rows = json.loads(index_path.read_text(encoding="utf-8"))
        return {
            row["file"]: row.get("caption", "")
            for row in rows
            if isinstance(row, dict) and row.get("file")
        }

    text = script.read_text(encoding="utf-8")
    mapping = {}
    for m in re.finditer(
        r'"([^"]+)":\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)', text
    ):
        sid, file, caption = m.groups()
        if sid.startswith("data_"):
            continue
        mapping[file] = caption
    intro = re.search(r'INTRO\s*=\s*\("([^"]+)"\s*,\s*"([^"]+)"\)', text)
    if intro:
        mapping[intro.group(1)] = intro.group(2)
    return mapping


def main() -> int:
    issues = []
    for script in sorted((ROOT / "scripts").glob("apply-ch*-images.py")):
        ch = chapter_from_script(script)
        if not ch:
            continue
        folder = ROOT / f"data_{ch}"
        if not folder.is_dir():
            continue
        cap_by_file = load_mapping(script, ch)
        for png in sorted(folder.glob("*.png")):
            if "-trim" in png.name:
                continue
            rel = f"data_{ch}/{png.name}"
            label = ocr_label(png)
            cap = cap_by_file.get(rel)
            if not cap:
                if label:
                    issues.append(f"ch{ch} {rel}: OCR={label} but not mapped in {script.name}")
                continue
            if label and label != "SUMMARY":
                cap_id = re.search(r"(FIGURE|TABLE)\s*(\d+-\d+)", cap.upper().replace("–", "-"))
                if cap_id:
                    normalized = f"{cap_id.group(1).title()} {cap_id.group(2)}"
                    if label.upper() != normalized.upper():
                        issues.append(
                            f"ch{ch} {rel}: file is {label}, caption says {cap_id.group(0)}"
                        )

    if not issues:
        print("✓ Image files and captions align on figure/table numbers (OCR check).")
        return 0
    print(f"Found {len(issues)} mismatch(es):\n")
    for line in issues:
        print(f"  • {line}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
