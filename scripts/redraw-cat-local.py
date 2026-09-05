#!/usr/bin/env python3
"""Draw the v2 cat base sprites with deterministic, hand-authored pixels.

The art is deliberately generated from one 48x48 design grid, then placed on
stage-sized transparent canvases. Expressions and action frames can later use
these bases without guessing where the face is.
"""
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
SCALES = {"baby": 0.66, "kid": 0.82, "adult": 1.0}
SIZES = {"baby": (30, 32), "kid": (36, 38), "adult": (44, 48)}

INK = (57, 38, 43, 255)
SHADOW = (190, 87, 42, 255)
FUR = (244, 157, 55, 255)
LIGHT = (255, 190, 70, 255)
CREAM = (255, 242, 213, 255)
PINK = (244, 132, 145, 255)
NOSE = (207, 82, 105, 255)
WHITE = (255, 253, 247, 255)


def draw_cat(stage):
    scale = SCALES[stage]
    image = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def xy(x, y):
        return (round(24 + (x - 24) * scale), round(47 - (47 - y) * scale))

    def polygon(points, fill):
        draw.polygon([xy(x, y) for x, y in points], fill=fill)

    def rectangle(x0, y0, x1, y1, fill):
        a, b = xy(x0, y0), xy(x1, y1)
        draw.rectangle((min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])), fill=fill)

    def line(points, fill, width=1):
        draw.line([xy(x, y) for x, y in points], fill=fill, width=max(1, round(width * scale)), joint="curve")

    # Tail first: a compact cat curl, not a fox-like fan.
    line([(31, 39), (39, 41), (43, 37), (42, 31), (38, 28), (35, 31)], INK, 8)
    line([(31, 39), (39, 40), (41, 37), (40, 32), (38, 30), (36, 32)], FUR, 5)
    line([(39, 39), (41, 36), (40, 32)], SHADOW, 2)
    rectangle(37, 28, 39, 30, LIGHT)

    # Body and separated paws.
    polygon([(11, 23), (14, 20), (31, 20), (35, 24), (35, 40), (32, 45), (27, 45),
             (25, 42), (20, 42), (18, 45), (12, 45), (9, 40)], INK)
    polygon([(13, 24), (16, 22), (30, 22), (33, 25), (33, 39), (30, 42), (27, 42),
             (25, 39), (20, 39), (18, 42), (13, 42), (11, 39)], FUR)
    polygon([(17, 28), (29, 28), (31, 35), (28, 40), (25, 38), (21, 38), (18, 40),
             (15, 35)], CREAM)
    rectangle(13, 40, 18, 43, CREAM)
    rectangle(27, 40, 32, 43, CREAM)
    rectangle(12, 43, 18, 45, INK)
    rectangle(27, 43, 33, 45, INK)
    rectangle(14, 41, 17, 43, LIGHT)
    rectangle(29, 41, 31, 43, LIGHT)

    # Head: rounded cat ears with a lower, softer point than the previous draft.
    polygon([(8, 8), (11, 3), (17, 7), (23, 5), (30, 7), (36, 3), (39, 9),
             (40, 16), (37, 25), (31, 29), (17, 29), (10, 25), (7, 17)], INK)
    polygon([(10, 9), (12, 5), (17, 8), (23, 7), (29, 8), (35, 5), (37, 10),
             (38, 16), (35, 23), (30, 26), (18, 26), (12, 23), (9, 17)], FUR)
    polygon([(12, 8), (13, 6), (17, 9), (14, 12)], PINK)
    polygon([(33, 9), (35, 6), (36, 10), (34, 12)], PINK)

    # Short tabby bands stop above the eyes; there is no pointed fox-like brow.
    rectangle(19, 9, 20, 12, SHADOW)
    rectangle(23, 8, 24, 11, SHADOW)
    rectangle(27, 9, 28, 12, SHADOW)
    rectangle(16, 11, 17, 13, SHADOW)
    rectangle(30, 11, 31, 13, SHADOW)

    # Two cream cheek lobes leave a clean central nose/mouth column.
    polygon([(11, 17), (16, 15), (22, 17), (24, 20), (26, 17), (32, 15), (37, 17),
             (35, 23), (30, 26), (18, 26), (13, 23)], CREAM)
    rectangle(15, 18, 20, 21, WHITE)
    rectangle(28, 18, 33, 21, WHITE)

    # Stage-specific eye sizes, but identical construction: dark eye + one-pixel glint.
    if stage == "baby":
        eyes = [(15, 16, 18, 19), (29, 16, 32, 19)]
        nose = (23, 20)
    elif stage == "kid":
        eyes = [(14, 15, 18, 19), (29, 15, 33, 19)]
        nose = (23, 20)
    else:
        eyes = [(13, 14, 18, 19), (30, 14, 35, 19)]
        nose = (24, 20)
    for x0, y0, x1, y1 in eyes:
        rectangle(x0, y0, x1, y1, INK)
        rectangle(x0 + 1, y0 + 1, x0 + 2, y0 + 2, WHITE)
    rectangle(nose[0], nose[1], nose[0] + 1, nose[1] + 1, NOSE)
    # The final output patch below owns the mouth. Avoid leaving a second
    # scaled copy behind, which can show up as a stray black nose line.

    # Keep whiskers off the kitten and young-cat nose corridor; at this scale
    # a line there reads as a stray mouth mark. The adult has enough room for
    # two deliberate whisker strokes.
    if stage == "adult":
        line([(14, 22), (8, 21)], INK)
        line([(14, 24), (9, 25)], INK)
        line([(33, 22), (39, 21)], INK)
        line([(33, 24), (38, 25)], INK)
    line([(15, 29), (17, 32)], SHADOW, 2)
    line([(31, 29), (29, 32)], SHADOW, 2)

    bbox = image.getchannel("A").getbbox()
    cropped = image.crop((bbox[0] - 1, bbox[1] - 1, bbox[2] + 1, bbox[3] + 1))
    target = Image.new("RGBA", SIZES[stage], (0, 0, 0, 0))
    left = (target.width - cropped.width) // 2
    top = target.height - cropped.height
    target.alpha_composite(cropped, (left, top))
    eye_patch = {
        "baby": {
            "boxes": ((5, 10, 10, 15), (14, 10, 19, 15)),
            "eyes": ((6, 11, 8, 13), (15, 11, 17, 13)),
            "glints": ((7, 11), (16, 11)),
        },
        "kid": {
            "boxes": ((6, 11, 12, 17), (18, 11, 24, 17)),
            "eyes": ((7, 12, 10, 15), (19, 12, 22, 15)),
            "glints": ((8, 12), (20, 12)),
        },
        "adult": {
            "boxes": ((9, 14, 16, 21), (24, 14, 31, 21)),
            "eyes": ((10, 15, 14, 19), (25, 15, 29, 19)),
            "glints": ((11, 15), (26, 15)),
        },
    }[stage]
    for x0, y0, x1, y1 in eye_patch["boxes"]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                target.putpixel((x, y), CREAM)
    for x0, y0, x1, y1 in eye_patch["eyes"]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                target.putpixel((x, y), INK)
    for point in eye_patch["glints"]:
        target.putpixel(point, WHITE)

    mouth_patch = {
        "baby": {
            "clear": (10, 15, 15, 18),
            "pixels": ((11, 16), (12, 17), (13, 16)),
        },
        "kid": {
            "clear": (13, 18, 20, 22),
            "pixels": ((14, 19), (15, 20), (16, 19)),
        },
        "adult": {
            "clear": (16, 23, 24, 27),
            # One pixel right of the previous adult mouth center, with a
            # slightly larger broken feline mouth instead of a human-like arc.
            "pixels": ((17, 24), (18, 25), (19, 24), (20, 25), (21, 24)),
        },
    }[stage]
    x0, y0, x1, y1 = mouth_patch["clear"]
    for y in range(y0, y1):
        for x in range(x0, x1):
            target.putpixel((x, y), CREAM)
    for point in mouth_patch["pixels"]:
        target.putpixel(point, INK)

    paw_edges = {
        "baby": ((7, 25), (16, 25), (7, 26), (16, 26)),
        "kid": ((8, 31), (20, 31), (8, 32), (20, 32)),
        "adult": ((10, 41), (24, 41), (10, 42), (24, 42)),
    }[stage]
    for point in paw_edges:
        target.putpixel(point, INK)
    if stage == "baby":
        # The reduced kitten needs only two short stair-step joins between
        # the ears and crown. They follow the existing silhouette instead of
        # creating a straight cap across the head.
        for x, y in ((5, 4), (6, 4), (7, 5), (8, 5), (9, 4),
                     (13, 4), (14, 5), (15, 5), (16, 4), (17, 4)):
            target.putpixel((x, y), INK)
    return target


def main():
    SPRITES.mkdir(parents=True, exist_ok=True)
    for stage in ("baby", "kid", "adult"):
        draw_cat(stage).save(SPRITES / f"cat-{stage}-v2.png")
    print("generated local cat v2 base sprites")


if __name__ == "__main__":
    main()
