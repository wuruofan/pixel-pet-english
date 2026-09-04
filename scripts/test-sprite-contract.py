#!/usr/bin/env python3
"""Regression checks for stage-aware cat/egg sprite rendering contracts."""
from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "app.js").read_text()
SPRITES = ROOT / "assets" / "sprites"


def alpha_bbox(name):
    return Image.open(SPRITES / name).convert("RGBA").getchannel("A").getbbox()


def main():
    # Stage 0 is an egg and must never borrow the adult cat's side-walk loop.
    assert re.search(r"walking\s*&&\s*stage\s*>=\s*1\s*&&\s*fr\.walk", APP), (
        "walking PNG branch must be restricted to stage >= 1"
    )

    # Every persistent expression used by the mood engine needs an egg mapping.
    for expr in ("sleep", "excited", "droopy", "sad", "wash", "grunt"):
        assert re.search(rf"{expr}:\s*\{{\s*0:\s*\[", APP), (
            f"{expr} must define a stage-0 egg frame mapping"
        )

    for name in (
        "cat-egg-sleep-0.png", "cat-egg-sleep-1.png",
        "cat-egg-excited-0.png", "cat-egg-excited-1.png", "cat-egg-excited-2.png",
        "cat-egg-droopy.png",
        "cat-egg-sad-0.png", "cat-egg-sad-1.png",
        "cat-egg-wash-0.png", "cat-egg-wash-1.png",
        "cat-egg-grunt-0.png", "cat-egg-grunt-1.png",
    ):
        assert (SPRITES / name).exists(), f"missing egg state frame: {name}"

    # Idle breathing must preserve the full silhouette; a clipped right edge
    # makes the runtime spot overlay and the shell appear to jump.
    base = alpha_bbox("cat-egg-idle-0.png")
    breath = alpha_bbox("cat-egg-idle-1.png")
    assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
        f"egg idle frames must keep the same horizontal silhouette: {base} vs {breath}"
    )

    print("sprite contract: PASS")


if __name__ == "__main__":
    main()
