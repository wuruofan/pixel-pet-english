#!/usr/bin/env python3
"""
pixel-pet-sprite-workflow — 通用差分渲染骨架（抽取自 dragon/fox 差分脚本）

用法：
  1. 复制本文件到项目 scripts/ 下，命名为 <物种>-differential.py
  2. 按物种填写 STAGES 配置（clean base 路径、FACE 锚点表、气泡/ZZ/腿区域、输出前缀）
  3. 运行 python3 scripts/<物种>-differential.py
  4. 产物：assets/sprites/<prefix>.png（base 帧）+ <prefix>-{pose}.png（28 pose）

工作流总览（详见 SKILL.md）：
  mmx 出图 → quantize.py 量化 → clean-base.py 清背景 → 本脚本差分渲染 →
  接入 src/app.js PET_FRAMES → node scripts/build.js → commit

核心思路：mmx 负责"好看的造型和比例"，程序负责"精确的像素级表情差分"。
本脚本从 clean base 出发：擦除原脸 → 程序画对称脸（眼/鼻/嘴/腮红）→ 状态层（泪/气泡/Zz/位移）。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]          # 项目根（脚本放在 scripts/ 下时）
SPRITES = ROOT / "assets" / "sprites"

# ============================================================
# 调色板 — 按物种调整（参考 dragon: 绿色系 / fox: 橙色系）
# ============================================================
EYE_DARK   = (45, 55, 35, 255)       # 深色（眼珠/鼻/嘴）
EYE_WHITE  = (255, 255, 240, 255)    # 眼白/高光
MOUTH_DARK = (45, 55, 35, 255)       # 嘴/鼻深色
LIGHT_HI   = (255, 190, 70, 255)     # 星眼高亮 / 食物碎屑
BLUSH      = (240, 140, 100, 255)    # 腮红
TEAR       = (120, 200, 240, 255)    # 蓝色眼泪
BUBBLE     = (150, 210, 245, 255)    # 蓝色气泡
ZZ         = (40, 40, 50, 255)       # Zz 深色
INK        = (57, 38, 43, 255)       # 纯黑（开口笑/星眼中心，更强对比）

# ============================================================
# 全量 pose 列表 — 28 个，对齐 cat v2（已验证，勿删 pose）
# 走路 = 跳跳蹦蹦（offset_y 上下起伏），不要腿部差分（已否决）
# wash = 左右气泡交替（wash-0 右 / wash-1 左）
# eat  = 三帧不同表情 + offset_y 带动头部，五官跟随（draw 时锚点自动偏移）
# ============================================================
ALL_POSES = [
    ('idle-0',    {'eyes': 'open',   'mouth': 'smile'}),
    ('idle-1',    {'eyes': 'open',   'mouth': 'smile'}),
    ('blink',     {'eyes': 'closed', 'mouth': 'smile'}),
    ('droopy',    {'eyes': 'lid',    'mouth': 'frown'}),
    ('eat-0',     {'eyes': 'open',   'mouth': 'smile', 'offset_y': 0}),
    ('eat-1',     {'eyes': 'arc',    'mouth': 'laugh', 'offset_y': -1}),
    ('eat-2',     {'eyes': 'open',   'mouth': 'crumbs', 'offset_y': 1}),
    ('excited-0', {'eyes': 'star',   'mouth': 'laugh', 'blush': True}),
    ('excited-1', {'eyes': 'star',   'mouth': 'laugh', 'blush': True}),
    ('excited-2', {'eyes': 'star',   'mouth': 'laugh', 'blush': True}),
    ('grunt-0',   {'eyes': 'squeeze', 'mouth': 'frown'}),
    ('grunt-1',   {'eyes': 'squeeze', 'mouth': 'frown'}),
    ('happy-0',   {'eyes': 'arc',    'mouth': 'smile', 'blush': True}),
    ('happy-1',   {'eyes': 'arc',    'mouth': 'smile', 'blush': True}),
    ('happy-2',   {'eyes': 'arc',    'mouth': 'smile', 'blush': True}),
    ('sad-0',     {'eyes': 'open',   'mouth': 'frown', 'tear': True}),
    ('sad-1',     {'eyes': 'open',   'mouth': 'frown', 'tear': True}),
    ('sleep-0',   {'eyes': 'closed', 'mouth': 'smile', 'zz': True}),
    ('sleep-1',   {'eyes': 'closed', 'mouth': 'smile', 'zz': True}),
    ('walk-0',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': 0}),
    ('walk-1',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': -2}),
    ('walk-2',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': -1}),
    ('walk-3',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': 0}),
    ('walk-4',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': 1}),
    ('walk-5',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': -1}),
    ('walk-6',    {'eyes': 'open',   'mouth': 'smile', 'offset_y': 0}),
    ('wash-0',    {'eyes': 'open',   'mouth': 'smile', 'bubbles': 'R'}),
    ('wash-1',    {'eyes': 'open',   'mouth': 'smile', 'bubbles': 'L'}),
]

# ============================================================
# 眼睛 6 态 / 嘴巴 5 态 绘制函数（face 为锚点表，见 references/anchor-guide.md）
# ============================================================
def draw_eyes(img, face, state):
    px = img.load()
    ex_L, ey_L = face['eye_L']
    ex_R, ey_R = face['eye_R']
    hx_L, hy_L = face['highlight_L']
    hx_R, hy_R = face['highlight_R']
    if state == 'open':
        for dy in range(3):
            for dx in range(3):
                px[ex_L+dx, ey_L+dy] = EYE_DARK
                px[ex_R+dx, ey_R+dy] = EYE_DARK
        px[hx_L, hy_L] = EYE_WHITE
        px[hx_R, hy_R] = EYE_WHITE
    elif state == 'closed':
        for dx in range(3):
            px[ex_L+dx, ey_L+1] = EYE_DARK
            px[ex_R+dx, ey_R+1] = EYE_DARK
    elif state == 'lid':
        for dx in range(3):
            px[ex_L+dx, ey_L] = EYE_DARK
            px[ex_L+dx, ey_L+1] = face['erase_color']
            px[ex_R+dx, ey_R] = EYE_DARK
            px[ex_R+dx, ey_R+1] = face['erase_color']
    elif state == 'squeeze':      # > < 挤眼
        for ex, ey in ((ex_L, ey_L), (ex_R, ey_R)):
            px[ex, ey+1] = EYE_DARK
            px[ex+1, ey] = EYE_DARK
            px[ex+1, ey+2] = EYE_DARK
            px[ex+2, ey+1] = EYE_DARK
    elif state == 'arc':          # ⌒ 笑眯眯
        for ex, ey in ((ex_L, ey_L), (ex_R, ey_R)):
            px[ex, ey+1] = EYE_DARK
            px[ex+1, ey] = EYE_DARK
            px[ex+2, ey+1] = EYE_DARK
    elif state == 'star':         # ★ 兴奋（中央亮黄）
        for ex, ey in ((ex_L, ey_L), (ex_R, ey_R)):
            for dx, dy in [(1,0),(0,1),(1,1),(2,1),(1,2)]:
                px[ex+dx, ey+dy] = EYE_DARK
            px[ex+1, ey+1] = LIGHT_HI


def draw_nose(img, face):
    px = img.load()
    nx, ny = face['nose']
    px[nx-1, ny] = MOUTH_DARK
    px[nx, ny] = MOUTH_DARK


def draw_mouth(img, face, state):
    px = img.load()
    mx, my = face['mouth']
    if state == 'smile':     # 3 点 ω
        px[mx-1, my] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my] = MOUTH_DARK
    elif state == 'laugh':   # 5 点 ω（更大；kid 嘴宽 ≤ adult，勿失控）
        px[mx-2, my] = MOUTH_DARK
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
        px[mx+2, my] = MOUTH_DARK
    elif state == 'frown':   # 倒 ω
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
    elif state == 'crumbs':  # ω + 食物碎屑
        px[mx-1, my] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my] = MOUTH_DARK
        crumb_colors = [(200,160,80,255), (220,180,100,255), (180,140,60,255)]
        for cx, cy, ci in [(mx-3,my-1,0),(mx+3,my-1,0),(mx-2,my-2,1),(mx+2,my-2,1),
                           (mx-1,my-3,2),(mx+1,my-3,2),(mx-4,my,1),(mx+4,my,1)]:
            if 0 <= cx < img.width and 0 <= cy < img.height:
                px[cx, cy] = crumb_colors[ci]
    elif state == 'tiny':
        px[mx, my] = MOUTH_DARK


def draw_blush(img, face):
    px = img.load()
    for bx, by in (face['blush_L'], face['blush_R']):
        for dy in range(2):
            for dx in range(2):
                px[bx+dx, by+dy] = BLUSH


def draw_tears(img, face):
    px = img.load()
    for tx, ty in (face['tear_L'], face['tear_R']):
        px[tx, ty] = TEAR
        px[tx, ty+1] = TEAR


def draw_bubbles(img, side, bubbles_override=None):
    """气泡：wash-0 右侧 / wash-1 左侧 交替。bubbles_override=(R列表, L列表) 按阶段定制。
    每侧 ≥5 个气泡，大小不一（2x2/3x3），位置分散在头部外侧/上方，勿贴耳。"""
    px = img.load()
    if bubbles_override:
        bubbles_r, bubbles_l = bubbles_override
    else:
        bubbles_r, bubbles_l = BUBBLES_R, BUBBLES_L
    blist = bubbles_r if side == 'R' else bubbles_l
    for bx, by, size in blist:
        for dy in range(size):
            for dx in range(size):
                if size == 3 and dx*dx + dy*dy > 4:
                    continue  # 3x3 圆角
                nx, ny = bx+dx, by+dy
                if 0 <= nx < img.width and 0 <= ny < img.height:
                    px[nx, ny] = BUBBLE


def draw_zz(img, zz_pos=None):
    """睡觉 Zz：两个（大 4x4 + 小 2x2 错开），放在头部右侧空白处，勿与耳朵重叠。"""
    px = img.load()
    for zx, zy, size in (zz_pos or ZZ_POS):
        if size == 4:
            for dx in range(4): px[zx+dx, zy] = ZZ
            px[zx+2, zy+1] = ZZ
            px[zx+1, zy+2] = ZZ
            for dx in range(4): px[zx+dx, zy+3] = ZZ
        elif size == 2:
            for dx in range(2): px[zx+dx, zy] = ZZ
            px[zx+1, zy+1] = ZZ
            for dx in range(2): px[zx+dx, zy+2] = ZZ


def erase_face(img, face, full_rect=None, extra_rects=None):
    """擦除 mmx 原脸，用 erase_color 填回。
    full_rect=(x1,y1,x2,y2)：整块擦除（原图残留眼/鼻/嘴时用）。
    extra_rects=[(x1,y1,x2,y2),...]：小矩形补擦（清除残留噪点，保留轮廓）。
    都不传时按锚点擦眼(3x3)/鼻(3x1)/嘴(7x4)/腮红(2x2)。"""
    px = img.load()
    w, h = img.size
    erase = face['erase_color']
    rects = []
    if full_rect:
        rects.append(full_rect)
    if extra_rects:
        rects.extend(extra_rects)
    if rects:
        for x1, y1, x2, y2 in rects:
            for y in range(y1, y2+1):
                for x in range(x1, x2+1):
                    if 0 <= x < w and 0 <= y < h:
                        px[x, y] = erase
        return
    for key in ('eye_L', 'eye_R'):
        ex, ey = face[key]
        for dy in range(3):
            for dx in range(3):
                if 0 <= ex+dx < w and 0 <= ey+dy < h:
                    px[ex+dx, ey+dy] = erase
    nx, ny = face['nose']
    for dx in range(-1, 2):
        if 0 <= nx+dx < w:
            px[nx+dx, ny] = erase
    mx, my = face['mouth']
    for dy in range(-1, 3):
        for dx in range(-3, 4):
            if 0 <= mx+dx < w and 0 <= my+dy < h:
                px[mx+dx, my+dy] = erase
    for key in ('blush_L', 'blush_R'):
        bx, by = face[key]
        for dy in range(2):
            for dx in range(2):
                if 0 <= bx+dx < w and 0 <= by+dy < h:
                    px[bx+dx, by+dy] = erase


def render_frame(base, face, config, full_rect=None, extra_rects=None,
                 bubbles_override=None, zz_pos=None):
    """渲染单帧：offset_y 头部平移（五官/擦除区域跟随偏移）→ 擦脸 → 画五官 → 状态层。"""
    w, h = base.size
    offset_y = config.get('offset_y', 0)
    if offset_y != 0:
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.paste(base, (0, offset_y))
        base = img
        face = _offset_face(face, offset_y)
        if full_rect:
            full_rect = (full_rect[0], full_rect[1]+offset_y, full_rect[2], full_rect[3]+offset_y)
        if extra_rects:
            extra_rects = [(r[0], r[1]+offset_y, r[2], r[3]+offset_y) for r in extra_rects]
    img = base.copy()
    erase_face(img, face, full_rect=full_rect, extra_rects=extra_rects)
    draw_eyes(img, face, config['eyes'])
    draw_nose(img, face)
    draw_mouth(img, face, config['mouth'])
    if config.get('blush'):
        draw_blush(img, face)
    if config.get('tear'):
        draw_tears(img, face)
    if config.get('bubbles'):
        draw_bubbles(img, config['bubbles'], bubbles_override=bubbles_override)
    if config.get('zz'):
        draw_zz(img, zz_pos)
    return img


def _offset_face(face, dy):
    """递归偏移 face 锚点表中所有 y 坐标（头部上下平移时五官跟随）。
    注意：'erase_color' 是 RGBA 颜色（4 元组），不是坐标，必须跳过偏移。"""
    def off(val):
        if isinstance(val, tuple) and len(val) == 2 and isinstance(val[0], int):
            return (val[0], val[1] + dy)
        if isinstance(val, tuple) and len(val) == 4 and all(isinstance(v, int) for v in val):
            return (val[0], val[1] + dy, val[2], val[3] + dy)
        if isinstance(val, list):
            return [off(v) for v in val]
        if isinstance(val, dict):
            return {k: off(v) for k, v in val.items()}
        return val
    result = {}
    for k, v in face.items():
        if k == 'erase_color':
            result[k] = v  # 颜色不是坐标，不偏移
        else:
            result[k] = off(v)
    return result


def main():
    for st in STAGES:
        print(f"\n=== {st['name']} ===")
        base = Image.open(st['base']).convert("RGBA")
        w, h = base.size
        print(f"  base: {w}x{h}  (期望 {st.get('w')}x{st.get('h')})")
        if w != st.get('w') or h != st.get('h'):
            print(f"  ⚠ 尺寸不匹配，请检查 clean base！")
        prefix = st['prefix']
        # base 帧（默认表情）
        base_frame = render_frame(base, st['face'], {'eyes': 'open', 'mouth': 'smile'},
                                  full_rect=st.get('erase_full'), extra_rects=st.get('erase_extra'),
                                  bubbles_override=st.get('bubbles'), zz_pos=st.get('zz_pos'))
        base_frame.save(SPRITES / f"{prefix}.png")
        print(f"  wrote {prefix}.png")
        # 全量 pose
        for pose_name, config in ALL_POSES:
            frame = render_frame(base, st['face'], config,
                                 full_rect=st.get('erase_full'), extra_rects=st.get('erase_extra'),
                                 bubbles_override=st.get('bubbles'), zz_pos=st.get('zz_pos'))
            frame.save(SPRITES / f"{prefix}-{pose_name}.png")
        print(f"  wrote {len(ALL_POSES)} pose frames")
    print("\nDone! 下一步：接入 src/app.js PET_FRAMES → node scripts/build.js")


if __name__ == '__main__':
    main()
