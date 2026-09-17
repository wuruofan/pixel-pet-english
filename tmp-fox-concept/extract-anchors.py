#!/usr/bin/env python3
"""Extract key-point pixel coordinates from the mmx-generated fox reference
images (front + side) and print them in a format that's easy to paste into
FOX_EYES / FOX_FACE_SPECS / FOX_TAIL_BOX / FOX_PAW_BOX.

Strategy:
- Front view: detect left/right eye centers (dark pixel cluster), nose tip
  (dark pixel below eyes), mouth (dark pixel below nose), ear apex (top
  dark pixels), chest V apex (lightest white pixels in chest area).
- Side view: detect eye (single dark cluster), muzzle, ear, leg bottom
  (dark pixels at canvas bottom), tail S-curve (rightmost orange curve).
- All coords are in the original 1024x source space; we divide by a
  target-scale factor (36 or 44) to get final sprite coordinates.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent
FRONT = ROOT / "fox-ref-front_001.jpg"
SIDE = None  # filled once side image lands


def load_rgba(path):
    """Load image, return RGBA array + the split regions for baby/kid/adult.

    For the 16:9 front reference (1280x720), the three stages are spread
    across the bottom 2/3 of the image at roughly: 0-25% (baby), 30-55%
    (kid), 60-95% (adult). We slice horizontally into three bounding
    boxes based on the egg-shape that anchors the leftmost (baby) region.
    """
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    h, w, _ = arr.shape
    return img, arr, w, h


def find_eye_centers(arr, x0, x1, y0, y1):
    """In the given crop, find dark pixel clusters that are likely eyes
    (very dark, surrounded by light skin). Return list of (cx, cy, w, h)."""
    crop = arr[y0:y1, x0:x1]
    # Eye pixels are very dark (RGB sum < 200)
    rgb_sum = crop[..., :3].sum(axis=-1)
    mask = rgb_sum < 180
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return []
    # Cluster via simple x-binning: pixels within 30px of each other share cluster
    clusters = []
    order = np.argsort(xs)
    for i in order:
        x, y = int(xs[i]), int(ys[i])
        if clusters and abs(x - clusters[-1][0][-1]) < 30:
            clusters[-1][0].append(x)
            clusters[-1][1].append(y)
        else:
            clusters.append(([x], [y]))
    out = []
    for xs_, ys_ in clusters:
        if len(xs_) < 8:  # too small to be an eye
            continue
        cx = sum(xs_) / len(xs_) + x0
        cy = sum(ys_) / len(ys_) + y0
        w_ = max(xs_) - min(xs_) + 1
        h_ = max(ys_) - min(ys_) + 1
        out.append((cx, cy, w_, h_, len(xs_)))
    return out


def find_nose(arr, x0, x1, y0, y1, eye_y):
    """Nose is the darkest cluster below eye_y in the muzzle x-range."""
    crop = arr[y0:y1, x0:x1]
    rgb_sum = crop[..., :3].sum(axis=-1)
    mask = rgb_sum < 120
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    # Restrict to rows below the eye row
    keep = ys > (eye_y - y0)
    xs, ys = xs[keep], ys[keep]
    if len(xs) == 0:
        return None
    cx = sum(xs) / len(xs) + x0
    cy = sum(ys) / len(ys) + y0
    return (cx, cy)


def find_ear_apex(arr, x0, x1, y0, y1):
    """Ear apex = topmost dark pixel cluster in the ear x-range
    (upper 1/3 of the crop)."""
    crop = arr[y0:y1, x0:x1]
    h = crop.shape[0]
    upper = crop[:h // 3]
    rgb_sum = upper[..., :3].sum(axis=-1)
    mask = rgb_sum < 250  # anything not background-cream
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    apex_y = min(ys)
    # Average x of all pixels at apex_y (within 4px)
    keep = ys <= apex_y + 4
    cx = sum(xs[keep]) / sum(keep) + x0
    cy = apex_y + y0
    return (cx, cy)


def find_paw_bottom(arr, x0, x1, y0, y1):
    """Paw bottom = bottommost dark/black pixel cluster (legs/paws)."""
    crop = arr[y0:y1, x0:x1]
    h = crop.shape[0]
    lower = crop[h * 3 // 4:]  # bottom quarter
    rgb_sum = lower[..., :3].sum(axis=-1)
    # Black paws have very low RGB
    mask = rgb_sum < 150
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    bot_y = max(ys)
    keep = ys >= bot_y - 4
    cx = sum(xs[keep]) / sum(keep) + x0
    cy = bot_y + y0
    return (cx, cy)


def main():
    print("=== Front view (ref-front_001.jpg) ===")
    img, arr, w, h = load_rgba(FRONT)
    print(f"Image size: {w}x{h}")
    # The four creatures sit on a roughly horizontal line. Estimate regions:
    # egg-shape (leftmost, ~10% wide) is the baby. The three foxes spread
    # from 25% to 95% of width. Adult is rightmost, biggest.
    regions = {
        "baby":  (int(w * 0.30), int(w * 0.50), int(h * 0.35), int(h * 0.95)),
        "kid":   (int(w * 0.52), int(w * 0.72), int(h * 0.25), int(h * 0.95)),
        "adult": (int(w * 0.74), int(w * 0.98), int(h * 0.15), int(h * 0.95)),
    }
    for stage, (x0, x1, y0, y1) in regions.items():
        print(f"\n[{stage}] crop x={x0}-{x1}, y={y0}-{y1}")
        # Eye centers (front view has TWO eyes)
        eyes = find_eye_centers(arr, x0, x1, y0, y1)
        print(f"  eyes (cx, cy, w, h, npx): {eyes}")
        if eyes:
            # Sort by y, take top 2 (most likely the eyes)
            eyes.sort(key=lambda e: e[1])
            top_two = eyes[:2]
            top_two.sort(key=lambda e: e[0])  # left then right
            lx, ly, lw, lh, _ = top_two[0]
            rx, ry, rw, rh, _ = top_two[1]
            print(f"    L eye: cx={lx:.0f} cy={ly:.0f} w={lw} h={lh}")
            print(f"    R eye: cx={rx:.0f} cy={ry:.0f} w={rw} h={rh}")
            eye_y = (ly + ry) / 2
            # Nose
            muzzle_x0 = x0 + int((x1 - x0) * 0.30)
            muzzle_x1 = x0 + int((x1 - x0) * 0.70)
            nose = find_nose(arr, muzzle_x0, muzzle_x1, int(eye_y), y1, eye_y)
            if nose:
                print(f"    nose: cx={nose[0]:.0f} cy={nose[1]:.0f}")
            # Ear apex (use left ear x-range as a proxy)
            ear_x0 = x0 + int((x1 - x0) * 0.20)
            ear_x1 = x0 + int((x1 - x0) * 0.40)
            ear_apex = find_ear_apex(arr, ear_x0, ear_x1, y0, y0 + int((y1 - y0) * 0.5))
            if ear_apex:
                print(f"    L ear apex: cx={ear_apex[0]:.0f} cy={ear_apex[1]:.0f}")
        # Paw bottom
        paw = find_paw_bottom(arr, x0, x1, y0, y1)
        if paw:
            print(f"  paw bottom: cx={paw[0]:.0f} cy={paw[1]:.0f}")

    if SIDE:
        print("\n=== Side view ===")
        # Side view extraction is similar but expects one eye, one ear, one
        # leg, one tail. Same function calls.
        img, arr, w, h = load_rgba(SIDE)
        print(f"Image size: {w}x{h}")
        # TODO once side image lands.


if __name__ == "__main__":
    main()
