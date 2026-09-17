#!/usr/bin/env python3
"""One-shot comparison sheet for the v6.1 fox concept.

Reads cat-kid-v2 / dog-kid-v2 / fox-kid-stance and the same for adult,
lays them out side-by-side with a label bar, and writes:
  - tmp-fox-concept/compare-kid.png   (cat/dog/fox kid, scaled 12x)
  - tmp-fox-concept/compare-adult.png (cat/dog/fox adult, scaled 12x)

This script is intentionally NOT in scripts/ — it's a tmp-fox-concept
artifact for visual review only. Re-run after re-rendering the fox
concept via `python scripts/redraw-fox-local.py`.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
FOX = ROOT / "tmp-fox-concept"

# Each tuple: (label, path)
KID = (
    ("cat", SPRITES / "cat-kid-v2.png"),
    ("dog", SPRITES / "dog-kid-v2.png"),
    ("fox", FOX / "fox-kid-stance.png"),
)
ADULT = (
    ("cat", SPRITES / "cat-adult-v2.png"),
    ("dog", SPRITES / "dog-adult-v2.png"),
    ("fox", FOX / "fox-adult-stance.png"),
)

SCALE = 12
LABEL_H = 24
PAD = 8


def build_sheet(rows, out_path):
    # Find the widest row to align all rows.
    row_widths = []
    row_height = 0
    row_imgs = []
    for triplet in rows:
        scaled = []
        for label, path in triplet:
            img = Image.open(path).convert("RGBA")
            w, h = img.size
            img = img.resize((w * SCALE, h * SCALE), Image.NEAREST)
            scaled.append((label, img))
            row_widths.append(img.size[0])
            row_height = max(row_height, img.size[1])
        row_imgs.append(scaled)
    total_w = sum(row_widths) + PAD * (sum(len(r) for r in rows) + 1)
    total_h = row_height * len(rows) + LABEL_H * len(rows) + PAD * (len(rows) + 1)

    sheet = Image.new("RGBA", (total_w, total_h), (245, 245, 245, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except OSError:
        font = ImageFont.load_default()

    y = PAD
    for row in row_imgs:
        x = PAD
        for label, img in row:
            sheet.paste(img, (x, y), img)
            # Label below the sprite
            tw = draw.textlength(label, font=font)
            draw.text((x + (img.size[0] - tw) / 2, y + row_height + 4),
                      label, fill=(57, 38, 43, 255), font=font)
            x += img.size[0] + PAD
        y += row_height + LABEL_H + PAD

    sheet.save(out_path, optimize=True)
    print(f"wrote {out_path} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    FOX.mkdir(exist_ok=True)
    build_sheet((KID,), FOX / "compare-kid.png")
    build_sheet((ADULT,), FOX / "compare-adult.png")