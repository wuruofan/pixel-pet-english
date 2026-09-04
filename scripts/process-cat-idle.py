#!/usr/bin/env python3
"""Create safe stage-aware idle breathing frames without breaking the tail.

The old implementation vertically resized the whole PNG. Because the tail is
separate from the body in the source art, that resize widened the gap and could
extend the opaque silhouette. Idle-1 now keeps the exact silhouette and makes
the smallest useful face-level breath change instead.
"""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
NOSE_SHIFT = {"baby": (12, 14), "kid": (11, 15), "adult": (15, 21)}


def make_breath(image, stage):
    out = image.copy()
    x, y = NOSE_SHIFT[stage]
    source = image.getpixel((x, y))
    destination = image.getpixel((x, y + 1))
    out.putpixel((x, y), destination)
    out.putpixel((x, y + 1), source)
    return out


def main():
    for stage in ("baby", "kid", "adult"):
        base = Image.open(SPRITES / f"cat-{stage}.png").convert("RGBA")
        base.save(SPRITES / f"cat-{stage}-idle-0.png")
        make_breath(base, stage).save(SPRITES / f"cat-{stage}-idle-1.png")
    print("generated silhouette-safe stage-aware idle frames")


if __name__ == "__main__":
    main()
