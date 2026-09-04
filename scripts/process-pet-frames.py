#!/usr/bin/env python3
"""Process GPT-generated cat sprite sheet into game-ready PNG frames.

Source: gpt-assets/ChatGPT Image 2026年9月4日 00_35_05.png (1536x1024, transparent bg).
Cuts auto-detected frame boxes, resamples to a UNIFORM scale so the cat keeps
consistent physical size across poses (adult standing = 48px tall reference),
and writes assets/sprites/<name>.png for build.js to embed as dataURLs.

Run: /Users/meow/.workbuddy/binaries/python/envs/default/bin/python scripts/process-pet-frames.py
"""
from PIL import Image
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'gpt-assets', 'ChatGPT Image 2026年9月4日 00_35_05.png')
OUT = os.path.join(ROOT, 'assets', 'sprites')

# frame boxes from auto-slicing (see .workbuddy/tmp/gpt-frames/boxes2.json)
BOXES = {
    'cat-baby':   [292, 172, 416, 280],   # f01 baby sitting
    'cat-kid':    [518, 144, 648, 280],   # f02 kid standing
    'cat-adult':  [988, 66, 1182, 284],   # f09 adult standing (largest stage)
    'cat-walk-0': [64, 526, 214, 638],
    'cat-walk-1': [272, 524, 408, 638],
    'cat-walk-2': [464, 520, 614, 638],
    'cat-walk-3': [674, 520, 826, 640],
    'cat-walk-4': [884, 520, 1052, 640],
    'cat-walk-5': [1114, 518, 1280, 640],
    'cat-walk-6': [1324, 518, 1484, 640],
    'cat-eat':    [1188, 734, 1316, 840], # f40 eating from bowl
    'cat-sleep':  [1358, 688, 1498, 836], # f41 curled asleep with zzz
    'cat-happy':  [1040, 690, 1164, 830], # f39 sitting big smile
    'cat-big':    [692, 682, 810, 838],   # f36 paw raised (excited)
}

REF_H = 220.0        # adult source height
TARGET_H = 48        # adult rendered height -> uniform scale for ALL frames
SCALE = TARGET_H / REF_H

im = Image.open(SRC).convert('RGBA')
os.makedirs(OUT, exist_ok=True)
for name, b in sorted(BOXES.items()):
    x0, y0, x1, y1 = max(0, b[0] - 2), max(0, b[1] - 2), min(im.width, b[2] + 2), min(im.height, b[3] + 2)
    f = im.crop((x0, y0, x1, y1))
    tw = max(1, round(f.width * SCALE))
    th = max(1, round(f.height * SCALE))
    f = f.resize((tw, th), Image.NEAREST)
    # quantize to shrink (keeps alpha, adaptive palette)
    f.quantize(colors=64, method=Image.FASTOCTREE).save(os.path.join(OUT, name + '.png'), optimize=True)
    print(f'{name}: {tw}x{th}')
print('done ->', OUT)
