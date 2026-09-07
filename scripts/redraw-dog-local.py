#!/usr/bin/env python3
"""Draw the v2 dog sprites with deterministic, hand-authored pixels.

The dog follows the cat pipeline exactly (see redraw-cat-local.py and
docs/sprites/HANDOFF-2026-09-06-cat-animation.md): three stage-distinct
body plans on the same canvases, every differential frame derived from its
own stage base by changing one or two things at a time.

Dog design language (user-approved concept):
- floppy ears hanging along the head edges, never covering the eyes
- protruding white muzzle with the nose on its top edge and a symmetric
  omega (w) mouth centered under the nose
- white chest patch; the adult wears a red collar (dog-gold accent)
- upturned stick tail that wags with tail_lift and sags when droopy
- puppy eyebrow spots on the kid stage

Frames: 3 stance bases + idle x2 + blink + 18 state poses + walk x7 per
stage. The egg stage is shared with the cat (cat-egg-v2-*, species-agnostic
shell; spots are tinted at runtime by palette).
"""
from pathlib import Path
import importlib.util

from PIL import Image, ImageDraw

_CAT_PATH = Path(__file__).resolve().parent / "redraw-cat-local.py"
_spec = importlib.util.spec_from_file_location("redraw_cat_local", _CAT_PATH)
_cat = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cat)
BOWL = _cat.BOWL
Canvas = _cat.Canvas
INK = _cat.INK
LIGHT = _cat.LIGHT
NOSE = _cat.NOSE
PINK = _cat.PINK
SHADOW = _cat.SHADOW
TEAR = _cat.TEAR
WHITE = _cat.WHITE
WALK_PHASES = _cat.WALK_PHASES
feet = _cat.feet
shift_vertical = _cat.shift_vertical
draw_zzz = _cat.draw_zzz
draw_blue_bubble = _cat.draw_blue_bubble
draw_sleep = _cat.draw_sleep
draw_bowl = _cat.draw_bowl
egg_bubble = _cat.egg_bubble

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
SIZES = {"baby": (30, 32), "kid": (36, 38), "adult": (44, 48)}
# Final-canvas eye rectangles (contract-pinned, one table per stage).
DOG_EYES = {
    "baby": ((9, 10, 11, 12), (14, 10, 16, 12)),
    "kid": ((10, 11, 12, 13), (18, 11, 20, 13)),
    "adult": ((13, 14, 16, 17), (26, 14, 29, 17)),
}
# Stage palettes from the game (dog-cream / dog-brown / dog-gold).
PALS = {
    "baby": {"body": (242, 221, 176, 255), "ear": (217, 188, 130, 255)},
    "kid": {"body": (201, 149, 94, 255), "ear": (168, 116, 62, 255)},
    "adult": {"body": (236, 192, 108, 255), "ear": (204, 156, 70, 255)},
}
COLLAR = (217, 106, 106, 255)  # dog-gold accent

DOG_TAIL_TIP = {"baby": (27, 19), "kid": (30, 25), "adult": (40, 33)}
DOG_TAIL_TIP_DROOP = {"baby": (27, 30), "kid": (28, 36), "adult": (36, 46)}
DOG_TAIL_BOX = {"baby": (20, 16, 30, 32), "kid": (24, 20, 33, 38), "adult": (30, 24, 44, 48)}
DOG_PAW_BOX = {"baby": (13, 26, 20, 32), "kid": (17, 33, 25, 38), "adult": (26, 42, 35, 48)}
DOG_PAW_PAD = {"baby": (16, 28), "kid": (20, 34), "adult": (30, 44)}
DOG_TEAR = {"baby": (10, 13), "kid": (11, 14), "adult": (14, 18)}
DOG_TEAR_RIGHT = {"baby": 15, "kid": 19, "adult": 27}


def dog_eyes(c, stage, style):
    for sx0, sy0, sx1, sy1 in DOG_EYES[stage]:
        if style == "open":
            c.r(sx0, sy0, sx1, sy1, INK)
            c.px(sx0 + 1, sy0, WHITE)
        elif style == "closed":
            c.r(sx0, sy0, sx1, sy1, WHITE)
            c.r(sx0, sy1, sx1, sy1, INK)
        elif style == "lid":
            c.r(sx0, sy0, sx1, sy1, WHITE)
            c.r(sx0, sy0 + 1, sx1, sy0 + 1, INK)
        elif style == "squeeze":
            c.r(sx0, sy0, sx1, sy1, WHITE)
            c.r(sx0, sy0 + 1, sx1, sy0 + 1, INK)
            c.r(sx0, sy1, sx1, sy1, INK)
        elif style == "arc":
            c.r(sx0, sy0, sx1, sy1, WHITE)
            c.px(sx0, sy1, INK)
            c.px(sx0 + 1, sy0, INK)
            c.px(sx1, sy1, INK)
        elif style == "star":
            c.r(sx0, sy0, sx1, sy1, INK)
            c.px(sx0 + 1, sy0 + 1, LIGHT)
        else:
            raise ValueError(f"unknown dog eye style: {style}")


def dog_mouth(c, stage, style):
    """Omega-family dog mouths, one table per stage, symmetric under the
    nose. crumbs/laugh swap the mouth interior for food/tongue."""
    if stage == "baby":
        if style == "smile":
            for x in (11, 12, 13, 14):
                c.px(x, 17, INK)
        elif style == "crumbs":
            c.r(11, 17, 14, 18, INK)
            c.r(12, 17, 13, 17, LIGHT)
        elif style == "laugh":
            c.r(11, 17, 14, 18, INK)
            c.r(12, 18, 13, 18, PINK)
        elif style == "tiny":
            c.px(12, 17, INK)
        elif style == "frown":
            for x, y in ((11, 18), (14, 18), (12, 17), (13, 17)):
                c.px(x, y, INK)
    elif stage == "kid":
        if style == "smile":
            c.px(15, 17, INK)
            for x in (13, 14, 15, 16, 17):
                c.px(x, 18, INK)
        elif style == "crumbs":
            c.r(13, 18, 17, 19, INK)
            c.r(14, 18, 16, 18, LIGHT)
        elif style == "laugh":
            c.r(13, 18, 17, 19, INK)
            c.r(14, 19, 16, 19, PINK)
        elif style == "tiny":
            c.px(15, 18, INK)
        elif style == "frown":
            for x, y in ((13, 19), (17, 19), (14, 18), (15, 18), (16, 18)):
                c.px(x, y, INK)
    else:
        if style == "smile":
            c.px(21, 23, INK)
            c.px(21, 24, INK)
            for x in (18, 19, 20, 21, 22, 23, 24):
                c.px(x, 25, INK)
            c.px(18, 24, INK)
            c.px(24, 24, INK)
        elif style == "crumbs":
            c.r(18, 25, 24, 27, INK)
            c.r(19, 25, 23, 25, LIGHT)
        elif style == "laugh":
            c.r(18, 25, 24, 27, INK)
            c.r(19, 26, 23, 26, PINK)
        elif style == "tiny":
            c.px(21, 25, INK)
        elif style == "frown":
            for x, y in ((18, 26), (24, 26), (19, 25), (20, 25), (21, 25), (22, 25), (23, 25)):
                c.px(x, y, INK)
        else:
            raise ValueError(f"unknown dog mouth style: {style}")


# ----------------------------------------------------------------- bodies

def dog_baby_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    dy = 11 if tail_droop else -tail_lift
    c.l([(21, 26), (26, 23 + dy), (27, 19 + dy)], INK, 6)
    c.l([(21, 26), (25, 23 + dy), (26, 20 + dy)], (242, 221, 176, 255), 4)
    c.p([(7, 19), (18, 19), (21, 23), (21, 28), (18, 31), (7, 31), (4, 28), (4, 23)], INK)
    c.p([(8, 20), (17, 20), (19, 24), (19, 27), (17, 30), (8, 30), (6, 27), (6, 24)],
        (242, 221, 176, 255))
    c.p([(11, 22), (15, 22), (17, 26), (15, 30), (11, 30), (9, 26)], WHITE)
    feet(c, ((6, 29, 12, 31), (14, 29, 19, 31)), paw_up=paw_up)


def dog_baby_head(c, eyes="open", mouth="smile", dy=0):
    c.offset(0, dy)
    c.p([(4, 8), (8, 5), (14, 4), (20, 6), (22, 10), (21, 15), (17, 19), (8, 19), (4, 15), (3, 10)], INK)
    c.p([(5, 9), (8, 6), (14, 5), (19, 7), (21, 10), (20, 14), (17, 18), (8, 18), (5, 14), (4, 10)],
        (242, 221, 176, 255))
    c.d.ellipse((9, 14, 16, 20), fill=WHITE)
    c.r(11, 14, 12, 15, NOSE)
    dog_mouth(c, "baby", mouth)
    dog_eyes(c, "baby", eyes)
    c.p([(3, 4), (8, 4), (8, 13), (5, 15), (2, 12)], INK)
    c.p([(4, 5), (7, 5), (7, 12), (5, 13), (3, 11)], (217, 188, 130, 255))
    c.p([(22, 4), (17, 4), (17, 13), (20, 15), (23, 12)], INK)
    c.p([(21, 5), (18, 5), (18, 12), (20, 13), (22, 11)], (217, 188, 130, 255))
    c.offset(0, -dy)


def dog_kid_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    dy = 11 if tail_droop else -tail_lift
    c.l([(24, 32), (29, 30 + dy), (30, 25 + dy)], INK, 5)
    c.l([(24, 32), (28, 30 + dy), (29, 26 + dy)], (201, 149, 94, 255), 3)
    c.p([(9, 21), (22, 21), (26, 25), (26, 33), (23, 36), (8, 36), (5, 33), (5, 25)], INK)
    c.p([(10, 22), (21, 22), (24, 26), (24, 31), (22, 35), (9, 35), (7, 32), (7, 26)],
        (201, 149, 94, 255))
    c.p([(13, 24), (19, 24), (21, 29), (18, 33), (14, 33), (11, 29)], WHITE)
    c.r(7, 26, 8, 29, (168, 116, 62, 255))
    c.r(24, 26, 25, 29, (168, 116, 62, 255))
    feet(c, ((8, 35, 14, 37), (18, 35, 24, 37)), paw_up=paw_up)


def dog_kid_head(c, eyes="open", mouth="smile", dy=0):
    c.offset(0, dy)
    c.p([(6, 9), (10, 6), (17, 5), (23, 7), (26, 12), (25, 17), (21, 21), (9, 21), (5, 17), (4, 12)], INK)
    c.p([(7, 10), (10, 7), (17, 6), (22, 8), (25, 12), (24, 16), (21, 20), (9, 20), (6, 16), (5, 12)],
        (201, 149, 94, 255))
    c.d.ellipse((11, 14, 19, 20), fill=WHITE)
    c.r(14, 15, 16, 16, NOSE)
    dog_mouth(c, "kid", mouth)
    dog_eyes(c, "kid", eyes)
    c.r(8, 8, 9, 9, (168, 116, 62, 255))
    c.r(21, 8, 22, 9, (168, 116, 62, 255))
    c.p([(3, 6), (8, 4), (9, 16), (4, 18), (1, 15)], INK)
    c.p([(4, 7), (7, 5), (8, 15), (5, 16), (2, 14)], (168, 116, 62, 255))
    c.p([(27, 6), (22, 4), (21, 16), (26, 18), (29, 15)], INK)
    c.p([(26, 7), (23, 5), (22, 15), (25, 16), (28, 14)], (168, 116, 62, 255))
    c.offset(0, -dy)


def dog_adult_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    dy = 13 if tail_droop else -tail_lift
    c.l([(31, 41), (38, 39 + dy), (40, 33 + dy)], INK, 7)
    c.l([(31, 41), (37, 39 + dy), (39, 34 + dy)], (236, 192, 108, 255), 4)
    c.p([(12, 27), (32, 27), (37, 31), (38, 38), (36, 43), (33, 46), (11, 46), (8, 43), (6, 38), (7, 31)], INK)
    c.p([(13, 29), (31, 29), (35, 32), (36, 38), (34, 42), (32, 45), (12, 45), (10, 42), (8, 38), (9, 32)],
        (236, 192, 108, 255))
    c.p([(17, 30), (27, 30), (30, 36), (27, 42), (17, 42), (14, 36)], WHITE)
    feet(c, ((10, 45, 17, 47), (27, 45, 34, 47)), paw_up=paw_up)


def dog_adult_head(c, eyes="open", mouth="smile", dy=0):
    c.offset(0, dy)
    c.p([(8, 13), (13, 8), (22, 6), (31, 8), (36, 13), (38, 20), (35, 27), (28, 31), (16, 31), (9, 27), (6, 20)],
        INK)
    c.p([(9, 14), (13, 9), (22, 7), (30, 9), (35, 14), (37, 20), (34, 26), (28, 30), (16, 30), (10, 26), (7, 20)],
        (236, 192, 108, 255))
    c.d.ellipse((14, 19, 28, 28), fill=WHITE)
    c.r(20, 20, 22, 22, NOSE)
    dog_mouth(c, "adult", mouth)
    dog_eyes(c, "adult", eyes)
    c.r(13, 29, 31, 31, COLLAR)
    c.r(14, 30, 16, 31, WHITE)
    c.p([(2, 11), (10, 4), (12, 22), (6, 24), (0, 18)], INK)
    c.p([(3, 12), (9, 6), (11, 21), (7, 22), (1, 17)], (204, 156, 70, 255))
    c.p([(40, 11), (32, 4), (30, 22), (36, 24), (42, 18)], INK)
    c.p([(39, 12), (33, 6), (31, 21), (35, 22), (41, 17)], (204, 156, 70, 255))
    c.offset(0, -dy)


DOG_BODIES = {"baby": dog_baby_body, "kid": dog_kid_body, "adult": dog_adult_body}
DOG_HEADS = {"baby": dog_baby_head, "kid": dog_kid_head, "adult": dog_adult_head}


# ------------------------------------------------------- state overlays

def draw_dog_bowl(c, stage):
    draw_bowl(c, stage)


def draw_dog_tear(c, stage, phase):
    x, y = DOG_TEAR[stage]
    d = ImageDraw.Draw(c.img)
    # tears hang from BOTH eyes (a single tear read as a mole)
    for x0 in (x, DOG_TEAR_RIGHT[stage]):
        d.rectangle((x0, y + phase, x0, y + 1 + phase), fill=TEAR)


def draw_dog_bubbles(c, stage, side):
    d = ImageDraw.Draw(c.img)
    # Each side authored separately: a horizontal mirror of the right spots
    # would land on the floppy ear / face. Body-side spots may sit against
    # the fur — blue bubbles stay readable over it.
    spots = {"baby": {"r": [(23, 9, 5), (26, 17, 4)], "l": [(0, 4, 5), (0, 21, 4)]},
             "kid": {"r": [(29, 11, 5), (32, 19, 4)], "l": [(0, 3, 5), (0, 18, 4)]},
             "adult": {"r": [(38, 13, 5), (40, 23, 4)], "l": [(0, 4, 5), (2, 30, 4)]}}[stage][side]
    for x, y, s in spots:
        draw_blue_bubble(d, x, y, s)


# --------------------------------------------------------------- sleeping

def draw_dog_sleep(stage, phase):
    """Side-lying curl — the SAME silhouette as the cat's sleep pose (head
    resting on the left, body curled to the right, tail wrapping the front,
    side-profile face). Only the species markers change: dog palette, a
    floppy ear replacing the cat's triangle ear, and a white muzzle instead
    of cream. Authored on the 30x32 master, nearest-neighbor fitted, Zzz
    drawn crisp on the final size."""
    body = PALS[stage]["body"]
    ear = PALS[stage]["ear"]
    c = Canvas(30, 32)
    # tail wrapping along the front of the curl (same path as the cat)
    c.l([(12, 30), (20, 32), (27, 29), (28, 25)], INK, 5)
    c.l([(13, 30), (20, 31), (26, 28)], body, 3)
    # lying body bean (exact same polygon as the cat, dog palette)
    c.p([(10, 20), (24, 19), (30, 23), (31, 28), (28, 31), (12, 31), (7, 27), (7, 23)], INK)
    c.p([(11, 22), (23, 21), (28, 24), (29, 28), (27, 30), (13, 30), (9, 27), (9, 24)], body)
    c.l([(22, 22), (26, 25), (26, 29)], SHADOW, 2)          # haunch hint
    # resting head (exact same polygon as the cat, dog palette)
    c.p([(4, 16), (8, 12), (14, 12), (17, 16), (16, 22), (10, 24), (5, 21)], INK)
    c.p([(5, 17), (8, 13), (13, 13), (16, 17), (15, 21), (10, 23), (6, 20)], body)
    # floppy ear replacing the cat's triangle ear (dog signature): hangs
    # off the top/back of the head where the cat's point ear would be
    c.p([(9, 10), (14, 9), (16, 12), (15, 18), (11, 19), (9, 15)], INK)
    c.p([(10, 11), (13, 10), (15, 13), (14, 17), (11, 18), (10, 15)], ear)
    # muzzle (exact same shape as the cat's cream muzzle, white for dog)
    c.p([(6, 18), (10, 16), (13, 18), (13, 21), (10, 23), (7, 21)], WHITE)
    c.r(6, 15, 9, 15, INK)                                 # closed eye (same as cat)
    c.r(6, 19, 7, 19, NOSE)                                # nose at the muzzle tip (same as cat)
    img = c.img.resize(SIZES[stage], Image.NEAREST)
    draw_zzz(img, stage, phase)
    return img


# --------------------------------------------------------------- walking

DOG_WALK_LAYOUT = {
    "adult": dict(
        body=(5, 22, 36, 42), body_in=(7, 24, 34, 40), belly=(10, 31, 30, 41),
        head=(26, 8, 43, 26), head_in=(28, 10, 41, 24),
        ear=((29, 4), (35, 3), (36, 15), (30, 15)),
        ear_in=((30, 6), (34, 5), (35, 13), (31, 13)),
        muzzle=(34, 16, 43, 24), eye=(34, 14, 36, 16), nose=(42, 19, 43, 21),
        near_front=27, near_back=7, far_front=30, far_back=10, leg_top=37,
        tail=((30, 41), (37, 38), (39, 31)), tail_up=(40, 28), tail_down=(41, 34),
        tail_w=(6, 4),
    ),
    "kid": dict(
        body=(4, 18, 29, 34), body_in=(6, 20, 27, 32), belly=(9, 25, 25, 33),
        head=(20, 6, 34, 21), head_in=(22, 8, 32, 19),
        ear=((21, 3), (26, 2), (27, 12), (22, 12)),
        ear_in=((22, 5), (25, 4), (26, 10), (23, 10)),
        muzzle=(27, 13, 34, 20), eye=(27, 11, 29, 13), nose=(33, 16, 34, 17),
        near_front=20, near_back=5, far_front=22, far_back=7, leg_top=31,
        tail=((24, 32), (29, 30), (30, 24)), tail_up=(31, 21), tail_down=(31, 27),
        tail_w=(5, 3),
    ),
    "baby": dict(
        body=(3, 16, 23, 28), body_in=(5, 18, 21, 26), belly=(7, 21, 19, 27),
        head=(15, 6, 27, 17), head_in=(16, 7, 26, 16),
        ear=((16, 3), (21, 2), (22, 10), (17, 10)),
        ear_in=((17, 4), (20, 4), (21, 8), (18, 8)),
        muzzle=(20, 11, 27, 17), eye=(20, 9, 22, 11), nose=(25, 13, 26, 14),
        near_front=16, near_back=4, far_front=18, far_back=6, leg_top=25,
        tail=((21, 26), (26, 23), (27, 19)), tail_up=(28, 17), tail_down=(28, 22),
        tail_w=(5, 3),
    ),
}


def draw_dog_walk(stage, f):
    """Side-view dog trot (facing right): legs, stick tail and a body bob;
    the floppy ear and eye stay put."""
    w, h = SIZES[stage]
    lay = DOG_WALK_LAYOUT[stage]
    fdx, bdx, bob = WALK_PHASES[f]
    c = Canvas(w, h)
    for x0, dx in ((lay["far_front"], -fdx), (lay["far_back"], -bdx)):
        c.r(x0 + dx, lay["leg_top"], x0 + dx + 2, h - 1, SHADOW)
    c.offset(0, bob)
    tip = lay["tail_up"] if f % 2 == 0 else lay["tail_down"]
    c.l(list(lay["tail"][:-1]) + [tip], INK, lay["tail_w"][0])
    c.l(list(lay["tail"][:-1]) + [tip], lay["body"] and (242, 221, 176, 255) if stage == "baby"
        else (201, 149, 94, 255) if stage == "kid" else (236, 192, 108, 255), lay["tail_w"][1])
    c.d.ellipse(lay["body"], fill=INK)
    c.d.ellipse(lay["body_in"], fill=PALS[stage]["body"])
    c.d.ellipse(lay["belly"], fill=WHITE)
    c.p(lay["ear"], INK)
    c.p(lay["ear_in"], PALS[stage]["ear"])
    c.d.ellipse(lay["head"], fill=INK)
    c.d.ellipse(lay["head_in"], fill=PALS[stage]["body"])
    c.d.ellipse(lay["muzzle"], fill=WHITE)
    c.r(*lay["eye"], INK)
    c.r(*lay["nose"], NOSE)
    c.offset(0, -bob)
    for x0, dx in ((lay["near_front"], fdx), (lay["near_back"], bdx)):
        c.r(x0 + dx, lay["leg_top"], x0 + dx + 2, h - 1, INK)
        c.r(x0 + dx + 1, lay["leg_top"] + 1, x0 + dx + 1, h - 2, PALS[stage]["body"])
    return c.img


# --------------------------------------------------------------- assembly

def draw_dog(stage):
    c = Canvas(*SIZES[stage])
    DOG_BODIES[stage](c)
    DOG_HEADS[stage](c)
    return c.img


def render_dog_pose(stage, head=(0, 0), eyes="open", mouth="smile", bowl=False,
                    tear=None, bubble=None, tail_lift=0, paw_up=False, tail_sag=False):
    c = Canvas(*SIZES[stage])
    DOG_BODIES[stage](c, tail_lift=tail_lift, paw_up=paw_up,
                      tail_droop=tail_sag)
    if bowl:
        draw_dog_bowl(c, stage)
    c.offset(*head)
    DOG_HEADS[stage](c, eyes=eyes, mouth=mouth, dy=0)
    c.offset(-head[0], -head[1])
    if tear is not None:
        draw_dog_tear(c, stage, tear)
    if bubble is not None:
        draw_dog_bubbles(c, stage, bubble)
    return c.img


DOG_POSES = ("eat-0", "eat-1", "eat-2",
             "sleep-0", "sleep-1",
             "happy-0", "happy-1", "happy-2",
             "excited-0", "excited-1", "excited-2",
             "droopy", "sad-0", "sad-1", "wash-0", "wash-1",
             "grunt-0", "grunt-1")


def dog_frame(stage, pose):
    if pose.startswith("sleep-"):
        return draw_dog_sleep(stage, int(pose[-1]))
    pitch = 2 if stage == "baby" else 3
    if pose == "happy-0":
        return shift_vertical(render_dog_pose(stage, tail_lift=1), 1)
    if pose in ("happy-1", "excited-1"):
        return shift_vertical(render_dog_pose(stage, tail_lift=-1,
                                              paw_up=(pose == "excited-1")), -2)
    if pose == "excited-0":
        return shift_vertical(render_dog_pose(stage, tail_lift=1), -1)
    if pose == "happy-2":
        return render_dog_pose(stage, tail_lift=-1)
    if pose == "eat-0":
        return render_dog_pose(stage, head=(0, pitch), mouth="crumbs", bowl=True, tail_lift=1)
    if pose == "eat-1":
        return render_dog_pose(stage, head=(0, pitch), eyes="closed", mouth="crumbs",
                               bowl=True, tail_lift=-1)
    if pose == "eat-2":
        return render_dog_pose(stage, head=(0, -2), bowl=True)
    if pose == "excited-2":
        return render_dog_pose(stage, eyes="star", mouth="laugh", tail_lift=1, paw_up=True)
    if pose == "sad-0":
        return render_dog_pose(stage, eyes="lid", mouth="frown", tear=0, tail_sag=True)
    if pose == "sad-1":
        return render_dog_pose(stage, eyes="lid", mouth="frown", tear=1, tail_sag=True)
    if pose == "droopy":
        return render_dog_pose(stage, eyes="lid", mouth="frown", tail_sag=True)
    if pose == "wash-0":
        return render_dog_pose(stage, head=(1, 0), bubble="r")
    if pose == "wash-1":
        return render_dog_pose(stage, head=(-1, 0), bubble="l")
    if pose == "grunt-0":
        return render_dog_pose(stage, eyes="squeeze", mouth="frown")
    if pose == "grunt-1":
        return render_dog_pose(stage, head=(0, 1), eyes="squeeze", mouth="frown")
    raise ValueError(f"unknown dog pose: {pose}")


def derive_dog_frames(stage, base):
    """idle-0 is the base, idle-1 is a 1px drop (feet stay grounded), blink
    clears the eye sockets to cream and closes each lid on the bottom row.
    Mirrors derive_frames in redraw-cat-local.py.
    """
    idle0 = base.copy()
    idle1 = Image.new("RGBA", base.size, (0, 0, 0, 0))
    idle1.paste(base, (0, 1))
    blink = base.copy()
    cream = PALS[stage]["body"]
    for x0, y0, x1, y1 in DOG_EYES[stage]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                blink.putpixel((x, y), cream)
        for x in range(x0, x1 + 1):
            blink.putpixel((x, y1), INK)
    return idle0, idle1, blink


def main():
    SPRITES.mkdir(parents=True, exist_ok=True)
    for stage in ("baby", "kid", "adult"):
        base = draw_dog(stage)
        base.save(SPRITES / f"dog-{stage}-v2.png")
        idle0, idle1, blink = derive_dog_frames(stage, base)
        idle0.save(SPRITES / f"dog-{stage}-v2-idle-0.png")
        idle1.save(SPRITES / f"dog-{stage}-v2-idle-1.png")
        blink.save(SPRITES / f"dog-{stage}-v2-blink.png")
        for pose in DOG_POSES:
            dog_frame(stage, pose).save(SPRITES / f"dog-{stage}-v2-{pose}.png")
        for f in range(7):
            draw_dog_walk(stage, f).save(SPRITES / f"dog-{stage}-v2-walk-{f}.png")
    print("generated local dog v2 sprites")


if __name__ == "__main__":
    main()
