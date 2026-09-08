#!/usr/bin/env python3
"""Test whether mmx-generated soft-edge cartoon art can be pixelized
(quantized + NEAREST-scaled) into clean 36x38 / 44x48 pixel art that
still reads as a fox.

Steps per region (split the 16:9 reference into baby/kid/adult):
1. Crop the region's bounding box (with a small margin).
2. LANCZOS downscale to 8x the target (e.g. 288x304 for kid at 36x38).
3. PIL quantize to 16 colors with MEDIANCUT.
4. NEAREST downscale to final 36x38 / 44x48.
5. Save side-by-side comparison (before + after) at 12x for review.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SIDE = ROOT / "fox-ref-side_001.jpg"
SIDE_R = ROOT / "fox-ref-side-r_001.jpg"
FRONT = ROOT / "fox-ref-front_001.jpg"

# Region crops for the side view (16:9, three stances left to right).
# These are estimated from the rendered image; tune as needed.
SIDE_REGIONS = {
    # name : (x0, y0, x1, y1) in source 1280x720, target (w, h)
    "baby":  (( 60, 230,  330, 660), (36, 38)),
    "kid":   ((400, 130,  720, 660), (36, 38)),
    "adult": ((770,  40, 1170, 660), (44, 48)),
}

# Region crops for the side-right view (facing right).
SIDE_R_REGIONS = {
    "baby":  ((100, 350,  330, 640), (36, 38)),
    "kid":   ((430, 280,  660, 640), (36, 38)),
    "adult": ((770, 200, 1140, 640), (44, 48)),
}

FRONT_REGIONS = {
    "baby":  ((400, 380,  580, 690), (36, 38)),
    "kid":   ((680, 200,  920, 690), (36, 38)),
    "adult": ((960, 100, 1250, 690), (44, 48)),
}

# Fox color anchor palette (the species-signature colors from PALS).
FOX_PALETTE_HEX = [
    "#3d262b",  # INK outline
    "#000000",  # BLACK (paws, dark ear tip)
    "#e8a87c",  # fox-body kid (rust)
    "#c87a4c",  # fox-ear (dark orange)
    "#fff4e4",  # fox-accent kid (cream)
    "#f4b282",  # fox-body adult (brighter)
    "#d27c48",  # fox-ear adult
    "#fffaf0",  # fox-accent adult (bright white)
    "#9fb7ff",  # TEAR (blue)
    "#f48491",  # NOSE / PINK
    "#cf5269",  # NOSE dark
    "#ca8862",  # eye iris brown
    "#f0d090",  # background cream
    "#f8e4c4",  # background cream-light
    "#5a3a3a",  # dark brown
    "#000000",  # extra black for padding
]


def quantize_region(src_path, regions, label):
    """Quantize each region, save comparison strip."""
    src = Image.open(src_path).convert("RGBA")
    parts = []
    for name, ((x0, y0, x1, y1), (tw, th)) in regions.items():
        crop = src.crop((x0, y0, x1, y1))
        cw, ch = crop.size
        # Pad to square-ish, then LANCZOS to 8x target
        scale = 8
        big = crop.resize((tw * scale, th * scale), Image.LANCZOS)
        # Quantize to 16 colors
        # Build a 256-color palette image: fox anchors + zeros padding
        pal_flat = []
        for hex_color in FOX_PALETTE_HEX:
            r = int(hex_color[1:3], 16)
            g = int(hex_color[3:5], 16)
            b = int(hex_color[5:7], 16)
            pal_flat.extend([r, g, b])
        # Pad to 256 * 3 = 768
        pal_flat += [0] * (768 - len(pal_flat))
        pal_img = Image.new("P", (1, 1))
        pal_img.putpalette(pal_flat)
        # RGBA can't quantize directly — flatten onto cream background first
        bg = Image.new("RGB", big.size, (240, 230, 210))
        bg.paste(big, mask=big.split()[3] if big.mode == "RGBA" else None)
        big_rgb = bg
        # Quantize with this palette as the target
        q = big_rgb.quantize(palette=pal_img, dither=Image.Dither.NONE)
        # Convert back to RGBA so transparency is preserved
        q_rgba = q.convert("RGBA")
        # NEAREST to target
        final = q_rgba.resize((tw, th), Image.NEAREST)
        out_path = ROOT / f"fox-{name}-{label}-q-test.png"
        final.save(out_path)
        # Make a 12x magnified review version
        review = final.resize((tw * 12, th * 12), Image.NEAREST)
        # Side-by-side: original (left) + pixelized (right)
        original_mag = crop.resize((tw * 12, th * 12), Image.LANCZOS)
        cmp = Image.new("RGBA", (tw * 24 + 8, th * 12),
                        (240, 230, 210, 255))
        cmp.paste(original_mag, (0, 0))
        cmp.paste(review, (tw * 12 + 8, 0))
        cmp_path = ROOT / f"compare-{name}-{label}.png"
        cmp.save(cmp_path)
        parts.append((name, out_path, cmp_path))
    return parts


def main():
    print("=== Side view (ref-side_001.jpg) ===")
    parts = quantize_region(SIDE, SIDE_REGIONS, "side")
    for name, p, c in parts:
        print(f"  {name}: pixel={p.name}  compare={c.name}")
    print("\n=== Side view RIGHT (ref-side-r_001.jpg) ===")
    parts = quantize_region(SIDE_R, SIDE_R_REGIONS, "side-r")
    for name, p, c in parts:
        print(f"  {name}: pixel={p.name}  compare={c.name}")
    print("\n=== Front view (ref-front_001.jpg) ===")
    parts = quantize_region(FRONT, FRONT_REGIONS, "front")
    for name, p, c in parts:
        print(f"  {name}: pixel={p.name}  compare={c.name}")


if __name__ == "__main__":
    main()
