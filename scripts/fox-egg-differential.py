#!/usr/bin/env python3
"""
fox-egg 差分渲染脚本
基于 mmx 量化的狐狸蛋 base，程序绘制脸部表情。
用法: python3 scripts/fox-egg-differential.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "assets" / "sprites"
TMP = ROOT / "tmp-fox-concept" / "egg-candidates"

# ============================================================
# 颜色
# ============================================================
DARK = (45, 25, 20, 255)       # 眼/嘴深色
WHITE = (255, 255, 255, 255)    # 眼白/高光
PINK = (240, 130, 130, 255)     # 腮红
TEAR_BLUE = (120, 190, 240, 255) # 眼泪
BUBBLE_BLUE = (150, 210, 250, 255) # 气泡
STAR_YELLOW = (255, 220, 80, 255)  # 星眼高光
EGG_ORANGE = (248, 160, 70, 255)   # 蛋壳橙（擦除填充）

# ============================================================
# 脸部锚点 (29×40)
# ============================================================
FACE = {
    # 眼窝 bbox (擦除区域)
    "socket": {"l": (7, 15, 9, 17), "r": (18, 15, 20, 17)},
    # open 眼：3×3 深色 + 上方白高光
    "pupil": {"l": (7, 15), "r": (18, 15)},
    "glint": {"l": (8, 15), "r": (19, 15)},
    # 闭眼线（眼中线 y=16）
    "closed": {"l": (7, 16, 9, 16), "r": (18, 16, 20, 16)},
    "lid":    {"l": (7, 17, 9, 17), "r": (18, 17, 20, 17)},
    "squeeze": {
        "l": ((7, 15, 9, 15), (7, 17, 9, 17)),
        "r": ((18, 15, 20, 15), (18, 17, 20, 17)),
    },
    "arc": {"l": [(7, 17), (8, 16), (9, 17)],
            "r": [(18, 17), (19, 16), (20, 17)]},
    "star_fill": {"l": (7, 15, 9, 17), "r": (18, 15, 20, 17)},
    "star_hi":   {"l": (8, 16), "r": (19, 16)},
    # 嘴巴中心
    "mouth_cx": 13,
    "mouth_y": 21,
    # 嘴型（相对中心偏移）
    "mouth_smile": [(-1, 0), (0, 1), (1, 0)],
    "mouth_frown": [(-1, 1), (0, 0), (1, 1)],
    "mouth_tiny":  [(0, 0)],
    "mouth_crumbs": [(-2, 0), (2, 0)],
    "mouth_laugh": [(-2, 0), (-1, 1), (0, 1), (1, 1), (2, 0)],
    "mouth_erase": (11, 21, 15, 22),
    # 腮红
    "blush": {"l": (4, 18, 5, 19), "r": (21, 18, 22, 19)},
    # 眼泪
    "tear": {"l": (6, 18), "r": (20, 18)},
    # 气泡 (x, y, size)
    "bubbles": {
        "r": [(25, 4, 3), (27, 8, 2), (24, 2, 2), (27, 12, 2), (23, 6, 2)],
        "l": [(1, 6, 3), (3, 2, 2), (0, 10, 2), (4, 12, 2), (1, 14, 2)],
    },
    # Zz (x, y, size)
    "zzz": [(25, 4, 4), (22, 9, 2)],
}


def load_base():
    """加载 clean base（无背景无阴影，无脸）"""
    img = Image.open(TMP / "fox-egg-clean-base.png").convert("RGBA")
    return img


def draw_eyes(img, state):
    d = ImageDraw.Draw(img)
    px = img.load()
    # 擦除眼窝
    for side in ("l", "r"):
        x0, y0, x1, y1 = FACE["socket"][side]
        d.rectangle((x0, y0, x1, y1), fill=EGG_ORANGE)

    if state == "open":
        for side in ("l", "r"):
            x0, y0 = FACE["pupil"][side]
            d.rectangle((x0, y0, x0+2, y0+2), fill=DARK)
            gx, gy = FACE["glint"][side]
            d.point((gx, gy), fill=WHITE)
    elif state == "closed":
        for side in ("l", "r"):
            x0, y0, x1, y1 = FACE["closed"][side]
            d.rectangle((x0, y0, x1, y1), fill=DARK)
    elif state == "lid":
        for side in ("l", "r"):
            x0, y0, x1, y1 = FACE["lid"][side]
            d.rectangle((x0, y0, x1, y1), fill=DARK)
    elif state == "squeeze":
        for side in ("l", "r"):
            for (x0, y0, x1, y1) in FACE["squeeze"][side]:
                d.rectangle((x0, y0, x1, y1), fill=DARK)
    elif state == "arc":
        for side in ("l", "r"):
            for (x, y) in FACE["arc"][side]:
                d.point((x, y), fill=DARK)
    elif state == "star":
        for side in ("l", "r"):
            x0, y0, x1, y1 = FACE["star_fill"][side]
            d.rectangle((x0, y0, x1, y1), fill=DARK)
            hx, hy = FACE["star_hi"][side]
            d.point((hx, hy), fill=STAR_YELLOW)


def draw_mouth(img, state):
    d = ImageDraw.Draw(img)
    cx, cy = FACE["mouth_cx"], FACE["mouth_y"]
    # 擦除嘴区
    x0, y0, x1, y1 = FACE["mouth_erase"]
    d.rectangle((x0, y0, x1, y1), fill=EGG_ORANGE)

    key = f"mouth_{state}"
    if key in FACE:
        for (dx, dy) in FACE[key]:
            d.point((cx + dx, cy + dy), fill=DARK)


def draw_blush(img):
    d = ImageDraw.Draw(img)
    for side in ("l", "r"):
        x0, y0, x1, y1 = FACE["blush"][side]
        d.rectangle((x0, y0, x1, y1), fill=PINK)


def draw_tear(img, side=None):
    d = ImageDraw.Draw(img)
    sides = [side] if side else ["l", "r"]
    for s in sides:
        x, y = FACE["tear"][s]
        d.rectangle((x, y, x+1, y+2), fill=TEAR_BLUE)


def draw_bubbles(img, side):
    d = ImageDraw.Draw(img)
    for (x, y, size) in FACE["bubbles"][side]:
        d.rectangle((x, y, x+size-1, y+size-1), fill=BUBBLE_BLUE)
        d.point((x, y), fill=WHITE)  # 高光


def draw_zzz(img):
    d = ImageDraw.Draw(img)
    for (x, y, size) in FACE["zzz"]:
        # 画 Z 字形
        if size >= 4:
            d.line((x, y, x+size-1, y), fill=DARK)
            d.line((x+size-1, y, x, y+size-1), fill=DARK)
            d.line((x, y+size-1, x+size-1, y+size-1), fill=DARK)
        else:
            d.line((x, y, x+size-1, y), fill=DARK)
            d.line((x+size-1, y, x, y+size-1), fill=DARK)
            d.line((x, y+size-1, x+size-1, y+size-1), fill=DARK)


def render_pose(eyes="open", mouth="smile", blush=False, tear=None,
                 bubble=None, zzz=False):
    img = load_base()
    draw_eyes(img, eyes)
    draw_mouth(img, mouth)
    if blush:
        draw_blush(img)
    if tear is not None:
        draw_tear(img, tear)
    if bubble:
        draw_bubbles(img, bubble)
    if zzz:
        draw_zzz(img)
    return img


# ============================================================
# 全量 pose 列表（对齐 cat-egg-v2）
# ============================================================
ALL_POSES = [
    ("idle-0",    dict(eyes="open",   mouth="smile")),
    ("idle-1",    dict(eyes="open",   mouth="smile")),
    ("blink",     dict(eyes="closed", mouth="smile")),
    ("eat",       dict(eyes="open",   mouth="crumbs")),
    ("sleep-0",   dict(eyes="closed", mouth="smile", zzz=True)),
    ("sleep-1",   dict(eyes="closed", mouth="smile", zzz=True)),
    ("happy",     dict(eyes="arc",    mouth="smile", blush=True)),
    ("excited-0", dict(eyes="star",   mouth="laugh", blush=True)),
    ("excited-1", dict(eyes="star",   mouth="laugh", blush=True)),
    ("excited-2", dict(eyes="star",   mouth="laugh", blush=True)),
    ("droopy",    dict(eyes="lid",    mouth="frown")),
    ("sad-0",     dict(eyes="open",   mouth="frown", tear="l")),
    ("sad-1",     dict(eyes="open",   mouth="frown", tear="r")),
    ("wash-0",    dict(eyes="open",   mouth="smile", bubble="r")),
    ("wash-1",    dict(eyes="open",   mouth="smile", bubble="l")),
    ("grunt-0",   dict(eyes="squeeze", mouth="frown")),
    ("grunt-1",   dict(eyes="squeeze", mouth="frown")),
]


if __name__ == "__main__":
    # 先保存 base（带默认表情）
    base = render_pose(eyes="open", mouth="smile")
    base.save(SPRITES / "fox-egg-v2.png")
    print(f"  wrote fox-egg-v2.png (base)")

    # 渲染所有 pose
    for name, kw in ALL_POSES:
        img = render_pose(**kw)
        path = SPRITES / f"fox-egg-v2-{name}.png"
        img.save(path)
    print(f"  wrote {len(ALL_POSES)} pose frames")
    print(f"\nAll fox-egg frames written to assets/sprites/")
