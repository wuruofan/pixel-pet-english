#!/usr/bin/env python3
"""Derive stage-sized cat action frames from the approved standing sprites.

The source sprites are intentionally kept intact: this pipeline only edits the
small face area and uses a one-pixel vertical bounce for excited frames. That
keeps each growth stage's silhouette, palette, and pixel-art scale consistent.
"""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
INK = (42, 9, 2, 255)
WHITE = (255, 253, 247, 255)
LID = (230, 170, 100, 255)
PINK = (245, 125, 140, 255)
TEAR = (80, 180, 245, 255)
BUBBLE = (117, 205, 235, 255)


# Face landmarks in the source art. They scale with the three approved
# silhouettes but deliberately do not resize the body.
FACE = {
    "baby": {"box": (7, 10, 21, 19), "eyes": ((9, 12), (17, 12)), "mouth": (13, 16)},
    "kid": {"box": (7, 12, 23, 21), "eyes": ((9, 14), (18, 14)), "mouth": (14, 18)},
    "adult": {"box": (11, 16, 33, 27), "eyes": ((13, 18), (25, 18)), "mouth": (19, 22)},
}


def opaque_face_color(image, box):
    colors = []
    for y in range(box[1] + 1, box[3] - 1):
        for x in range(box[0] + 1, box[2] - 1):
            r, g, b, a = image.getpixel((x, y))
            if a > 180 and r > 220 and g > 190 and b > 165:
                colors.append((r, g, b, 255))
    return max(set(colors), key=colors.count) if colors else WHITE


def load_stage(stage):
    return Image.open(SPRITES / f"cat-{stage}.png").convert("RGBA")


def clear_face(image, stage):
    out = image.copy()
    data = FACE[stage]
    fill = opaque_face_color(image, data["box"])
    left, top, right, bottom = data["box"]
    for y in range(top + 1, bottom - 1):
        for x in range(left + 1, right - 1):
            if out.getpixel((x, y))[3] > 120:
                out.putpixel((x, y), fill)
    return out


def px(image, x, y, color):
    if 0 <= x < image.width and 0 <= y < image.height:
        image.putpixel((x, y), color)


def eye_open(image, x, y, big=False):
    if big:
        for yy in range(y, y + 3):
            for xx in range(x - 1, x + 2):
                px(image, xx, yy, INK)
        px(image, x + 1, y, WHITE)
    else:
        for yy in range(y, y + 2):
            for xx in range(x, x + 2):
                px(image, xx, yy, INK)
        px(image, x + 1, y, WHITE)


def eye_squeeze(image, x, y):
    px(image, x, y + 1, INK)
    px(image, x + 1, y, INK)
    px(image, x + 2, y + 1, INK)


def draw_face(image, stage, mode, phase=0):
    out = clear_face(image, stage)
    data = FACE[stage]
    (lx, ly), (rx, ry) = data["eyes"]
    mx, my = data["mouth"]
    if mode == "excited":
        if phase == 2:
            # Star-like highlights read clearly at the tiny display size.
            for x, y in ((lx, ly), (rx, ry)):
                eye_open(out, x, y, big=True)
                px(out, x, y + 1, (255, 226, 102, 255))
                px(out, x - 1, y + 1, (255, 226, 102, 255))
        else:
            eye_open(out, lx, ly, big=True)
            eye_open(out, rx, ry, big=True)
        for x in range(mx - 2, mx + 3):
            px(out, x, my, INK)
        px(out, mx - 1, my + 1, PINK)
        px(out, mx, my + 1, PINK)
        px(out, mx + 1, my + 1, PINK)
    elif mode == "droopy":
        for x, y in ((lx, ly), (rx, ry)):
            px(out, x, y, LID)
            px(out, x + 1, y, LID)
            px(out, x, y + 1, INK)
            px(out, x + 1, y + 1, INK)
        px(out, mx, my, INK)
        px(out, mx + 1, my, INK)
        px(out, mx - 1, my + 1, INK)
        px(out, mx + 2, my + 1, INK)
    elif mode == "sad":
        for i, (x, y) in enumerate(((lx, ly), (rx, ry))):
            eye_open(out, x, y)
            px(out, x + (1 if i == 0 else 0), y - 1, INK)
        px(out, mx, my, INK)
        px(out, mx + 1, my, INK)
        px(out, mx - 1, my + 1, INK)
        px(out, mx + 2, my + 1, INK)
        tear_x = lx + 1 if phase == 0 else rx + 1
        px(out, tear_x, ly + 2, TEAR)
        px(out, tear_x, ly + 3, TEAR)
    elif mode == "wash":
        eye_squeeze(out, lx, ly)
        eye_squeeze(out, rx, ry)
        px(out, lx - 1, ly + 3, PINK)
        px(out, rx + 2, ry + 3, PINK)
        px(out, mx, my, INK)
        px(out, mx + 1, my, INK)
        bubble_x = rx + 4 - phase * 2
        bubble_y = max(1, ry - 4)
        px(out, bubble_x, bubble_y, BUBBLE)
        px(out, bubble_x + 1, bubble_y, BUBBLE)
        px(out, bubble_x, bubble_y + 1, BUBBLE)
    elif mode == "grunt":
        eye_squeeze(out, lx, ly)
        eye_squeeze(out, rx, ry)
        px(out, lx - 1, ly + 3, PINK)
        px(out, rx + 2, ry + 3, PINK)
        mouth_y = my + 1 + phase
        for x in range(mx - 2, mx + 3):
            px(out, x, mouth_y, INK)
        px(out, mx - 1, mouth_y + 1, PINK)
        px(out, mx, mouth_y + 1, PINK)
        px(out, mx + 1, mouth_y + 1, PINK)
    return out


def shift_vertical(image, amount):
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    if amount >= 0:
        out.paste(image.crop((0, 0, image.width, image.height - amount)), (0, amount))
    else:
        out.paste(image.crop((0, -amount, image.width, image.height)), (0, 0))
    return out


def save(image, name):
    image.save(SPRITES / name)


def main():
    for stage in ("baby", "kid", "adult"):
        base = load_stage(stage)
        save(draw_face(base, stage, "excited", 0), f"cat-{stage}-excited-0.png")
        save(shift_vertical(draw_face(base, stage, "excited", 1), -1), f"cat-{stage}-excited-1.png")
        save(shift_vertical(draw_face(base, stage, "excited", 2), -2), f"cat-{stage}-excited-2.png")
        save(draw_face(base, stage, "droopy"), f"cat-{stage}-droopy.png")
        save(draw_face(base, stage, "sad", 0), f"cat-{stage}-sad-0.png")
        save(draw_face(base, stage, "sad", 1), f"cat-{stage}-sad-1.png")
        save(draw_face(base, stage, "wash", 0), f"cat-{stage}-wash-0.png")
        save(draw_face(base, stage, "wash", 1), f"cat-{stage}-wash-1.png")
        save(draw_face(base, stage, "grunt", 0), f"cat-{stage}-grunt-0.png")
        save(draw_face(base, stage, "grunt", 1), f"cat-{stage}-grunt-1.png")
    print("generated stage-aware cat P1/P2 states")


if __name__ == "__main__":
    main()
