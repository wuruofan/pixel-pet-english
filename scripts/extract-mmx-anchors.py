#!/usr/bin/env python3
"""Extract key-point coordinates from the mmx 1024x1024 high-res fox
reference images. This works on the un-quantized output where dark
pixels are still distinct from light pixels.

Strategy:
- Find dark clusters (eyes, nose, mouth, paws) by RGB-sum threshold
- Find light clusters (chest V, white muzzle) by RGB-max threshold
- Group by region (head, muzzle, body, foot) using the cluster center
- Output coordinates scaled to the target sprite size (36x38 or 44x48)

The output is a draft for FOX_EYES / FOX_FACE_SPECS / FOX_PAW_BOX that
the human (or this script with feedback) refines.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
TMP = ROOT.parent / "tmp-fox-concept"
TARGETS = {
    "kid":   (36, 38),
    "adult": (44, 48),
}
SOURCES = {
    # mmx source path, target stage
    "kid":   (TMP / "fox-kid-front_001.jpg",   (36, 38)),
    "adult": (TMP / "fox-adult-front_001.jpg", (44, 48)),
    "kid-walk":   (TMP / "fox-kid-walk_001.jpg",   (36, 38)),
    "adult-walk": (TMP / "fox-adult-walk_001.jpg", (44, 48)),
    "kid-sleep":   (TMP / "fox-kid-sleep_001.jpg",   (36, 38)),
    "adult-sleep": (TMP / "fox-adult-sleep_001.jpg", (44, 48)),
}


def is_dark(rgb, thresh=200):
    return sum(int(c) for c in rgb[:3]) < thresh * 3


def is_very_dark(rgb, thresh=130):
    return sum(int(c) for c in rgb[:3]) < thresh * 3


def is_orange(rgb):
    r, g, b = rgb[:3]
    return r > 200 and 100 < g < 200 and b < 130


def is_light(rgb):
    r, g, b = rgb[:3]
    return r > 240 and g > 220 and b > 200


def cluster_pixels(mask, min_size=3):
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not visited[sy, sx]:
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
                    out.append((xs, ys,
                                (min(xs), min(ys), max(xs), max(ys))))
    out.sort(key=lambda c: -len(c[0]))
    return out


def find_dark_clusters(arr):
    rgb = arr[..., :3]
    sums = rgb.astype(int).sum(axis=-1)
    dark_mask = sums < 200
    return cluster_pixels(dark_mask, min_size=3)


def find_very_dark(arr):
    rgb = arr[..., :3]
    sums = rgb.astype(int).sum(axis=-1)
    mask = sums < 120
    return cluster_pixels(mask, min_size=2)


def find_light_clusters(arr):
    rgb = arr[..., :3]
    mask = (rgb[..., 0] > 240) & (rgb[..., 1] > 220) & (rgb[..., 2] > 200)
    return cluster_pixels(mask, min_size=10)


def fmt_cluster(c, scale_x, scale_y):
    xs, ys, bb = c
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    sx, sy = bb[0] * scale_x, bb[1] * scale_y
    ex, ey = bb[2] * scale_x, bb[3] * scale_y
    return (cx * scale_x, cy * scale_y,
            round(sx), round(sy), round(ex), round(ey),
            len(xs))


def main():
    for stage, (path, target) in SOURCES.items():
        if not path.exists():
            print(f"\n[{stage}] SKIP: {path} not found")
            continue
        img = Image.open(path).convert("RGBA")
        arr = np.array(img)
        h, w = arr.shape[:2]
        tw, th = target
        sx_scale = tw / w
        sy_scale = th / h
        print(f"\n=== {stage} ===")
        print(f"  source: {w}x{h}  target: {tw}x{th}  scale: {sx_scale:.4f} / {sy_scale:.4f}")

        # All dark clusters (sorted by size)
        dark = find_dark_clusters(arr)
        very_dark = find_very_dark(arr)
        light = find_light_clusters(arr)

        # Split dark into head (top half) and body (bottom half)
        head_dark = [c for c in dark if sum(c[1]) / len(c[1]) < h * 0.6]
        body_dark = [c for c in dark if sum(c[1]) / len(c[1]) >= h * 0.6]
        print(f"  dark clusters: {len(dark)}  head: {len(head_dark)}  body: {len(body_dark)}")
        print(f"  very_dark: {len(very_dark)}  light: {len(light)}")

        # Top 10 dark clusters (head + body)
        print("  Top dark clusters (center scaled to target):")
        for i, c in enumerate(dark[:10]):
            cx, cy, sx, sy, ex, ey, n = fmt_cluster(c, sx_scale, sy_scale)
            print(f"    #{i}: center=({cx:5.1f}, {cy:5.1f})  bbox=({sx},{sy})-({ex},{ey})  n={n}")

        # Top 5 light clusters
        print("  Top light clusters (chest V / white muzzle / tail tip):")
        for i, c in enumerate(light[:5]):
            cx, cy, sx, sy, ex, ey, n = fmt_cluster(c, sx_scale, sy_scale)
            print(f"    #{i}: center=({cx:5.1f}, {cy:5.1f})  bbox=({sx},{sy})-({ex},{ey})  n={n}")


if __name__ == "__main__":
    main()
