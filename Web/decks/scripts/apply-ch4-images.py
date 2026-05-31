#!/usr/bin/env python3
import subprocess, sys
from pathlib import Path
if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, str(Path(__file__).resolve().parents[1] / "scripts" / "apply_images.py"), "--chapter", "4"]))
