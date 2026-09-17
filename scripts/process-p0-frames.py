#!/usr/bin/env python3
"""Generate P0 multi-frame sprite variants from existing single-frame PNGs.

P0 frames (11 total):
  cat-idle-0, cat-idle-1     <- derived from cat-adult (breathing A/B)
  cat-blink                  <- cat-adult with eyes drawn as horizontal lines
  cat-eat-0..2               <- derived from cat-eat (head bobbing)
  cat-sleep-0..1             <- derived from cat-sleep (slight shift)
  cat-happy-0..2             <- derived from cat-happy (vertical bounce)

All output is bottom-aligned at the same canvas size as the source
(48 px tall ref), so they slot straight into drawPet / PET_FRAMES.

Run: /Users/wuruofan/.workbuddy/binaries/python/envs/default/bin/python scripts/process-p0-frames.py
"""
from PIL import Image
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites')
OUT = SRC  # overwrite/add in place


def load(name):
    return Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')


def save(name, im):
    p = os.path.join(OUT, name + '.png')
    im.save(p, optimize=True)
    print(f'  wrote {name}: {im.size}')


def shift_vertical(im, dy):
    """Shift image up by dy px (positive dy = up), bottom-aligned."""
    w, h = im.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if dy >= 0:
        out.paste(im.crop((0, 0, w, h - dy)), (0, 0))
    else:
        out.paste(im.crop((0, -dy, w, h)), (0, 0))
    return out


def squash_vertical(im, factor):
    """Squash height by factor (0<factor<1 = shorter), bottom-aligned, NEAREST."""
    w, h = im.size
    new_h = max(1, round(h * factor))
    squashed = im.resize((w, new_h), Image.NEAREST)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(squashed, (0, h - new_h))
    return out


def close_eyes(im):
    """Erase the eye dots and draw a thin horizontal line for closed-eye look.
    Eye positions inferred from cat-adult.png pixel inspection (43x48).
    """
    px = im.load()
    cream = (255, 246, 234, 255)   # #fff6ea face cream
    line = (58, 42, 31, 255)        # #3a2a1f outline
    # Bounding boxes (y, x0, x1)
    eye_boxes = [
        (17, 20, 8, 13),    # left eye y range + x range
        (17, 20, 19, 24),   # right eye
    ]
    for y0, y1, x0, x1 in eye_boxes:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1):
                r, g, b, a = px[x, y]
                if a > 0:
                    px[x, y] = cream
    # Draw squint line at y=18 (vertical center of eye box)
    for x0, x1 in [(8, 13), (19, 24)]:
        for x in range(x0, x1):
            r, g, b, a = px[x, 18]
            if a > 0:
                px[x, 18] = line
    return im


def main():
    print('=== P0 frame derivation ===')

    # 1. idle-0 / idle-1: breathing (full size vs squashed 95%)
    adult = load('cat-adult')
    save('cat-idle-0', adult.copy())
    save('cat-idle-1', squash_vertical(adult, 0.95))

    # 2. blink: draw horizontal line over each eye on cat-adult
    blink = adult.copy()
    close_eyes(blink)
    save('cat-blink', blink)

    # 3. eat-0..2: head-bob (shift up 0/1/2 px) over cat-eat
    eat = load('cat-eat')
    save('cat-eat-0', eat.copy())
    save('cat-eat-1', shift_vertical(eat, 1))
    save('cat-eat-2', shift_vertical(eat, 2))

    # 4. sleep-0..1: subtle breath shift
    slp = load('cat-sleep')
    save('cat-sleep-0', slp.copy())
    save('cat-sleep-1', shift_vertical(slp, 1))

    # 5. happy-0..2: vertical bounce (0 / 2 / 4 px up)
    hap = load('cat-happy')
    save('cat-happy-0', hap.copy())
    save('cat-happy-1', shift_vertical(hap, 2))
    save('cat-happy-2', shift_vertical(hap, 4))

    print('done ->', OUT)


if __name__ == '__main__':
    main()
