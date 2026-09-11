#!/usr/bin/env python3
"""Differential overlay for the fox sprites (v6.1 — anchors re-calibrated).

mmx 002 风格 + 程序化表情层。v6 失败根因：锚点表把 kid 的鼻子 (15,17-18)
当成左眼、真眼 (11-13,14-16)/(17-19,14-16) 没被擦除，且擦除区用奶油色填充
（眼位是橙色毛），于是新表情画在鼻子上、旧眼残留在脸上、脸上留白块。

v6.1 修复（按 36×38 / 44×48 实际像素逐点校准，见 HANDOFF 增量 §12.5）：
  1. 眼窝/瞳孔/高光/闭眼线/腮红/泪 全部对到 mmx 真实脸部像素
  2. 擦除眼窝用「毛色」填充（kid=#f7a05b / adult=#f69139），不再留白块
  3. 嘴/鼻按 mmx 真实位置重画（kid 口鼻区窄，ω 嘴收窄到 3 点）

Layer 1 (AI-generated, fox-{stage}-v2.png = mmx 像素化 base):
  - mmx 画的头/耳/身体/尾巴/胸/脚底（保留 mmx 自然风格）

Layer 2 (this module — the differential, drawn ON TOP):
  1. 擦除 mmx 原眼（范围 = 真实深色像素 bbox），用毛色填回
  2. 程序画 mmx 风格眼（深棕 MELANIN + 白高光）
  3. 重画鼻（kid 1×2 / adult 2×2，mmx 真实位置）
  4. 重画嘴（kid 3 点 ω / adult 5 点 ω，mmx 真实位置）
  5. 状态层：tear / bubble / zzz / blush（per-side 独立登记）
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"

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
        "socket": {"l": (9, 17, 13, 19), "r": (19, 15, 23, 19)},
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
        # 鼻：mmx 1×2 竖线 (21,22)(21,23)，原位重画
        "nose": [(21, 22), (21, 23)],
        # 嘴：mmx 嘴在量化后丢失，5 点 ω 居中于鼻下 (x=19-23, y=24-25)
        "mouth_smile": [(19, 24), (20, 25), (21, 25), (22, 25), (23, 24)],
        "mouth_frown": [(19, 25), (20, 24), (21, 24), (22, 24), (23, 25)],
        "mouth_tiny":  (21, 25),
        "mouth_crumbs": [(18, 24), (24, 24)],
        "mouth_laugh": [(18, 24), (19, 25), (20, 25), (21, 25), (22, 25), (23, 25), (24, 24)],  # v7.2: 大ω
        "mouth_erase": (19, 24, 23, 26),  # v7.3: 扩大到y26，擦掉mmx残留的红棕色(#ae462b)下嘴唇/舌头阴影
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
        # 鼻：2px 横向 (15,17)(16,17)
        "nose": [(15, 17), (16, 17)],
        # 嘴：mmx 原图没画嘴，3 点 ω 居中于鼻下 (x=14-16, y=19-20)
        "mouth_smile": [(14, 19), (15, 20), (16, 19)],
        "mouth_frown": [(14, 20), (15, 19), (16, 20)],
        "mouth_tiny":  (15, 20),
        "mouth_crumbs": [(13, 19), (17, 19)],
        "mouth_laugh": [(13, 19), (14, 20), (15, 20), (16, 20), (17, 19)],
        "mouth_erase": (14, 18, 17, 20),
        # mmx 残留上眼睑杂点
        "extra_erase": [(14, 11), (21, 12)],
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
    "kid":   {"r": [(31, 4, 3), (33, 8, 2), (29, 2, 2), (34, 12, 2), (27, 6, 2)],
              "l": [(3, 6, 3), (5, 2, 2), (1, 10, 2), (6, 12, 2), (2, 14, 2)]},
    "adult": {"r": [(38, 6, 3), (40, 10, 2), (36, 3, 2), (41, 14, 2), (34, 8, 2)],
              "l": [(4, 8, 3), (6, 4, 2), (2, 12, 2), (7, 15, 2), (3, 16, 2)]},
    "teen": {"r": [(31, 4, 3), (33, 8, 2), (29, 2, 2), (34, 12, 2), (27, 6, 2)],
             "l": [(3, 6, 3), (5, 2, 2), (1, 10, 2), (6, 12, 2), (2, 14, 2)]},
}
FOX_ZZZ_SMALL = {"kid": [(31, 4, 4), (27, 9, 2)], "adult": [(38, 6, 4), (34, 11, 2)],
                  "teen": [(31, 4, 4), (27, 9, 2)]}  # v7.2: 两个Z（大+小，错开）

# 腮红（2×2，下移到眼睛下方白色口鼻区两侧，不再盖在橙色毛上）
# v7.1: kid L=(10,20,11,21) R=(24,20,25,21)；adult L=(18,23,19,24) R=(29,23,30,24)
FOX_BLUSH = {
    "kid":   {"l": (10, 20, 11, 21), "r": (24, 20, 25, 21)},
    "adult": {"l": (18, 23, 19, 24),  "r": (29, 23, 30, 24)},
    "teen":  {"l": (10, 16, 11, 17),  "r": (22, 16, 23, 17)},
}


# ============================================================
# 基础函数
# ============================================================
def load_base(stage):
    # v7.5 正式提交：从 assets/sprites/ 加载大头版 base
    return Image.open(SPRITES / f"fox-{stage}-v2.png").convert("RGBA")


def _cover(img, x0, y0, x1, y1, color):
    d = ImageDraw.Draw(img)
    d.rectangle((x0, y0, x1, y1), fill=color)


def _erase_eyes(img, stage):
    """擦除 mmx 原眼珠 → 毛色填回（不碰鼻/嘴，鼻嘴原位重画即可）"""
    fur = FUR_EYE[stage]
    for side in ("l", "r"):
        _cover(img, *FOX_FACE[stage]["socket"][side], fur)


def _erase_mouth(img, stage):
    box = FOX_FACE[stage]["mouth_erase"]
    if box is not None:
        _cover(img, *box, CREAM_MUZZLE[stage])
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
def shift_region_with_fill(img, region, dx, dy, fill_color, fill_rows=2):
    """移动区域像素，原位置上部用 fill_color 填充（避免腿部跟身体衔接处出现空隙）"""
    x1, y1, x2, y2 = region
    w, h = img.size
    px = img.load()
    pixels = []
    for y in range(y1, y2):
        for x in range(x1, x2):
            if 0 <= x < w and 0 <= y < h and px[x, y][3] > 0:
                pixels.append((x, y, px[x, y]))
    for x, y, _ in pixels:
        px[x, y] = (0, 0, 0, 0)
    # 用身体颜色填充原位置上部（跟身体连接的部分）
    for y in range(y1, min(y1 + fill_rows, y2)):
        for x in range(x1, x2):
            if 0 <= x < w and 0 <= y < h:
                has_body_above = False
                for dy_check in range(1, 4):
                    ny = y - dy_check
                    if ny >= 0 and px[x, ny][3] > 0:
                        nr, ng, nb, na = px[x, ny]
                        if nr > ng and nr > nb:  # 橙色身体
                            has_body_above = True
                            break
                if has_body_above:
                    px[x, y] = fill_color
    for x, y, color in pixels:
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and color[3] > 0:
            px[nx, ny] = color

# fox 各阶段腿部区域（用于走路动画）
FOX_LEG_REGIONS = {
    "kid":   {"left": (8, 27, 16, 38),  "right": (18, 27, 28, 38)},
    "teen":  {"left": (8, 29, 17, 38),  "right": (19, 29, 29, 38)},
    "adult": {"left": (10, 37, 22, 48), "right": (24, 37, 36, 48)},
}

FOX_BODY_COLOR = (250, 135, 44, 255)

def render_pose(stage, eyes="open", mouth="smile", tear=None,
                blush=False, bubble=None, zzz=False, offset_y=0, leg_shift=None):
    """组合 base + differential 表情层 → 完整 sprite"""
    img = load_base(stage)
    # 腿部移动（走路动画）
    if leg_shift:
        for leg_name, dx, dy in leg_shift:
            if leg_name in FOX_LEG_REGIONS[stage]:
                shift_region_with_fill(img, FOX_LEG_REGIONS[stage][leg_name], dx, dy, FOX_BODY_COLOR, fill_rows=2)
    # 头部上下平移（吃饭/走路动画）
    if offset_y != 0:
        w, h = img.size
        shifted = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        shifted.paste(img, (0, offset_y))
        img = shifted
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
        for x, y, s in FOX_ZZZ_SMALL[stage]:
            d.line([(x, y), (x + s, y)], fill=INK)
            d.line([(x + s, y), (x, y + s)], fill=INK)
            d.line([(x, y + s), (x + s, y + s)], fill=INK)
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
    cell_w, cell_h = {"kid": (36, 38), "adult": (44, 48)}[stage]
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


if __name__ == "__main__":
    # v7.5 正式提交：全量 28 pose/stage，输出到 assets/sprites/
    # 跟 cat v2 命名规范一致：fox-{stage}-v2-{pose}.png
    out = SPRITES
    ALL_POSES = [
        # idle 呼吸 2 帧（第一版暂同帧，后续加身体上下移动）
        ("idle-0",    dict(eyes="open",    mouth="smile")),
        ("idle-1",    dict(eyes="open",    mouth="smile")),
        # blink 眨眼
        ("blink",     dict(eyes="closed",  mouth="smile")),
        # droopy 耷拉眼+难过嘴
        ("droopy",    dict(eyes="lid",     mouth="frown")),
        # eat 吃东西 3 帧（前两帧带食物碎屑，第三帧吃完微笑）
        ("eat-0",     dict(eyes="open",    mouth="crumbs")),
        ("eat-1",     dict(eyes="open",    mouth="crumbs")),
        ("eat-2",     dict(eyes="open",    mouth="smile")),
        # excited 兴奋 3 帧（星眼+大笑+腮红）
        ("excited-0", dict(eyes="star",    mouth="laugh", blush=True)),
        ("excited-1", dict(eyes="star",    mouth="laugh", blush=True)),
        ("excited-2", dict(eyes="star",    mouth="laugh", blush=True)),
        # grunt 咕哝 2 帧（眯眼+难过嘴）
        ("grunt-0",   dict(eyes="squeeze", mouth="frown")),
        ("grunt-1",   dict(eyes="squeeze", mouth="frown")),
        # happy 开心 3 帧（笑眯眯眼+微笑+腮红）
        ("happy-0",   dict(eyes="arc",     mouth="smile", blush=True)),
        ("happy-1",   dict(eyes="arc",     mouth="smile", blush=True)),
        ("happy-2",   dict(eyes="arc",     mouth="smile", blush=True)),
        # sad 难过 2 帧（眼泪位置不同）
        ("sad-0",     dict(eyes="open",    mouth="frown", tear=0)),
        ("sad-1",     dict(eyes="open",    mouth="frown", tear=1)),
        # sleep 睡觉 2 帧（闭眼+Zz）
        ("sleep-0",   dict(eyes="closed",  mouth="smile", zzz=True)),
        ("sleep-1",   dict(eyes="closed",  mouth="smile", zzz=True)),
        # walk 走路 7 帧（跳跳蹦蹦风格，上下起伏）
        ("walk-0",    dict(eyes="open",    mouth="smile", offset_y=0)),
        ("walk-1",    dict(eyes="open",    mouth="smile", offset_y=-2)),
        ("walk-2",    dict(eyes="open",    mouth="smile", offset_y=-1)),
        ("walk-3",    dict(eyes="open",    mouth="smile", offset_y=0)),
        ("walk-4",    dict(eyes="open",    mouth="smile", offset_y=1)),
        ("walk-5",    dict(eyes="open",    mouth="smile", offset_y=-1)),
        ("walk-6",    dict(eyes="open",    mouth="smile", offset_y=0)),
        # wash 洗澡 2 帧（泡泡左右）
        ("wash-0",    dict(eyes="open",    mouth="smile", bubble="r")),
        ("wash-1",    dict(eyes="open",    mouth="smile", bubble="l")),
    ]
    for stage in ("kid", "teen", "adult"):
        for name, kw in ALL_POSES:
            img = render_pose(stage, **kw)
            path = out / f"fox-{stage}-v2-{name}.png"
            img.save(path)
        print(f"  {stage}: wrote {len(ALL_POSES)} poses to {out}/")
    print(f"\nAll {len(ALL_POSES)*3} frames written to assets/sprites/ (v7.6 kid+teen+adult).")
