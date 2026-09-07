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
    """Fox-kid body silhouette (36x38). Slim long torso (narrower than v4),
    legs slightly wider apart for a stable stance. The fox tail signature:
    it rises from the right HIP (not the spine), sweeps up and back in a
    thick S arc with a fluffy jagged outline (continuous tuft bulges, not
    isolated points) and a white tip — mimicking the fox emoji 🦊."""
    dy = -tail_lift
    body = FOX_BODY["kid"]
    accent = FOX_ACCENT["kid"]
    # fluffy thick S-arc tail — starts at right hip (28, 32), bulges out
    # to the right (peaks at x=37 mid-arc), curls back left to tip
    # (30, 6). Outer (right) edge has continuous jagged fur tufts.
    if tail_droop:
        # tail hangs limply down
        c.l([(28, 32), (32, 36), (32, 38)], INK, 4)
        c.l([(28, 32), (32, 36), (32, 37)], body, 2)
        c.r(31, 37, 32, 38, accent)
    else:
        # tail silhouette outline — thick S-arc, ~8-9 cols wide
        c.p([(28, 32), (32, 28), (36, 22 + dy), (37, 16 + dy),
             (36, 10 + dy), (33, 6 + dy), (30, 6 + dy), (28, 10 + dy),
             (30, 18 + dy), (32, 24 + dy)], INK)
        c.p([(29, 32), (32, 29), (35, 23 + dy), (36, 16 + dy),
             (35, 11 + dy), (32, 7 + dy), (30, 7 + dy), (29, 11 + dy),
             (31, 18 + dy), (32, 24 + dy)], body)
        # continuous jagged fur tufts on the outer (right + top) edge of
        # the tail — bulges every ~2 rows for true fluffy feel.
        tufts = [(34, 26), (36, 24), (37, 20), (37, 17), (37, 14),
                 (36, 11), (34, 8), (32, 7), (30, 9), (29, 12),
                 (29, 16), (30, 21)]
        for fx, fy in tufts:
            c.px(fx, fy + dy, INK)
        # white tail tip on the top-left curve (where the S ends)
        c.r(28, 6 + dy, 30, 9 + dy, accent)
    # slim long body — narrower than v4 (was 5→31, now 7→29), legs apart
    c.p([(8, 24), (28, 24), (30, 28), (30, 35), (27, 37), (8, 37),
         (6, 35), (6, 28)], INK)
    c.p([(9, 25), (27, 25), (29, 29), (29, 34), (26, 36), (9, 36),
         (8, 34), (8, 29)], body)
    # white chest patch — narrower than v4, leaves rust shoulders visible
    c.p([(14, 26), (22, 26), (24, 31), (22, 35), (14, 35), (12, 31)], accent)
    feet(c, ((8, 35, 14, 37), (18, 35, 24, 37)), paw_up=paw_up)


def fox_body_adult(c, tail_lift=0, tail_droop=0, paw_up=False):
    """Fox-adult body silhouette (44x48). Slim long torso; the signature
    fox feature is the LARGE fluffy thick S-arc tail from the right HIP
    with continuous jagged fur tufts, two cream ring markings, and a
    white tip on the outer curve — like the fox emoji 🦊. Tail does NOT
    rise above head height (keeps the face visible)."""
    dy = -tail_lift
    body = FOX_BODY["adult"]
    accent = FOX_ACCENT["adult"]
    # big thick S-arc fluffy tail — starts at right hip (32, 38), bulges
    # out to (44, 22) mid-arc, curls back to tip (38, 7). ~9-10 cols wide.
    if tail_droop:
        # tail hangs limply down
        c.l([(32, 38), (36, 44), (36, 47)], INK, 5)
        c.l([(32, 38), (36, 44), (36, 46)], body, 3)
        c.r(35, 46, 36, 47, accent)
    else:
        # tail silhouette outline — thick S-arc, ~9-10 cols wide
        c.p([(32, 38), (37, 33), (42, 26 + dy), (44, 18 + dy),
             (43, 10 + dy), (40, 6 + dy), (37, 7 + dy), (35, 12 + dy),
             (37, 22 + dy), (39, 30 + dy)], INK)
        c.p([(33, 38), (37, 34), (41, 27 + dy), (43, 18 + dy),
             (42, 11 + dy), (39, 7 + dy), (37, 8 + dy), (36, 13 + dy),
             (38, 22 + dy), (39, 30 + dy)], body)
        # continuous jagged fur tufts on the outer edge — bulges every
        # ~2 rows for true fluffy feel.
        tufts = [(39, 33), (42, 30), (43, 26), (44, 22), (44, 18),
                 (44, 14), (43, 10), (40, 7), (37, 9), (35, 13),
                 (35, 18), (36, 24), (37, 30)]
        for fx, fy in tufts:
            c.px(fx, fy + dy, INK)
        # cream ring markings — two rings on the outer curve
        c.r(40, 28 + dy, 42, 30 + dy, accent)
        c.r(42, 16 + dy, 43, 18 + dy, accent)
        # white tail tip on the top-left curve (where the S ends)
        c.r(37, 6 + dy, 39, 9 + dy, accent)
    # slim long body — narrower than v4 (was 9→37, now 11→33)
    c.p([(11, 28), (33, 28), (35, 32), (35, 43), (33, 47), (12, 47),
         (10, 43), (10, 32)], INK)
    c.p([(12, 29), (32, 29), (34, 33), (34, 42), (32, 46), (13, 46),
         (12, 42), (12, 33)], body)
    # chest fluff — slightly narrower than v4, leaves rust shoulders
    c.p([(18, 32), (26, 32), (28, 38), (26, 44), (18, 44), (16, 38)], accent)
    feet(c, ((12, 45, 19, 47), (25, 45, 32, 47)), paw_up=paw_up)


def fox_head_kid(c, eyes="open"):
    """Fox-kid head (36x38). Angular fox face (NOT a round dome): narrow
    forehead between the ears, widens to cheekbones, tapers to a pointy
    chin. Pointy ears with dark ear-tips rising up above the head outline,
    narrow white forehead blaze, triangular pointed muzzle protruding from
    the face center (not pasted on the bottom)."""
    body = FOX_BODY["kid"]
    ear = FOX_EAR["kid"]
    accent = FOX_ACCENT["kid"]
    # tall pointy ears — apex reaches y=0 (canvas top), base wider than v4,
    # the fox silhouette tell.
    c.p([(4, 12), (8, 0), (13, 11)], INK)
    c.p([(5, 11), (8, 2), (12, 11)], body)
    c.r(8, 0, 8, 3, ear)
    c.p([(23, 11), (28, 0), (32, 12)], INK)
    c.p([(24, 11), (28, 2), (31, 11)], body)
    c.r(28, 0, 28, 3, ear)
    # angular fox head: narrower top than v4 (forehead 14 wide, was 17),
    # wider cheeks (24 wide, was 22), sharper chin. The classic
    # inverted-triangle fox face.
    c.p([(7, 12), (11, 7), (25, 7), (29, 12), (30, 16), (27, 21),
         (22, 23), (18, 24), (14, 23), (9, 21), (6, 16)], INK)
    c.p([(8, 13), (11, 8), (25, 8), (28, 13), (29, 16), (26, 20),
         (22, 22), (18, 23), (14, 22), (10, 20), (7, 16)], body)
    # narrow white forehead blaze — only between eyes, leaves rust cheeks
    # visible on both sides (was a wider band in v4).
    c.r(17, 9, 19, 12, accent)
    # triangular pointed muzzle — narrower at top, widens at cheeks,
    # tapers to a sharp chin (so it reads as protruding from the face
    # center, not pasted onto the bottom).
    c.p([(14, 14), (22, 14), (24, 18), (22, 21), (18, 22), (14, 21),
         (12, 18)], accent)
    fox_face_anchors(c, "kid", eyes)


def fox_head_adult(c, eyes="open"):
    """Fox-adult head (44x48). Same angular/triangular fox face shape as
    kid, scaled up: narrow top, wide cheekbones, pointy chin, triangular
    muzzle protruding from the face center. Tall pointy ears reach the
    canvas top — the silhouette signature."""
    body = FOX_BODY["adult"]
    ear = FOX_EAR["adult"]
    accent = FOX_ACCENT["adult"]
    # big tall pointy ears — apex at y=0 (canvas top)
    c.p([(7, 15), (11, 0), (20, 13)], INK)
    c.p([(9, 14), (11, 2), (18, 13)], body)
    c.r(11, 0, 11, 4, ear)
    c.p([(24, 13), (33, 0), (37, 15)], INK)
    c.p([(26, 13), (33, 2), (35, 14)], body)
    c.r(33, 0, 33, 4, ear)
    # angular adult head — inverted-triangle fox silhouette (narrower
    # top, wider cheeks, sharper chin than v4)
    c.p([(10, 15), (16, 9), (28, 9), (34, 15), (35, 21), (32, 27),
         (26, 30), (22, 31), (18, 31), (12, 27), (9, 21)], INK)
    c.p([(11, 16), (16, 10), (28, 10), (33, 16), (34, 21), (31, 26),
         (26, 29), (22, 30), (18, 30), (13, 26), (10, 21)], body)
    # narrow forehead blaze between the bigger eyes
    c.r(20, 12, 24, 16, accent)
    # triangular muzzle — narrow at top, widens at cheeks, sharp chin
    c.p([(17, 20), (27, 20), (29, 24), (27, 28), (22, 29), (17, 28),
         (15, 24)], accent)
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
