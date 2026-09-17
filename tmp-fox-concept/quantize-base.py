#!/usr/bin/env python3
"""Pixelize the single-stage high-res base images (fox-kid-base, fox-adult-base)
into the target 36x38 / 44x48 sprite dimensions.

Steps:
1. Auto-detect the fox bounding box (largest non-background connected region).
2. Crop the bounding box with a small margin.
3. Resize to a square at 8x target (e.g. 288x304 for kid, 352x384 for adult)
   using LANCZOS.
4. Quantize to 16-color fox-anchor palette.
5. NEAREST-downscale to target dimensions.
6. Save the pixelized result and a 12x magnified review version.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent

# Fox color anchor palette (16 colors).
FOX_PALETTE_HEX = [
    "#3d262b",  # INK outline
    "#e8a87c",  # fox-body kid (rust)
    "#c87a4c",  # fox-ear kid (dark orange)
    "#fff4e4",  # fox-accent kid (cream)
    "#f4b282",  # fox-body adult (brighter)
    "#d27c48",  # fox-ear adult
    "#fffaf0",  # fox-accent adult (bright white)
    "#9fb7ff",  # TEAR (blue)
    "#f48491",  # PINK
    "#cf5269",  # NOSE dark
    "#ca8862",  # eye iris brown
    "#f0d090",  # background cream
    "#f8e4c4",  # background cream-light
    "#5a3a3a",  # dark brown
    "#1a1014",  # BLACK (deepest)
    "#000000",  # extra black
]

BASES = [
    # (path, target_size, name)
    (ROOT / "fox-kid-front_001.jpg",   (36, 38), "fox-kid"),
    (ROOT / "fox-adult-front_001.jpg", (44, 48), "fox-adult"),
    (ROOT / "fox-kid-walk_001.jpg",   (36, 38), "fox-kid-walk"),
    (ROOT / "fox-adult-walk_001.jpg", (44, 48), "fox-adult-walk"),
    (ROOT / "fox-kid-sleep_001.jpg",   (36, 38), "fox-kid-sleep"),
    (ROOT / "fox-adult-sleep_001.jpg", (44, 48), "fox-adult-sleep"),
]


def build_palette_img():
    pal_flat = []
    for hex_color in FOX_PALETTE_HEX:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        pal_flat.extend([r, g, b])
    pal_flat += [0] * (768 - len(pal_flat))
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(pal_flat)
    return pal_img


def detect_bbox(img, bg_color=(240, 224, 192), tolerance=20):
    """Return the bounding box of the largest region whose pixels differ
    from the background color by more than `tolerance` (sum-of-channel
    difference)."""
    arr = np.array(img.convert("RGB"))
    bg = np.array(bg_color)
    diff = np.abs(arr.astype(int) - bg.astype(int)).sum(axis=-1)
    mask = diff > tolerance * 3  # tolerance per channel
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def pixelize(src_path, target_size, name):
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    print(f"\n[{name}] source {w}x{h}, target {target_size}")
    # Detect fox bbox
    bbox = detect_bbox(img)
    print(f"  fox bbox (x0,y0,x1,y1): {bbox}")
    if not bbox:
        print("  no fox found!")
        return
    # Add margin (10% of bbox size)
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    mx = int(bw * 0.05)
    my = int(bh * 0.05)
    crop_box = (max(0, bbox[0] - mx), max(0, bbox[1] - my),
                min(w, bbox[2] + mx), min(h, bbox[3] + my))
    print(f"  crop with margin: {crop_box}")
    crop = img.crop(crop_box)
    cw, ch = crop.size
    # Make square (pad shorter side with background)
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (240, 224, 192, 255))
    square.paste(crop, ((side - cw) // 2, (side - ch) // 2))
    # Resize to 8x target
    big = square.resize((target_size[0] * 8, target_size[1] * 8),
                        Image.LANCZOS)
    # Flatten onto cream background
    bg = Image.new("RGB", big.size, (240, 224, 192))
    bg.paste(big, mask=big.split()[3] if big.mode == "RGBA" else None)
    # Quantize with ADAPTIVE palette (extract main colors from the actual
    # image — better than fixed palette for cartoon art with gradients).
    q = bg.quantize(colors=24, method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE)
    q_rgba = q.convert("RGBA")
    # NEAREST to target
    final = q_rgba.resize(target_size, Image.NEAREST)
    out = ROOT / f"{name}-v2-base.png"
    final.save(out)
    print(f"  wrote {out}")
    # Review: 12x magnified
    review = final.resize((target_size[0] * 12, target_size[1] * 12),
                          Image.NEAREST)
    review_path = ROOT / f"{name}-v2-base-12x.png"
    review.save(review_path)
    print(f"  wrote {review_path} (12x review)")


def main():
    for src, ts, name in BASES:
        pixelize(src, ts, name)


if __name__ == "__main__":
    main()
