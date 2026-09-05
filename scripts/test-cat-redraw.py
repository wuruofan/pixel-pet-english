#!/usr/bin/env python3
"""Contract checks for the local pixel-redrawn cat base samples."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
INK = (57, 38, 43, 255)
NOSE = (207, 82, 105, 255)
WHITE = (255, 253, 247, 255)

EXPECTED_SIZES = {
    "baby": (30, 32),
    "kid": (36, 38),
    "adult": (44, 48),
}


def main():
    def is_ink(pixel):
        r, g, b, a = pixel
        return a > 0 and r < 100 and g < 80 and b < 90

    frames = []
    for stage, size in EXPECTED_SIZES.items():
        path = SPRITES / f"cat-{stage}-v2.png"
        assert path.exists(), f"missing local redraw: {path.name}"
        image = Image.open(path).convert("RGBA")
        assert image.size == size, f"{path.name} has size {image.size}, expected {size}"
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        assert bbox, f"{path.name} is empty"
        assert bbox[1] >= 0 and bbox[3] <= size[1]
        assert alpha.getpixel((0, 0)) == 0, f"{path.name} needs transparent padding"
        frames.append(path.read_bytes())

    assert len(set(frames)) == 3, "the three redraw stages must be visually distinct"

    def longest_ink_run(image, x0, x1, y0, y1):
        longest = 0
        for y in range(y0, y1):
            run = 0
            for x in range(x0, x1):
                r, g, b, a = image.getpixel((x, y))
                if is_ink((r, g, b, a)):
                    run += 1
                    longest = max(longest, run)
                else:
                    run = 0
        return longest

    # The new face must live inside the head, not drift into the ears or chest.
    face_regions = {
        "baby": (8, 12, 22, 24),
        "kid": (9, 13, 27, 27),
        "adult": (11, 14, 34, 30),
    }
    for stage, (left, top, right, bottom) in face_regions.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        ink_pixels = 0
        for y in range(top, bottom):
            for x in range(left, right):
                r, g, b, a = image.getpixel((x, y))
                if is_ink((r, g, b, a)):
                    ink_pixels += 1
        assert ink_pixels >= 8, f"{stage} redraw has no readable face construction"

    baby = Image.open(SPRITES / "cat-baby-v2.png").convert("RGBA")
    # The top of the kitten's head needs a visible continuous outline; a few
    # isolated ear pixels read as a missing cap at the displayed scale.
    top_runs = []
    for y in range(3, 7):
        run = 0
        longest = 0
        for x in range(6, 24):
            r, g, b, a = baby.getpixel((x, y))
            if is_ink((r, g, b, a)):
                run += 1
                longest = max(longest, run)
            else:
                run = 0
        top_runs.append(longest)
    assert max(top_runs) >= 4, "baby head needs a visible top outline"

    # The mouth sits directly below the nose and must remain readable at 1x.
    def face_run(image, x0, x1, y0, y1):
        return longest_ink_run(image, x0, x1, y0, y1)

    baby_mouth = face_run(baby, 9, 17, 14, 18)
    adult = Image.open(SPRITES / "cat-adult-v2.png").convert("RGBA")
    adult_mouth = face_run(adult, 15, 30, 22, 27)
    assert 1 <= baby_mouth <= 2, f"baby mouth should be small but readable: run={baby_mouth}"
    baby_mouth_pixels = [(11, 16), (12, 17), (13, 16)]
    assert all(baby.getpixel(point) == INK for point in baby_mouth_pixels), (
        "baby mouth should be a separated shallow arc, not a central black clump"
    )
    kid_mouth_pixels = [(14, 19), (15, 20), (16, 19)]
    kid = Image.open(SPRITES / "cat-kid-v2.png").convert("RGBA")
    assert all(kid.getpixel(point) == INK for point in kid_mouth_pixels), (
        "kid mouth should use a compact feline point shape"
    )
    adult_mouth_pixels = [(17, 24), (18, 25), (19, 24), (20, 25), (21, 24)]
    assert all(adult.getpixel(point) == INK for point in adult_mouth_pixels), (
        "adult mouth should use the shifted compact feline point shape"
    )
    assert baby.getpixel((10, 16)) != INK
    assert baby.getpixel((14, 16)) != INK

    # The nose-to-mouth gap must stay clean; leftover pixels from the old
    # canonical mouth read as a stray black line beside the nose.
    for stage, row, x0, x1 in (("baby", 14, 9, 16), ("kid", 17, 12, 21)):
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert all(
            image.getpixel((x, row)) != INK
            for x in range(x0, x1)
        ), f"{stage} nose-to-mouth gap contains a stray black line"

    # The top contour is stage-specific. A short, broken kitten contour is
    # required, while the older cats keep their naturally stepped silhouette;
    # a long post-fill line makes all three heads look mechanically capped.
    baby_top = longest_ink_run(baby, 6, 24, 3, 7)
    assert 2 <= baby_top <= 6, f"baby top outline should be a soft short contour: run={baby_top}"
    crown = [(5, 4), (6, 4), (7, 5), (8, 5), (9, 4),
             (13, 4), (14, 5), (15, 5), (16, 4), (17, 4)]
    crown_ink = sum(1 for point in crown if is_ink(baby.getpixel(point)))
    assert crown_ink >= 8, "baby crown needs a visible stepped contour"
    for stage, box in (("kid", (8, 26, 3, 9)), ("adult", (8, 36, 4, 10))):
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert longest_ink_run(image, *box) <= 10, (
            f"{stage} top outline should keep its natural stepped contour"
        )

    # The central face column moves up slightly with the redraw revision.
    nose_limits = {"baby": 13, "kid": 16, "adult": 21}
    for stage, limit in nose_limits.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        nose_y = [
            y for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y)) == NOSE
        ]
        assert nose_y and min(nose_y) <= limit, f"{stage} nose was not moved up"

    # Eyes are calibrated on the final canvas so reduction cannot make one
    # side heavier than the other.
    eye_specs = {
        "baby": {"left": (6, 11, 8, 13), "right": (15, 11, 17, 13), "glints": ((7, 11), (16, 11))},
        "kid": {"left": (7, 12, 10, 15), "right": (19, 12, 22, 15), "glints": ((8, 12), (20, 12))},
        "adult": {"left": (10, 15, 14, 19), "right": (25, 15, 29, 19), "glints": ((11, 15), (26, 15))},
    }
    for stage, spec in eye_specs.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        glints = set(spec["glints"])
        for side in ("left", "right"):
            x0, y0, x1, y1 = spec[side]
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if (x, y) in glints:
                        continue
                    assert image.getpixel((x, y)) == INK, (
                        f"{stage} {side} eye is not a calibrated dark block"
                    )
        for point in spec["glints"]:
            assert image.getpixel(point) == WHITE, (
                f"{stage} eye is missing its one-pixel glint"
            )

    # Each front paw gets a light one-pixel side edge so it reads as a paw,
    # without turning the whole hand into a heavy black block.
    paw_edges = {
        "baby": [(7, 25), (16, 25), (7, 26), (16, 26)],
        "kid": [(8, 31), (20, 31), (8, 32), (20, 32)],
        "adult": [(10, 41), (24, 41), (10, 42), (24, 42)],
    }
    for stage, points in paw_edges.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert all(image.getpixel(point) == INK for point in points), (
            f"{stage} front paws need visible side edges"
        )

    print("cat redraw contract: PASS")


if __name__ == "__main__":
    main()
