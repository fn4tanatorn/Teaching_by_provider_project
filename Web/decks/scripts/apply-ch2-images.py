#!/usr/bin/env python3
"""Apply data_2/ images — see chapter_image_maps.py & apply_images.py."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    sys.exit(
        subprocess.call(
            [sys.executable, str(Path(__file__).resolve().parents[1] / "scripts" / "apply_images.py"), "--chapter", "2"]
        )
    )
