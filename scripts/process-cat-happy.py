#!/usr/bin/env python3
"""Derive stage-sized happy jump frames from the existing happy face art."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"


def shift_up(im, dy):
    """Move the sprite upward inside its existing canvas, preserving width."""
    if dy <= 0:
        return im.copy()
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im.crop((0, dy, w, h)), (0, 0))
    return out


def main():
    for stage in ("baby", "kid"):
        base = Image.open(SPRITES / f"cat-{stage}-happy.png").convert("RGBA")
        frames = (
            base,
            shift_up(base, 1),
            shift_up(base, 2),
        )
        for index, frame in enumerate(frames):
            path = SPRITES / f"cat-{stage}-happy-{index}.png"
            frame.save(path, optimize=True)
            print(f"wrote {path.name}: {frame.size}")


if __name__ == "__main__":
    main()
