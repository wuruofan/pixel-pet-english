#!/usr/bin/env python3
"""Fit the approved curled-sleep and side-walk art to each cat stage."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"


def fit_height(image, height):
    width = max(1, round(image.width * height / image.height))
    return image.resize((width, height), Image.Resampling.NEAREST)


def fit_scale(image, scale):
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.NEAREST,
    )


def main():
    sleep_heights = {"baby": 24, "kid": 31, "adult": 46}
    for stage, height in sleep_heights.items():
        for index in range(2):
            source = Image.open(SPRITES / f"cat-sleep-{index}.png").convert("RGBA")
            fit_height(source, height).save(SPRITES / f"cat-{stage}-sleep-{index}.png")

    # The adult side loop is the only approved walk cycle. Fitting it down
    # keeps its silhouette and timing while matching baby/kid display scale.
    for stage, scale in (("baby", 0.76), ("kid", 0.9)):
        for index in range(6):
            source = Image.open(SPRITES / f"cat-walk-{index}.png").convert("RGBA")
            fit_scale(source, scale).save(SPRITES / f"cat-{stage}-walk-{index}.png")
    print("generated stage-fitted cat sleep and walk frames")


if __name__ == "__main__":
    main()
