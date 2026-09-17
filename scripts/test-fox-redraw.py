#!/usr/bin/env python3
"""Contract checks for the local pixel-redrawn fox base samples.

Mirror of test-dog-redraw.py, adapted for the fox design (pointy ears with
dark ear-tips, white muzzle with omega mouth, white chest patch, thick
wrapping tail). Two stages (kid + adult; no baby form — egg → fox-kid
directly). 21 differential frames per stage + a side-view walk cycle.

Pixel coords come from scripts/redraw-fox-local.py (FOX_EYES, FOX_TAIL_TIP,
FOX_PAW_PAD, FOX_TEAR, FOX_TEAR_RIGHT, FOX_BUBBLES, FOX_ZZZ_SMALL).

**STATUS (2026-09-07)**: scaffolding only — the fox body/head/walk/sleep
functions in redraw-fox-local.py raise NotImplementedError pending concept
approval. This test script reports what is checked + what is missing
rather than failing hard. Once the fox concept frame is approved and the
rendering functions are filled in, replace the ScaffoldingReport() with the
real assertions (mirroring test-dog-redraw.py main()).
"""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"

# Shared constants (mirrored from redraw-fox-local.py / cat).
INK = (57, 38, 43, 255)
WHITE = (255, 253, 247, 255)
TEAR = (159, 183, 255, 255)
BOWL = (74, 127, 193, 255)
LIGHT = (255, 190, 70, 255)
PINK = (244, 132, 145, 255)
NOSE = (207, 82, 105, 255)

# Fox has only kid + adult (no baby); egg stage jumps directly to fox-kid.
EXPECTED_SIZES = {"kid": (36, 38), "adult": (44, 48)}

# Per-stage fox body palettes (mirrors PET_SPECIES[fox].pals).
# v5 🦊-emoji palette — matches redraw-fox-local.py PALS.
FOX_BODY = {
    "kid":   (232, 168, 124, 255),   # fox-body kid (🦊 orange-red)
    "adult": (244, 178, 130, 255),   # fox-body adult (🦊 brighter)
}
FOX_EAR = {
    "kid":   (200, 118, 68, 255),    # dark ear-tip / outline accent
    "adult": (210, 124, 72, 255),
}
FOX_ACCENT = {
    "kid":   (255, 244, 228, 255),   # cream (muzzle, chest)
    "adult": (255, 250, 240, 255),
}

# Final-canvas eye rectangles (left, right). Filled after concept approval.
FOX_EYES = {
    "kid":   ((11, 11, 13, 13), (19, 11, 21, 13)),
    "adult": ((14, 14, 17, 17), (27, 14, 30, 17)),
}

# Sad tear anchors — BOTH eyes, independently registered (NOT a mirror).
FOX_TEAR = {"kid": (12, 16), "adult": (17, 21)}
FOX_TEAR_RIGHT = {"kid": 21, "adult": 30}

# Tail / paw contract boxes (placeholder until stance silhouette lands).
FOX_TAIL_BOX = {"kid": (24, 20, 33, 38), "adult": (30, 24, 44, 48)}
FOX_TAIL_TIP = {"kid": (30, 25), "adult": (40, 33)}
FOX_TAIL_TIP_DROOP = {"kid": (28, 36), "adult": (36, 46)}
FOX_PAW_BOX = {"kid": (17, 33, 25, 38), "adult": (26, 42, 35, 48)}
FOX_PAW_PAD = {"kid": (20, 34), "adult": (30, 44)}

# Pose list (mirrors redraw-dog-local.py).
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


def has_sprite(name):
    return (SPRITES / f"{name}.png").exists()


def main():
    # -------- Scaffolding status --------
    print("fox redraw contract: SCAFFOLDING (concept pending)")
    print("=" * 60)

    expected_frames = []
    for stage in EXPECTED_SIZES:
        expected_frames.append(f"fox-{stage}-v2")
        for pose in FOX_POSES:
            expected_frames.append(f"fox-{stage}-v2-{pose}")
        for f in range(7):
            expected_frames.append(f"fox-{stage}-v2-walk-{f}")
    print(f"Total expected fox frames once concept lands: {len(expected_frames)}")

    present = [f for f in expected_frames if has_sprite(f)]
    missing = [f for f in expected_frames if not has_sprite(f)]
    print(f"Present: {len(present)} / Missing: {len(missing)}")

    # -------- Documented §9 rule assertions (to enable after sprites land) --
    # These are NOT executed today (sprites missing). They are listed so the
    # next session knows what to wire up once redraw-fox-local.py functions
    # are implemented.
    rule_checks = [
        ("§9 双眼泪对称性",
         "FOX_TEAR + FOX_TEAR_RIGHT 双眼 y 同行，x 距离 ≥ 一定像素",
         "load fox-{stage}-v2-sad-0.png; 对 FOX_TEAR[stage] 和 (FOX_TEAR_RIGHT[stage], y) "
         "的像素断言 == TEAR；sad-1 的像素 y+1 同样断言 == TEAR"),
        ("§9 蓝泡泡颜色",
         "任一泡泡 interior 像素 == TEAR",
         "load fox-{stage}-v2-wash-0/1.png；扫描 FOX_BUBBLES[stage][side] 坐标，"
         "interior 像素断言 == TEAR"),
        ("§9 per-side 泡泡登记（非镜像）",
         "wash-0 右侧和 wash-1 左侧的泡泡坐标独立",
         "对比 FOX_BUBBLES[stage]['r'] 和 FOX_BUBBLES[stage]['l']，确保没有一行是另一行的镜像"),
        ("§9 大脸无中缝横条",
         "狐狸脸颊区域无中间横条（'bra/bib line' 防护）",
         "对 adult 阶段的脸颊区域 (y=脸颊中心行) 扫描整行，不能出现连续 INK 像素 ≥3"),
        ("§9 腮红随头运动",
         "excited-1 头部俯仰后腮红跟随",
         "对比 idle-0 和 excited-1 的腮红区域像素，excited-1 的腮红相对头部组 "
         "移动了 head_offset 像素"),
        ("§9 侧影直绘",
         "fox_sleep 走 '直接画完整侧影' 路线（无覆盖+重绘）",
         "静态检查：redraw-fox-local.py 的 fox_sleep() 不调用 draw_sleep() 然后擦除耳朵；"
         "而是直接以 30x32 母版绘制完整侧影"),
    ]
    print("\n§9 rule assertions to enable after concept approval:")
    for title, summary, how in rule_checks:
        print(f"\n  • {title}")
        print(f"      {summary}")
        print(f"      → {how}")

    # -------- Base contract checks (mirrors test-dog-redraw.py main) --------
    # These will activate once the fox PNGs land. They are listed but
    # skipped today (sprites missing). Replace this with the full main()
    # mirroring test-dog-redraw.py once the stance frame is approved.
    print("\n\nBase contract checks (active once PNGs land):")
    planned = [
        "(a) 站姿脚踩画布底边 + 三阶段互不可辨",
        "(b) 18 状态帧 + idle/blink 在 tail/paw 区域外是 base 的精确 shift",
        "(c) eat 三态（低头/抬碗/抬头闭眼）",
        "(d) sad 双泪 + 双眼像素断言",
        "(e) wash 双侧泡泡坐标独立（per-side 表）+ TEAR 颜色断言",
        "(f) sleep 带 Z 字符 + 侧影完整性",
        "(g) walk 7 帧互不相同 + 侧眼存在",
        "(h) 帧清单存在性 + test-sprite-contract.py PET_FRAMES.fox 接线",
    ]
    for p in planned:
        print(f"  - {p}")

    print("\nNEXT STEPS:")
    print("  1. 设计狐狸概念稿（尖耳+白口鼻+白胸+粗尾，三阶段形体差异化）")
    print("  2. 用户验收概念")
    print("  3. 填 redraw-fox-local.py 的 fox_body_kid/adult + fox_head_kid/adult +")
    print("     fox_walk + fox_sleep 函数（继承 §9 规则）")
    print("  4. 把上面 'rule_checks' 和 'planned' 的占位断言替换为实跑断言")
    print("  5. 接线 src/app.js PET_FRAMES.fox + src/app.js fox 物种定义")


if __name__ == "__main__":
    main()
