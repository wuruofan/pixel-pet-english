#!/usr/bin/env python3
"""Regression checks for stage-aware cat/egg sprite rendering contracts."""
from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "app.js").read_text()
SPRITES = ROOT / "assets" / "sprites"


def alpha_bbox(name):
    alpha = Image.open(SPRITES / name).convert("RGBA").getchannel("A")
    return alpha.point(lambda value: 255 if value > 100 else 0).getbbox()


def face_similarity(source_name, target_name, box, dx=0):
    """Share of identical pixels in box; dx aligns a head that swayed."""
    source = Image.open(SPRITES / source_name).convert("RGBA")
    target = Image.open(SPRITES / target_name).convert("RGBA")
    left, top, right, bottom = box
    same = 0
    total = 0
    for y in range(top, bottom):
        for x in range(left, right):
            sx = x - dx
            if 0 <= sx < source.width:
                total += 1
                same += source.getpixel((sx, y)) == target.getpixel((x, y))
    return same / max(total, 1)


def main():
    # Stage 0 is an egg and must never borrow the adult cat's side-walk loop.
    assert re.search(r"walking\s*&&\s*stage\s*>=\s*1\s*&&\s*fr\.walk", APP), (
        "walking PNG branch must be restricted to stage >= 1"
    )

    # Every persistent expression used by the mood engine needs an egg mapping.
    for expr in ("sleep", "excited", "droopy", "sad", "wash", "grunt"):
        assert re.search(rf"{expr}:\s*\{{\s*0:\s*\[", APP), (
            f"{expr} must define a stage-0 egg frame mapping"
        )

    for name in (
        "cat-egg-v2-sleep-0.png", "cat-egg-v2-sleep-1.png",
        "cat-egg-v2-excited-0.png", "cat-egg-v2-excited-1.png", "cat-egg-v2-excited-2.png",
        "cat-egg-v2-droopy.png",
        "cat-egg-v2-sad-0.png", "cat-egg-v2-sad-1.png",
        "cat-egg-v2-wash-0.png", "cat-egg-v2-wash-1.png",
        "cat-egg-v2-grunt-0.png", "cat-egg-v2-grunt-1.png",
    ):
        assert (SPRITES / name).exists(), f"missing egg state frame: {name}"

    # Idle breathing must preserve the full silhouette; a clipped right edge
    # makes the runtime spot overlay and the shell appear to jump.
    base = alpha_bbox("cat-egg-v2-idle-0.png")
    breath = alpha_bbox("cat-egg-v2-idle-1.png")
    assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
        f"egg idle frames must keep the same horizontal silhouette: {base} vs {breath}"
    )
    for stage in ("baby", "kid", "adult"):
        base = alpha_bbox(f"cat-{stage}-idle-0.png")
        breath = alpha_bbox(f"cat-{stage}-idle-1.png")
        assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
            f"{stage} idle frames must keep the same horizontal silhouette: {base} vs {breath}"
        )
        assert (
            SPRITES.joinpath(f"cat-{stage}-idle-0.png").read_bytes()
            != SPRITES.joinpath(f"cat-{stage}-idle-1.png").read_bytes()
        ), f"{stage} idle frames must be a real difference"

    # The locally redrawn v2 cat owns the stage stances plus idle/blink, each
    # derived from its own base (hand-off 2026-09-05 §5). The remaining states
    # stay on the legacy frames until phase B replaces them one by one.
    assert "1: 'cat-baby-v2', 2: 'cat-kid-v2', 3: 'cat-adult-v2'" in APP
    assert "1: ['cat-baby-v2-idle-0', 'cat-baby-v2-idle-1']" in APP
    assert "2: ['cat-kid-v2-idle-0',  'cat-kid-v2-idle-1']" in APP
    assert "3: ['cat-adult-v2-idle-0','cat-adult-v2-idle-1']" in APP
    assert "1: ['cat-baby-v2-blink']" in APP
    assert "2: ['cat-kid-v2-blink']" in APP
    assert "3: ['cat-adult-v2-blink']" in APP
    v2_sizes = {"baby": (30, 32), "kid": (36, 38), "adult": (44, 48)}
    for stage, size in v2_sizes.items():
        for frame in ("idle-0", "idle-1", "blink"):
            path = SPRITES / f"cat-{stage}-v2-{frame}.png"
            assert path.exists(), f"missing v2 frame: {path.name}"
            assert Image.open(path).size == size, (
                f"{path.name} must stay on the {stage} v2 canvas {size}"
            )
    # v2 idle breathing follows the same silhouette rule as the legacy idle
    # above, so the runtime overlay and shell never jump between breaths.
    for stage in ("baby", "kid", "adult"):
        base = alpha_bbox(f"cat-{stage}-v2-idle-0.png")
        breath = alpha_bbox(f"cat-{stage}-v2-idle-1.png")
        assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
            f"{stage} v2 idle frames must keep the same horizontal silhouette: {base} vs {breath}"
        )
        assert (
            SPRITES.joinpath(f"cat-{stage}-v2-idle-0.png").read_bytes()
            != SPRITES.joinpath(f"cat-{stage}-v2-idle-1.png").read_bytes()
        ), f"{stage} v2 idle frames must be a real difference"

    # The v2 eat action is the pitched-head + bowl loop, fitted per stage.
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(3):
            path = SPRITES / f"cat-{stage}-v2-eat-{index}.png"
            assert path.exists(), f"missing {stage} eat frame: {path.name}"
            assert Image.open(path).size == v2_sizes[stage]
            frames.append(path.read_bytes())
        assert len(set(frames)) == 3, f"{stage} eat frames must be unique"
    assert "1: ['cat-baby-v2-eat-0', 'cat-baby-v2-eat-1', 'cat-baby-v2-eat-2']" in APP
    assert "2: ['cat-kid-v2-eat-0', 'cat-kid-v2-eat-1', 'cat-kid-v2-eat-2']" in APP
    assert "3: ['cat-adult-v2-eat-0', 'cat-adult-v2-eat-1', 'cat-adult-v2-eat-2']" in APP

    # The v2 happy hop: crouch / airborne / land on each stage's own base.
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(3):
            path = SPRITES / f"cat-{stage}-v2-happy-{index}.png"
            assert path.exists(), f"missing {stage} happy frame: {path.name}"
            assert Image.open(path).size == v2_sizes[stage]
            frames.append(path.read_bytes())
        assert len(set(frames)) == 3, f"{stage} happy frames must all be unique"

    assert "1: ['cat-baby-v2-happy-0', 'cat-baby-v2-happy-1', 'cat-baby-v2-happy-2']" in APP
    assert "2: ['cat-kid-v2-happy-0', 'cat-kid-v2-happy-1', 'cat-kid-v2-happy-2']" in APP
    assert "3: ['cat-adult-v2-happy-0', 'cat-adult-v2-happy-1', 'cat-adult-v2-happy-2']" in APP

    # P1/P2 cat states must be stage-aware. Reusing cat-big or the standing
    # frame makes an interaction look frozen and can visibly resize the pet.
    for expr, count in (("excited", 3), ("sad", 2), ("wash", 2), ("grunt", 2)):
        for stage in ("baby", "kid", "adult"):
            frames = []
            for index in range(count):
                path = SPRITES / f"cat-{stage}-v2-{expr}-{index}.png"
                assert path.exists(), f"missing {stage} {expr} frame: {path.name}"
                assert Image.open(path).size == v2_sizes[stage]
                frames.append(path.read_bytes())
            assert len(set(frames)) == count, f"{stage} {expr} frames must be unique"
        assert f"1: ['cat-baby-v2-{expr}-" in APP
        assert f"2: ['cat-kid-v2-{expr}-" in APP
        assert f"3: ['cat-adult-v2-{expr}-" in APP

    # Cat faces are deliberately more detailed than the egg face. Generated
    # action frames must preserve most of the stage's original eye/cheek art;
    # erasing the whole box and redrawing 2px geometry is a regression.
    face_boxes = {
        "baby": (5, 10, 21, 19),
        "kid": (6, 11, 25, 21),
        "adult": (8, 14, 35, 28),
    }
    for stage, box in face_boxes.items():
        source = f"cat-{stage}-v2.png"
        for expr in ("excited-0", "excited-2", "droopy", "sad-0", "grunt-0"):
            target = f"cat-{stage}-v2-{expr}.png"
            assert face_similarity(source, target, box) >= 0.55, (
                f"{stage} {expr} erased too much of the original cat face"
            )
        for expr, dx in (("wash-0", 1), ("wash-1", -1)):
            target = f"cat-{stage}-v2-{expr}.png"
            assert face_similarity(source, target, box, dx=dx) >= 0.55, (
                f"{stage} {expr} erased too much of the original cat face"
            )

    for stage in ("baby", "kid", "adult"):
        path = SPRITES / f"cat-{stage}-v2-droopy.png"
        assert path.exists(), f"missing {stage} droopy frame: {path.name}"
        assert f"cat-{stage}-v2-droopy" in APP

    # Walking keeps the growth-stage scale with the v2 side-view loop; the
    # legacy GPT side art is fully retired.
    assert "walk: { 1: 'cat-baby-v2-walk-', 2: 'cat-kid-v2-walk-', 3: 'cat-adult-v2-walk-' }" in APP
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(7):
            path = SPRITES / f"cat-{stage}-v2-walk-{index}.png"
            assert path.exists(), f"missing {stage} walk frame: {path.name}"
            assert Image.open(path).size == v2_sizes[stage]
            frames.append(path.read_bytes())
        assert len(set(frames)) == 7, f"{stage} walk frames must be unique"

    # Sleep is a curled side pose, but each stage still needs its own fitted
    # dimensions so a baby does not grow taller merely by closing its eyes.
    assert "sleep:   { 0: ['cat-egg-v2-sleep-0', 'cat-egg-v2-sleep-1']," in APP
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(2):
            path = SPRITES / f"cat-{stage}-v2-sleep-{index}.png"
            assert path.exists(), f"missing {stage} sleep frame: {path.name}"
            assert Image.open(path).size == v2_sizes[stage], (
                f"{stage} sleep frame has the wrong fitted size: {Image.open(path).size}"
            )
            frames.append(path.read_bytes())
        assert len(set(frames)) == 2, f"{stage} sleep frames must be unique"

    # The main-page timer must resolve stage-aware expression maps before
    # checking array length, otherwise sleep/excited/happy never advance.
    assert "if (ev && typeof ev === 'object') ev = ev[petStageIdx()];" in APP

    # The bench timer must flip frames via drawPet directly: tbRedraw resets
    # exprIdx, so looping through it freezes every multi-frame expr on its
    # first frame (idle breathing included).
    assert re.search(
        r"exprIdx\[tbExpr\] = \(\(petAnim\.exprIdx\[tbExpr\] \|\| 0\) \+ 1\) % ev2\.length;\s*"
        r"drawPet\(\$\('#tb-cv'\), tbExpr, tbStage\);",
        APP,
    ), "bench frame loop must not redraw through tbRedraw (it resets exprIdx)"

    # Growing a stage must be celebrated, never swapped silently: the
    # level-up loop detects the stage change and plays the moment.
    assert "var stageBefore = petStageIdx();" in APP
    assert "celebrateEvolution(stageBefore, stageAfter)" in APP
    assert "star: { pal:" in APP, "evolution needs a star FX sprite"

    # The bench must expose all four growth stages, including adult.
    assert "var TB_STAGES = [[0, '蛋'], [1, curSpecies().stages[0]], [2, curSpecies().stages[1]], [3, curSpecies().stages[2]]];" in APP

    # ------------------ dog (小狗) ---------------------------
    # The dog pipeline mirrors the cat's: 3 stage-distinct v2 stances,
    # 21 differential frames per stage, and a 7-frame side-view walk loop.
    # All wiring is local; the egg shell is shared with the cat and tinted
    # at runtime by the species palette.
    assert "1: 'dog-baby-v2', 2: 'dog-kid-v2', 3: 'dog-adult-v2'" in APP
    assert "1: ['dog-baby-v2-idle-0', 'dog-baby-v2-idle-1']" in APP
    assert "2: ['dog-kid-v2-idle-0',  'dog-kid-v2-idle-1']" in APP
    assert "3: ['dog-adult-v2-idle-0','dog-adult-v2-idle-1']" in APP
    assert "1: ['dog-baby-v2-blink']" in APP
    assert "2: ['dog-kid-v2-blink']" in APP
    assert "3: ['dog-adult-v2-blink']" in APP

    dog_sizes = {"baby": (30, 32), "kid": (36, 38), "adult": (44, 48)}
    for stage, size in dog_sizes.items():
        for frame in ("idle-0", "idle-1", "blink"):
            path = SPRITES / f"dog-{stage}-v2-{frame}.png"
            assert path.exists(), f"missing dog v2 frame: {path.name}"
            assert Image.open(path).size == size, (
                f"{path.name} must stay on the {stage} v2 canvas {size}"
            )
        # idle breath keeps the same horizontal silhouette (no jump on swap)
        base = alpha_bbox(f"dog-{stage}-v2-idle-0.png")
        breath = alpha_bbox(f"dog-{stage}-v2-idle-1.png")
        assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
            f"{stage} dog v2 idle frames must keep the same horizontal silhouette: {base} vs {breath}"
        )
        assert (
            SPRITES.joinpath(f"dog-{stage}-v2-idle-0.png").read_bytes()
            != SPRITES.joinpath(f"dog-{stage}-v2-idle-1.png").read_bytes()
        ), f"{stage} dog v2 idle frames must be a real difference"

        # All 18 differential poses must exist and live on the v2 canvas
        dog_pose_specs = (
            ("eat", 3), ("sleep", 2), ("happy", 3), ("excited", 3),
            ("droopy", 1), ("sad", 2), ("wash", 2), ("grunt", 2),
        )
        for expr, count in dog_pose_specs:
            frames = []
            for index in range(count):
                if count == 1:
                    path = SPRITES / f"dog-{stage}-v2-{expr}.png"
                else:
                    path = SPRITES / f"dog-{stage}-v2-{expr}-{index}.png"
                assert path.exists(), f"missing dog {stage} {expr} frame: {path.name}"
                assert Image.open(path).size == size
                frames.append(path.read_bytes())
            assert len(set(frames)) == count, (
                f"dog {stage} {expr} frames must be unique ({count} distinct)"
            )

        # walk: 7 distinct side-view frames on the v2 canvas
        walk_frames = []
        for index in range(7):
            path = SPRITES / f"dog-{stage}-v2-walk-{index}.png"
            assert path.exists(), f"missing dog {stage} walk frame: {path.name}"
            assert Image.open(path).size == size
            walk_frames.append(path.read_bytes())
        assert len(set(walk_frames)) == 7, (
            f"dog {stage} walk frames must be 7 distinct pictures"
        )

    # PET_FRAMES.dog must wire every state and stage the same way cat does.
    for expr, count in (("eat", 3), ("sleep", 2), ("happy", 3), ("excited", 3),
                         ("droopy", 1), ("sad", 2), ("wash", 2), ("grunt", 2)):
        for stage_idx, prefix in ((1, "dog-baby"), (2, "dog-kid"),
                                  (3, "dog-adult")):
            if count == 1:
                assert f"{stage_idx}: ['{prefix}-v2-{expr}']" in APP, (
                    f"{prefix}-v2-{expr} must be wired in PET_FRAMES.dog"
                )
            else:
                joined = "', '".join(f"{prefix}-v2-{expr}-{i}" for i in range(count))
                assert f"{stage_idx}: ['{joined}']" in APP, (
                    f"{prefix} {expr} frames must all be wired in PET_FRAMES.dog"
                )
    assert "walk: { 1: 'dog-baby-v2-walk-', 2: 'dog-kid-v2-walk-', 3: 'dog-adult-v2-walk-' }" in APP

    print("sprite contract: PASS")


if __name__ == "__main__":
    main()
