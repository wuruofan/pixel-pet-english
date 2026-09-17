#!/usr/bin/env python3
"""Approved cat references -> clean bases -> 87 reproducible production PNGs.

Sources: HANDOFF-2026-09-16-cat-mmx-base.md. The kid's collar is retained.
Face patches restore the skin UNDER each feature, rather than painting cream
rectangles over orange fur. Draw the face first, then move face/body together.
python3 -B scripts/cat-differential.py --preview-only  # no production writes
python3 -B scripts/cat-differential.py                 # bases, frames, preview
"""
import argparse
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / 'assets' / 'sprites'
BASES = ROOT / 'assets' / 'sprite-bases'
PREVIEW = ROOT / 'docs' / 'sprites' / 'cat-mmx-preview.png'
spec = importlib.util.spec_from_file_location('cat_bases', Path(__file__).with_name('prepare-cat-bases.py'))
bases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bases)

INK = (65, 42, 37, 255)
CREAM = (255, 242, 213, 255)
LIGHT = (255, 194, 115, 255)
FUR = (248, 165, 66, 255)
STRIPE = (197, 100, 37, 255)
PINK = (225, 111, 115, 255)
BLUSH = (246, 145, 139, 255)
WHITE = (255, 253, 244, 255)
BLUE = (119, 188, 233, 255)
BLUE_RIM = (72, 140, 193, 255)
GOLD = (255, 207, 91, 255)

# Measured on the final PNG grid. Orange under baby eyes, cream under kid eyes,
# and two different skin colors around adult eyes. Do not scale old anchors.
STAGES = {
    'baby': {'eyes': ((11, 15), (18, 15)), 'eye_size': 2,
             'nose': (15, 18), 'mouth': (15, 20), 'mouth_width': 3,
             'blush': ((10, 18), (19, 18)), 'face_box': (9, 14, 22, 22)},
    'kid': {'eyes': ((12, 16), (20, 16)), 'eye_size': 2,
            'nose': (16, 18), 'mouth': (16, 20), 'mouth_width': 4,
            'blush': ((10, 18), (23, 18)), 'face_box': (10, 15, 25, 22)},
    'adult': {'eyes': ((13, 18), (23, 18)), 'eye_size': 3,
              'nose': (19, 22), 'mouth': (19, 24), 'mouth_width': 5,
              'blush': ((12, 22), (25, 22)), 'face_box': (11, 17, 28, 27)},
}
POSES = {
    'idle-0': {}, 'idle-1': {'dy': -1},
    'blink': {'eyes': 'closed'},
    'droopy': {'eyes': 'lid', 'mouth': 'frown'},
    'eat-0': {},
    'eat-1': {'eyes': 'arc', 'mouth': 'open', 'dy': -1},
    'eat-2': {'mouth': 'crumbs', 'dy': 1},
    'excited-0': {'eyes': 'star', 'mouth': 'open', 'blush': True},
    'excited-1': {'eyes': 'star', 'mouth': 'open', 'blush': True, 'dy': -2},
    'excited-2': {'eyes': 'star', 'mouth': 'open', 'blush': True, 'dy': -1},
    'grunt-0': {'eyes': 'squeeze', 'mouth': 'frown', 'blush': True},
    'grunt-1': {'eyes': 'squeeze', 'mouth': 'tiny', 'blush': True, 'dy': 1},
    'happy-0': {'eyes': 'arc', 'blush': True, 'dy': 1},
    'happy-1': {'eyes': 'arc', 'blush': True, 'dy': -2},
    'happy-2': {'eyes': 'arc', 'blush': True},
    'sad-0': {'mouth': 'frown', 'tear': 0},
    'sad-1': {'mouth': 'frown', 'tear': 1},
    'sleep-0': {'eyes': 'closed', 'mouth': 'tiny', 'zz': 0},
    'sleep-1': {'eyes': 'closed', 'mouth': 'tiny', 'zz': 1},
    **{f'walk-{i}': {'dy': dy} for i, dy in enumerate((0, -2, -1, 0, 1, -1, 0))},
    'wash-0': {'eyes': 'arc', 'bubbles': 'R'},
    'wash-1': {'eyes': 'arc', 'bubbles': 'L'},
}


def clean_face(stage, image):
    image = image.copy()
    d = ImageDraw.Draw(image)
    px = image.load()
    # Quantized cyan fringes can become taupe. Keep the kid's actual collar.
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y] == (207, 190, 163, 255) and not (stage == 'kid' and y == 23):
                neighbors = [px[nx, ny] for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))
                             if 0 <= nx < image.width and 0 <= ny < image.height]
                px[x, y] = CREAM if any(c in (CREAM, WHITE) for c in neighbors) else (LIGHT if stage == 'baby' else FUR)
    if stage == 'baby':
        d.rectangle((10, 14, 12, 16), fill=LIGHT)
        d.rectangle((18, 14, 20, 16), fill=LIGHT)
        d.rectangle((11, 17, 19, 20), fill=CREAM)
    elif stage == 'kid':
        d.rectangle((11, 16, 14, 18), fill=CREAM)
        d.rectangle((19, 16, 22, 18), fill=CREAM)
        d.rectangle((14, 18, 19, 21), fill=CREAM)
        d.rectangle((9, 19, 13, 20), fill=CREAM)
        d.rectangle((21, 19, 25, 20), fill=CREAM)
    else:
        # Original eyes and their white/red halos: orange above the muzzle,
        # cream below it. One fill color across both coat regions leaves blocks.
        d.rectangle((11, 17, 16, 20), fill=FUR)
        d.rectangle((21, 17, 26, 20), fill=FUR)
        d.rectangle((11, 21, 13, 21), fill=FUR)
        d.rectangle((14, 21, 15, 21), fill=CREAM)
        d.rectangle((16, 21, 20, 21), fill=FUR)
        d.rectangle((21, 21, 23, 21), fill=CREAM)
        d.rectangle((24, 21, 26, 21), fill=FUR)
        d.rectangle((16, 22, 22, 25), fill=CREAM)
        # Isolated red generator noise on the outer whisker / between legs.
        for y in range(14, image.height):
            for x in range(image.width):
                if px[x, y] in (PINK, BLUSH, (196, 75, 91, 255)):
                    px[x, y] = STRIPE if x < 12 else CREAM
    return image


def draw_face(image, stage, pose):
    f = STAGES[stage]
    d = ImageDraw.Draw(image)
    n = f['eye_size']
    state = pose.get('eyes', 'open')
    for index, (x, y) in enumerate(f['eyes']):
        if state == 'open':
            d.rectangle((x, y, x+n-1, y+n-1), fill=INK)
            d.point((x, y), fill=WHITE)
        elif state == 'closed':
            d.line((x, y+1, x+n-1, y+1), fill=INK)
        elif state == 'lid':
            d.line((x, y+1, x+n-1, y+1), fill=INK)
            d.point((x+n-1, y+2), fill=INK)
        elif state == 'arc':
            if n == 2:
                points = [(x,y+1),(x+1,y)] if index == 0 else [(x,y),(x+1,y+1)]
                d.line(points, fill=INK)
            else:
                d.line([(x, y+1), (x+1, y), (x+2, y+1)], fill=INK)
        elif state == 'squeeze':
            sx = 1 if index == 0 else -1
            x0 = x if index == 0 else x+n-1
            points = [(x0,y-1),(x0+sx,y),(x0+sx,y+1),(x0,y+2)] if n == 2 else [
                (x0,y),(x0+sx,y+1),(x0,y+2)]
            d.line(points, fill=INK)
        elif state == 'star':
            if n == 2:
                # Four pixels keep the same half-pixel center as a 2px eye.
                d.rectangle((x,y-1,x+1,y+2), fill=INK)
                d.rectangle((x-1,y,x+2,y+1), fill=INK)
                d.rectangle((x,y,x+1,y+1), fill=GOLD)
            else:
                d.line((x+1, y, x+1, y+2), fill=INK)
                d.line((x, y+1, x+2, y+1), fill=INK)
                d.point((x+1, y+1), fill=GOLD)
    nx, ny = f['nose']
    d.line((nx, ny, nx+(stage == 'kid'), ny), fill=PINK)
    mx, my = f['mouth']
    width = f['mouth_width']
    left = mx - (width-1)//2
    right = left + width-1
    mid_right = mx + (width % 2 == 0)
    mouth = pose.get('mouth', 'smile')
    if mouth == 'tiny':
        d.point((mx, my), fill=INK)
    elif mouth == 'frown':
        d.line([(left, my+1), (mx, my), (mid_right,my), (right, my+1)], fill=INK)
    elif mouth == 'open':
        d.rectangle((left, my, right, my+1), fill=INK)
        d.line((mx, my+1, mid_right,my+1), fill=PINK)
    else:
        d.line([(left, my), (mx, my+1), (mid_right,my+1), (right, my)], fill=INK)
        if mouth == 'crumbs':
            for dx, dy in ((-3,0),(3,0),(-2,2),(2,2)):
                d.point((mx+dx, my+dy), fill=STRIPE)
    if pose.get('blush'):
        for x, y in f['blush']:
            d.rectangle((x, y, x+1, y+1), fill=BLUSH)
    if 'tear' in pose:
        for x, y in f['eyes']:
            ty = y+n+pose['tear']
            d.line((x, ty, x, ty+1), fill=BLUE)


def bubbles(image, side):
    d = ImageDraw.Draw(image)
    w, h = image.size
    spots = [(w-5,4,3),(w-3,10,2),(w-6,16,3),(w-3,22,2),(w-5,28,3)] if side == 'R' else [
        (1,5,3),(3,11,2),(1,16,3),(3,23,2),(1,28,3)]
    for x, y, n in spots:
        d.rectangle((x,y,x+n-1,y+n-1), fill=BLUE_RIM)
        d.point((x,y), fill=WHITE)
        d.point((x+1,y+1), fill=BLUE)
        if n == 3:
            d.point((x+1,y), fill=BLUE)
            d.point((x+2,y+1), fill=BLUE)


def sleepy(image, phase):
    d = ImageDraw.Draw(image)
    x, y = image.width-5, 7-phase
    d.line([(x,y),(x+3,y),(x,y+3),(x+3,y+3)], fill=INK)
    # Keep the small Z outside the kid's wider right ear/cheek as well.
    x, y = image.width-4, 14-phase
    d.line([(x,y),(x+1,y),(x,y+2),(x+1,y+2)], fill=INK)


def render_frame(base, stage, pose):
    image = base.copy()
    draw_face(image, stage, pose)
    dy = pose.get('dy', 0)
    if dy:
        shifted = Image.new('RGBA', image.size)
        shifted.paste(image, (0,dy))
        assert sum(a == 255 for a in image.getchannel('A').getdata()) == sum(
            a == 255 for a in shifted.getchannel('A').getdata()), (stage, pose, 'clipped hop')
        image = shifted
    if 'bubbles' in pose:
        bubbles(image, pose['bubbles'])
    if 'zz' in pose:
        sleepy(image, pose['zz'])
    return image


def preview(rows):
    poses = ('idle-0','blink','happy-1','excited-1','eat-1','sad-1','sleep-1','wash-0','wash-1','walk-1')
    cell_w, cell_h = 156, 192
    sheet = Image.new('RGB', (cell_w*len(poses), cell_h*3+36), (246, 240, 226))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(poses):
        d.text((i*cell_w+12, 12), name, fill=INK[:3])
    for row, (stage, base) in enumerate(rows.items()):
        for col, name in enumerate(poses):
            image = render_frame(base, stage, POSES[name])
            canvas = Image.new('RGBA', (48,48))
            canvas.paste(image, ((48-image.width)//2,48-image.height))
            canvas = canvas.resize((144,144), Image.Resampling.NEAREST)
            x, y = col*cell_w+6, row*cell_h+40
            sheet.paste(canvas,(x,y),canvas)
            d.text((x+8,y+153),stage,fill=INK[:3])
    sheet.save(PREVIEW)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-only', action='store_true')
    args = parser.parse_args()
    BASES.mkdir(parents=True,exist_ok=True)
    rows = {}
    for stage in STAGES:
        original = bases.prepare(stage)
        original.save(BASES/f'cat-{stage}-quantized.png')
        clean = clean_face(stage,original)
        clean.save(BASES/f'cat-{stage}-clean.png')
        rows[stage] = clean
        if not args.preview_only:
            render_frame(clean,stage,{}).save(SPRITES/f'cat-{stage}-v2.png')
            for name, pose in POSES.items():
                render_frame(clean,stage,pose).save(SPRITES/f'cat-{stage}-v2-{name}.png')
        print(f'{stage}: {clean.width}x{clean.height}, base + {len(POSES)} poses')
    preview(rows)
    print('preview:', PREVIEW.relative_to(ROOT))


if __name__ == '__main__':
    main()
