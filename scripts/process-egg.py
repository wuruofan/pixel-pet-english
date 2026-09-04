#!/usr/bin/env python3
"""Egg sprite pipeline: AI original -> clean 29x36 egg -> 6 animation frames.

Design notes (v2, 2026-09-04):
- The egg PNG carries NO spots. Spots are overlaid at runtime by drawPet
  using the current pet's body color (PET_PALETTES[sp.pals[1]].B), so one
  egg sprite set works for every pet species and the spot color is swappable.
- Eyes are 3x3 glossy black with a 2x1 white highlight (bigger than v1's
  3x2, matching the earlier white-egg reference the user liked).
- Frames are real differential frames (not same-image copies):
    cat-egg / cat-egg-idle-0   stage frame, open eyes + smile
    cat-egg-idle-1              shifted 1px right (wobble)
    cat-egg-blink               closed-eye arc
    cat-egg-eat                 squint + open mouth + food below mouth
    cat-egg-happy               ^ ^ happy eyes + open laughing mouth

Run:
    python3 scripts/process-egg.py
"""
from PIL import Image
from collections import deque
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'gpt-assets', 'egg-original-2026-09-04.png')
OUT = os.path.join(ROOT, 'assets', 'sprites')

# ---- palette (same family as cat-adult.png) ----
INK   = (42, 9, 2, 255)          # deep brown outline / eyes
CREAM = (253, 247, 236, 255)     # cream shell
PINK  = (250, 135, 120, 255)     # blush / tongue
WHITE = (255, 255, 255, 255)     # eye highlight
YELLOW = (251, 180, 69, 255)     # food treat
SPOT  = {(252, 171, 52), (253, 177, 57), (251, 180, 69), (247, 153, 42),
         (236, 122, 21), (242, 133, 25), (241, 138, 36), (163, 88, 24)}
MAIN  = [INK, CREAM, PINK, WHITE, YELLOW] + list(SPOT)

# 3x3 eye regions (left / right)
EYE_L = [(7, 14), (8, 14), (9, 14), (7, 15), (8, 15), (9, 15), (7, 16), (8, 16), (9, 16)]
EYE_R = [(18, 14), (19, 14), (20, 14), (18, 15), (19, 15), (20, 15), (18, 16), (19, 16), (20, 16)]
MOUTH_CLEAR = [(x, y) for x in range(11, 18) for y in (19, 20)]


def nearest(c):
    best = None
    bd = 1e9
    for p in MAIN:
        d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if d < bd:
            bd = d
            best = p
    return best[:3]


def load_raw(path):
    """Flood-fill white bg (from edges) -> transparent, crop, scale to 36px tall."""
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    alpha = Image.new('L', (W, H), 255)
    ap = alpha.load()

    def is_white(r, g, b):
        return r > 240 and g > 240 and b > 240

    seed = ([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] +
            [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    bg = set()
    dq = deque()
    for s in seed:
        if s not in bg:
            bg.add(s)
            dq.append(s)
    while dq:
        x, y = dq.popleft()
        if not is_white(*px[x, y]):
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in bg and is_white(*px[nx, ny]):
                bg.add((nx, ny))
                dq.append((nx, ny))
    for (x, y) in bg:
        ap[x, y] = 0

    bb = alpha.getbbox()
    crop = im.crop(bb)
    al = alpha.crop(bb)
    cw, ch = crop.size
    th = 36
    tw = max(1, round(cw * th / ch))
    crop_s = crop.resize((tw, th), Image.BOX)
    al_s = al.resize((tw, th), Image.BOX)

    out = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    op = out.load()
    sp = crop_s.load()
    sa = al_s.load()
    for y in range(th):
        for x in range(tw):
            a = sa[x, y]
            if a > 110:
                op[x, y] = nearest(sp[x, y]) + (255,)
            else:
                op[x, y] = (0, 0, 0, 0)
    return out


def refine(base):
    """Hand-refine: cream shell (no spots), chunky outline, 3x3 glossy eyes."""
    w, h = base.size
    px = base.load()
    mask = set()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] > 110:
                mask.add((x, y))

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    # shell = solid cream (spots overlaid at runtime by drawPet)
    for (x, y) in mask:
        op[x, y] = CREAM

    def has_trans(x, y):
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in mask:
                return True
        return False

    # eyes: 3x3 black + 2x1 white highlight
    for (x, y) in EYE_L + EYE_R:
        op[x, y] = INK
    for (x, y) in [(7, 14), (8, 14), (18, 14), (19, 14)]:
        op[x, y] = WHITE

    # blush
    for (x, y) in [(4, 17), (5, 17), (4, 18), (5, 18),
                   (21, 17), (22, 17), (21, 18), (22, 18)]:
        if (x, y) in mask:
            op[x, y] = PINK

    # smile
    for (x, y) in [(12, 19), (16, 19), (13, 20), (14, 20), (15, 20)]:
        if (x, y) in mask:
            op[x, y] = INK

    # chunky outline
    for (x, y) in [p for p in mask if has_trans(*p)]:
        op[x, y] = INK

    # leftover color cleanup
    for y in range(h):
        for x in range(w):
            c = op[x, y]
            if c[3] > 128 and c not in MAIN:
                op[x, y] = nearest(c[:3])
    return out


def copy_shift(base, dx):
    w, h = base.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    bp = base.load()
    for y in range(h):
        for x in range(w):
            c = bp[x, y]
            if c[3] > 128 and 0 <= x + dx < w:
                op[x + dx, y] = c
    return out


def make_blink(base):
    out = base.copy()
    op = out.load()
    for (x, y) in EYE_L + EYE_R:
        op[x, y] = CREAM
    # closed-eye downward arc
    for (x, y) in [(7, 15), (8, 16), (9, 15), (18, 15), (19, 16), (20, 15)]:
        op[x, y] = INK
    return out


def make_eat(base):
    out = base.copy()
    op = out.load()
    # squint eyes (horizontal lines)
    for (x, y) in EYE_L + EYE_R:
        op[x, y] = CREAM
    for (x, y) in [(7, 15), (8, 15), (9, 15), (18, 15), (19, 15), (20, 15)]:
        op[x, y] = INK
    # clear old smile, draw open mouth 2x2 (ink lip + pink tongue)
    for (x, y) in MOUTH_CLEAR:
        op[x, y] = CREAM
    for (x, y) in [(13, 19), (14, 19)]:
        op[x, y] = INK
    for (x, y) in [(13, 20), (14, 20)]:
        op[x, y] = PINK
    # food: 2x2 yellow treat with ink outline, right below mouth
    for (x, y) in [(12, 21), (15, 21), (12, 22), (15, 22)]:
        op[x, y] = INK
    for (x, y) in [(13, 21), (14, 21), (13, 22), (14, 22)]:
        op[x, y] = YELLOW
    return out


def make_happy(base):
    out = base.copy()
    op = out.load()
    # ^ ^ happy eyes
    for (x, y) in EYE_L + EYE_R:
        op[x, y] = CREAM
    for (x, y) in [(7, 15), (8, 14), (9, 15), (18, 15), (19, 14), (20, 15)]:
        op[x, y] = INK
    # clear old smile, draw open laughing mouth (ink lip + pink tongue)
    for (x, y) in MOUTH_CLEAR:
        op[x, y] = CREAM
    for (x, y) in [(12, 20), (13, 20), (14, 20), (15, 20), (16, 20)]:
        op[x, y] = INK
    for (x, y) in [(13, 21), (14, 21)]:
        op[x, y] = PINK
    return out


def main():
    base_raw = load_raw(SRC)
    base = refine(base_raw)
    frames = {
        'cat-egg':          base,
        'cat-egg-idle-0':   base,
        'cat-egg-idle-1':   copy_shift(base, 1),
        'cat-egg-blink':    make_blink(base),
        'cat-egg-eat':      make_eat(base),
        'cat-egg-happy':    make_happy(base),
    }
    for name, im in frames.items():
        p = os.path.join(OUT, name + '.png')
        im.save(p, optimize=True)
        w, h = im.size
        px = im.load()
        n = sum(1 for y in range(h) for x in range(w) if px[x, y][3] > 128)
        print(f'  wrote {name}: {w}x{h}, opaque={n}')
    print('done ->', OUT)


if __name__ == '__main__':
    main()
