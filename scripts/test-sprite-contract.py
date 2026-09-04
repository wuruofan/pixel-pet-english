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

    # Baby/kid eat states must use the existing real three-phase low-to-bowl
    # action, not the placeholder files that copy their standing frames.
    eat_frames = [SPRITES / f"cat-eat-{index}.png" for index in range(3)]
    assert all(path.exists() for path in eat_frames), "adult eat frame set is incomplete"
    assert len({path.read_bytes() for path in eat_frames}) == 3, "eat frames must all be unique"
    assert "1: ['cat-eat-0', 'cat-eat-1', 'cat-eat-2']" in APP
    assert "2: ['cat-eat-0', 'cat-eat-1', 'cat-eat-2']" in APP

    # Baby/kid happy states should have an actual three-phase jump, not only a
    # CSS animation around one static face frame.
    for stage in ("baby", "kid"):
        frames = []
        for index in range(3):
            path = SPRITES / f"cat-{stage}-happy-{index}.png"
            assert path.exists(), f"missing {stage} happy frame: {path.name}"
            frames.append(path.read_bytes())
        assert len(set(frames)) == 3, f"{stage} happy frames must all be unique"

    assert "1: ['cat-baby-happy-0', 'cat-baby-happy-1', 'cat-baby-happy-2']" in APP
    assert "2: ['cat-kid-happy-0', 'cat-kid-happy-1', 'cat-kid-happy-2']" in APP

    print("sprite contract: PASS")


if __name__ == "__main__":
    main()
