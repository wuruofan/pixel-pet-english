#!/usr/bin/env python3
"""Scan the v5 pixelated fox base sprites (36x38 kid, 44x48 adult) and
extract the key-point coordinates we need for differential overlays:
- Eye centers + dimensions (black pupil clusters in the head region)
- Nose (single dark pixel cluster in the muzzle)
- Mouth (small dark cluster below the nose)
- Ear apex (topmost dark pixel)
- Chest V bounds (centered light-cream region)
- Paw bottom y (bottommost dark pixel)
- Tail bbox (orange cluster on the right side of the body)

These feed directly into FOX_EYES, FOX_FACE_SPECS, FOX_TAIL_BOX, FOX_PAW_BOX
in redraw-fox-local.py.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"

# Approximate fox color anchors from the pixelized output
INK = (29, 16, 20, 255)     # black pupil / outline
NOSE = (207, 82, 105, 255)  # pink nose (may or may not survive quantize)
WHITE = (255, 253, 247, 255)  # high-light, V chest

def is_ink(rgb, tol=50):
    return all(abs(int(rgb[i]) - INK[i]) < tol for i in range(3))


def is_dark(rgb, threshold=80):
    """Anything noticeably dark — used for eye/mouth pixels after quantize."""
    return sum(int(c) for c in rgb[:3]) < threshold * 3


def cluster_pixels(mask, min_size=2):
    """Group True pixels in mask into clusters using simple BFS.
    Returns list of (xs, ys, bbox) sorted by size descending."""
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    clusters = []
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not visited[sy, sx]:
                # BFS
                stack = [(sx, sy)]
                pts = []
                while stack:
                    x, y = stack.pop()
                    if x < 0 or y < 0 or x >= w or y >= h:
                        continue
                    if visited[y, x] or not mask[y, x]:
                        continue
                    visited[y, x] = True
                    pts.append((x, y))
                    stack.extend([(x+1, y), (x-1, y), (x, y+1), (x, y-1)])
                if len(pts) >= min_size:
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    clusters.append((xs, ys,
                                     (min(xs), min(ys), max(xs), max(ys))))
    clusters.sort(key=lambda c: -len(c[0]))
    return clusters


def scan_sprite(path, name, size):
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    print(f"\n=== {name} ({w}x{h}) ===")

    # Mask of dark pixels (eyes / mouth / outlines / nose / paws)
    rgb = arr[..., :3]
    sums = rgb.astype(int).sum(axis=-1)
    dark_mask = sums < 180  # any dark pixel

    # All clusters sorted by size
    clusters = cluster_pixels(dark_mask, min_size=1)
    print(f"  total dark clusters: {len(clusters)}")
    for i, (xs, ys, bb) in enumerate(clusters[:8]):
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        bw = bb[2] - bb[0] + 1
        bh = bb[3] - bb[1] + 1
        print(f"    #{i}: size={len(xs):3d}  center=({cx:.1f}, {cy:.1f})  bbox={bb} ({bw}x{bh})")

    # Heuristic: eyes are the two topmost clusters in the head (top half).
    # Find the topmost row that has a dark cluster and pick the 2 biggest
    # clusters whose center y < h/2.
    head_candidates = [c for c in clusters
                       if sum(c[1]) / len(c[1]) < h * 0.55 and len(c[0]) >= 2]
    print(f"  head-area candidates (cy < h*0.55, size>=2): {len(head_candidates)}")
    eyes = []
    if len(head_candidates) >= 2:
        # Pick the 2 largest symmetric clusters
        head_candidates.sort(key=lambda c: -len(c[0]))
        # Group clusters by y proximity (eyes should be on the same row)
        top_two = head_candidates[:2]
        top_two.sort(key=lambda c: sum(c[0]) / len(c[0]))  # left then right
        for xs, ys, bb in top_two:
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            eyes.append((int(round(cx)), int(round(cy)),
                         bb[2] - bb[0] + 1, bb[3] - bb[1] + 1))
        print(f"  → eyes: {eyes}")

    # Mouth / nose: clusters below the eye row
    if eyes:
        eye_y = sum(e[1] for e in eyes) / len(eyes)
        mouth_cands = [c for c in clusters
                       if sum(c[1]) / len(c[1]) > eye_y and len(c[0]) <= 6]
        if mouth_cands:
            mouth_cands.sort(key=lambda c: sum(c[1]) / len(c[1]))  # topmost
            xs, ys, bb = mouth_cands[0]
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            print(f"  → nose: ({cx:.0f}, {cy:.0f})  bbox={bb}")
            if len(mouth_cands) > 1:
                xs, ys, bb = mouth_cands[1]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                print(f"  → mouth: ({cx:.0f}, {cy:.0f})  bbox={bb}")

    # Ear apex: topmost dark pixel in left half + right half
    top_y = h
    for c in clusters:
        if c[1]:  # ys
            cy_min = min(c[1])
            if cy_min < top_y:
                top_y = cy_min
    print(f"  → topmost dark y: {top_y}")
    # Top dark pixels (any cluster touching y=top_y)
    for c in clusters:
        if min(c[1]) <= top_y + 1:
            xs = c[0]
            cx = sum(xs) / len(xs)
            cy = top_y
            print(f"    ear apex candidate: ({cx:.0f}, {cy})  size={len(xs)}")

    # Paw bottom: bottommost dark pixel
    bot_y = 0
    for c in clusters:
        if c[1]:
            cy_max = max(c[1])
            if cy_max > bot_y:
                bot_y = cy_max
    print(f"  → bottommost dark y: {bot_y}")

    # Chest V: find the cream/white-ish cluster in the body center
    # Cream colors are around (255, 244, 228) or (255, 250, 240)
    light_mask = (rgb[..., 0] > 240) & (rgb[..., 1] > 220) & (rgb[..., 2] > 200)
    light_clusters = cluster_pixels(light_mask, min_size=2)
    if light_clusters:
        # Filter to body center (cx around w/2, cy > h/3)
        body_center = [c for c in light_clusters
                       if abs(sum(c[0]) / len(c[0]) - w/2) < w * 0.25
                       and sum(c[1]) / len(c[1]) > h * 0.4]
        if body_center:
            body_center.sort(key=lambda c: -len(c[0]))
            xs, ys, bb = body_center[0]
            print(f"  → chest V (biggest light cluster in body): "
                  f"bbox={bb}  size={len(xs)}")


def main():
    scan_sprite(SPRITES / "fox-kid-v2.png", "fox-kid", (36, 38))
    scan_sprite(SPRITES / "fox-adult-v2.png", "fox-adult", (44, 48))


if __name__ == "__main__":
    main()
