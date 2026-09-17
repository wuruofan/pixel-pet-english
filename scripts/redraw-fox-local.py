#!/usr/bin/env python3
"""Draw the v2 fox sprites with deterministic, hand-authored pixels.

The fox follows the cat/dog pipeline exactly (see redraw-cat-local.py and
docs/sprites/HANDOFF-2026-09-06-cat-animation.md §8.5 + §9): three
stage-distinct body plans on the same canvases, every differential frame
derived from its own stage base by changing one or two things at a time.

Fox design language (target, awaiting concept approval):
- pointy ears with dark ear-tip pixels (S shadow color) at the apex
- protruding white muzzle with the nose on its top edge and a symmetric
  omega (w) mouth centered under the nose
- white chest patch; the adult wears a richer cream/orange accent
- thick, wrapping tail with stage-distinct shape (kid → wider, adult →
  full-wrap with cream ring markings)
- fox stages are stage 2 (kid, "小狐狸") and stage 3 (adult, "大尾巴狐")
  in PET_SPECIES — no baby form (eggs hatch into fox-kid directly)

This file is a SCAFFOLDING ONLY (2026-09-07). The actual body/head/bubble/
tear/sleep/walk functions raise NotImplementedError until the concept frame
is approved and the per-stage fox silhouettes are hand-authored. Once the
base stance is approved, fill in the fox_* functions and mirror the dog
POSES / render_pose / write loop at the bottom.

Frames (target): 3 stance bases + idle x2 + blink + 18 state poses + walk
x7 per stage. The egg stage is shared with the cat (cat-egg-v2-*,
species-agnostic shell; spots are tinted at runtime by palette).

**必继承 §9 视觉规则**：双眼泪、洗澡泡泡 per-side 登记（不要镜像）、腮红
在 head offset 内绘制、不画中间横条、侧影直接画不"覆盖+重绘"。
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
# fox has only kid + adult (no baby); egg stage goes directly to fox-kid.
SIZES = {"kid": (36, 38), "adult": (44, 48)}
# Fox-specific stage palette mirrors the game's fox-rust/fox-deep/fox-bright.
# B = body (rust/orange), S = shadow (dark ear-tip + outline accent),
# A = cream/white accent (muzzle, chest, tail ring). These are filled in
# from PET_SPECIES[fox].pals[0]/[1]/[2] in app.js.
# v5 🦊-emoji palette (warmer, brighter orange-red; closer to the fox
# emoji reference the user picked over the v4 brick-red).
PALS = {
    "kid":   {"body": (232, 168, 124, 255),   "ear": (200, 118, 68, 255),
              "accent": (255, 244, 228, 255)},
    "adult": {"body": (244, 178, 130, 255),   "ear": (210, 124, 72, 255),
              "accent": (255, 250, 240, 255)},
}
# Per-stage convenience aliases used by the drawing functions.
FOX_BODY = {k: v["body"] for k, v in PALS.items()}
FOX_EAR = {k: v["ear"] for k, v in PALS.items()}
FOX_ACCENT = {k: v["accent"] for k, v in PALS.items()}
# Final-canvas eye rectangles (contract-pinned, one table per stage).
# TODO(concept): set per-stage eye sockets after fox face is approved.
FOX_EYES = {
    "kid":   ((11, 11, 13, 13), (19, 11, 21, 13)),
    "adult": ((14, 14, 17, 17), (27, 14, 30, 17)),
}
# Per-stage tear coordinates (left + right eye x; both y same row).
# Right-eye x must be independently registered, NOT a horizontal mirror.
# TODO(concept): lock these once fox face design lands.
FOX_TEAR = {"kid": (12, 16), "adult": (17, 21)}
FOX_TEAR_RIGHT = {"kid": 21, "adult": 30}
# Per-stage tail / paw contract boxes (filled after stance silhouette).
FOX_TAIL_BOX = {"kid": (24, 20, 33, 38), "adult": (30, 24, 44, 48)}
FOX_TAIL_TIP = {"kid": (30, 25), "adult": (40, 33)}
FOX_TAIL_TIP_DROOP = {"kid": (28, 36), "adult": (36, 46)}
FOX_PAW_BOX = {"kid": (17, 33, 25, 38), "adult": (26, 42, 35, 48)}
FOX_PAW_PAD = {"kid": (20, 34), "adult": (30, 44)}
# Per-side bubble spots (NOT a horizontal mirror — the head/body silhouette
# is asymmetric so left spots are registered independently).
# TODO(concept): after fox silhouette is approved, register per-stage per-side.
FOX_BUBBLES = {
    "kid":   {"r": [], "l": []},
    "adult": {"r": [], "l": []},
}
# Per-stage small-Z sleep offset (drawn after NEAREST scale to stay crisp).
# TODO(concept): tune once fox sleep silhouette is approved.
FOX_ZZZ_SMALL = {"kid": (22, 15, 4), "adult": (28, 15, 4)}


def fox_eyes(c, stage, style):
    """Same eye-style API as the dog (open / closed / lid / squeeze / arc /
    star), drawn into the FOX_EYES sockets. The contract test pins both
    socket rectangles are used by every style."""
    for sx0, sy0, sx1, sy1 in FOX_EYES[stage]:
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
            raise ValueError(f"unknown fox eye style: {style}")


def fox_mouth(c, stage, style):
    """Omega-family fox mouths (smile / crumbs / laugh / tiny / frown).
    Symmetric around the muzzle center; nose sits on the muzzle's top edge.
    TODO(state-frames): author the omega pixel sets per stage after fox muzzle."""
    raise NotImplementedError("fox_mouth: pending state-frame implementation")


# Fox face anchors: nose + omega-mouth per stage (eyes come from fox_eyes()).
FOX_FACE_SPECS = {
    "kid":   {"nose": (17, 17, 18, 18),
              "mouth": ((16, 20), (17, 21), (18, 21), (19, 21), (20, 20))},
    "adult": {"nose": (21, 22, 22, 23),
              "mouth": ((19, 26), (20, 27), (21, 26), (22, 27), (23, 26),
                        (24, 26))},
}


def fox_face_anchors(c, stage, eyes="open"):
    """Contract-pinned eyes/nose/omega-mouth for fox stages. The omega
    pattern is 5 pixels for kid (smaller muzzle) and 6 for adult."""
    spec = FOX_FACE_SPECS[stage]
    fox_eyes(c, stage, eyes)
    c.r(*spec["nose"], NOSE)
    for x, y in spec["mouth"]:
        c.px(x, y, INK)


def fox_tear(c, stage, phase):
    """§9 rule — tears on BOTH eyes, blue (TEAR), rolling 1px on phase 1.
    Right-eye x is registered independently (FOX_TEAR_RIGHT), not mirrored."""
    x, y = FOX_TEAR[stage]
    d = ImageDraw.Draw(c.img)
    for x0 in (x, FOX_TEAR_RIGHT[stage]):
        d.rectangle((x0, y + phase, x0, y + 1 + phase), fill=TEAR)


def fox_bubbles(c, stage, side):
    """§9 rule — blue bubbles (draw_blue_bubble), per-side registered.
    Left spots are NOT a horizontal mirror of the right (mirror would land
    on the fox face / ear). Body-side spots may sit against the fur."""
    d = ImageDraw.Draw(c.img)
    for x, y, s in FOX_BUBBLES[stage][side]:
        draw_blue_bubble(d, x, y, s)


def fox_body_kid(c, tail_lift=0, tail_droop=0, paw_up=False):
    """Fox-kid body silhouette (36x38). Anchored to the mmx 1024×1024
    reference (fox-kid-front_001.jpg) auto-extracted anchor points. The
    mmx fox stands facing the viewer with feet at y=34, body x=8-28, tail
    rising from the right hip into a thick S-arc with white tip. White V
    chest at (16-19, 24-27). Black paws at the bottom row."""
    dy = -tail_lift
    body = FOX_BODY["kid"]
    ear = FOX_EAR["kid"]
    accent = FOX_ACCENT["kid"]
    # fluffy thick S-arc tail — starts at right hip (28, 28), bulges
    # right to (32, 16) mid-arc, curls back left to tip (29, 6).
    if tail_droop:
        c.l([(28, 28), (32, 32), (32, 35)], INK, 3)
        c.l([(28, 28), (32, 32), (32, 34)], body, 2)
        c.r(31, 34, 32, 35, accent)
    else:
        # S-arc tail outline (thick, ~5 cols wide)
        c.p([(28, 28), (30, 24 + dy), (33, 18 + dy), (33, 12 + dy),
             (31, 7 + dy), (29, 6 + dy), (28, 11 + dy),
             (29, 18 + dy), (30, 24 + dy)], INK)
        c.p([(29, 28), (30, 25 + dy), (32, 19 + dy), (32, 13 + dy),
             (30, 8 + dy), (29, 7 + dy), (28, 12 + dy),
             (29, 19 + dy), (30, 25 + dy)], body)
        # jagged tufts on outer (right) edge
        for fx, fy in [(31, 22), (32, 20), (32, 16), (32, 13),
                       (31, 10), (30, 8), (29, 9), (29, 13),
                       (29, 17), (30, 22)]:
            c.px(fx, fy + dy, INK)
        # white tail tip
        c.r(28, 6 + dy, 30, 9 + dy, accent)
    # body silhouette — narrower than v4 to match mmx proportions
    c.p([(8, 24), (28, 24), (29, 27), (29, 33), (27, 34), (9, 34),
         (7, 33), (7, 27)], INK)
    c.p([(9, 25), (27, 25), (28, 28), (28, 32), (26, 33), (10, 33),
         (8, 32), (8, 28)], body)
    # white chest V — narrower at top, widens at belly (mmx shape)
    c.p([(16, 24), (19, 24), (20, 27), (19, 30), (16, 30), (15, 27)], accent)
    # black paws at y=33-35 (anchored to mmx 脚底 y=34-35)
    c.r(8, 33, 14, 35, INK)
    c.r(18, 33, 24, 35, INK)
    # tiny LIGHT paw pad highlight
    c.r(10, 34, 12, 35, LIGHT)
    c.r(20, 34, 22, 35, LIGHT)


def fox_body_adult(c, tail_lift=0, tail_droop=0, paw_up=False):
    """Fox-adult body silhouette (44x48). Anchored to the mmx 1024×1024
    reference. Larger S-arc tail with two cream ring markings, white V
    chest, four black paws. Feet rest at y=44."""
    dy = -tail_lift
    body = FOX_BODY["adult"]
    ear = FOX_EAR["adult"]
    accent = FOX_ACCENT["adult"]
    # big fluffy S-arc tail with cream rings — starts at right hip (33, 36)
    if tail_droop:
        c.l([(33, 36), (38, 41), (38, 44)], INK, 4)
        c.l([(33, 36), (38, 41), (38, 43)], body, 3)
        c.r(37, 43, 38, 44, accent)
    else:
        # S-arc tail outline (~7 cols wide)
        c.p([(33, 36), (37, 32 + dy), (40, 24 + dy), (41, 16 + dy),
             (39, 9 + dy), (36, 6 + dy), (33, 9 + dy), (33, 16 + dy),
             (35, 24 + dy), (37, 32 + dy)], INK)
        c.p([(34, 36), (37, 33 + dy), (39, 25 + dy), (40, 17 + dy),
             (38, 10 + dy), (36, 7 + dy), (34, 10 + dy), (34, 17 + dy),
             (35, 25 + dy), (36, 33 + dy)], body)
        # jagged tufts on outer edge
        for fx, fy in [(38, 30), (39, 27), (40, 23), (40, 20),
                       (40, 16), (39, 12), (38, 9), (36, 7),
                       (34, 10), (33, 14), (33, 20), (34, 27)]:
            c.px(fx, fy + dy, INK)
        # two cream ring markings on the outer curve
        c.r(38, 27 + dy, 40, 30 + dy, accent)
        c.r(40, 17 + dy, 41, 20 + dy, accent)
        # white tail tip
        c.r(34, 6 + dy, 37, 9 + dy, accent)
    # body silhouette
    c.p([(11, 32), (33, 32), (34, 36), (34, 42), (32, 44), (12, 44),
         (10, 42), (10, 36)], INK)
    c.p([(12, 33), (32, 33), (33, 37), (33, 41), (31, 43), (13, 43),
         (11, 41), (11, 37)], body)
    # white chest V — wider at top, tapers at belly
    c.p([(18, 32), (26, 32), (27, 38), (26, 42), (18, 42), (17, 38)], accent)
    # black paws at y=43-45
    c.r(11, 43, 19, 45, INK)
    c.r(25, 43, 33, 45, INK)
    c.r(14, 44, 16, 45, LIGHT)
    c.r(28, 44, 30, 45, LIGHT)


def fox_head_kid(c, eyes="open"):
    """Fox-kid head (36x38). Anchored to the mmx 1024×1024 reference
    (fox-kid-front_001.jpg). Pointy ears at y=5-12, face y=11-22, eyes at
    (15-16, 16-18) and (19-20, 16-18), nose (17-18, 18-19), omega mouth
    at y=20-21, white muzzle y=14-21, white forehead blaze between eyes."""
    body = FOX_BODY["kid"]
    ear = FOX_EAR["kid"]
    accent = FOX_ACCENT["kid"]
    # tall pointy ears — apex at y=5 (mmx position), narrow base
    c.p([(10, 12), (11, 5), (12, 11)], INK)
    c.p([(10, 11), (11, 6), (12, 11)], body)
    c.r(11, 5, 11, 8, ear)
    c.p([(24, 11), (25, 5), (26, 12)], INK)
    c.p([(24, 11), (25, 6), (26, 11)], body)
    c.r(25, 5, 25, 8, ear)
    # round-ish face (mmx style — not a strict inverted triangle)
    c.p([(8, 12), (12, 9), (24, 9), (28, 12), (28, 18), (26, 21),
         (22, 22), (18, 22), (14, 22), (10, 21), (8, 18)], INK)
    c.p([(9, 13), (13, 10), (23, 10), (27, 13), (27, 18), (25, 20),
         (22, 21), (18, 21), (14, 21), (11, 20), (9, 18)], body)
    # white forehead blaze between eyes (narrow)
    c.r(17, 10, 19, 13, accent)
    # white muzzle — the triangular wedge centered on the face
    c.p([(14, 14), (22, 14), (23, 18), (21, 21), (18, 21), (15, 21),
         (13, 18)], accent)
    fox_face_anchors(c, "kid", eyes)


def fox_head_adult(c, eyes="open"):
    """Fox-adult head (44x48). Anchored to the mmx 1024×1024 reference
    (fox-adult-front_001.jpg). Big pointy ears, eyes at y=18-21, nose
    (15-16, 20-21), omega mouth y=22-23, wider white muzzle and chest."""
    body = FOX_BODY["adult"]
    ear = FOX_EAR["adult"]
    accent = FOX_ACCENT["adult"]
    # big tall pointy ears — apex at y=7 (mmx position)
    c.p([(7, 15), (10, 7), (12, 15)], INK)
    c.p([(8, 14), (10, 9), (12, 14)], body)
    c.r(10, 7, 10, 10, ear)
    c.p([(32, 15), (34, 7), (37, 15)], INK)
    c.p([(32, 14), (34, 9), (36, 14)], body)
    c.r(34, 7, 34, 10, ear)
    # face (mmx style — rounder than v4 strict inverted triangle)
    c.p([(7, 14), (13, 10), (31, 10), (37, 14), (37, 22), (35, 27),
         (30, 30), (25, 31), (19, 31), (14, 30), (9, 27), (7, 22)], INK)
    c.p([(8, 15), (14, 11), (30, 11), (36, 15), (36, 22), (34, 26),
         (30, 29), (25, 30), (19, 30), (15, 29), (10, 26), (8, 22)], body)
    # white forehead blaze between eyes (wider — adult has bigger eyes)
    c.r(20, 13, 24, 17, accent)
    # white muzzle — wide wedge centered on the face
    c.p([(15, 18), (29, 18), (30, 24), (27, 28), (22, 30), (17, 28),
         (14, 24)], accent)
    fox_face_anchors(c, "adult", eyes)


def fox_walk(stage, frame_idx):
    """Side-view walk frames (WALK_PHASES-driven). Same 7-frame contract as
    the cat/dog. TODO(concept): author FOX_WALK_LAYOUT per stage."""
    raise NotImplementedError("fox_walk: pending concept approval")


def fox_sleep(stage, phase):
    """§9 rule — sleep silhouette is drawn whole on the master canvas
    (no 'cover + redraw' trick), then NEAREST-scaled, then Zzz drawn crisp
    on the final size. TODO(concept): author the fox side-lying silhouette
    with pointy ears + white muzzle + thick tail."""
    raise NotImplementedError("fox_sleep: pending concept approval")


# Per-stage pose dispatcher mirroring redraw-cat-local.py's cat_frame.
FOX_POSES = (
    "idle-0", "idle-1", "blink",
    "eat-0", "eat-1", "eat-2",
    "sleep-0", "sleep-1",
    "happy-0", "happy-1", "happy-2",
    "excited-0", "excited-1", "excited-2",
    "big", "droopy",
    "sad-0", "sad-1",
    "wash-0", "wash-1",
    "grunt-0", "grunt-1",
)
FOX_STANCE_BODIES = {"kid": fox_body_kid, "adult": fox_body_adult}
FOX_STANCE_HEADS = {"kid": fox_head_kid, "adult": fox_head_adult}


def render_fox_pose(stage, head=(0, 0), eyes="open", bowl=False,
                    tear=None, blush=False, bubble=None, tail_lift=0,
                    tail_droop=0, paw_up=False):
    """Mirror of cat's render_pose: stance → bowl → head offset → head →
    blush (inside offset!) → tear → bubble. §9 rule on the offset order."""
    c = Canvas(*SIZES[stage])
    FOX_STANCE_BODIES[stage](c, tail_lift=tail_lift, tail_droop=tail_droop,
                             paw_up=paw_up)
    if bowl:
        draw_bowl(c, stage)
    c.offset(*head)
    FOX_STANCE_HEADS[stage](c, eyes=eyes)
    if blush:
        # §9 rule — blush inside head offset so it pitches with the head.
        _cat.draw_blush(c, stage)
    c.offset(-head[0], -head[1])
    if tear is not None:
        fox_tear(c, stage, tear)
    if bubble is not None:
        fox_bubbles(c, stage, bubble)
    return c.img


def fox_frame(stage, pose):
    """Stage base + one differential change. The full pose dispatcher will
    be filled in once fox_body_* / fox_head_* / fox_walk / fox_sleep land.
    TODO(concept): implement the pose-specific offsets/parameters."""
    raise NotImplementedError(f"fox_frame({stage}, {pose}): pending concept")


def write_all():
    """Render every stage × pose combination to assets/sprites/fox-*-v2.png.
    Wired up once the body/head functions are implemented."""
    for stage in SIZES:
        base = render_fox_pose(stage)
        (SPRITES / f"fox-{stage}-v2.png").save(base, optimize=True)
        for pose in FOX_POSES:
            img = fox_frame(stage, pose)
            (SPRITES / f"fox-{stage}-v2-{pose}.png").save(img, optimize=True)
        for f in range(7):
            img = fox_walk(stage, f)
            (SPRITES / f"fox-{stage}-v2-walk-{f}.png").save(img, optimize=True)


def render_concept():
    """Concept-only renderer: writes just the stance bases for visual
    approval. Used during the design phase before state-frame work begins."""
    out = ROOT / "tmp-fox-concept"
    out.mkdir(exist_ok=True)
    for stage in SIZES:
        img = render_fox_pose(stage)
        img.save(out / f"fox-{stage}-stance.png", optimize=True)
        print(f"  wrote {out / f'fox-{stage}-stance.png'}")


if __name__ == "__main__":
    # Concept-phase entry: render only the stance bases to tmp-fox-concept/
    # for visual approval. Once approved, switch to write_all() to emit the
    # full sprite set + state frames + walk frames.
    render_concept()
