#!/usr/bin/env python3
"""Contract checks for the local pixel-redrawn cat base samples."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
INK = (57, 38, 43, 255)
LIGHT = (255, 190, 70, 255)
FUR = (244, 157, 55, 255)
PINK = (244, 132, 145, 255)
NOSE = (207, 82, 105, 255)
WHITE = (255, 253, 247, 255)
TEAR = (159, 183, 255, 255)
BOWL = (74, 127, 193, 255)

EXPECTED_SIZES = {
    "baby": (30, 32),
    "kid": (36, 38),
    "adult": (44, 48),
}


def main():
    def is_ink(pixel):
        r, g, b, a = pixel
        return a > 0 and r < 100 and g < 80 and b < 90

    frames = []
    for stage, size in EXPECTED_SIZES.items():
        path = SPRITES / f"cat-{stage}-v2.png"
        assert path.exists(), f"missing local redraw: {path.name}"
        image = Image.open(path).convert("RGBA")
        assert image.size == size, f"{path.name} has size {image.size}, expected {size}"
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        assert bbox, f"{path.name} is empty"
        assert bbox[1] >= 0 and bbox[3] <= size[1]
        assert bbox[3] == size[1], f"{path.name} feet must touch the canvas floor"
        assert alpha.getpixel((0, 0)) == 0, f"{path.name} needs transparent padding"
        frames.append(path.read_bytes())

    assert len(set(frames)) == 3, "the three redraw stages must be visually distinct"

    def longest_ink_run(image, x0, x1, y0, y1):
        longest = 0
        for y in range(y0, y1):
            run = 0
            for x in range(x0, x1):
                r, g, b, a = image.getpixel((x, y))
                if is_ink((r, g, b, a)):
                    run += 1
                    longest = max(longest, run)
                else:
                    run = 0
        return longest

    # The new face must live inside the head, not drift into the ears or chest.
    face_regions = {
        "baby": (8, 12, 22, 24),
        "kid": (9, 13, 27, 27),
        "adult": (11, 14, 34, 30),
    }
    for stage, (left, top, right, bottom) in face_regions.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        ink_pixels = 0
        for y in range(top, bottom):
            for x in range(left, right):
                r, g, b, a = image.getpixel((x, y))
                if is_ink((r, g, b, a)):
                    ink_pixels += 1
        assert ink_pixels >= 8, f"{stage} redraw has no readable face construction"

    baby = Image.open(SPRITES / "cat-baby-v2.png").convert("RGBA")
    # The kitten's crown is framed by its round ears: two visible ear tips
    # above a short dome between them; no long straight cap may close the top.
    ear_tips = [(6, 4), (19, 4), (6, 5), (19, 5)]
    assert all(is_ink(baby.getpixel(p)) for p in ear_tips), (
        "baby ear tips must stay visible above the crown"
    )

    # The mouth sits directly below the nose and must remain readable at 1x.
    def face_run(image, x0, x1, y0, y1):
        return longest_ink_run(image, x0, x1, y0, y1)

    baby_mouth = face_run(baby, 9, 17, 14, 18)
    adult = Image.open(SPRITES / "cat-adult-v2.png").convert("RGBA")
    adult_mouth = face_run(adult, 15, 30, 22, 27)
    assert 1 <= baby_mouth <= 2, f"baby mouth should be small but readable: run={baby_mouth}"
    baby_mouth_pixels = [(11, 16), (12, 17), (13, 16)]
    assert all(baby.getpixel(point) == INK for point in baby_mouth_pixels), (
        "baby mouth should be a separated shallow arc, not a central black clump"
    )
    kid_mouth_pixels = [(14, 19), (15, 20), (16, 19)]
    kid = Image.open(SPRITES / "cat-kid-v2.png").convert("RGBA")
    assert all(kid.getpixel(point) == INK for point in kid_mouth_pixels), (
        "kid mouth should use a compact feline point shape"
    )
    adult_mouth_pixels = [(17, 24), (18, 25), (19, 24), (20, 25), (21, 24)]
    assert all(adult.getpixel(point) == INK for point in adult_mouth_pixels), (
        "adult mouth should use the shifted compact feline point shape"
    )
    assert baby.getpixel((10, 16)) != INK
    assert baby.getpixel((14, 16)) != INK

    # The nose-to-mouth gap must stay clean; leftover pixels from the old
    # canonical mouth read as a stray black line beside the nose.
    for stage, row, x0, x1 in (("baby", 14, 9, 16), ("kid", 17, 12, 21)):
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert all(
            image.getpixel((x, row)) != INK
            for x in range(x0, x1)
        ), f"{stage} nose-to-mouth gap contains a stray black line"

    # The top contour is stage-specific. A short, broken kitten contour is
    # required, while the older cats keep their naturally stepped silhouette;
    # a long post-fill line makes all three heads look mechanically capped.
    dome = longest_ink_run(baby, 8, 14, 7, 8)
    assert 4 <= dome <= 7, f"baby crown dome should be a short visible arc: run={dome}"
    assert longest_ink_run(baby, 3, 25, 3, 9) <= 7, (
        "baby top outline should keep its stepped ear/dome contour"
    )
    for stage, box in (("kid", (8, 26, 3, 9)), ("adult", (8, 36, 4, 10))):
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert longest_ink_run(image, *box) <= 10, (
            f"{stage} top outline should keep its natural stepped contour"
        )

    # The central face column moves up slightly with the redraw revision.
    nose_limits = {"baby": 13, "kid": 16, "adult": 21}
    for stage, limit in nose_limits.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        nose_y = [
            y for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y)) == NOSE
        ]
        assert nose_y and min(nose_y) <= limit, f"{stage} nose was not moved up"

    # Eyes are calibrated on the final canvas so reduction cannot make one
    # side heavier than the other.
    eye_specs = {
        "baby": {"left": (6, 11, 8, 13), "right": (15, 11, 17, 13), "glints": ((7, 11), (16, 11))},
        "kid": {"left": (7, 12, 10, 15), "right": (19, 12, 22, 15), "glints": ((8, 12), (20, 12))},
        "adult": {"left": (10, 15, 14, 19), "right": (25, 15, 29, 19), "glints": ((11, 15), (26, 15))},
    }
    for stage, spec in eye_specs.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        glints = set(spec["glints"])
        for side in ("left", "right"):
            x0, y0, x1, y1 = spec[side]
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if (x, y) in glints:
                        continue
                    assert image.getpixel((x, y)) == INK, (
                        f"{stage} {side} eye is not a calibrated dark block"
                    )
        for point in spec["glints"]:
            assert image.getpixel(point) == WHITE, (
                f"{stage} eye is missing its one-pixel glint"
            )

    # Each front paw gets a light one-pixel side edge so it reads as a paw,
    # without turning the whole hand into a heavy black block.
    # Front paws are outlined stubs: INK rims with light pads, never a solid
    # black block. Each stage pins its own paw coordinates.
    paw_specs = {
        "baby": {"rims": [(6, 30), (12, 30), (14, 30), (19, 30)],
                 "pads": [(8, 30), (16, 30)]},
        "kid": {"rims": [(8, 36), (14, 36), (18, 36), (24, 36)],
                "pads": [(10, 36), (21, 36)]},
        "adult": {"rims": [(10, 46), (17, 46), (27, 46), (34, 46)],
                  "pads": [(12, 46), (30, 46)]},
    }
    for stage, spec in paw_specs.items():
        image = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")
        assert all(image.getpixel(p) == INK for p in spec["rims"]), (
            f"{stage} front paws need visible outlined rims"
        )
        assert all(image.getpixel(p) == LIGHT for p in spec["pads"]), (
            f"{stage} paw pads must stay light, not solid black"
        )

    # Derived idle/blink frames (hand-off §5 phase B). Each stage derives its
    # own frames from its own v2 base; face geometry is never shared across
    # stages.
    CREAM = (255, 242, 213, 255)
    eye_sockets = {
        "baby": ((6, 11, 8, 13), (15, 11, 17, 13)),
        "kid": ((7, 12, 10, 15), (19, 12, 22, 15)),
        "adult": ((10, 15, 14, 19), (25, 15, 29, 19)),
    }
    for stage, size in EXPECTED_SIZES.items():
        base = Image.open(SPRITES / f"cat-{stage}-v2.png").convert("RGBA")

        # idle-0 must be the approved base stance byte-for-byte, so the
        # section-4 face anchors stay exact.
        idle0_path = SPRITES / f"cat-{stage}-v2-idle-0.png"
        assert idle0_path.exists(), f"missing v2 idle frame: {idle0_path.name}"
        idle0 = Image.open(idle0_path).convert("RGBA")
        assert idle0.size == size, f"{idle0_path.name} has size {idle0.size}, expected {size}"
        assert idle0.tobytes() == base.tobytes(), (
            f"{idle0_path.name} must stay identical to the approved base stance"
        )

        # idle-1 is a one-pixel downward breath: feet stay on the canvas
        # floor and the horizontal silhouette is unchanged.
        idle1_path = SPRITES / f"cat-{stage}-v2-idle-1.png"
        assert idle1_path.exists(), f"missing v2 idle frame: {idle1_path.name}"
        idle1 = Image.open(idle1_path).convert("RGBA")
        assert idle1.size == size, f"{idle1_path.name} has size {idle1.size}, expected {size}"
        for y in range(size[1]):
            for x in range(size[0]):
                expected = base.getpixel((x, y - 1)) if y > 0 else (0, 0, 0, 0)
                assert idle1.getpixel((x, y)) == expected, (
                    f"{idle1_path.name} is not a clean one-pixel breath at ({x}, {y})"
                )

        # blink may only replace the two eye sockets with symmetric closed
        # lids; nose, mouth, cheeks and outline stay exactly on the base.
        blink_path = SPRITES / f"cat-{stage}-v2-blink.png"
        assert blink_path.exists(), f"missing v2 blink frame: {blink_path.name}"
        blink = Image.open(blink_path).convert("RGBA")
        assert blink.size == size, f"{blink_path.name} has size {blink.size}, expected {size}"
        sockets = eye_sockets[stage]
        for y in range(size[1]):
            for x in range(size[0]):
                if any(sx0 <= x <= sx1 and sy0 <= y <= sy1 for sx0, sy0, sx1, sy1 in sockets):
                    continue
                assert blink.getpixel((x, y)) == base.getpixel((x, y)), (
                    f"{blink_path.name} changed pixels outside the eye sockets at ({x}, {y})"
                )
        for sx0, sy0, sx1, sy1 in sockets:
            for y in range(sy0, sy1 + 1):
                for x in range(sx0, sx1 + 1):
                    expected = INK if y == sy1 else CREAM
                    assert blink.getpixel((x, y)) == expected, (
                        f"{blink_path.name} closed lid must fill the eye socket at ({x}, {y})"
                    )

    # ------------------------------------------------------------------
    # State frames: every pose changes only what it claims to change, on
    # its own stage base. Whole-body offsets must be pixel-exact shifts.
    def load(name):
        return Image.open(SPRITES / name).convert("RGBA")

    base_nose = {"baby": (11, 13), "kid": (14, 16), "adult": (19, 21)}
    for stage, size in EXPECTED_SIZES.items():
        base = load(f"cat-{stage}-v2.png")
        sockets = eye_sockets[stage]
        nx, ny = base_nose[stage]

        # happy/excited hops are whole-body vertical offsets of the base.
        for pose, dy in (("happy-0", 1), ("happy-1", -2), ("happy-2", 0),
                         ("excited-0", -1), ("excited-1", -2)):
            img = load(f"cat-{stage}-v2-{pose}.png")
            assert img.size == size, f"{stage} {pose} wrong canvas"
            for y in range(size[1]):
                sy = y - dy
                for x in range(size[0]):
                    expected = base.getpixel((x, sy)) if 0 <= sy < size[1] else (0, 0, 0, 0)
                    assert img.getpixel((x, y)) == expected, (
                        f"{stage} {pose} must be a clean {dy:+d}px body shift at ({x},{y})"
                    )

        # excited-2 swaps the sockets for glowing star eyes, nothing else.
        star = load(f"cat-{stage}-v2-excited-2.png")
        for y in range(size[1]):
            for x in range(size[0]):
                if any(sx0 <= x <= sx1 and sy0 <= y <= sy1 for sx0, sy0, sx1, sy1 in sockets):
                    continue
                assert star.getpixel((x, y)) == base.getpixel((x, y)), (
                    f"{stage} excited-2 changed pixels outside the eye sockets at ({x},{y})"
                )
        for sx0, sy0, sx1, sy1 in sockets:
            assert star.getpixel((sx0 + 1, sy1 - 1)) == LIGHT, (
                f"{stage} star eyes must glow light inside the ink rim"
            )
            if sx1 - sx0 >= 4 and sy1 - sy0 >= 4:
                assert star.getpixel(((sx0 + sx1) // 2, (sy0 + sy1) // 2)) == WHITE

        # eating: the whole face pitches while a trapezoid dish with a
        # domed kibble heap sits in front, wider than the body silhouette.
        dish_spec = {"baby": (4, 26, 22, 31), "kid": (5, 32, 29, 37),
                     "adult": (7, 41, 37, 47)}[stage]
        dx0, dy0, dx1, dy1 = dish_spec
        rim_y = {"baby": 28, "kid": 34, "adult": 44}[stage]
        cx = (dx0 + dx1) // 2
        for pose, dy, eyes in (("eat-0", 3, "open"), ("eat-1", 3, "closed"), ("eat-2", -2, "open")):
            img = load(f"cat-{stage}-v2-{pose}.png")
            assert img.getpixel((nx, ny + dy)) == NOSE, (
                f"{stage} {pose} nose must follow the pitched head"
            )
            assert img.getpixel((dx0 + 2, rim_y)) == INK and img.getpixel((dx1 - 3, rim_y)) == INK, (
                f"{stage} {pose} is missing its dish rim"
            )
            assert img.getpixel((cx, rim_y + 1)) == BOWL, (
                f"{stage} {pose} dish must be the blue bowl, not fur-colored"
            )
            assert img.getpixel((cx - 3, rim_y - 2)) == LIGHT and img.getpixel((cx + 3, rim_y - 2)) == LIGHT, (
                f"{stage} {pose} kibble heap must rise above the rim"
            )
            assert img.getpixel((cx, rim_y - 2)) == WHITE, (
                f"{stage} {pose} heap needs a bright glint"
            )
            assert img.getpixel((cx, rim_y - 3)) == INK, (
                f"{stage} {pose} heap needs its ink outline to read against the fur"
            )
            if eyes == "closed":
                for sx0, sy0, sx1, sy1 in sockets:
                    assert img.getpixel((sx0, sy1 + dy)) == INK, (
                        f"{stage} eat-1 must close both eyes while chewing"
                    )

        # sleep is its own lying silhouette: grounded, closed eye, crisp Z.
        for phase in (0, 1):
            img = load(f"cat-{stage}-v2-sleep-{phase}.png")
            assert img.size == size and img.getbbox()[3] == size[1], (
                f"{stage} sleep-{phase} must fill its canvas down to the floor"
            )
        zz = {"baby": (21, 8, 5), "kid": (25, 8, 5), "adult": (30, 10, 5)}[stage]
        for phase in (0, 1):
            img = load(f"cat-{stage}-v2-sleep-{phase}.png")
            zy = zz[1] + phase
            x0, s = zz[0], zz[2]
            assert all(img.getpixel((x, zy)) == INK for x in range(x0, x0 + s)), (
                f"{stage} sleep-{phase} Z glyph needs its top bar"
            )
            assert all(img.getpixel((x, zy + s - 1)) == INK for x in range(x0, x0 + s)), (
                f"{stage} sleep-{phase} Z glyph needs its bottom bar"
            )
            for i in range(1, s - 1):
                diag_x = x0 + s - 1 - i
                assert img.getpixel((diag_x, zy + i)) == INK, (
                    f"{stage} sleep-{phase} Z glyph needs its diagonal"
                )
                strays = [x for x in range(x0, x0 + s)
                          if x != diag_x and img.getpixel((x, zy + i)) == INK]
                assert not strays, (
                    f"{stage} sleep-{phase} Z middle rows must stay a thin diagonal"
                )
        # the sleeping muzzle keeps its nose (per-stage scaled coordinates)
        nose_px = {"baby": (6, 19), "kid": (8, 23), "adult": (9, 29)}[stage]
        assert load(f"cat-{stage}-v2-sleep-0.png").getpixel(nose_px) == NOSE, (
            f"{stage} sleeping face lost its muzzle nose"
        )

        # sad/droopy drop heavy lids over the sockets; sad adds a blue tear
        # hanging from the left eye, one pixel further down on sad-1.
        tear_xy = {"baby": (7, 14), "kid": (8, 16), "adult": (12, 20)}[stage]
        for pose, roll in (("sad-0", 0), ("sad-1", 1), ("droopy", None)):
            img = load(f"cat-{stage}-v2-{pose}.png")
            for sx0, sy0, sx1, sy1 in sockets:
                assert img.getpixel((sx0, sy0)) == FUR and img.getpixel((sx0, sy1)) == INK, (
                    f"{stage} {pose} must shade heavy lids over the eyes"
                )
            if roll is not None:
                for dy in (0, 1):
                    assert img.getpixel((tear_xy[0], tear_xy[1] + roll + dy)) == TEAR, (
                        f"{stage} {pose} is missing its tear"
                    )
            else:
                assert img.getpixel(tear_xy) != TEAR, (
                    f"{stage} droopy must not show a tear"
                )

        # washing sways the head and shows a cluster of bubbles.
        for pose, dx, side in (("wash-0", 1, "r"), ("wash-1", -1, "l")):
            img = load(f"cat-{stage}-v2-{pose}.png")
            assert img.getpixel((nx + dx, ny)) == NOSE, (
                f"{stage} {pose} nose must sway with the head"
            )
            bcn = {"baby": (24, 12), "kid": (30, 14), "adult": (38, 18)}[stage]
            if side == "l":
                bcn = (size[0] - bcn[0] - 4, bcn[1])
            assert img.getpixel((bcn[0] + 1, bcn[1])) == INK and img.getpixel((bcn[0] + 1, bcn[1] + 1)) == WHITE, (
                f"{stage} {pose} is missing its soap bubble"
            )
            b2 = {"baby": (27, 17), "kid": (32, 20), "adult": (40, 25)}[stage]
            if side == "l":
                b2 = (size[0] - b2[0] - 3, b2[1])
            assert img.getpixel((b2[0] + 1, b2[1])) == INK and img.getpixel((b2[0] + 1, b2[1] + 1)) == WHITE, (
                f"{stage} {pose} should show a cluster of bubbles"
            )

        # grunting squeezes the eyes and shows blush under BOTH eyes (the
        # patch offset is per stage — a fixed offset landed mid-face).
        blush_px = {"baby": [(6, 17), (15, 17)], "kid": [(8, 18), (20, 18)],
                    "adult": [(11, 25), (26, 25)]}[stage]
        for pose, dy in (("grunt-0", 0), ("grunt-1", 1)):
            img = load(f"cat-{stage}-v2-{pose}.png")
            for bx, by in blush_px:
                assert img.getpixel((bx, by + dy)) == PINK, (
                    f"{stage} {pose} must blush under both eyes"
                )
            for sx0, sy0, sx1, sy1 in sockets:
                assert img.getpixel((sx0, sy0 + 1 + dy)) == INK, (
                    f"{stage} {pose} must squeeze its eyes shut"
                )

        # walk: a side-view cycle where legs/tail move but the head never
        # drifts; every frame keeps its side eye and grounded legs.
        walks = [load(f"cat-{stage}-v2-walk-{f}.png") for f in range(7)]
        assert len({w.tobytes() for w in walks}) == 7, (
            f"{stage} walk frames must be seven distinct pictures"
        )
        eye_px = {"baby": (21, 10), "kid": (26, 12), "adult": (35, 15)}[stage]
        tail_win = {"baby": ((0, 8), (6, 20)), "kid": ((0, 10), (7, 25)),
                    "adult": ((0, 14), (9, 31))}[stage]
        for f, img in enumerate(walks):
            assert img.size == size, f"{stage} walk-{f} wrong canvas"
            assert img.getpixel(eye_px) == INK, f"{stage} walk-{f} side eye missing"
            assert img.getbbox()[3] == size[1], (
                f"{stage} walk-{f} legs must touch the canvas floor"
            )
        (tx0, ty0), (tx1, ty1) = tail_win
        assert any(
            walks[0].getpixel((x, y)) != walks[1].getpixel((x, y))
            for y in range(ty0, ty1) for x in range(tx0, tx1)
        ), f"{stage} walk tail must sway between frames"

    print("cat redraw contract: PASS")


if __name__ == "__main__":
    main()
