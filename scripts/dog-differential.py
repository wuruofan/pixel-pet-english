#!/usr/bin/env python3
"""Golden retriever references -> clean bases -> 87 reproducible production PNGs.

Sources: HANDOFF-2026-09-17-dog-redesign.md. Original AI PNGs are retained.
Face patches restore the skin UNDER each feature, rather than painting cream
rectangles over orange fur. Draw the face first, then move face/body together.
python3 -B scripts/dog-differential.py --preview-only  # no production writes
python3 -B scripts/dog-differential.py                 # bases, frames, preview
"""
import argparse
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / 'assets' / 'sprites'
BASES = ROOT / 'assets' / 'sprite-bases'
PREVIEW = ROOT / 'docs' / 'sprites' / 'dog-redesign-preview.png'
spec = importlib.util.spec_from_file_location('dog_bases', Path(__file__).with_name('prepare-dog-bases.py'))
bases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bases)

INK = (44, 27, 22, 255)
NOSE = (110, 66, 45, 255)
CREAM = (255, 241, 211, 255)
CREAM_SHADOW = (248, 215, 166, 255)
LIGHT = (255, 207, 120, 255)
FUR = (255, 184, 82, 255)
ADULT_FUR = (249, 169, 58, 255)
STRIPE = (207, 113, 31, 255)
PINK = (225, 111, 115, 255)
BLUSH = (246, 161, 131, 255)
WHITE = (255, 253, 244, 255)
BLUE = (119, 188, 233, 255)
BLUE_RIM = (72, 140, 193, 255)
GOLD = (255, 207, 91, 255)

# Coordinates measured on each selected, quantized reference. The baby/kid
# have a half-pixel face axis, so their noses and smiles use an even width.
STAGES = {
    'baby': {'eyes': ((13,15),(21,15)), 'eye_size': 2,
             'nose': (17,18), 'nose_width': 2, 'mouth': (17,20),
             'mouth_width': 4, 'blush': ((14,19),(20,19))},
    'kid': {'eyes': ((12,13),(21,13)), 'eye_size': 3,
            'nose': (17,17), 'nose_width': 2, 'mouth': (17,19),
            'mouth_width': 4, 'blush': ((12,18),(22,18))},
    'adult': {'eyes': ((14,13),(24,13)), 'eye_size': 3,
              'nose': (19,18), 'nose_width': 3, 'mouth': (20,20),
              'mouth_width': 5, 'blush': ((15,19),(24,19))},
}
FACE_PATCHES = {
    'baby': [((12,14,15,16),LIGHT),((20,14,23,16),LIGHT),
             ((16,17,19,19),CREAM),((15,19,21,21),CREAM)],
    'kid': [((12,13,14,15),LIGHT),((20,13,23,15),LIGHT),
            ((15,16,20,19),CREAM),((11,17,13,18),CREAM_SHADOW),
            ((22,17,24,18),CREAM_SHADOW)],
    'adult': [((13,13,17,16),ADULT_FUR),((23,13,27,16),ADULT_FUR),
              ((18,17,22,20),CREAM),((17,20,24,21),CREAM)],
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
    """Restore coat beneath the reference face before drawing pixel expressions."""
    image = image.copy()
    d = ImageDraw.Draw(image)
    for box, color in FACE_PATCHES[stage]:
        assert all(image.getpixel((x,y))[3] == 255
                   for y in range(box[1],box[3]+1)
                   for x in range(box[0],box[2]+1)), (stage, 'face patch outside body', box)
        d.rectangle(box, fill=color)
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
    d.line((nx, ny, nx+f['nose_width']-1, ny), fill=NOSE)
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


def decoration_clear(image, box):
    """Reserve a transparent pixel around each prop, including diagonal touches."""
    x,y,w,h = box
    if min(x,y) < 1 or x+w >= image.width or y+h >= image.height:
        return False
    return not image.getchannel('A').crop((x-1,y-1,x+w+1,y+h+1)).getbbox()


def bubbles(image, side):
    d = ImageDraw.Draw(image)
    for target_y, n in ((4,3),(10,2),(16,3),(23,2),(29,3)):
        candidates = ((abs(y-target_y), x,y)
                      for y in range(2,image.height-n-1)
                      for x in ([image.width-n-2,image.width-n-1] if side == 'R' else [1,2])
                      if decoration_clear(image,(x,y,n,n)))
        _, x,y = min(candidates, default=(None,None,None))
        assert x is not None, ('no room for bubble',side,n)
        d.rectangle((x,y,x+n-1,y+n-1),fill=BLUE_RIM)
        d.point((x,y),fill=WHITE)
        d.point((x+1,y+1),fill=BLUE)
        if n == 3:
            d.point((x+1,y),fill=BLUE)
            d.point((x+2,y+1),fill=BLUE)


def sleepy(image, phase):
    d = ImageDraw.Draw(image)
    for n, target_y in ((4,6-phase),(3,13-phase)):
        candidates = ((abs(y-target_y), x,y)
                      for y in range(2,20)
                      for x in range(image.width-n-2,image.width-n)
                      if decoration_clear(image,(x,y,n,n)))
        _, x,y = min(candidates, default=(None,None,None))
        assert x is not None, 'no room for sleep glyph'
        d.line([(x,y),(x+n-1,y),(x,y+n-1),(x+n-1,y+n-1)],fill=INK)


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


def preview(rows, path):
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
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-only', action='store_true')
    parser.add_argument('--preview', type=Path, default=PREVIEW)
    parser.add_argument('--output-dir', type=Path, default=SPRITES)
    args = parser.parse_args()
    BASES.mkdir(parents=True,exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for stage in STAGES:
        original = bases.prepare(stage)
        if not args.preview_only:
            original.save(BASES/f'dog-{stage}-quantized.png')
        clean = clean_face(stage,original)
        if not args.preview_only:
            clean.save(BASES/f'dog-{stage}-clean.png')
        rows[stage] = clean
        if not args.preview_only:
            render_frame(clean,stage,{}).save(args.output_dir/f'dog-{stage}-v2.png')
            for name, pose in POSES.items():
                render_frame(clean,stage,pose).save(args.output_dir/f'dog-{stage}-v2-{name}.png')
        print(f'{stage}: {clean.width}x{clean.height}, base + {len(POSES)} poses')
    preview(rows, args.preview)
    print('preview:', args.preview)


if __name__ == '__main__':
    main()
