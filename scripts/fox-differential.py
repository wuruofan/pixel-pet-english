#!/usr/bin/env python3
"""Rebuild the 87 fox sprites from the three selected, immutable source bases.

The source art is preserved in assets/sprite-bases. Small coordinate masks repair
background-removal damage and remove ground shadows before facial overlays. Draw
the full pet before translating it so its eyes, mouth, blush and tears stay aligned.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
SOURCES = ROOT / "assets" / "sprite-bases"
STAGES = ("kid", "teen", "adult")

# ============================================================
# Color palette — mmx 风格
# ============================================================
MELANIN = (87, 51, 41, 255)   # 深棕眼珠/鼻/嘴（mmx 原图眼色≈#603a31）
INK = (57, 38, 43, 255)       # 纯黑：开口笑 / 星眼中心 / Zzz（更强对比）
WHITE = (255, 253, 247, 255)  # 眼高光
LIGHT = (255, 190, 70, 255)   # 食物碎屑 / 星眼高光
PINK = (244, 132, 145, 255)   # 腮红
TEAR = (159, 183, 255, 255)   # 蓝泪
BOWL = (74, 127, 193, 255)    # 蓝泡泡描边

# 擦除填充：眼位周边是橙色毛，必须用毛色填（v6 用奶油色 → 留白块）
# v7 bighead: 新 base 毛色 kid=#e97532 / adult=#fa8428
# v7.6 teen: teen 毛色 #ed7632
FUR_EYE = {"kid": (233, 117, 50, 255), "adult": (250, 132, 40, 255), "teen": (237, 118, 50, 255)}
# 嘴区周边是奶油口鼻（bighead 口鼻区 kid=#e3c3a0 / adult=#fce3b3 / teen=#fbcb8b）
CREAM_MUZZLE = {"kid": (227, 195, 160, 255), "adult": (252, 227, 179, 255), "teen": (251, 203, 139, 255)}

# ============================================================
# 头/耳/尾/胸/脚 范围锚点 — LOCKED from mmx 像素化 base 实际像素
# （仅调试用：REGIONS 标记图）
# ============================================================
FOX_REGIONS = {
    "kid": {
        "head":  (3, 0, 23, 19),
        "ear_l": (3, 0, 7, 6),
        "ear_r": (18, 0, 23, 6),
        "chest": (13, 21, 23, 28),
        "tail":  None,
        "leg_l": (3, 29, 12, 35),
        "leg_r": (16, 29, 26, 35),
        "foot_y": 35,
    },
    "adult": {
        "head":  (2, 0, 23, 23),
        "ear_l": (3, 3, 9, 13),
        "ear_r": (17, 3, 22, 13),
        "chest": (12, 22, 32, 31),
        "tail":  (27, 21, 43, 44),
        "leg_l": (2, 37, 15, 44),
        "leg_r": (20, 37, 32, 44),
        "foot_y": 44,
    },
}

# ============================================================
# 眼/鼻/嘴 锚点 — v6.1 按 36×38 / 44×48 实际像素逐点校准
# 坐标：(x0,y0,x1,y1) 均为包含端点
# ============================================================
FOX_FACE = {
    "kid": {
        # v7 bighead: 新 base 眼睛大且非对称（R 比 L 高 2 行）
        #   L 眼珠深色 bbox (9-13, 17-19)；R 眼珠深色 bbox (19-23, 15-19)
        "socket": {"l": (9, 16, 13, 19), "r": (19, 15, 23, 19)},
        # open 眼：3×2 深棕瞳孔 + 上方白高光（R 比 L 高 1 行）
        "pupil": {
            "l": [(10, 18), (11, 18), (12, 18), (10, 19), (11, 19), (12, 19)],
            "r": [(20, 17), (21, 17), (22, 17), (20, 18), (21, 18), (22, 18)],
        },
        "glint": {"l": (11, 17), "r": (21, 16)},
        # closed 闭眼线（L 眼中线 y=18，R 眼中线 y=17）
        "closed": {"l": (10, 18, 12, 18), "r": (20, 17, 22, 17)},
        # lid 半闭线（眼窝底行）
        "lid":    {"l": (10, 19, 12, 19), "r": (20, 18, 22, 18)},
        # squeeze 用力眯眼：上下两线
        "squeeze": {
            "l": ((10, 17, 12, 17), (10, 19, 12, 19)),
            "r": ((20, 16, 22, 16), (20, 18, 22, 18)),
        },
        # arc 笑眯眯：下弯弧（∪）
        "arc": {"l": [(10, 19), (11, 18), (12, 19)],
                "r": [(20, 18), (21, 17), (22, 18)]},
        # star 星眼：3×2 填深棕 + 中央亮黄
        "star_fill": {"l": (10, 18, 12, 19), "r": (20, 17, 22, 18)},
        "star_hi":   {"l": (11, 18), "r": (21, 17)},
        # 鼻：v7.5 恢复2px (15-16, y=21)，3px在大脸上偏宽
        "nose": [(15, 21), (16, 21)],
        # 嘴：v7.5 回调——smile恢复3点ω（5点太大），laugh从7点缩到5点（不超过adult）
        "mouth_smile": [(14, 23), (15, 24), (16, 23)],
        "mouth_frown": [(14, 24), (15, 23), (16, 24)],
        "mouth_tiny":  (15, 24),
        "mouth_crumbs": [(13, 23), (17, 23)],
        "mouth_laugh": [(13, 23), (14, 24), (15, 24), (16, 24), (17, 23)],
        "mouth_erase": (14, 23, 16, 24),
        # v7 bighead: mmx 残留杂点（右眼下方孤立深色点），用口鼻区色擦除
        "extra_erase": [(22, 20)],
        "fur_erase": [(18, 19)],
    },
    "adult": {
        # v7 bighead: 新 base 眼睛大且对称
        #   L 眼珠深色 bbox (12-17, 17-21)；R 眼珠深色 bbox (25-30, 17-21)
        "socket": {"l": (12, 17, 17, 21), "r": (25, 17, 30, 21)},
        # open 眼：3×2 深棕瞳孔 + 上方白高光
        "pupil": {
            "l": [(13, 19), (14, 19), (15, 19), (13, 20), (14, 20), (15, 20)],
            "r": [(26, 19), (27, 19), (28, 19), (26, 20), (27, 20), (28, 20)],
        },
        "glint": {"l": (14, 18), "r": (27, 18)},
        # 闭眼线 y=19（眼中线）
        "closed": {"l": (13, 19, 15, 19), "r": (26, 19, 28, 19)},
        "lid":    {"l": (13, 20, 15, 20), "r": (26, 20, 28, 20)},
        "squeeze": {
            "l": ((13, 18, 15, 18), (13, 20, 15, 20)),
            "r": ((26, 18, 28, 18), (26, 20, 28, 20)),
        },
        "arc": {"l": [(13, 20), (14, 19), (15, 20)],
                "r": [(26, 20), (27, 19), (28, 20)]},
        "star_fill": {"l": (13, 19, 15, 20), "r": (26, 19, 28, 20)},
        "star_hi":   {"l": (14, 19), "r": (27, 19)},
        # 鼻与嘴保留一行奶油色间隔。
        "nose": [(20, 22), (21, 22)],
        "nose_erase": (20, 22, 21, 23),
        # 嘴：mmx 嘴在量化后丢失，5 点 ω 居中于鼻下 (x=19-23, y=24-25)
        "mouth_smile": [(19, 24), (20, 25), (21, 25), (22, 25), (23, 24)],
        "mouth_frown": [(19, 25), (20, 24), (21, 24), (22, 24), (23, 25)],
        "mouth_tiny":  (21, 25),
        "mouth_crumbs": [(18, 24), (24, 24)],
        "mouth_laugh": [(18, 24), (19, 25), (20, 25), (21, 25), (22, 25), (23, 25), (24, 24)],  # v7.2: 大ω
        "mouth_erase": (19, 24, 23, 26),  # v7.3: 扩大到y26，擦掉mmx残留的红棕色(#ae462b)下嘴唇/舌头阴影
        "extra_erase": [(14, 22), (15, 22), (26, 22), (27, 22), (28, 22),
                        (20, 27), (21, 27), (22, 27), (21, 28)],
    },
    "teen": {
        # v7.6 teen (小狐狸, stage 2): 36×38, 介于 kid 和 adult 之间
        # 眼窝对称 L=(12,14,14,16) R=(19,14,21,16) (3×3)
        "socket": {"l": (12, 14, 14, 16), "r": (19, 14, 21, 16)},
        # open 眼：3×2 深棕瞳孔 + 上方白高光
        "pupil": {
            "l": [(12, 15), (13, 15), (14, 15), (12, 16), (13, 16), (14, 16)],
            "r": [(19, 15), (20, 15), (21, 15), (19, 16), (20, 16), (21, 16)],
        },
        "glint": {"l": (13, 14), "r": (20, 14)},
        # 闭眼线 y=15（眼中线）
        "closed": {"l": (12, 15, 14, 15), "r": (19, 15, 21, 15)},
        "lid":    {"l": (12, 16, 14, 16), "r": (19, 16, 21, 16)},
        "squeeze": {
            "l": ((12, 14, 14, 14), (12, 16, 14, 16)),
            "r": ((19, 14, 21, 14), (19, 16, 21, 16)),
        },
        "arc": {"l": [(12, 16), (13, 15), (14, 16)],
                "r": [(19, 16), (20, 15), (21, 16)]},
        "star_fill": {"l": (12, 15, 14, 16), "r": (19, 15, 21, 16)},
        "star_hi":   {"l": (13, 15), "r": (20, 15)},
        # 两眼中轴 x=16.5；鼻、四像素宽微笑同轴，嘴宽介于 kid/adult。
        "nose": [(16, 17), (17, 17)],
        "nose_erase": (15, 17, 17, 17),
        "mouth_smile": [(15, 19), (16, 20), (17, 20), (18, 19)],
        "mouth_frown": [(15, 20), (16, 19), (17, 19), (18, 20)],
        "mouth_tiny":  (16, 20),
        "mouth_crumbs": [(14, 19), (19, 19)],
        "mouth_laugh": [(14, 19), (15, 20), (16, 20), (17, 20), (18, 20), (19, 19)],
        "mouth_erase": (14, 18, 19, 20),
        # 额头属于橙色毛，不能用口鼻奶油色擦除旧点。
        "fur_erase": [(14, 11), (21, 12)],
    },
}

# 泪（双眼泪：per-side 独立登记）— 挂在各自下眼睑
# v7 bighead: kid L x=11 R x=21 y=20；adult L x=14 R x=27 y=22
FOX_TEAR = {"kid": {"l": 11, "r": 21, "y": 20},
            "adult": {"l": 14, "r": 27, "y": 22},
            "teen": {"l": 13, "r": 20, "y": 17}}

# 蓝泡泡（v7.1: 更多气泡，大小不一，位置分散到头部周围/上方，不再只在头两侧）
# 格式 (x, y, size): size=2 → 2x2, size=3 → 3x3
FOX_BUBBLES = {
    "kid":   {"r": [(31, 2, 3), (33, 7, 2), (30, 11, 2), (33, 15, 2), (32, 23, 2)],
              "l": [(1, 2, 2), (0, 7, 3), (3, 12, 2), (0, 16, 2), (3, 19, 2)]},
    "adult": {"r": [(38, 3, 3), (41, 8, 2), (37, 12, 2), (40, 16, 2), (38, 21, 2)],
              "l": [(5, 3, 2), (1, 7, 3), (5, 12, 2), (1, 17, 2), (3, 22, 2)]},
    "teen":  {"r": [(31, 2, 3), (33, 7, 2), (30, 11, 2), (33, 15, 2), (31, 20, 2)],
              "l": [(5, 3, 2), (1, 7, 3), (6, 11, 2), (2, 15, 2), (6, 20, 2)]},
}
FOX_ZZZ_SMALL = {"kid": [(31, 3, 3), (31, 11, 2)],
                 "teen": [(31, 3, 3), (31, 11, 2)],
                 "adult": [(38, 5, 4), (37, 13, 2)]}

# 腮红（2×2，位于眼睛下方奶油色口鼻区，随整个宠物平移）
FOX_BLUSH = {
    "kid":   {"l": (10, 21, 11, 22), "r": (23, 21, 24, 22)},
    "adult": {"l": (11, 23, 12, 24), "r": (29, 23, 30, 24)},
    "teen":  {"l": (11, 18, 12, 19), "r": (21, 18, 22, 19)},
}


# ============================================================
# 基础函数
# ============================================================
# These masks restore only transparent pixels accidentally removed with the white
# background. Do not fill the real gap between adult's chest and raised tail.
MUZZLE_FILL_ROWS = {
    "kid": {20: (8, 30), 21: (8, 28), 22: (8, 28), 23: (9, 26)},
    "teen": {21: (14, 22), 22: (15, 22)},
    "adult": {21: (31, 31), 22: (18, 31), 23: (18, 31), 24: (18, 30),
              25: (18, 29), 26: (18, 28), 27: (18, 27), 28: (18, 26)},
}


def clean_base(img, stage):
    """Repair alpha damage without changing the selected source's character design."""
    img = img.copy()
    px = img.load()
    for y, (left, right) in MUZZLE_FILL_ROWS[stage].items():
        for x in range(left, right + 1):
            if px[x, y][3] == 0:
                px[x, y] = CREAM_MUZZLE[stage]
    stray = {"kid": [(5, 21)], "teen": [(13, 21), (12, 26)], "adult": []}
    for point in stray[stage]:
        px[point] = (0, 0, 0, 0)
    if stage == "teen":
        # Pale background/shadow pixels below the two dark paws.
        for x in range(img.width):
            px[x, 35] = (0, 0, 0, 0)
    if stage == "adult":
        # Keep the original paws; trim the surrounding pale oval ground shadow.
        feet = {41: (12, 30), 42: (13, 30), 43: (14, 30), 44: (17, 26)}
        for y in range(41, img.height):
            left, right = feet.get(y, (1, 0))
            for x in range(img.width):
                if not left <= x <= right:
                    px[x, y] = (0, 0, 0, 0)
    # Canonical transparent RGB also makes repeated generation byte-identical.
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return img


def load_base(stage):
    return clean_base(Image.open(SOURCES / f"fox-{stage}-source.png").convert("RGBA"), stage)


def _cover(img, x0, y0, x1, y1, color):
    d = ImageDraw.Draw(img)
    d.rectangle((x0, y0, x1, y1), fill=color)


def _erase_eyes(img, stage):
    """擦除 mmx 原眼珠 → 毛色填回（不碰鼻/嘴，鼻嘴原位重画即可）"""
    fur = FUR_EYE[stage]
    for side in ("l", "r"):
        _cover(img, *FOX_FACE[stage]["socket"][side], fur)
    for point in FOX_FACE[stage].get("fur_erase", []):
        img.putpixel(point, fur)


def _erase_mouth(img, stage):
    box = FOX_FACE[stage]["mouth_erase"]
    if box is not None:
        _cover(img, *box, CREAM_MUZZLE[stage])
    if "nose_erase" in FOX_FACE[stage]:
        _cover(img, *FOX_FACE[stage]["nose_erase"], CREAM_MUZZLE[stage])
    # v7 bighead: 额外擦除 mmx 残留杂点（如 kid (22,20) 孤立深色点）
    extra = FOX_FACE[stage].get("extra_erase", [])
    d = ImageDraw.Draw(img)
    for x, y in extra:
        d.point((x, y), fill=CREAM_MUZZLE[stage])


# ============================================================
# 眼 6 态：open / closed / lid / squeeze / arc / star
# ============================================================
def _line(d, x0, y, x1, color=MELANIN):
    d.line([(x0, y), (x1, y)], fill=color)


def _draw_eye_open(d, stage, side):
    for x, y in FOX_FACE[stage]["pupil"][side]:
        d.point((x, y), fill=MELANIN)
    gx, gy = FOX_FACE[stage]["glint"][side]
    d.point((gx, gy), fill=WHITE)


def _draw_eye_closed(d, stage, side):
    x0, y0, x1, y1 = FOX_FACE[stage]["closed"][side]
    _line(d, x0, y0, x1)


def _draw_eye_lid(d, stage, side):
    x0, y0, x1, y1 = FOX_FACE[stage]["lid"][side]
    _line(d, x0, y0, x1)


def _draw_eye_squeeze(d, stage, side):
    for x0, y0, x1, y1 in FOX_FACE[stage]["squeeze"][side]:
        _line(d, x0, y0, x1)


def _draw_eye_arc(d, stage, side):
    for x, y in FOX_FACE[stage]["arc"][side]:
        d.point((x, y), fill=MELANIN)


def _draw_eye_star(d, stage, side):
    x0, y0, x1, y1 = FOX_FACE[stage]["star_fill"][side]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d.point((x, y), fill=MELANIN)
    hx, hy = FOX_FACE[stage]["star_hi"][side]
    d.point((hx, hy), fill=LIGHT)


# ============================================================
# 嘴 5 态
# ============================================================
def _draw_mouth_smile(d, stage):
    for x, y in FOX_FACE[stage]["mouth_smile"]:
        d.point((x, y), fill=MELANIN)


def _draw_mouth_frown(d, stage):
    for x, y in FOX_FACE[stage]["mouth_frown"]:
        d.point((x, y), fill=MELANIN)


def _draw_mouth_tiny(d, stage):
    x, y = FOX_FACE[stage]["mouth_tiny"]
    d.point((x, y), fill=MELANIN)


def _draw_mouth_crumbs(d, stage):
    _draw_mouth_smile(d, stage)
    for x, y in FOX_FACE[stage]["mouth_crumbs"]:
        d.point((x, y), fill=LIGHT)


def _draw_mouth_laugh(d, stage):
    for x, y in FOX_FACE[stage]["mouth_laugh"]:
        d.point((x, y), fill=INK)


# ============================================================
# 状态层
# ============================================================
def diff_tear(base, stage, phase=0):
    img = base.copy()
    d = ImageDraw.Draw(img)
    t = FOX_TEAR[stage]
    for x0 in (t["l"], t["r"]):
        d.rectangle((x0, t["y"] + phase, x0, t["y"] + 1 + phase), fill=TEAR)
    return img


def diff_blush(base, stage):
    img = base.copy()
    d = ImageDraw.Draw(img)
    for side in ("l", "r"):
        x0, y0, x1, y1 = FOX_BLUSH[stage][side]
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                d.point((x, y), fill=PINK)
    return img


def diff_bubble(base, stage, side):
    img = base.copy()
    d = ImageDraw.Draw(img)
    for x, y, s in FOX_BUBBLES[stage][side]:
        # 纯蓝色填充气泡（不用 outline，否则 2x2 全是边框、3x3 只有中心1px填充）
        if s == 2:
            d.rectangle((x, y, x + 1, y + 1), fill=TEAR)
            d.point((x, y), fill=WHITE)  # 左上角高光
        elif s == 3:
            d.rectangle((x, y, x + 2, y + 2), fill=TEAR)
            d.point((x, y), fill=WHITE)  # 左上角高光
    return img


def diff_zzz(base, stage):
    img = base.copy()
    d = ImageDraw.Draw(img)
    for x, y, s in FOX_ZZZ_SMALL[stage]:
        d.line([(x, y), (x + s, y)], fill=INK)
        d.line([(x + s, y), (x, y + s)], fill=INK)
        d.line([(x, y + s), (x + s, y + s)], fill=INK)
    return img


# ============================================================
# 组合入口
# ============================================================
def render_pose(stage, eyes="open", mouth="smile", tear=None,
                blush=False, bubble=None, zzz=False, offset_y=0, zzz_phase=0):
    """Draw the full pet first, then apply a lossless whole-sprite hop."""
    img = load_base(stage)
    _erase_eyes(img, stage)
    _erase_mouth(img, stage)
    d = ImageDraw.Draw(img)

    # 画鼻
    for x, y in FOX_FACE[stage]["nose"]:
        d.point((x, y), fill=MELANIN)

    # 画嘴
    if mouth == "smile":
        _draw_mouth_smile(d, stage)
    elif mouth == "tiny":
        _draw_mouth_tiny(d, stage)
    elif mouth == "frown":
        _draw_mouth_frown(d, stage)
    elif mouth == "crumbs":
        _draw_mouth_crumbs(d, stage)
    elif mouth == "laugh":
        _draw_mouth_laugh(d, stage)

    # 画眼
    for side in ("l", "r"):
        if eyes == "open":
            _draw_eye_open(d, stage, side)
        elif eyes == "closed":
            _draw_eye_closed(d, stage, side)
        elif eyes == "lid":
            _draw_eye_lid(d, stage, side)
        elif eyes == "squeeze":
            _draw_eye_squeeze(d, stage, side)
        elif eyes == "arc":
            _draw_eye_arc(d, stage, side)
        elif eyes == "star":
            _draw_eye_star(d, stage, side)

    # 状态层
    if blush:
        for side in ("l", "r"):
            x0, y0, x1, y1 = FOX_BLUSH[stage][side]
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    d.point((x, y), fill=PINK)
    if tear is not None:
        t = FOX_TEAR[stage]
        for x0 in (t["l"], t["r"]):
            d.rectangle((x0, t["y"] + tear, x0, t["y"] + 1 + tear), fill=TEAR)
    if bubble is not None:
        for x, y, s in FOX_BUBBLES[stage][bubble]:
            if s == 2:
                d.rectangle((x, y, x + 1, y + 1), fill=TEAR)
                d.point((x, y), fill=WHITE)
            elif s == 3:
                d.rectangle((x, y, x + 2, y + 2), fill=TEAR)
                d.point((x, y), fill=WHITE)
    if zzz:
        for x, y, size in FOX_ZZZ_SMALL[stage]:
            y -= zzz_phase
            d.line([(x, y), (x + size, y)], fill=INK)
            d.line([(x + size, y), (x, y + size)], fill=INK)
            d.line([(x, y + size), (x + size, y + size)], fill=INK)
    if offset_y:
        bbox = img.getbbox()
        if bbox and (bbox[1] + offset_y < 0 or bbox[3] + offset_y > img.height):
            raise ValueError(f"{stage}: offset {offset_y} would crop opaque pixels")
        shifted = Image.new("RGBA", img.size, (0, 0, 0, 0))
        shifted.paste(img, (0, offset_y))
        img = shifted
    return img



# ============================================================
# 调试：头/耳/尾/胸/脚 范围标记图
# ============================================================
def render_regions(stage, out_path):
    """用红/绿/蓝/黄/紫 框标出 head/ear/tail/chest/leg 范围"""
    img = load_base(stage).copy()
    d = ImageDraw.Draw(img)
    r = FOX_REGIONS[stage]
    palette = [
        ("head",  r["head"],  (255, 0, 0, 255)),
        ("ear_l", r["ear_l"], (0, 255, 0, 255)),
        ("ear_r", r["ear_r"], (0, 255, 0, 255)),
        ("tail",  r["tail"],  (0, 0, 255, 255)),
        ("chest", r["chest"], (255, 255, 0, 255)),
        ("leg_l", r["leg_l"], (255, 0, 255, 255)),
        ("leg_r", r["leg_r"], (255, 0, 255, 255)),
    ]
    for name, bbox, color in palette:
        if bbox is None:
            continue
        x0, y0, x1, y1 = bbox
        d.rectangle((x0, y0, x1, y1), outline=color)
    img.resize((img.size[0] * 12, img.size[1] * 12), Image.NEAREST).save(out_path)
    print(f"  regions map saved to {out_path}")


def render_grid(stage, poses, out_path):
    """把多个 pose 拼成一行网格，12x 放大"""
    cell_w, cell_h = {"kid": (36, 38), "teen": (36, 38), "adult": (44, 48)}[stage]
    scale = 12
    gap = 8 * scale
    W = (cell_w * scale + gap) * len(poses) + gap
    H = cell_h * scale + 2 * gap
    grid = Image.new("RGBA", (W, H), (255, 253, 247, 255))
    for i, (name, kw) in enumerate(poses):
        img = render_pose(stage, **kw)
        big = img.resize((cell_w * scale, cell_h * scale), Image.NEAREST)
        grid.paste(big, (gap + i * (cell_w * scale + gap), gap), big)
        d = ImageDraw.Draw(grid)
        d.text((gap + i * (cell_w * scale + gap), H - gap - 10), name,
               fill=(100, 60, 50, 255))
    grid.save(out_path)
    print(f"  grid saved to {out_path}")


# Full-pet offsets keep the selected body and limbs intact. Idle/happy/excited/
# grunt/sleep previously repeated one bitmap; each loop now has visible variation.
ALL_POSES = [
    ("idle-0",    dict(eyes="open",    mouth="smile")),
    ("idle-1",    dict(eyes="open",    mouth="smile", offset_y=-1)),
    ("blink",     dict(eyes="closed",  mouth="smile")),
    ("droopy",    dict(eyes="lid",     mouth="frown")),
    ("eat-0",     dict(eyes="open",    mouth="crumbs")),
    ("eat-1",     dict(eyes="arc",     mouth="laugh", offset_y=1)),
    ("eat-2",     dict(eyes="open",    mouth="smile")),
    ("excited-0", dict(eyes="star",    mouth="laugh", blush=True)),
    ("excited-1", dict(eyes="star",    mouth="laugh", blush=True, offset_y=-2)),
    ("excited-2", dict(eyes="star",    mouth="smile", blush=True, offset_y=-1)),
    ("grunt-0",   dict(eyes="squeeze", mouth="frown")),
    ("grunt-1",   dict(eyes="squeeze", mouth="tiny", offset_y=1)),
    ("happy-0",   dict(eyes="arc",     mouth="smile", blush=True)),
    ("happy-1",   dict(eyes="arc",     mouth="laugh", blush=True, offset_y=-1)),
    ("happy-2",   dict(eyes="arc",     mouth="smile", blush=True, offset_y=1)),
    ("sad-0",     dict(eyes="open",    mouth="frown", tear=0)),
    ("sad-1",     dict(eyes="open",    mouth="frown", tear=1)),
    ("sleep-0",   dict(eyes="closed",  mouth="smile", zzz=True)),
    ("sleep-1",   dict(eyes="closed",  mouth="smile", zzz=True, zzz_phase=1)),
    ("walk-0",    dict(eyes="open",    mouth="smile", offset_y=0)),
    ("walk-1",    dict(eyes="open",    mouth="smile", offset_y=-2)),
    ("walk-2",    dict(eyes="open",    mouth="smile", offset_y=-1)),
    ("walk-3",    dict(eyes="open",    mouth="smile", offset_y=0)),
    ("walk-4",    dict(eyes="open",    mouth="smile", offset_y=1)),
    ("walk-5",    dict(eyes="open",    mouth="smile", offset_y=-1)),
    ("walk-6",    dict(eyes="open",    mouth="smile", offset_y=0)),
    ("wash-0",    dict(eyes="open",    mouth="smile", bubble="r")),
    ("wash-1",    dict(eyes="open",    mouth="smile", bubble="l")),
]


def main():
    for stage in STAGES:
        render_pose(stage).save(SPRITES / f"fox-{stage}-v2.png")
        for name, kw in ALL_POSES:
            render_pose(stage, **kw).save(SPRITES / f"fox-{stage}-v2-{name}.png")
        print(f"  {stage}: wrote base + {len(ALL_POSES)} poses")
    print(f"All {(len(ALL_POSES) + 1) * len(STAGES)} fox sprites regenerated.")


if __name__ == "__main__":
    main()
