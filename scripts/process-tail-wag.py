#!/usr/bin/env python3
"""Tail-wag + egg-wobble: replace each stage's idle-1 with a tailed variant.

idle-0 = original (no change)
idle-1 = right half (tail region) shifted horizontally by +2 px on the canvas,
         creating a visible tail-wag/lean effect when alternating with idle-0.

Strategy:
- Find the rightmost non-transparent pixel column (tail tip).
- Crop a tail band from the right edge (width = tail thickness ~ 1/3 of sprite).
- Shift the band right by 2 px (with clipping) and paste back.
- Body (left 2/3) stays untouched so the cat's head/face don't move.

Egg:
- egg-idle-0: original AI-cropped egg
- egg-idle-1: same egg shifted right by 1 px (gentle wobble)

Run: /Users/wuruofan/.workbuddy/binaries/python/envs/default/bin/python scripts/process-tail-wag.py
"""
from PIL import Image
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites')


def load(name):
    return Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')


def save(name, im):
    p = os.path.join(SRC, name + '.png')
    im.save(p, optimize=True)
    print(f'  wrote {name}: {im.size}')


def find_content_bbox(im):
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    return (min_x, min_y, max_x, max_y)


def shift_right_band(im, band_start_x, shift, bg=(0, 0, 0, 0)):
    """Cut the right band from band_start_x to right edge, shift right by `shift`,
    paste back over a transparent canvas of the same size.
    Body to the left of band_start_x stays put.
    """
    w, h = im.size
    px = im.load()
    out = Image.new('RGBA', (w, h), bg)

    # Copy left part (body) as-is
    for y in range(h):
        for x in range(band_start_x):
            out.load()[x, y] = px[x, y]

    # Copy right band shifted by `shift` px
    new_px = out.load()
    for y in range(h):
        for x in range(band_start_x, w):
            r, g, b, a = px[x, y]
            if a > 0:
                nx = x + shift
                if 0 <= nx < w:
                    new_px[nx, y] = (r, g, b, a)
    return out


def main():
    print('=== tail wag + egg wobble ===')

    # Cat stages — each gets a tail-shifted idle-1
    for stage in ['cat-baby', 'cat-kid', 'cat-adult']:
        base = load(stage)
        bbox = find_content_bbox(base)
        min_x, min_y, max_x, max_y = bbox
        width = max_x - min_x + 1
        # Tail band = right 35% of the sprite's content width
        # Cut starts at min_x + round(width * 0.65)
        cut = min_x + round(width * 0.65)
        print(f'  {stage}: content bbox {bbox}, cut at x={cut}')
        idle1 = shift_right_band(base, cut, shift=2)
        save(stage + '-idle-1', idle1)

    # Egg — gentle wobble (full sprite shifts 1px right)
    egg = load('cat-egg')
    bbox = find_content_bbox(egg)
    min_x, _, max_x, _ = bbox
    cut = min_x  # whole sprite
    print(f'  cat-egg: content bbox {bbox}, cut at x={cut}')
    egg_idle1 = shift_right_band(egg, cut, shift=1)
    save('cat-egg-idle-1', egg_idle1)

    print('done ->', SRC)


if __name__ == '__main__':
    main()
