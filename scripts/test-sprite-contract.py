#!/usr/bin/env python3
"""Regression checks for stage-aware cat/egg sprite rendering contracts."""
from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "src" / "app.js").read_text()
SPRITES = ROOT / "assets" / "sprites"


def alpha_bbox(name):
    return Image.open(SPRITES / name).convert("RGBA").getchannel("A").getbbox()


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
        "cat-egg-sleep-0.png", "cat-egg-sleep-1.png",
        "cat-egg-excited-0.png", "cat-egg-excited-1.png", "cat-egg-excited-2.png",
        "cat-egg-droopy.png",
        "cat-egg-sad-0.png", "cat-egg-sad-1.png",
        "cat-egg-wash-0.png", "cat-egg-wash-1.png",
        "cat-egg-grunt-0.png", "cat-egg-grunt-1.png",
    ):
        assert (SPRITES / name).exists(), f"missing egg state frame: {name}"

    # Idle breathing must preserve the full silhouette; a clipped right edge
    # makes the runtime spot overlay and the shell appear to jump.
    base = alpha_bbox("cat-egg-idle-0.png")
    breath = alpha_bbox("cat-egg-idle-1.png")
    assert base and breath and base[0] == breath[0] and base[2] == breath[2], (
        f"egg idle frames must keep the same horizontal silhouette: {base} vs {breath}"
    )

    # Baby/kid eat states must use the existing real three-phase low-to-bowl
    # action, not the placeholder files that copy their standing frames.
    eat_frames = [SPRITES / f"cat-eat-{index}.png" for index in range(3)]
    assert all(path.exists() for path in eat_frames), "adult eat frame set is incomplete"
    assert len({path.read_bytes() for path in eat_frames}) == 3, "eat frames must all be unique"
    assert "1: ['cat-baby-eat-0', 'cat-baby-eat-1', 'cat-baby-eat-2']" in APP
    assert "2: ['cat-kid-eat-0', 'cat-kid-eat-1', 'cat-kid-eat-2']" in APP

    # The real bowl action is fitted per stage so it does not shrink a kid or
    # adult down to the 29x24 source-art scale.
    expected_eat_sizes = {"baby": (28, 23), "kid": (36, 30), "adult": (43, 36)}
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(3):
            path = SPRITES / f"cat-{stage}-eat-{index}.png"
            assert path.exists(), f"missing {stage} eat frame: {path.name}"
            assert Image.open(path).size == expected_eat_sizes[stage]
            frames.append(path.read_bytes())
        assert len(set(frames)) == 3, f"{stage} eat frames must be unique"
    assert "1: ['cat-baby-eat-0', 'cat-baby-eat-1', 'cat-baby-eat-2']" in APP
    assert "2: ['cat-kid-eat-0', 'cat-kid-eat-1', 'cat-kid-eat-2']" in APP
    assert "3: ['cat-adult-eat-0', 'cat-adult-eat-1', 'cat-adult-eat-2']" in APP

    # Adult happy uses the same approved jump cycle, fitted to adult scale.
    for index in range(3):
        path = SPRITES / f"cat-adult-happy-{index}.png"
        assert path.exists(), f"missing adult happy frame: {path.name}"
        assert Image.open(path).size == (43, 48)
    assert "3: ['cat-adult-happy-0', 'cat-adult-happy-1', 'cat-adult-happy-2']" in APP

    # Baby/kid happy states should have an actual three-phase jump, not only a
    # CSS animation around one static face frame.
    for stage in ("baby", "kid"):
        frames = []
        for index in range(3):
            path = SPRITES / f"cat-{stage}-happy-{index}.png"
            assert path.exists(), f"missing {stage} happy frame: {path.name}"
            frames.append(path.read_bytes())
        assert len(set(frames)) == 3, f"{stage} happy frames must all be unique"

    assert "1: ['cat-baby-happy-0', 'cat-baby-happy-1', 'cat-baby-happy-2']" in APP
    assert "2: ['cat-kid-happy-0', 'cat-kid-happy-1', 'cat-kid-happy-2']" in APP

    # P1/P2 cat states must be stage-aware. Reusing cat-big or the standing
    # frame makes an interaction look frozen and can visibly resize the pet.
    for expr, count in (("excited", 3), ("sad", 2), ("wash", 2), ("grunt", 2)):
        for stage in ("baby", "kid", "adult"):
            frames = []
            for index in range(count):
                path = SPRITES / f"cat-{stage}-{expr}-{index}.png"
                assert path.exists(), f"missing {stage} {expr} frame: {path.name}"
                frames.append(path.read_bytes())
            assert len(set(frames)) == count, f"{stage} {expr} frames must be unique"
        assert f"1: ['cat-baby-{expr}-" in APP
        assert f"2: ['cat-kid-{expr}-" in APP
        assert f"3: ['cat-adult-{expr}-" in APP

    for stage in ("baby", "kid", "adult"):
        path = SPRITES / f"cat-{stage}-droopy.png"
        assert path.exists(), f"missing {stage} droopy frame: {path.name}"
        assert f"cat-{stage}-droopy" in APP

    # Walking should keep the growth-stage scale too. The original adult side
    # loop remains the source of truth, while baby/kid get fitted copies.
    assert "walk: { 1: 'cat-baby-walk-', 2: 'cat-kid-walk-', 3: 'cat-walk-' }" in APP
    for stage in ("baby", "kid"):
        frames = []
        for index in range(6):
            path = SPRITES / f"cat-{stage}-walk-{index}.png"
            assert path.exists(), f"missing {stage} walk frame: {path.name}"
            frames.append(path.read_bytes())
        assert len(set(frames)) == 6, f"{stage} walk frames must be unique"

    # Sleep is a curled side pose, but each stage still needs its own fitted
    # dimensions so a baby does not grow taller merely by closing its eyes.
    assert "sleep:   { 0: ['cat-egg-sleep-0', 'cat-egg-sleep-1']," in APP
    expected_sleep_sizes = {"baby": (23, 24), "kid": (29, 31), "adult": (43, 46)}
    for stage in ("baby", "kid", "adult"):
        frames = []
        for index in range(2):
            path = SPRITES / f"cat-{stage}-sleep-{index}.png"
            assert path.exists(), f"missing {stage} sleep frame: {path.name}"
            assert Image.open(path).size == expected_sleep_sizes[stage], (
                f"{stage} sleep frame has the wrong fitted size: {Image.open(path).size}"
            )
            frames.append(path.read_bytes())
        assert len(set(frames)) == 2, f"{stage} sleep frames must be unique"

    # The main-page timer must resolve stage-aware expression maps before
    # checking array length, otherwise sleep/excited/happy never advance.
    assert "if (ev && typeof ev === 'object') ev = ev[petStageIdx()];" in APP

    # The bench must expose all four growth stages, including adult.
    assert "var TB_STAGES = [[0, '蛋'], [1, curSpecies().stages[0]], [2, curSpecies().stages[1]], [3, curSpecies().stages[2]]];" in APP

    print("sprite contract: PASS")


if __name__ == "__main__":
    main()
