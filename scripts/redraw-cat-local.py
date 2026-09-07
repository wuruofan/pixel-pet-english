#!/usr/bin/env python3
"""Draw the v2 cat sprites with deterministic, hand-authored pixels.

Each growth stage owns a deliberately different body plan (the stages must
read as three different cats, not one cat at three zoom levels):

- baby: chibi — huge round head on a compact body, tiny round ears, a
  pom-pom tail, only two forehead dashes.
- kid: lanky — upright ears, a longer slim body with a visible leg gap,
  a long upward tail, three forehead bands plus flank stripes.
- adult: sturdy — big silhouette-breaking ears, fluffy jaw cheeks, a broad
  body with haunches, whiskers and a large tail curl.

Every state frame derives from its own stage base by changing exactly one
thing (head pitch, eye style, an overlay, or a whole-body offset), so the
calibrated face anchors never drift between frames. Sleeping is the only
fully separate silhouette: a side-lying curl with its own closed eye.

The face anchors (eyes, glints, nose, mouth) sit at the same calibrated
coordinates as the approved v2 base for every stage. Feet always touch the
bottom row so the runtime's bottom-aligned 48x48 placement keeps them on
the ground.
"""
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
SIZES = {"baby": (30, 32), "kid": (36, 38), "adult": (44, 48)}
# Final-canvas eye rectangles (identical to the redraw contract test); blink
# and the closed/lid/squeeze eye styles clear exactly these sockets.
EYE_SOCKETS = {
    "baby": ((6, 11, 8, 13), (15, 11, 17, 13)),
    "kid": ((7, 12, 10, 15), (19, 12, 22, 15)),
    "adult": ((10, 15, 14, 19), (25, 15, 29, 19)),
}

INK = (57, 38, 43, 255)
SHADOW = (190, 87, 42, 255)
FUR = (244, 157, 55, 255)
LIGHT = (255, 190, 70, 255)
CREAM = (255, 242, 213, 255)
PINK = (244, 132, 145, 255)
NOSE = (207, 82, 105, 255)
WHITE = (255, 253, 247, 255)
# Prop colors shared with the FX sprite vocabulary (zzz droplets / food bowl):
# a tear on cream cheeks and a blue dish against cream fur need hues the
# eight base colors cannot provide.
TEAR = (159, 183, 255, 255)
BOWL = (74, 127, 193, 255)


class Canvas:
    """Tiny drawing helper: fills only, hard edges, no anti-aliasing.
    offset() translates subsequent strokes so the head group can be drawn
    at a pitch/sway without re-authoring its pixels."""

    def __init__(self, w, h):
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.ox = 0
        self.oy = 0

    def offset(self, dx, dy):
        self.ox += dx
        self.oy += dy

    def r(self, x0, y0, x1, y1, c):
        self.d.rectangle((x0 + self.ox, y0 + self.oy, x1 + self.ox, y1 + self.oy), fill=c)

    def p(self, pts, c):
        self.d.polygon([(x + self.ox, y + self.oy) for x, y in pts], fill=c)

    def l(self, pts, c, w=1):
        self.d.line([(x + self.ox, y + self.oy) for x, y in pts], fill=c, width=w, joint="curve")

    def px(self, x, y, c):
        self.d.point((x + self.ox, y + self.oy), fill=c)


def feet(c, rects, paw_up=False):
    """Outlined paw stubs: INK rim, LIGHT pad, bottom row stays INK so the
    paws rest exactly on the canvas floor without reading as black blocks.
    paw_up lifts the second paw one pixel, leaving a visible gap below —
    a raised paw for the excited frames."""
    for i, (x0, y0, x1, y1) in enumerate(rects):
        up = 1 if (paw_up and i == 1) else 0
        c.r(x0, y0 - up, x1, y1 - up, INK)
        c.r(x0 + 1, y0 - up, x1 - 1, y1 - 1 - up, LIGHT)


def draw_eyes(c, stage, style):
    """Eye styles over the calibrated sockets: open (default), closed
    (blink/chewing), lid (droopy/sad), squeeze (straining), star (excited)."""
    for x0, y0, x1, y1 in EYE_SOCKETS[stage]:
        if style == "open":
            c.r(x0, y0, x1, y1, INK)
        elif style == "closed":
            c.r(x0, y0, x1, y1, CREAM)
            c.r(x0, y1, x1, y1, INK)
        elif style == "lid":
            c.r(x0, y0, x1, y1, CREAM)
            c.r(x0, y0, x1, y1 - 1, FUR)
            c.r(x0, y1, x1, y1, INK)
        elif style == "squeeze":
            c.r(x0, y0, x1, y1, CREAM)
            c.r(x0, y0 + 1, x1, y0 + 1, INK)
        elif style == "star":
            c.r(x0, y0, x1, y1, INK)
            c.r(x0 + 1, y0 + 1, x1 - 1, y1 - 1, LIGHT)
            if x1 - x0 >= 3 and y1 - y0 >= 3:
                c.px((x0 + x1) // 2, (y0 + y1) // 2, WHITE)
        else:
            raise ValueError(f"unknown eye style: {style}")


FACE_SPECS = {
    "baby": {"nose": (11, 13, 12, 14), "mouth": ((11, 16), (12, 17), (13, 16)),
             "whiskers": False},
    "kid": {"nose": (14, 16, 15, 17), "mouth": ((14, 19), (15, 20), (16, 19)),
            "whiskers": False},
    "adult": {"nose": (19, 21, 20, 22),
              "mouth": ((17, 24), (18, 25), (19, 24), (20, 25), (21, 24)),
              "whiskers": True},
}


def face_anchors(c, stage, eyes="open"):
    """The contract-pinned eyes/glints/nose/mouth for one stage."""
    spec = FACE_SPECS[stage]
    draw_eyes(c, stage, eyes)
    if eyes == "open":
        for x0, y0, x1, y1 in EYE_SOCKETS[stage]:
            c.px(x0 + 1, y0, WHITE)
    c.r(*spec["nose"], NOSE)
    for x, y in spec["mouth"]:
        c.px(x, y, INK)


# ---------------------------------------------------------------- bodies

def baby_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    # pom-pom tail, tucked against the body's right flank. It wags with
    # tail_lift and sags to the floor when droopy/sad.
    dy = 2 if tail_droop else -tail_lift
    pom = [(x, y + dy) for x, y in ((19, 22), (25, 20), (27, 24), (25, 28), (21, 29), (19, 26))]
    c.p(pom, INK)
    c.p([(x, y + dy) for x, y in ((20, 23), (24, 22), (25, 24), (24, 26), (22, 26), (20, 25))], FUR)
    c.r(23, 22 + dy, 24, 23 + dy, LIGHT)
    # compact chubby body
    c.p([(7, 20), (18, 20), (21, 24), (21, 29), (18, 31), (7, 31), (4, 29), (4, 24)], INK)
    c.p([(8, 21), (17, 21), (19, 25), (19, 28), (17, 30), (8, 30), (6, 28), (6, 25)], FUR)
    c.p([(11, 22), (15, 22), (17, 26), (15, 30), (11, 30), (9, 26)], CREAM)
    feet(c, ((6, 29, 12, 31), (14, 29, 19, 31)), paw_up=paw_up)


def baby_head(c, eyes="open"):
    # small round ears, tips clearly above the crown
    c.p([(4, 10), (6, 4), (11, 9)], INK)
    c.p([(14, 9), (19, 4), (21, 10)], INK)
    c.p([(6, 8), (7, 5), (9, 7)], PINK)
    c.p([(15, 7), (17, 5), (19, 8)], PINK)
    # big round head
    c.p([(4, 9), (8, 7), (14, 6), (20, 8), (22, 12), (21, 17), (17, 21), (8, 21), (4, 17), (3, 12)], INK)
    c.p([(5, 10), (8, 8), (14, 7), (19, 9), (21, 12), (20, 16), (17, 20), (8, 20), (5, 16), (4, 12)], FUR)
    # two tiny forehead dashes only
    c.r(10, 8, 11, 9, SHADOW)
    c.r(14, 8, 15, 9, SHADOW)
    # cheeks
    c.p([(5, 15), (9, 14), (12, 16), (12, 19), (9, 20), (5, 19)], CREAM)
    c.p([(13, 16), (16, 14), (20, 15), (20, 19), (16, 20), (13, 19)], CREAM)
    face_anchors(c, "baby", eyes)


def kid_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    # long tail with a curl. It sways its tip with tail_lift and hangs to
    # the floor when droopy/sad.
    dy = -tail_lift
    if tail_droop:
        c.l([(23, 33), (27, 34), (28, 36)], INK, 5)
        c.l([(23, 33), (26, 34), (27, 35)], FUR, 3)
    else:
        c.l([(23, 32), (28, 31), (31, 27 + dy), (31, 22 + dy), (29, 20 + dy)], INK, 5)
        c.l([(23, 32), (28, 31), (30, 27 + dy), (30, 23 + dy)], FUR, 3)
        c.l([(30, 28 + dy), (30, 23 + dy)], SHADOW, 2)
    # longer slim body, legs apart at the bottom
    c.p([(9, 22), (22, 22), (26, 26), (26, 34), (23, 36), (8, 36), (5, 34), (5, 26)], INK)
    c.p([(10, 23), (21, 23), (24, 27), (24, 32), (22, 35), (9, 35), (7, 32), (7, 27)], FUR)
    c.p([(13, 25), (19, 25), (21, 30), (18, 34), (14, 34), (11, 30)], CREAM)
    # flank stripes
    c.r(7, 27, 8, 30, SHADOW)
    c.r(8, 31, 9, 33, SHADOW)
    c.r(24, 27, 25, 30, SHADOW)
    feet(c, ((8, 35, 14, 37), (18, 35, 24, 37)), paw_up=paw_up)


def kid_head(c, eyes="open"):
    # upright ears with a wide base
    c.p([(5, 12), (7, 3), (14, 9)], INK)
    c.p([(16, 9), (23, 3), (25, 12)], INK)
    c.p([(8, 9), (9, 5), (12, 8)], PINK)
    c.p([(18, 8), (21, 5), (22, 9)], PINK)
    # head
    c.p([(6, 10), (10, 7), (17, 6), (23, 8), (26, 13), (25, 18), (21, 22), (9, 22), (5, 18), (4, 13)], INK)
    c.p([(7, 11), (10, 8), (17, 7), (22, 9), (25, 13), (24, 17), (21, 21), (9, 21), (6, 17), (5, 13)], FUR)
    # forehead 3 bands, stopping above the eyes
    c.r(13, 8, 14, 11, SHADOW)
    c.r(16, 7, 17, 10, SHADOW)
    c.r(19, 8, 20, 11, SHADOW)
    # cheeks
    c.p([(6, 15), (11, 14), (13, 17), (13, 20), (9, 21), (6, 19)], CREAM)
    c.p([(14, 17), (18, 14), (24, 15), (24, 19), (20, 21), (14, 20)], CREAM)
    face_anchors(c, "kid", eyes)


def adult_body(c, tail_lift=0, tail_droop=False, paw_up=False):
    # large tail curl. It sways with tail_lift; when droopy/sad the curl
    # lets go and the tail hangs to the floor.
    dy = -tail_lift
    if tail_droop:
        c.l([(31, 42), (36, 44), (36, 46)], INK, 8)
        c.l([(31, 42), (35, 44), (35, 45)], FUR, 5)
        c.px(35, 46, LIGHT)
    else:
        c.l([(30, 41), (38, 42), (42, 37 + dy), (41, 31 + dy), (37, 28 + dy), (34, 31 + dy)], INK, 8)
        c.l([(30, 41), (38, 41), (40, 37 + dy), (39, 32 + dy), (37, 30 + dy), (35, 32 + dy)], FUR, 5)
        c.l([(38, 40), (40, 37 + dy), (39, 33 + dy)], SHADOW, 2)
        c.r(35, 28 + dy, 37, 29 + dy, LIGHT)
    # broad body with haunches
    c.p([(12, 28), (32, 28), (37, 32), (38, 39), (36, 44), (33, 46), (11, 46), (8, 44), (6, 39), (7, 32)], INK)
    c.p([(13, 30), (31, 30), (35, 33), (36, 39), (34, 43), (32, 45), (12, 45), (10, 43), (8, 39), (9, 33)], FUR)
    c.p([(17, 31), (27, 31), (30, 37), (27, 43), (17, 43), (14, 37)], CREAM)
    # flank stripes
    c.r(10, 33, 12, 38, SHADOW)
    c.r(11, 39, 13, 43, SHADOW)
    c.r(33, 33, 35, 38, SHADOW)
    feet(c, ((10, 45, 17, 47), (27, 45, 34, 47)), paw_up=paw_up)


def adult_head(c, eyes="open"):
    # big ears that break the head silhouette
    c.p([(7, 16), (9, 3), (19, 9)], INK)
    c.p([(25, 9), (35, 3), (37, 16)], INK)
    c.p([(11, 12), (12, 5), (16, 10)], PINK)
    c.p([(28, 10), (32, 5), (33, 12)], PINK)
    # tall round head
    c.p([(8, 14), (13, 9), (22, 7), (31, 9), (36, 14), (38, 21), (35, 28), (28, 32), (16, 32), (9, 28), (6, 21)], INK)
    c.p([(9, 15), (13, 10), (22, 8), (30, 10), (35, 15), (37, 21), (34, 27), (28, 31), (16, 31), (10, 27), (7, 21)], FUR)
    # forehead 3 bands, stopping above the eyes
    c.r(19, 9, 20, 13, SHADOW)
    c.r(23, 8, 24, 12, SHADOW)
    c.r(27, 9, 28, 13, SHADOW)
    # rounded cheek fluff under the eyes: two soft patches only. A straight
    # bar between them (the old 19,24,21,26 strip) read as a bra/bib line.
    c.p([(9, 22), (14, 20), (17, 22), (17, 26), (13, 28), (9, 26)], CREAM)
    c.p([(23, 22), (27, 20), (33, 22), (33, 26), (28, 28), (23, 26)], CREAM)
    face_anchors(c, "adult", eyes)
    if FACE_SPECS["adult"]["whiskers"]:
        c.l([(10, 22), (4, 21)], INK)
        c.l([(10, 25), (5, 27)], INK)
        c.l([(33, 22), (39, 21)], INK)
        c.l([(33, 25), (38, 27)], INK)


BODIES = {"baby": baby_body, "kid": kid_body, "adult": adult_body}
HEADS = {"baby": baby_head, "kid": kid_head, "adult": adult_head}


# ------------------------------------------------------- state overlays

def draw_bowl(c, stage):
    """Food dish in front of the paws, in the same blue as the falling-bowl
    FX so the child recognizes one and the same bowl. A trapezoid dish (wide
    rim, narrow base) with a domed kibble heap rising above the rim. The
    dish is ~2/3 of the body width — as wide as the body it fuses with the
    cat's bottom silhouette — and the heap gets an INK outline like every
    other shape: LIGHT-on-orange would melt into the fur behind it."""
    if stage == "baby":
        heap_edge = ((9, 25), (16, 25), (18, 27), (7, 27))
        dome, dish, inner = ((10, 26), (15, 26), (17, 27), (8, 27)), \
                            ((7, 28), (18, 28), (16, 31), (9, 31)), \
                            ((8, 29), (17, 29), (15, 30), (10, 30))
    elif stage == "kid":
        heap_edge = ((11, 31), (22, 31), (24, 33), (9, 33))
        dome, dish, inner = ((12, 32), (21, 32), (23, 33), (10, 33)), \
                            ((9, 34), (24, 34), (22, 37), (11, 37)), \
                            ((10, 35), (23, 35), (21, 36), (12, 36))
    else:
        heap_edge = ((14, 41), (30, 41), (32, 43), (12, 43))
        dome, dish, inner = ((15, 42), (29, 42), (31, 43), (13, 43)), \
                            ((12, 44), (32, 44), (30, 47), (14, 47)), \
                            ((13, 45), (31, 45), (29, 46), (15, 46))
    c.p(heap_edge, INK)
    c.p(dome, LIGHT)
    top_w = dome[1][0] - dome[0][0]
    c.r(dome[0][0] + top_w // 2 - 1, dome[0][1], dome[0][0] + top_w // 2, dome[0][1], WHITE)
    c.p(dish, INK)
    c.p(inner, BOWL)


def draw_blush(c, stage):
    """Two PINK patches centered under each eye — the offset is per stage,
    because the eye gap widens with growth (a fixed +7 landed mid-face on
    kid/adult)."""
    for x, y in {"baby": ((6, 17), (15, 17)), "kid": ((8, 18), (20, 18)),
                 "adult": ((11, 25), (26, 25))}[stage]:
        c.r(x, y, x + 1, y + 1, PINK)


def draw_tear(c, stage, phase):
    """Blue tears hanging from BOTH eyes' lower lids (a single tear read as
    a mole), rolling one pixel down on phase 1. Blue (the zzz-FX hue) stays
    visible on the cream cheek; white there would wash out."""
    pts = {"baby": ((7, 14), (16, 14)), "kid": ((8, 16), (20, 16)),
           "adult": ((12, 20), (27, 20))}[stage]
    for x, y in pts:
        c.r(x, y + phase, x, y + 1 + phase, TEAR)


def draw_blue_bubble(d, x, y, s):
    """A soap bubble: ink rim, pale-blue body (the zzz-FX hue), white glint.
    Bigger than a white speck so the cluster reads as bath foam and stays
    readable even over fur — blue never fuses with the orange/cream body."""
    if s >= 5:
        d.rectangle((x, y + 1, x + 4, y + 2), fill=INK)
        d.rectangle((x + 1, y, x + 3, y + 4), fill=INK)
        d.rectangle((x + 1, y + 1, x + 3, y + 3), fill=TEAR)
        d.point((x + 2, y + 1), fill=WHITE)
    elif s == 4:
        d.rectangle((x, y + 1, x + 3, y + 2), fill=INK)
        d.rectangle((x + 1, y, x + 2, y + 3), fill=INK)
        d.rectangle((x + 1, y + 1, x + 2, y + 2), fill=TEAR)
        d.point((x + 2, y + 1), fill=WHITE)
    else:
        d.point((x, y + 1), fill=INK)
        d.point((x + 2, y + 1), fill=INK)
        d.point((x + 1, y), fill=INK)
        d.point((x + 1, y + 2), fill=INK)
        d.point((x + 1, y + 1), fill=TEAR)


def draw_bubbles(c, stage, side):
    """Soap bubbles beside the head/body, swapping sides with the head sway.
    Each side is authored separately so no bubble lands on the face; the
    body-side spots may sit against the fur (blue stays readable on it)."""
    spots = {
        "baby": {"r": [(23, 9, 5), (26, 16, 4), (27, 5, 3)],
                 "l": [(0, 5, 5), (0, 21, 4), (0, 25, 3)]},
        "kid": {"r": [(29, 10, 5), (32, 18, 4), (32, 6, 3)],
                "l": [(0, 5, 5), (0, 25, 4), (0, 30, 3)]},
        "adult": {"r": [(38, 12, 5), (40, 22, 4), (39, 6, 3)],
                  "l": [(0, 8, 5), (0, 30, 4), (1, 18, 3)]},
    }[stage][side]
    d = ImageDraw.Draw(c.img)
    for x, y, s in spots:
        draw_blue_bubble(d, x, y, s)


def shift_vertical(img, dy):
    """Whole-body vertical offset; the canvas clips whatever leaves it."""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, dy))
    return out


# --------------------------------------------------------------- egg stage

EGG_SIZE = (29, 36)
# Row-by-row silhouette of the approved egg shell. The runtime overlays
# EGG_SPOTS at fixed coordinates, so the redraw must match this exactly.
EGG_ROWS = [(11, 17), (9, 19), (8, 20), (7, 21), (6, 22), (5, 23), (4, 24),
            (4, 24), (3, 25), (3, 25), (2, 26), (2, 26), (1, 27), (1, 27),
            (1, 27), (1, 27), (0, 28), (0, 28), (0, 28), (0, 28), (0, 28),
            (0, 28), (0, 28), (0, 28), (0, 28), (0, 28), (1, 27), (1, 27),
            (1, 27), (2, 26), (2, 26), (3, 25), (4, 24), (5, 23), (7, 21),
            (9, 20)]
EGG_EYES = ((7, 14, 9, 16), (18, 14, 20, 16))
EGG_POSES = ("idle-0", "idle-1", "blink", "eat", "sleep-0", "sleep-1",
             "happy", "excited-0", "excited-1", "excited-2", "droopy",
             "sad-0", "sad-1", "wash-0", "wash-1", "grunt-0", "grunt-1")


def draw_egg_shell(c):
    """Trace the legacy silhouette row by row; the shell is white with a
    soft cream weight in the lower flanks and cap."""
    for y, (x0, x1) in enumerate(EGG_ROWS):
        c.px(x0, y, INK)
        c.px(x1, y, INK)
        if x1 > x0 + 1:
            c.r(x0 + 1, y, x1 - 1, y, CREAM if y >= 29 else WHITE)
        if y >= 25 and x1 - x0 > 3:
            c.px(x0 + 1, y, CREAM)
            c.px(x1 - 1, y, CREAM)
    for bx, by in ((4, 17), (20, 17)):
        c.r(bx, by, bx + 2, by + 1, PINK)


def egg_eyes(c, style):
    for sx0, sy0, sx1, sy1 in EGG_EYES:
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
            raise ValueError(f"unknown egg eye style: {style}")


def egg_mouth(c, style):
    if style == "smile":
        for x, y in ((12, 19), (16, 19), (13, 20), (14, 20), (15, 20)):
            c.px(x, y, INK)
    elif style == "crumbs":
        c.r(12, 19, 15, 20, INK)
        c.r(13, 19, 14, 19, LIGHT)
    elif style == "tiny":
        c.px(14, 20, INK)
    elif style == "open-small":
        c.r(13, 20, 15, 20, INK)
    elif style == "laugh":
        c.r(12, 19, 16, 20, INK)
        c.r(13, 20, 15, 20, PINK)
    elif style == "frown":
        for x, y in ((12, 20), (16, 20), (13, 19), (14, 19), (15, 19)):
            c.px(x, y, INK)
    else:
        raise ValueError(f"unknown egg mouth style: {style}")


def egg_bubble(d, x, y, s):
    if s == 4:
        d.rectangle((x, y + 1, x + 3, y + 2), fill=INK)
        d.rectangle((x + 1, y, x + 2, y + 3), fill=INK)
        d.rectangle((x + 1, y + 1, x + 2, y + 2), fill=WHITE)
        d.point((x + 2, y + 1), fill=LIGHT)
    else:
        d.point((x, y + 1), fill=INK)
        d.point((x + 2, y + 1), fill=INK)
        d.point((x + 1, y), fill=INK)
        d.point((x + 1, y + 2), fill=INK)
        d.point((x + 1, y + 1), fill=WHITE)


def draw_egg(pose="idle-0"):
    """The egg stage on one 29x36 canvas: silhouette row-copied from the
    approved shell (EGG_SPOTS is pinned to it) with a locally drawn face.
    Eyes/mouth/tear/bubbles change per pose; the shell never does."""
    c = Canvas(*EGG_SIZE)
    draw_egg_shell(c)
    spec = {
        "idle-0": ("open", "smile", 0),
        "idle-1": ("open", "smile", 0),
        "blink": ("closed", "smile", 0),
        "eat": ("closed", "crumbs", 0),
        "sleep-0": ("closed", "tiny", 0),
        "sleep-1": ("closed", "open-small", 0),
        "happy": ("arc", "laugh", 0),
        "excited-0": ("open", "laugh", 0),
        "excited-1": ("star", "laugh", 0),
        "excited-2": ("star", "laugh", 0),
        "droopy": ("lid", "frown", 0),
        "sad-0": ("lid", "frown", 0),
        "sad-1": ("lid", "frown", 0),
        "wash-0": ("closed", "tiny", 0),
        "wash-1": ("closed", "tiny", 0),
        "grunt-0": ("squeeze", "frown", 0),
        "grunt-1": ("squeeze", "frown", 1),
    }[pose]
    eyes, mouth, dy = spec
    c.offset(0, dy)
    egg_eyes(c, eyes)
    egg_mouth(c, mouth)
    c.offset(0, -dy)
    img = c.img
    d = ImageDraw.Draw(img)
    if pose.startswith("sad-"):
        roll = 0 if pose == "sad-0" else 1
        for tx in (5, 16):
            d.rectangle((tx, 19 + roll, tx, 20 + roll), fill=TEAR)
    if pose == "wash-0":
        egg_bubble(d, 24, 1, 4)
        egg_bubble(d, 25, 6, 3)
    if pose == "wash-1":
        egg_bubble(d, 1, 1, 4)
        egg_bubble(d, 2, 6, 3)
    if pose == "excited-2":
        img = shift_vertical(img, -1)
    if pose == "idle-1":
        img = shift_vertical(img, 1)
    # Pad the 29x36 egg into a 29x40 canvas (2px top + 2px bottom) so the
    # shell arcs are not clipped by the canvas edge.
    padded = Image.new('RGBA', (img.width, img.height + 4), (0, 0, 0, 0))
    padded.paste(img, (0, 2))
    return padded


# --------------------------------------------------------------- walking

# Gait table per frame: (front pair dx, back pair dx, body bob). The tail
# tip sways up/down with the frame parity.
WALK_PHASES = ((2, -2, 0), (1, -1, -1), (0, 0, 0), (-1, 1, -1),
               (-2, 2, 0), (-1, 1, 0), (1, -1, 0))

WALK_LAYOUT = {
    # facing right: head at the right end, tail at the left rear
    "adult": dict(
        body=(5, 22, 36, 42), body_in=(7, 24, 34, 40), belly=(10, 31, 30, 41),
        head=(26, 9, 43, 27), head_in=(28, 11, 41, 25),
        ear=((31, 3), (35, 2), (38, 11)), ear_in=((33, 5), (35, 4), (36, 9)),
        muzzle=(35, 18, 43, 26), eye=(35, 15, 36, 17), nose=(42, 21, 43, 22),
        near_front=27, near_back=7, far_front=30, far_back=10, leg_top=37,
        tail=((8, 30), (2, 25), (2, 17)), tail_up=(2, 15), tail_down=(3, 20),
        tail_w=(6, 4),
    ),
    "kid": dict(
        body=(4, 18, 29, 34), body_in=(6, 20, 27, 32), belly=(9, 25, 25, 33),
        head=(20, 7, 34, 22), head_in=(22, 9, 32, 20),
        ear=((25, 1), (28, 1), (31, 9)), ear_in=((27, 3), (28, 3), (29, 7)),
        muzzle=(29, 15, 35, 21), eye=(26, 12, 27, 14), nose=(33, 17, 34, 18),
        near_front=20, near_back=5, far_front=22, far_back=7, leg_top=31,
        tail=((5, 24), (1, 19), (0, 12)), tail_up=(0, 10), tail_down=(1, 14),
        tail_w=(5, 3),
    ),
    "baby": dict(
        body=(3, 16, 23, 28), body_in=(5, 18, 21, 26), belly=(7, 21, 19, 27),
        head=(15, 7, 27, 18), head_in=(16, 8, 26, 17),
        ear=((19, 2), (21, 1), (24, 7)), ear_in=((20, 3), (21, 3), (23, 5)),
        muzzle=(23, 13, 27, 17), eye=(21, 10, 22, 12), nose=(26, 14, 26, 15),
        near_front=16, near_back=4, far_front=18, far_back=6, leg_top=25,
        tail=((4, 19), (1, 15), (1, 10)), tail_up=(1, 8), tail_down=(2, 12),
        tail_w=(5, 3),
    ),
}


def draw_walk(stage, f):
    """Side-view walk cycle (facing right; leftward walking is a CSS flip).
    Only the legs, the tail tip and a one-pixel body bob change per frame —
    the head and its side eye stay put so the face never drifts. Legs stay
    anchored to the canvas floor; the bobbing body reveals or covers them."""
    w, h = SIZES[stage]
    lay = WALK_LAYOUT[stage]
    fdx, bdx, bob = WALK_PHASES[f]
    c = Canvas(w, h)
    # far legs behind the body, moving opposite to the near pair
    for x0, dx in ((lay["far_front"], -fdx), (lay["far_back"], -bdx)):
        c.r(x0 + dx, lay["leg_top"], x0 + dx + 2, h - 1, SHADOW)
    # tail with a swaying tip, body and head bob with the gait
    c.offset(0, bob)
    tip = lay["tail_up"] if f % 2 == 0 else lay["tail_down"]
    c.l(list(lay["tail"][:-1]) + [tip], INK, lay["tail_w"][0])
    c.l(list(lay["tail"][:-1]) + [tip], FUR, lay["tail_w"][1])
    c.d.ellipse(lay["body"], fill=INK)
    c.d.ellipse(lay["body_in"], fill=FUR)
    c.d.ellipse(lay["belly"], fill=CREAM)
    c.p(lay["ear"], INK)
    c.p(lay["ear_in"], PINK)
    c.d.ellipse(lay["head"], fill=INK)
    c.d.ellipse(lay["head_in"], fill=FUR)
    c.d.ellipse(lay["muzzle"], fill=CREAM)
    c.r(*lay["eye"], INK)
    c.r(*lay["nose"], NOSE)
    c.offset(0, -bob)
    # near legs, grounded on the canvas floor
    for x0, dx in ((lay["near_front"], fdx), (lay["near_back"], bdx)):
        c.r(x0 + dx, lay["leg_top"], x0 + dx + 2, h - 1, INK)
        c.r(x0 + dx + 1, lay["leg_top"] + 1, x0 + dx + 1, h - 2, FUR)
    return c.img


# ------------------------------------------------------------- sleeping

def draw_zzz(img, stage, phase):
    """Zzz drawn AFTER the nearest-neighbor fit: a scaled 1px diagonal turns
    into a blurry 'I', so each stage gets a crisp hand-sized Z (top bar,
    diagonal, bottom bar) at its own coordinates."""
    d = ImageDraw.Draw(img)
    zx, zy, s = {"baby": (21, 8, 5), "kid": (25, 8, 5), "adult": (30, 10, 5)}[stage]
    small = {"baby": (18, 13, 4), "kid": (22, 15, 4), "adult": (28, 15, 4)}[stage]
    if phase:
        zy += 1
    for x, y, w in ((zx, zy, s), small):
        d.rectangle((x, y, x + w - 1, y), fill=INK)
        for i in range(1, w - 1):
            d.point((x + w - 1 - i, y + i), fill=INK)
        d.rectangle((x, y + w - 1, x + w - 1, y + w - 1), fill=INK)


def draw_sleep(stage, phase):
    """Side-lying curl: the only pose with its own silhouette. The head
    rests at the left, the tail wraps along the front. Authored once on a
    30x32 master layout, nearest-neighbor fitted to each stage canvas, then
    the Zzz glyphs are drawn crisp on the final size."""
    c = Canvas(30, 32)
    # tail wrapping along the front of the curl
    c.l([(12, 30), (20, 32), (27, 29), (28, 25)], INK, 5)
    c.l([(13, 30), (20, 31), (26, 28)], FUR, 3)
    # lying body bean
    c.p([(10, 20), (24, 19), (30, 23), (31, 28), (28, 31), (12, 31), (7, 27), (7, 23)], INK)
    c.p([(11, 22), (23, 21), (28, 24), (29, 28), (27, 30), (13, 30), (9, 27), (9, 24)], FUR)
    # haunch hint
    c.l([(22, 22), (26, 25), (26, 29)], SHADOW, 2)
    # resting head with one ear up and a closed eye; the cream muzzle stays
    # 1px inside the outline (flush cream read as a bird beak)
    c.p([(10, 14), (11, 9), (16, 13)], INK)          # ear
    c.p([(10, 12), (12, 10), (14, 12)], PINK)
    c.p([(4, 16), (8, 12), (14, 12), (17, 16), (16, 22), (10, 24), (5, 21)], INK)
    c.p([(5, 17), (8, 13), (13, 13), (16, 17), (15, 21), (10, 23), (6, 20)], FUR)
    c.p([(6, 18), (10, 16), (13, 18), (13, 21), (10, 23), (7, 21)], CREAM)
    c.r(6, 15, 9, 15, INK)                            # closed eye line
    c.r(6, 19, 7, 19, NOSE)                           # nose on the muzzle edge
    img = c.img.resize(SIZES[stage], Image.NEAREST)
    draw_zzz(img, stage, phase)
    return img


# --------------------------------------------------------------- frames

def draw_cat(stage):
    """The approved standing base for one stage."""
    c = Canvas(*SIZES[stage])
    BODIES[stage](c)
    HEADS[stage](c)
    return c.img


def render_pose(stage, head=(0, 0), eyes="open", bowl=False, tear=None,
                bubble=None, blush=False, tail_lift=0, tail_droop=False,
                paw_up=False):
    """Re-render a stage with the head group pitched/swayed, the tail
    wagging/drooping and overlays applied."""
    c = Canvas(*SIZES[stage])
    BODIES[stage](c, tail_lift=tail_lift, tail_droop=tail_droop, paw_up=paw_up)
    if bowl:
        draw_bowl(c, stage)
    c.offset(*head)
    HEADS[stage](c, eyes)
    if blush:
        # blush belongs to the face group: drawn inside the head offset so it
        # pitches with the head instead of pinning to the canvas.
        draw_blush(c, stage)
    c.offset(-head[0], -head[1])
    if tear is not None:
        draw_tear(c, stage, tear)
    if bubble is not None:
        draw_bubbles(c, stage, bubble)
    return c.img


POSES = ("eat-0", "eat-1", "eat-2",
         "sleep-0", "sleep-1",
         "happy-0", "happy-1", "happy-2",
         "excited-0", "excited-1", "excited-2",
         "droopy", "sad-0", "sad-1", "wash-0", "wash-1",
         "grunt-0", "grunt-1")


def cat_frame(stage, pose):
    """One state frame: every pose changes exactly one or two things on its
    own stage base, never the calibrated face construction."""
    if pose.startswith("sleep-"):
        return draw_sleep(stage, int(pose[-1]))
    if pose == "happy-0":
        return shift_vertical(render_pose(stage, tail_lift=1), 1)      # crouch, tail up
    if pose in ("happy-1", "excited-1"):
        return shift_vertical(
            render_pose(stage, tail_lift=-1, paw_up=(pose == "excited-1")), -2)
    if pose == "excited-0":
        return shift_vertical(render_pose(stage, tail_lift=1), -1)     # hop
    if pose == "happy-2":
        return render_pose(stage, tail_lift=-1)                        # landing
    # The kitten's face sits just above the heap at pitch +2; +3 made the
    # chin outline touch the heap outline. Bigger stages keep +3.
    pitch = 2 if stage == "baby" else 3
    if pose == "eat-0":
        return render_pose(stage, head=(0, pitch), bowl=True, tail_lift=1)
    if pose == "eat-1":
        return render_pose(stage, head=(0, pitch), bowl=True, eyes="closed", tail_lift=-1)
    if pose == "eat-2":
        return render_pose(stage, head=(0, -2), bowl=True)
    if pose == "excited-2":
        return render_pose(stage, eyes="star", tail_lift=1, paw_up=True)
    if pose == "sad-0":
        return render_pose(stage, eyes="lid", tear=0, tail_droop=True)
    if pose == "sad-1":
        return render_pose(stage, eyes="lid", tear=1, tail_droop=True)
    if pose == "droopy":
        return render_pose(stage, eyes="lid", tail_droop=True)
    if pose == "wash-0":
        return render_pose(stage, head=(1, 0), bubble="r")
    if pose == "wash-1":
        return render_pose(stage, head=(-1, 0), bubble="l")
    if pose == "grunt-0":
        return render_pose(stage, eyes="squeeze", blush=True)
    if pose == "grunt-1":
        return render_pose(stage, head=(0, 1), eyes="squeeze", blush=True)
    raise ValueError(f"unknown pose: {pose}")


def derive_frames(stage, base):
    """Derive idle-0/idle-1/blink from one approved base stance.

    idle-1 is a one-pixel downward breath (feet stay grounded on the canvas
    floor). Blink clears the two eye sockets to cheek cream and closes each
    lid on the socket's bottom row; everything outside the sockets is
    byte-identical to the base.
    """
    idle0 = base.copy()
    idle1 = Image.new("RGBA", base.size, (0, 0, 0, 0))
    idle1.paste(base, (0, 1))
    blink = base.copy()
    for x0, y0, x1, y1 in EYE_SOCKETS[stage]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                blink.putpixel((x, y), CREAM)
        for x in range(x0, x1 + 1):
            blink.putpixel((x, y1), INK)
    return idle0, idle1, blink


def main():
    SPRITES.mkdir(parents=True, exist_ok=True)
    draw_egg().save(SPRITES / "cat-egg-v2.png")
    for pose in EGG_POSES:
        draw_egg(pose).save(SPRITES / f"cat-egg-v2-{pose}.png")
    for stage in ("baby", "kid", "adult"):
        base = draw_cat(stage)
        base.save(SPRITES / f"cat-{stage}-v2.png")
        idle0, idle1, blink = derive_frames(stage, base)
        idle0.save(SPRITES / f"cat-{stage}-v2-idle-0.png")
        idle1.save(SPRITES / f"cat-{stage}-v2-idle-1.png")
        blink.save(SPRITES / f"cat-{stage}-v2-blink.png")
        for pose in POSES:
            cat_frame(stage, pose).save(SPRITES / f"cat-{stage}-v2-{pose}.png")
        for f in range(7):
            draw_walk(stage, f).save(SPRITES / f"cat-{stage}-v2-walk-{f}.png")
    print("generated local cat v2 base + idle/blink + state + walk sprites")


if __name__ == "__main__":
    main()
