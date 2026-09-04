#!/usr/bin/env python3
"""Per-stage idle frames: derive breathing pair for each cat stage.

The previous `cat-idle-0/1` was a single 43×48 frame (adult-scaled) used for ALL
stages — so a baby-stage pet would suddenly grow to adult size when going idle.

This script generates 6 stage-aware idle frames so drawPet can pick the right
size based on `stage`:
  cat-baby-idle-0 / cat-baby-idle-1   (28×24 source → breathing pair)
  cat-kid-idle-0  / cat-kid-idle-1    (29×31 source)
  cat-adult-idle-0/ cat-adult-idle-1   (43×48 source)

idle-1 is the breathing "B" frame: same source squashed 95% vertically,
bottom-aligned. idle-0 is the unchanged source.

The old `cat-idle-0.png` / `cat-idle-1.png` are deleted (superseded by
cat-adult-idle-0/1).

Run: /Users/wuruofan/.workbuddy/binaries/python/envs/default/bin/python scripts/process-stage-idle.py
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


def squash_vertical(im, factor):
    w, h = im.size
    new_h = max(1, round(h * factor))
    squashed = im.resize((w, new_h), Image.NEAREST)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(squashed, (0, h - new_h))
    return out


def main():
    print('=== stage-aware idle frames ===')
    stages = ['cat-baby', 'cat-kid', 'cat-adult']
    for stage in stages:
        im = load(stage)
        save(stage + '-idle-0', im.copy())
        save(stage + '-idle-1', squash_vertical(im, 0.95))

    # 删除旧的单一 idle（被 cat-adult-idle-* 取代）
    for old in ['cat-idle-0', 'cat-idle-1']:
        p = os.path.join(SRC, old + '.png')
        if os.path.exists(p):
            os.remove(p)
            print(f'  removed {old}')

    print('done ->', SRC)


if __name__ == '__main__':
    main()
