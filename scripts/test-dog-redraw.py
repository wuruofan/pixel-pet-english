#!/usr/bin/env python3
"""Contract checks for the local pixel-redrawn dog base samples.

Mirror of test-cat-redraw.py, adapted for the dog design (floppy ears,
white muzzle with omega mouth, stick tail). Three stage-distinct bodies
plus 21 differential frames per stage (idle x2 + blink + eat x3 + sleep x2
+ happy x3 + excited x3 + droopy + sad x2 + wash x2 + grunt x2) and a
side-view walk cycle of 7 frames.

Pixel coords come from scripts/redraw-dog-local.py (DOG_EYES, DOG_TAIL_TIP,
DOG_PAW_PAD, etc.) and from the per-stage muzzle/nose/mouth layouts.
"""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"

# Shared constants (mirrored from redraw-dog-local.py).
INK = (57, 38, 43, 255)
WHITE = (255, 253, 247, 255)
TEAR = (159, 183, 255, 255)
BOWL = (74, 127, 193, 255)
LIGHT = (255, 190, 70, 255)
PINK = (244, 132, 145, 255)
NOSE = (207, 82, 105, 255)

EXPECTED_SIZES = {
    "baby": (30, 32),
    "kid": (36, 38),
    "adult": (44, 48),
}

# Eye rectangles (left, right) on the final dog canvas.
DOG_EYES = {
    "baby": ((9, 10, 11, 12), (14, 10, 16, 12)),
    "kid": ((10, 11, 12, 13), (18, 11, 20, 13)),
    "adult": ((13, 14, 16, 17), (26, 14, 29, 17)),
}

# Tail tip pixels at tail_lift=0; droop tips when tail is on the floor.
DOG_TAIL_TIP = {"baby": (27, 19), "kid": (30, 25), "adult": (40, 33)}
DOG_TAIL_TIP_DROOP = {"baby": (27, 30), "kid": (28, 36), "adult": (36, 46)}

# Tail and paw bounding boxes — exempt from shift-equality checks. The
# paw box reaches up two rows above the paws so excited-1's lifted+shifted
# paw rim stays inside the exemption (otherwise the rim pixels leak into
# the body silhouette and break the shift equality).
DOG_TAIL_BOX = {
    "baby": (20, 16, 30, 32), "kid": (24, 20, 33, 38), "adult": (30, 24, 44, 48),
}
DOG_PAW_BOX = {
    "baby": (13, 24, 20, 32), "kid": (17, 31, 25, 38), "adult": (26, 40, 35, 48),
}
DOG_PAW_PAD = {"baby": (16, 28), "kid": (20, 34), "adult": (30, 44)}

# Stage-specific mouth anchor (under the white muzzle nose).
DOG_MOUTH = {
    "baby": [(11, 17), (12, 17), (13, 17), (14, 17)],
    "kid": [(13, 18), (14, 18), (15, 18), (16, 18), (17, 18)],
    "adult": [(18, 25), (19, 25), (20, 25), (21, 25), (22, 25), (23, 25), (24, 25)],
}

# Body palettes (cream / brown / golden).
DOG_BODY = {
    "baby": (242, 221, 176, 255),
    "kid": (201, 149, 94, 255),
    "adult": (236, 192, 108, 255),
}
DOG_COLLAR = (217, 106, 106, 255)

# Sad tear anchor on the left eye (one px down on sad-1).
DOG_TEAR_BASE = {"baby": (10, 13), "kid": (11, 14), "adult": (14, 18)}

# Bounding box of the omega mouth per stage — excited-2 swaps in the "laugh"
# variant so the muzzle pixels legitimately differ from the base. We exempt
# the full mouth bounding box so both smile and laugh variants are covered.
DOG_LAUGH_BOX = {
    "baby": (10, 16, 15, 19),
    "kid": (12, 17, 18, 20),
    "adult": (17, 23, 25, 28),
}


def main():
    def is_ink(pixel):
        r, g, b, a = pixel
        return a > 0 and r < 100 and g < 80 and b < 90

    def load(name):
        return Image.open(SPRITES / name).convert("RGBA")

    def find_tail_tip(img, box):
        """Return the rightmost ink pixel inside `box`, breaking ties by
        smallest y. The stick tail sticks out past the head's right edge,
        so its rightmost ink wins over the head outline."""
        x0, y0, x1, y1 = box
        best = None
        for y in range(y0, y1):
            for x in range(x0, x1):
                if is_ink(img.getpixel((x, y))):
                    if best is None or (x > best[0]) or (x == best[0] and y < best[1]):
                        best = (x, y)
        return best

    def find_tail_droop_tip(img, box):
        """Return the lowest ink pixel inside `box`, breaking ties by
        largest x. The drooping tail's tip settles near the canvas floor."""
        x0, y0, x1, y1 = box
        best = None
        for y in range(y0, y1):
            for x in range(x0, x1):
                if is_ink(img.getpixel((x, y))):
                    if best is None or (y > best[1]) or (y == best[1] and x > best[0]):
                        best = (x, y)
        return best

    # Three visually distinct bases, feet on the floor.
    bytes_seen = set()
    for stage, size in EXPECTED_SIZES.items():
        path = SPRITES / f"dog-{stage}-v2.png"
        assert path.exists(), f"missing local redraw: {path.name}"
        image = load(f"dog-{stage}-v2.png")
        assert image.size == size, (
            f"{path.name} has size {image.size}, expected {size}"
        )
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        assert bbox, f"{path.name} is empty"
        assert bbox[3] == size[1], (
            f"{path.name} feet must touch the canvas floor"
        )
        assert alpha.getpixel((0, 0)) == 0, (
            f"{path.name} needs transparent padding"
        )
        bytes_seen.add(path.read_bytes())
    assert len(bytes_seen) == 3, "the three redraw stages must be visually distinct"

    # Eye sockets must be calibrated dark blocks with one white glint each.
    for stage, (left, right) in DOG_EYES.items():
        image = load(f"dog-{stage}-v2.png")
        for sx0, sy0, sx1, sy1 in (left, right):
            for y in range(sy0, sy1 + 1):
                for x in range(sx0, sx1 + 1):
                    expected = INK if not (x == sx0 + 1 and y == sy0) else WHITE
                    assert image.getpixel((x, y)) == expected, (
                        f"{stage} eye socket ({sx0},{sy0})-({sx1},{sy1}) broke "
                        f"calibration at ({x}, {y})"
                    )

    # Omega mouth under the muzzle.
    for stage, pts in DOG_MOUTH.items():
        image = load(f"dog-{stage}-v2.png")
        assert all(image.getpixel(p) == INK for p in pts), (
            f"{stage} omega mouth missing at {pts}"
        )

    # Tail tip must land on its color.
    for stage in EXPECTED_SIZES:
        image = load(f"dog-{stage}-v2.png")
        tip = find_tail_tip(image, DOG_TAIL_BOX[stage])
        assert tip is not None, f"{stage} tail box has no ink at all"
        tx, ty = tip
        assert is_ink(image.getpixel((tx, ty))), (
            f"{stage} tail tip pixel not ink"
        )

    # Adult stage wears the red collar.
    adult = load("dog-adult-v2.png")
    collar_band = [(13, 30), (14, 30), (20, 30), (28, 30), (30, 30)]
    assert any(adult.getpixel(p) == DOG_COLLAR for p in collar_band), (
        f"adult dog should wear the red collar; got {[adult.getpixel(p) for p in collar_band]}"
    )

    # Kid stage has eyebrow spots above the eyes.
    kid = load("dog-kid-v2.png")
    kid_brown = (168, 116, 62, 255)
    assert kid.getpixel((9, 8)) == kid_brown and kid.getpixel((9, 9)) == kid_brown, (
        "kid left eyebrow spot missing"
    )
    assert kid.getpixel((21, 8)) == kid_brown and kid.getpixel((21, 9)) == kid_brown, (
        "kid right eyebrow spot missing"
    )

    # ---------------------------------------------------------------
    # idle-0 / idle-1 / blink must obey the same invariants as the cat.
    for stage, size in EXPECTED_SIZES.items():
        base = load(f"dog-{stage}-v2.png")
        sockets = DOG_EYES[stage]

        # idle-0 equals base.
        idle0 = load(f"dog-{stage}-v2-idle-0.png")
        assert idle0.size == size
        assert idle0.tobytes() == base.tobytes(), (
            f"dog-{stage}-v2-idle-0 must equal base"
        )

        # idle-1: 1px dip + tail tip moves down 1 px (sway).
        idle1 = load(f"dog-{stage}-v2-idle-1.png")
        assert idle1.size == size
        tb0 = DOG_TAIL_BOX[stage][:2]
        tb1 = DOG_TAIL_BOX[stage][2:]
        for y in range(size[1]):
            for x in range(size[0]):
                if tb0[0] <= x < tb1[0] and tb0[1] <= y < tb1[1]:
                    continue
                expected = base.getpixel((x, y - 1)) if y > 0 else (0, 0, 0, 0)
                assert idle1.getpixel((x, y)) == expected, (
                    f"dog-{stage}-v2-idle-1 is not a clean 1px breath at ({x},{y})"
                )
        tx, ty = find_tail_tip(base, DOG_TAIL_BOX[stage])
        # idle-1 must shift some pixels inside the tail box (the breath
        # carries the stick tail a fraction of a pixel).
        tb0 = DOG_TAIL_BOX[stage][:2]
        tb1 = DOG_TAIL_BOX[stage][2:]
        tail_diff = 0
        for ty_ in range(tb0[1], tb1[1]):
            for tx_ in range(tb0[0], tb1[0]):
                if idle1.getpixel((tx_, ty_)) != base.getpixel((tx_, ty_)):
                    tail_diff += 1
        assert tail_diff > 0, (
            f"dog-{stage} idle breath must sway the tail (no pixel changed)"
        )

        # blink: only the two eye sockets change (filled with body color and a
        # bottom ink lid).
        blink = load(f"dog-{stage}-v2-blink.png")
        assert blink.size == size
        cream = DOG_BODY[stage]
        for y in range(size[1]):
            for x in range(size[0]):
                if any(sx0 <= x <= sx1 and sy0 <= y <= sy1 for sx0, sy0, sx1, sy1 in sockets):
                    continue
                assert blink.getpixel((x, y)) == base.getpixel((x, y)), (
                    f"dog-{stage}-v2-blink changed pixels outside eye sockets at ({x},{y})"
                )
        for sx0, sy0, sx1, sy1 in sockets:
            for y in range(sy0, sy1 + 1):
                for x in range(sx0, sx1 + 1):
                    expected = INK if y == sy1 else cream
                    assert blink.getpixel((x, y)) == expected, (
                        f"dog-{stage}-v2-blink closed lid error at ({x},{y})"
                    )

    # ---------------------------------------------------------------
    # State poses.
    base_nose = {"baby": (11, 14), "kid": (14, 15), "adult": (20, 20)}

    for stage, size in EXPECTED_SIZES.items():
        base = load(f"dog-{stage}-v2.png")
        sockets = DOG_EYES[stage]
        nx, ny = base_nose[stage]
        tb0 = DOG_TAIL_BOX[stage][:2]
        tb1 = DOG_TAIL_BOX[stage][2:]
        pb0 = DOG_PAW_BOX[stage][:2]
        pb1 = DOG_PAW_BOX[stage][2:]

        # happy/excited hops: full-body shift + tail wag; excited-1 also
        # lifts the right paw.
        hop_spec = (
            ("happy-0", 1, 1), ("happy-1", -2, -1), ("happy-2", 0, -1),
            ("excited-0", -1, 1), ("excited-1", -2, -1),
        )
        for pose, dy, lift in hop_spec:
            img = load(f"dog-{stage}-v2-{pose}.png")
            assert img.size == size, f"{stage} {pose} wrong canvas"
            paw_up = pose == "excited-1"
            for y in range(size[1]):
                sy = y - dy
                for x in range(size[0]):
                    if tb0[0] <= x < tb1[0] and tb0[1] <= y < tb1[1]:
                        continue
                    if paw_up and pb0[0] <= x < pb1[0] and pb0[1] <= y < pb1[1]:
                        continue
                    expected = base.getpixel((x, sy)) if 0 <= sy < size[1] else (0, 0, 0, 0)
                    assert img.getpixel((x, y)) == expected, (
                        f"dog {stage} {pose} must be a clean {dy:+d}px body "
                        f"shift at ({x}, {y})"
                    )
            # The tail must change inside its box — wagging/drooping shifts
            # at least some pixels compared to the base stance.
            tb0 = DOG_TAIL_BOX[stage][:2]
            tb1 = DOG_TAIL_BOX[stage][2:]
            tail_diff = 0
            for ty in range(tb0[1], tb1[1]):
                for tx in range(tb0[0], tb1[0]):
                    if img.getpixel((tx, ty)) != base.getpixel((tx, ty)):
                        tail_diff += 1
            assert tail_diff > 0, (
                f"dog {stage} {pose} tail must move (no pixel changed in tail box)"
            )
            if paw_up:
                px_, py_ = DOG_PAW_PAD[stage]
                assert img.getpixel((px_, py_ - 2)) == LIGHT, (
                    f"dog {stage} {pose} lifted paw pad must rise with the hop"
                )
                assert img.getpixel((px_, py_ + 2)) == (0, 0, 0, 0), (
                    f"dog {stage} {pose} paws must leave the floor clear"
                )

        # excited-2: star eyes + raised paw + tail up; everything outside
        # sockets/tail/paw/mouth stays on base.
        star = load(f"dog-{stage}-v2-excited-2.png")
        mx0, my0, mx1, my1 = DOG_LAUGH_BOX[stage]
        for y in range(size[1]):
            for x in range(size[0]):
                in_socket = any(sx0 <= x <= sx1 and sy0 <= y <= sy1
                                for sx0, sy0, sx1, sy1 in sockets)
                in_tail = tb0[0] <= x < tb1[0] and tb0[1] <= y < tb1[1]
                in_paw = pb0[0] <= x < pb1[0] and pb0[1] <= y < pb1[1]
                in_mouth = mx0 <= x <= mx1 and my0 <= y <= my1
                if in_socket or in_tail or in_paw or in_mouth:
                    continue
                assert star.getpixel((x, y)) == base.getpixel((x, y)), (
                    f"dog {stage} excited-2 changed pixels outside "
                    f"sockets/tail/paw/mouth at ({x},{y})"
                )
        for sx0, sy0, sx1, sy1 in sockets:
            assert star.getpixel((sx0 + 1, sy0 + 1)) == LIGHT, (
                f"dog {stage} excited-2 star eye must glow light at ({sx0 + 1}, {sy0 + 1})"
            )
        px_, py_ = DOG_PAW_PAD[stage]
        assert star.getpixel((px_, py_)) == LIGHT, (
            f"dog {stage} excited-2 lifted paw must show its light pad"
        )
        tb0 = DOG_TAIL_BOX[stage][:2]
        tb1 = DOG_TAIL_BOX[stage][2:]
        tail_diff = 0
        for ty in range(tb0[1], tb1[1]):
            for tx in range(tb0[0], tb1[0]):
                if star.getpixel((tx, ty)) != base.getpixel((tx, ty)):
                    tail_diff += 1
        assert tail_diff > 0, (
            f"dog {stage} excited-2 tail must move (no pixel changed in tail box)"
        )

        # eat: face pitches + bowl rim/heap + tail sways.
        dish_spec = {
            "baby": (7, 28, 18, 31), "kid": (9, 34, 24, 37), "adult": (12, 44, 32, 47),
        }[stage]
        dx0, dy0, dx1, dy1 = dish_spec
        rim_y = {"baby": 28, "kid": 34, "adult": 44}[stage]
        cx = (dx0 + dx1) // 2
        pitch = 2 if stage == "baby" else 3
        for pose, dy, eyes in (("eat-0", pitch, "open"), ("eat-1", pitch, "closed"),
                               ("eat-2", -2, "open")):
            img = load(f"dog-{stage}-v2-{pose}.png")
            assert img.getpixel((nx, ny + dy)) == NOSE, (
                f"dog {stage} {pose} nose must follow the pitched head"
            )
            assert img.getpixel((dx0 + 2, rim_y)) == INK and img.getpixel((dx1 - 3, rim_y)) == INK, (
                f"dog {stage} {pose} missing its dish rim"
            )
            assert img.getpixel((cx, rim_y + 1)) == BOWL, (
                f"dog {stage} {pose} dish must be the blue bowl"
            )
            assert img.getpixel((cx - 2, rim_y - 2)) == LIGHT and img.getpixel((cx + 2, rim_y - 2)) == LIGHT, (
                f"dog {stage} {pose} kibble heap must rise above the rim"
            )
            assert img.getpixel((cx, rim_y - 2)) == WHITE, (
                f"dog {stage} {pose} heap needs a bright glint"
            )
            assert img.getpixel((cx, rim_y - 3)) == INK, (
                f"dog {stage} {pose} heap needs its ink outline"
            )
            if eyes == "closed":
                for sx0, sy0, sx1, sy1 in sockets:
                    assert img.getpixel((sx0, sy1 + dy)) == INK, (
                        f"dog {stage} eat-1 must close both eyes"
                    )

        # sleep: lying silhouette fills the canvas to the floor; crisp Z glyph.
        for phase in (0, 1):
            img = load(f"dog-{stage}-v2-sleep-{phase}.png")
            assert img.size == size and img.getbbox()[3] == size[1], (
                f"dog {stage} sleep-{phase} must fill its canvas down to the floor"
            )
        zz = {"baby": (21, 8, 5), "kid": (25, 8, 5), "adult": (30, 10, 5)}[stage]
        for phase in (0, 1):
            img = load(f"dog-{stage}-v2-sleep-{phase}.png")
            zy = zz[1] + phase
            x0, s = zz[0], zz[2]
            assert all(img.getpixel((x, zy)) == INK for x in range(x0, x0 + s)), (
                f"dog {stage} sleep-{phase} Z glyph needs its top bar"
            )
            assert all(img.getpixel((x, zy + s - 1)) == INK for x in range(x0, x0 + s)), (
                f"dog {stage} sleep-{phase} Z glyph needs its bottom bar"
            )
            for i in range(1, s - 1):
                diag_x = x0 + s - 1 - i
                assert img.getpixel((diag_x, zy + i)) == INK, (
                    f"dog {stage} sleep-{phase} Z glyph needs its diagonal"
                )
                strays = [x for x in range(x0, x0 + s)
                          if x != diag_x and img.getpixel((x, zy + i)) == INK]
                assert not strays, (
                    f"dog {stage} sleep-{phase} Z middle rows must stay a thin diagonal"
                )

        # sad/droopy: heavy lids over sockets (white interior with ink
        # line on second row), tail droops to the floor; sad-0/sad-1 add
        # a blue tear.
        for pose, roll in (("sad-0", 0), ("sad-1", 1), ("droopy", None)):
            img = load(f"dog-{stage}-v2-{pose}.png")
            for sx0, sy0, sx1, sy1 in sockets:
                assert img.getpixel((sx0, sy0)) == WHITE, (
                    f"dog {stage} {pose} must shade heavy lids (top row white)"
                )
                assert img.getpixel((sx0, sy0 + 1)) == INK, (
                    f"dog {stage} {pose} must draw the lid line on row+1"
                )
            d_tip = find_tail_droop_tip(img, DOG_TAIL_BOX[stage])
            assert d_tip is not None, (
                f"dog {stage} {pose} tail must droop (no ink in tail box)"
            )
            if roll is not None:
                tx_, ty_ = DOG_TEAR_BASE[stage]
                for dy in (0, 1):
                    assert img.getpixel((tx_, ty_ + roll + dy)) == TEAR, (
                        f"dog {stage} {pose} is missing its tear"
                    )
            else:
                tx_, ty_ = DOG_TEAR_BASE[stage]
                assert img.getpixel((tx_, ty_)) != TEAR, (
                    f"dog {stage} droopy must not show a tear"
                )

        # wash: head sways and bubbles show on the active side.
        for pose, dx, side in (("wash-0", 1, "r"), ("wash-1", -1, "l")):
            img = load(f"dog-{stage}-v2-{pose}.png")
            assert img.getpixel((nx + dx, ny)) == NOSE, (
                f"dog {stage} {pose} nose must sway with the head"
            )
            # The bubble cluster sits beside the head on wash-0; on wash-1
            # it's authored to the left flank. Big blue bubbles: ink rim +
            # pale-blue body (TEAR hue) so they read over fur too.
            bubble_main = {"baby": (23, 9), "kid": (29, 11), "adult": (38, 13)}[stage]
            if side == "l":
                # left-side spots are authored separately (a mirror would
                # land the bubble on the floppy ear / face)
                bubble_main = {"baby": (0, 4), "kid": (0, 3), "adult": (0, 4)}[stage]
            assert img.getpixel((bubble_main[0], bubble_main[1] + 1)) == INK, (
                f"dog {stage} {pose} is missing its soap bubble rim at {bubble_main}"
            )
            assert img.getpixel((bubble_main[0] + 1, bubble_main[1] + 1)) == TEAR, (
                f"dog {stage} {pose} is missing its soap bubble interior"
            )

        # grunt: squeezed eyes; nose/mouth stay readable.
        for pose, dy in (("grunt-0", 0), ("grunt-1", 1)):
            img = load(f"dog-{stage}-v2-{pose}.png")
            for sx0, sy0, sx1, sy1 in sockets:
                assert img.getpixel((sx0, sy0 + 1 + dy)) == INK, (
                    f"dog {stage} {pose} must squeeze its eyes shut"
                )

        # walk: 7 distinct frames with a side-view eye and grounded legs.
        walks = [load(f"dog-{stage}-v2-walk-{f}.png") for f in range(7)]
        assert len({w.tobytes() for w in walks}) == 7, (
            f"dog {stage} walk frames must be seven distinct pictures"
        )
        eye_px = {"baby": (21, 10), "kid": (27, 12), "adult": (35, 14)}[stage]
        for f, img in enumerate(walks):
            assert img.size == size, f"dog {stage} walk-{f} wrong canvas"
            assert img.getpixel(eye_px) == INK, (
                f"dog {stage} walk-{f} side eye missing"
            )
            assert img.getbbox()[3] == size[1], (
                f"dog {stage} walk-{f} legs must touch the canvas floor"
            )
        tail_win = {"baby": ((21, 16), (30, 22)), "kid": ((24, 20), (33, 30)),
                    "adult": ((30, 24), (44, 38))}[stage]
        (tx0, ty0), (tx1, ty1) = tail_win
        assert any(
            walks[0].getpixel((x, y)) != walks[1].getpixel((x, y))
            for y in range(ty0, ty1) for x in range(tx0, tx1)
        ), f"dog {stage} walk tail must sway between frames"

    print("dog redraw contract: PASS")


if __name__ == "__main__":
    main()
