#!/usr/bin/env python3
"""Apply data_1/ images to ch1-intro.json (delegates to apply_images)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    return subprocess.call(
        [sys.executable, str(ROOT / "scripts" / "apply_images.py"), "--chapter", "1"]
    )


if __name__ == "__main__":
    sys.exit(main())
