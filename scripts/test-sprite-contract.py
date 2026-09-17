#!/usr/bin/env python3
"""Regression checks for stage-aware cat/egg sprite rendering contracts."""
from pathlib import Path
import re
import runpy

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "app.js").read_text()
SPRITES = ROOT / "assets" / "sprites"


def alpha_bbox(name):
    alpha = Image.open(SPRITES / name).convert("RGBA").getchannel("A")
    return alpha.point(lambda value: 255 if value > 100 else 0).getbbox()


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
    # The new cat artwork is accepted by image-level contracts, independently
    # of renderer helpers. The public frame names stay stable across redraws.
    cat_contract = runpy.run_path(str(ROOT / "scripts" / "test-cat-redraw.py"))
    cat_contract["check_cat_sprites"]()
    cat_section = APP.split("var PET_FRAMES = {", 1)[1].split("dog: {", 1)[0]
    stage_block = re.search(r"stage:\s*\{([^}]+)\}", cat_section)
    assert stage_block, "PET_FRAMES.cat needs its own stage map"
    stage_map = dict(re.findall(r"(\d+):\s*'([^']+)'", stage_block.group(1)))
    assert stage_map == {"0": "cat-egg-v2", "1": "cat-baby-v2",
                         "2": "cat-kid-v2", "3": "cat-adult-v2"}

    expressions = {"idle": 2, "blink": 1, "eat": 3, "sleep": 2,
                   "happy": 3, "excited": 3, "big": 3, "droopy": 1,
                   "sad": 2, "wash": 2, "grunt": 2}
    for expr, count in expressions.items():
        block = re.search(rf"\b{expr}:\s*\{{(.*?)\}}", cat_section, re.S)
        assert block, f"PET_FRAMES.cat is missing {expr}"
        mapping = {key: re.findall(r"'([^']+)'", values)
                   for key, values in re.findall(r"(\d+):\s*\[([^\]]*)\]", block.group(1))}
        for index, stage in enumerate(("baby", "kid", "adult"), 1):
            pose = "excited" if expr == "big" else expr
            prefix = f"cat-{stage}-v2-{pose}"
            expected = [prefix] if count == 1 else [f"{prefix}-{i}" for i in range(count)]
            assert mapping.get(str(index)) == expected, (
                f"PET_FRAMES.cat {stage} {expr} must map every frame in order"
            )
        assert mapping.get("0") and all(name.startswith("cat-egg-v2-") for name in mapping["0"]), (
            f"PET_FRAMES.cat {expr} must use shared egg frames at stage 0"
        )
        assert all((SPRITES / f"{name}.png").is_file() for name in mapping["0"]), (
            f"PET_FRAMES.cat {expr} references a missing shared egg frame"
        )
    walk_block = re.search(r"walk:\s*\{([^}]+)\}", cat_section)
    assert walk_block, "PET_FRAMES.cat needs a walk prefix for each grown stage"
    assert dict(re.findall(r"(\d+):\s*'([^']+)'", walk_block.group(1))) == {
        "1": "cat-baby-v2-walk-", "2": "cat-kid-v2-walk-", "3": "cat-adult-v2-walk-"
    }, "PET_FRAMES.cat must select the current stage's seven-frame hop"

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
