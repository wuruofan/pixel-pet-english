#!/usr/bin/env python3
"""Fox sprite regressions: run with python3 scripts/test-fox-sprites.py."""
import contextlib
import copy
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("fox_sprites", ROOT / "scripts/fox-differential.py")
FOX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FOX)
SPRITES = ROOT / "assets/sprites"
POSES = dict(FOX.ALL_POSES)


def opaque(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y))[3]}


def enclosed_holes(image):
    clear = {(x, y) for y in range(image.height) for x in range(image.width)} - opaque(image)
    pending = [p for p in clear if p[0] in (0, image.width - 1) or p[1] in (0, image.height - 1)]
    while pending:
        point = pending.pop()
        if point not in clear:
            continue
        clear.remove(point)
        x, y = point
        pending.extend(p for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                       if p in clear)
    return clear


def components(points):
    remaining = set(points)
    groups = []
    while remaining:
        start = remaining.pop()
        group, pending = {start}, [start]
        while pending:
            x, y = pending.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    point = x + dx, y + dy
                    if point in remaining:
                        remaining.remove(point)
                        group.add(point)
                        pending.append(point)
        groups.append(group)
    return groups


class FoxSpritesTest(unittest.TestCase):
    def image(self, stage, pose=None):
        suffix = f"-{pose}" if pose else ""
        return Image.open(SPRITES / f"fox-{stage}-v2{suffix}.png").convert("RGBA")

    def test_published_87_frames_match_reproducible_generator(self):
        expected = {f"fox-{stage}-v2{suffix}.png" for stage in FOX.STAGES
                    for suffix in [""] + [f"-{pose}" for pose in POSES]}
        self.assertEqual(len(expected), 87)
        self.assertEqual({p.name for p in SPRITES.glob("fox-*-v2*.png")}, expected)
        sources_before = {p: p.read_bytes() for p in FOX.SOURCES.glob("fox-*-source.png")}
        self.assertEqual(len(sources_before), 3)
        saved_output = FOX.SPRITES
        try:
            with tempfile.TemporaryDirectory(prefix="fox-sprites-test-") as temporary:
                FOX.SPRITES = Path(temporary)
                for _ in range(2):
                    with contextlib.redirect_stdout(io.StringIO()):
                        FOX.main()
                    for name in expected:
                        self.assertEqual((FOX.SPRITES / name).read_bytes(), (SPRITES / name).read_bytes(), name)
        finally:
            FOX.SPRITES = saved_output
        for source, before in sources_before.items():
            self.assertEqual(source.read_bytes(), before)

    def test_alpha_repairs_and_shadow_removal(self):
        # Known damage in the selected originals: muzzle/neck gaps and tiny debris.
        repaired = {"kid": [(13, 20), (12, 21), (10, 22), (13, 23)],
                    "teen": [(14, 21), (15, 21), (15, 22)],
                    "adult": [(31, 21), (19, 22), (20, 23), (24, 24), (26, 26)]}
        debris = {"kid": [(5, 21)], "teen": [(12, 26), (14, 35), (22, 35)],
                  "adult": [(10, 41), (8, 42), (33, 43), (30, 44), (18, 45)]}
        for stage in FOX.STAGES:
            base = self.image(stage)
            self.assertEqual(base.size, (44, 48) if stage == "adult" else (36, 38))
            self.assertEqual(enclosed_holes(base), set(), stage)
            self.assertEqual(len(components(opaque(base))), 1, stage)
            for point in repaired[stage]:
                self.assertEqual(base.getpixel(point)[3], 255, (stage, point))
            for point in debris[stage]:
                self.assertEqual(base.getpixel(point)[3], 0, (stage, point))
            for pose, options in POSES.items():
                image = self.image(stage, pose)
                self.assertEqual(image.size, base.size)
                self.assertEqual(set(image.getchannel("A").getdata()), {0, 255})
                dy = options.get("offset_y", 0)
                for x, y in repaired[stage]:
                    self.assertEqual(image.getpixel((x, y + dy))[3], 255, (stage, pose, x, y))
        # Preserve the adult's real gap between the chest and raised tail.
        self.assertEqual(self.image("adult").getpixel((29, 27))[3], 0)

    def test_old_features_are_erased_and_teen_face_is_centered(self):
        kid = self.image("kid", "blink")
        for x in (10, 11, 12):
            self.assertEqual(kid.getpixel((x, 16)), FOX.FUR_EYE["kid"])
        teen = self.image("teen")
        for point in ((14, 11), (21, 12)):
            self.assertEqual(teen.getpixel(point), FOX.FUR_EYE["teen"])
        for left, right in (((12, 15), (21, 15)), ((13, 14), (20, 14)),
                            ((16, 17), (17, 17)), ((15, 19), (18, 19)),
                            ((16, 20), (17, 20))):
            self.assertEqual(teen.getpixel(left), teen.getpixel(right))
        adult = self.image("adult")
        for point in ((21, 23), (20, 27), (21, 27), (22, 27), (21, 28)):
            self.assertEqual(adult.getpixel(point), FOX.CREAM_MUZZLE["adult"])
        for stage, gap in (("kid", (15, 22)), ("teen", (16, 18)), ("adult", (21, 23))):
            self.assertNotEqual(self.image(stage).getpixel(gap), FOX.MELANIN)

    def test_whole_pet_moves_without_cropping_or_detached_face_layers(self):
        anchors = copy.deepcopy(FOX.FOX_FACE)
        for stage in FOX.STAGES:
            for pose, options in POSES.items():
                dy = options.get("offset_y", 0)
                if not dy:
                    continue
                neutral = FOX.render_pose(stage, **{**options, "offset_y": 0})
                expected = Image.new("RGBA", neutral.size)
                expected.paste(neutral, (0, dy))
                actual = self.image(stage, pose)
                self.assertEqual(actual.tobytes(), expected.tobytes(), (stage, pose))
                self.assertEqual(len(opaque(actual)), len(opaque(neutral)), (stage, pose))
        self.assertEqual(FOX.FOX_FACE, anchors)

    def test_animation_loops_have_real_variation(self):
        required = {"idle": 2, "eat": 3, "excited": 3, "grunt": 2,
                    "happy": 3, "sad": 2, "sleep": 2, "walk": 4, "wash": 2}
        for stage in FOX.STAGES:
            for action, count in required.items():
                frames = {self.image(stage, pose).tobytes() for pose in POSES if pose.startswith(action + "-")}
                self.assertGreaterEqual(len(frames), count, (stage, action))

    def test_bubbles_and_both_zs_are_wholly_outside_the_pet(self):
        for stage in FOX.STAGES:
            for action in ("wash", "sleep"):
                neutral = self.image(stage, "idle-0" if action == "wash" else "blink")
                body = opaque(neutral)
                for phase in (0, 1):
                    image = self.image(stage, f"{action}-{phase}")
                    for point in body:
                        self.assertEqual(image.getpixel(point), neutral.getpixel(point), (stage, action, point))
                    effects = opaque(image) - body
                    groups = sorted(len(group) for group in components(effects))
                    # Exact sizes catch clipped effects; one clear pixel prevents
                    # the Zs joining the ear and enclosing a triangular alpha hole.
                    z_sizes = [7, 13] if stage == "adult" else [7, 10]
                    self.assertEqual(groups, [4, 4, 4, 4, 9] if action == "wash" else z_sizes,
                                     (stage, action, phase))
                    for x, y in effects:
                        self.assertFalse(any((x + dx, y + dy) in body
                                             for dx in (-1, 0, 1) for dy in (-1, 0, 1)),
                                         (stage, action, phase, x, y))


if __name__ == "__main__":
    unittest.main(verbosity=2)
