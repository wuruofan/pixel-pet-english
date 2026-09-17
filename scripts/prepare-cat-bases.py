#!/usr/bin/env python3
"""Prepare the three approved 2026-09-16 cat references, without generating poses.

Remove cyan background/shadow BEFORE palette reduction so the cream face never
merges with the background. Keep the largest foreground component (the cat),
fit it with room for the two-pixel hop, and quantize onto one shared palette.
Run cat-differential.py for the complete reproducible build.
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp-cat-concept' / 'mmx-retry'
OUTPUT = ROOT / 'assets' / 'sprite-bases'
PALETTE = [
    (255, 242, 213), (248, 223, 181),  # muzzle/chest, cream shadow
    (255, 194, 115), (248, 165, 66), (233, 137, 46),  # orange fur
    (197, 100, 37), (164, 76, 33),  # tabby stripes
    (246, 145, 139), (225, 111, 115), (196, 75, 91),  # ears/blush/nose
    (65, 42, 37), (255, 253, 244), (207, 190, 163),  # eyes/highlight/collar
]
STAGES = {
    'baby': ('cat-baby-minimal_001.jpg', (36, 38), (26, 29)),
    'kid': ('cat-kid-v2_003.jpg', (36, 38), (26, 32)),
    'adult': ('cat-adult-v2_001.jpg', (44, 48), (34, 41)),
}


def foreground(source):
    image = Image.open(source).convert('RGBA')
    w, h = image.size
    px = image.load()
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            cyan = g > r + 12 and b > r + 15 and max(g, b) > 95
            mask[y * w + x] = 0 if cyan else 1
    largest = []
    for start in range(w * h):
        if not mask[start]:
            continue
        mask[start] = 0
        queue = deque([start])
        component = []
        while queue:
            point = queue.popleft()
            component.append(point)
            x, y = point % w, point // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    index = ny * w + nx
                    if mask[index]:
                        mask[index] = 0
                        queue.append(index)
        if len(component) > len(largest):
            largest = component
    alpha = Image.new('L', (w, h))
    apx = alpha.load()
    for point in largest:
        apx[point % w, point // w] = 255
    image.putalpha(alpha)
    return image.crop(alpha.getbbox())


def prepare(stage):
    filename, size, fit = STAGES[stage]
    cat = foreground(SOURCE / filename)
    scale = min(fit[0] / cat.width, fit[1] / cat.height)
    target = (round(cat.width * scale), round(cat.height * scale))
    # Follow the handoff's 8x intermediate reduction and nearest-neighbor grid.
    cat = cat.resize((target[0] * 8, target[1] * 8), Image.Resampling.LANCZOS)
    cat = cat.resize(target, Image.Resampling.NEAREST)
    px = cat.load()
    for y in range(cat.height):
        for x in range(cat.width):
            r, g, b, a = px[x, y]
            if a < 150:
                px[x, y] = (0, 0, 0, 0)
            else:
                color = min(PALETTE, key=lambda c: sum((c[i] - (r, g, b)[i]) ** 2 for i in range(3)))
                px[x, y] = color + (255,)
    result = Image.new('RGBA', size)
    result.paste(cat, ((size[0] - cat.width) // 2, size[1] - 3 - cat.height))
    return result


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stage in STAGES:
        image = prepare(stage)
        image.save(OUTPUT / f'cat-{stage}-quantized.png')
        print(stage, image.size, image.getchannel('A').getbbox())


if __name__ == '__main__':
    main()
