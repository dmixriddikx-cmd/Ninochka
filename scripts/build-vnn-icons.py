"""Render home-screen PNG icons from the single VNN SVG master.

Run after installing CairoSVG 2.8.2:
    python scripts/build-vnn-icons.py _site
"""
from pathlib import Path
import sys

import cairosvg

root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()
assets = root / "assets"
source = assets / "vnn-icon.svg"
if not source.is_file():
    raise SystemExit(f"Missing VNN source artwork: {source}")
for width in (180, 192, 512):
    destination = assets / f"vnn-icon-{width}.png"
    cairosvg.svg2png(url=str(source), write_to=str(destination),
                     output_width=width, output_height=width)
    with destination.open("rb") as stream:
        if stream.read(8) != b"\x89PNG\r\n\x1a\n":
            raise SystemExit(f"Invalid PNG: {destination}")
print("VNN app icons created: 180, 192, 512")
