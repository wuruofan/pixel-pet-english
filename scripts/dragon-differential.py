#!/usr/bin/env python3
"""
dragon 差分渲染脚本
- 从 clean base (mmx量化+背景阴影清除) 加载
- 擦除原有脸部，程序画对称的脸 (眼/鼻/嘴/腮红)
- 表驱动锚点，支持眼睛状态(open/closed/lid/squeeze/arc/star)、嘴巴状态(smile/frown/crumbs/laugh/tiny)
- 渲染全量 28 pose (对齐 cat v2)
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp-dragon-concept"
SPRITES = ROOT / "assets" / "sprites"

# ============================================================
# 颜色
# ============================================================
EYE_DARK = (45, 55, 35, 255)       # 深绿黑（眼睛/瞳孔）
EYE_WHITE = (255, 255, 240, 255)   # 眼白/高光
MOUTH_DARK = (45, 55, 35, 255)     # 嘴/鼻深色
BLUSH = (240, 140, 100, 255)       # 橙色腮红
TEAR = (120, 200, 240, 255)        # 蓝色眼泪
BUBBLE = (150, 210, 245, 255)      # 蓝色气泡
ZZ = (40, 40, 50, 255)             # Zz 深色

# ============================================================
# kid 锚点 (36x38)
# ============================================================
KID_FACE = {
    'eye_L': (10, 11),    # 左眼起点 (3x3)
    'eye_R': (23, 11),    # 右眼起点
    'highlight_L': (11, 11),
    'highlight_R': (24, 11),
    'nose': (16, 15),     # 鼻子中心 (2px 横向)
    'mouth': (16, 18),    # 嘴巴中心
    'blush_L': (7, 13),   # 腮红左上 (2x2)
    'blush_R': (27, 13),  # 腮红右上
    'tear_L': (9, 14),
    'tear_R': (25, 14),
    'erase_color': (140, 170, 95, 255),  # 擦除填充色（身体绿）
}

# ============================================================
# adult 锚点 (44x48)
# ============================================================
ADULT_FACE = {
    'eye_L': (13, 17),
    'eye_R': (27, 17),
    'highlight_L': (14, 17),
    'highlight_R': (28, 17),
    'nose': (20, 19),
    'mouth': (20, 22),
    'blush_L': (10, 19),
    'blush_R': (31, 19),
    'tear_L': (12, 20),
    'tear_R': (30, 20),
    'erase_color': (150, 180, 120, 255),
}

# ============================================================
# 气泡 / Zz 位置
# ============================================================
BUBBLES_R = [(32, 6, 3), (34, 10, 2), (31, 4, 2), (34, 14, 2), (30, 8, 2)]
BUBBLES_L = [(2, 8, 3), (4, 4, 2), (1, 12, 2), (5, 14, 2), (2, 16, 2)]
ZZ_POS = [(32, 6, 4), (29, 11, 2)]

# ============================================================
# 全量 pose 列表 (28个，对齐 cat v2)
# ============================================================
ALL_POSES = [
    ('idle-0',    {'eyes':'open',    'mouth':'smile'}),
    ('idle-1',    {'eyes':'open',    'mouth':'smile'}),
    ('blink',     {'eyes':'closed',  'mouth':'smile'}),
    ('droopy',    {'eyes':'lid',     'mouth':'frown'}),
    ('eat-0',     {'eyes':'open',    'mouth':'smile',  'offset_y': 0}),
    ('eat-1',     {'eyes':'arc',     'mouth':'laugh',  'offset_y': -1}),
    ('eat-2',     {'eyes':'open',    'mouth':'crumbs', 'offset_y': 1}),
    ('excited-0', {'eyes':'star',    'mouth':'laugh', 'blush':True}),
    ('excited-1', {'eyes':'star',    'mouth':'laugh', 'blush':True}),
    ('excited-2', {'eyes':'star',    'mouth':'laugh', 'blush':True}),
    ('grunt-0',   {'eyes':'squeeze', 'mouth':'frown'}),
    ('grunt-1',   {'eyes':'squeeze', 'mouth':'frown'}),
    ('happy-0',   {'eyes':'arc',     'mouth':'smile', 'blush':True}),
    ('happy-1',   {'eyes':'arc',     'mouth':'smile', 'blush':True}),
    ('happy-2',   {'eyes':'arc',     'mouth':'smile', 'blush':True}),
    ('sad-0',     {'eyes':'open',    'mouth':'frown', 'tear':True}),
    ('sad-1',     {'eyes':'open',    'mouth':'frown', 'tear':True}),
    ('sleep-0',   {'eyes':'closed',  'mouth':'smile', 'zz':True}),
    ('sleep-1',   {'eyes':'closed',  'mouth':'smile', 'zz':True}),
    ('walk-0',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-1',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-2',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-3',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-4',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-5',    {'eyes':'open',    'mouth':'smile'}),
    ('walk-6',    {'eyes':'open',    'mouth':'smile'}),
    ('wash-0',    {'eyes':'open',    'mouth':'smile', 'bubbles':'both'}),
    ('wash-1',    {'eyes':'open',    'mouth':'smile', 'bubbles':'both'}),
]

# ============================================================
# 绘制函数
# ============================================================
def draw_eyes(img, face, state):
    px = img.load()
    ex_L, ey_L = face['eye_L']
    ex_R, ey_R = face['eye_R']
    hx_L, hy_L = face['highlight_L']
    hx_R, hy_R = face['highlight_R']

    if state == 'open':
        # 3x3 深色填充 + 白色高光
        for dy in range(3):
            for dx in range(3):
                px[ex_L+dx, ey_L+dy] = EYE_DARK
                px[ex_R+dx, ey_R+dy] = EYE_DARK
        px[hx_L, hy_L] = EYE_WHITE
        px[hx_R, hy_R] = EYE_WHITE
    elif state == 'closed':
        # 1x3 横线
        for dx in range(3):
            px[ex_L+dx, ey_L+1] = EYE_DARK
            px[ex_R+dx, ey_R+1] = EYE_DARK
    elif state == 'lid':
        # 上半填充 + 下半肤色
        for dx in range(3):
            px[ex_L+dx, ey_L] = EYE_DARK
            px[ex_R+dx, ey_R] = EYE_DARK
        for dx in range(3):
            px[ex_L+dx, ey_L+1] = face['erase_color']
            px[ex_R+dx, ey_R+1] = face['erase_color']
    elif state == 'squeeze':
        # > < 形
        px[ex_L, ey_L+1] = EYE_DARK
        px[ex_L+1, ey_L] = EYE_DARK
        px[ex_L+1, ey_L+2] = EYE_DARK
        px[ex_L+2, ey_L+1] = EYE_DARK
        px[ex_R, ey_R+1] = EYE_DARK
        px[ex_R+1, ey_R] = EYE_DARK
        px[ex_R+1, ey_R+2] = EYE_DARK
        px[ex_R+2, ey_R+1] = EYE_DARK
    elif state == 'arc':
        # ⌒ 形（笑眯眯）
        px[ex_L, ey_L+1] = EYE_DARK
        px[ex_L+1, ey_L] = EYE_DARK
        px[ex_L+2, ey_L+1] = EYE_DARK
        px[ex_R, ey_R+1] = EYE_DARK
        px[ex_R+1, ey_R] = EYE_DARK
        px[ex_R+2, ey_R+1] = EYE_DARK
    elif state == 'star':
        # ★ 形（兴奋）
        star_offsets = [(1,0),(0,1),(1,1),(2,1),(1,2)]
        for dx, dy in star_offsets:
            px[ex_L+dx, ey_L+dy] = EYE_DARK
            px[ex_R+dx, ey_R+dy] = EYE_DARK

def draw_mouth(img, face, state):
    px = img.load()
    w, h = img.size
    mx, my = face['mouth']
    if state == 'smile':
        # 3点ω
        px[mx-1, my] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my] = MOUTH_DARK
    elif state == 'laugh':
        # 5点ω（更大）
        px[mx-2, my] = MOUTH_DARK
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
        px[mx+2, my] = MOUTH_DARK
    elif state == 'frown':
        # 倒ω（难过）
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
    elif state == 'crumbs':
        # ω + 更多食物碎屑（8个，分散在嘴巴周围）
        px[mx-1, my] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my] = MOUTH_DARK
        # 碎屑（深浅两种棕色，分散在嘴巴上方和两侧）
        crumb_colors = [(200, 160, 80, 255), (220, 180, 100, 255), (180, 140, 60, 255)]
        crumb_positions = [
            (mx-3, my-1, 0), (mx+3, my-1, 0),
            (mx-2, my-2, 1), (mx+2, my-2, 1),
            (mx-1, my-3, 2), (mx+1, my-3, 2),
            (mx-4, my, 1),   (mx+4, my, 1),
        ]
        for cx, cy, ci in crumb_positions:
            if 0 <= cx < w and 0 <= cy < h:
                px[cx, cy] = crumb_colors[ci]
    elif state == 'tiny':
        px[mx, my] = MOUTH_DARK

def draw_nose(img, face):
    px = img.load()
    nx, ny = face['nose']
    px[nx-1, ny] = MOUTH_DARK
    px[nx, ny] = MOUTH_DARK

def draw_blush(img, face):
    px = img.load()
    bx_L, by_L = face['blush_L']
    bx_R, by_R = face['blush_R']
    for dy in range(2):
        for dx in range(2):
            px[bx_L+dx, by_L+dy] = BLUSH
            px[bx_R+dx, by_R+dy] = BLUSH

def draw_tears(img, face):
    px = img.load()
    tx_L, ty_L = face['tear_L']
    tx_R, ty_R = face['tear_R']
    px[tx_L, ty_L] = TEAR
    px[tx_L, ty_L+1] = TEAR
    px[tx_R, ty_R] = TEAR
    px[tx_R, ty_R+1] = TEAR

def draw_bubbles(img, side='R'):
    px = img.load()
    if side == 'both':
        bubbles_list = BUBBLES_R + BUBBLES_L
    else:
        bubbles_list = BUBBLES_R if side == 'R' else BUBBLES_L
    for bx, by, size in bubbles_list:
        if size == 3:
            for dy in range(3):
                for dx in range(3):
                    if dx*dx + dy*dy <= 4:
                        try: px[bx+dx, by+dy] = BUBBLE
                        except: pass
        elif size == 2:
            for dy in range(2):
                for dx in range(2):
                    try: px[bx+dx, by+dy] = BUBBLE
                    except: pass

def draw_zz(img):
    px = img.load()
    for zx, zy, size in ZZ_POS:
        if size == 4:
            # Z 字形 4x4
            for dx in range(4): px[zx+dx, zy] = ZZ
            px[zx+2, zy+1] = ZZ
            px[zx+1, zy+2] = ZZ
            for dx in range(4): px[zx+dx, zy+3] = ZZ
        elif size == 2:
            for dx in range(2): px[zx+dx, zy] = ZZ
            px[zx+1, zy+1] = ZZ
            for dx in range(2): px[zx+dx, zy+1] = ZZ

def erase_face(img, face, w, h, full_rect=None, extra_rects=None):
    """擦除原有脸部区域，用身体绿色填充。
    full_rect=(x1,y1,x2,y2) 时擦除整个矩形（用于 adult 原图有残留眼嘴）。
    extra_rects=[(x1,y1,x2,y2),...] 额外擦除小矩形（用于 kid 清除残留噪点，保留脸部轮廓）。
    """
    px = img.load()
    erase = face['erase_color']
    if full_rect:
        x1, y1, x2, y2 = full_rect
        for y in range(y1, y2+1):
            for x in range(x1, x2+1):
                if 0 <= x < w and 0 <= y < h:
                    px[x, y] = erase
    if extra_rects:
        for rect in extra_rects:
            x1, y1, x2, y2 = rect
            for y in range(y1, y2+1):
                for x in range(x1, x2+1):
                    if 0 <= x < w and 0 <= y < h:
                        px[x, y] = erase
    if full_rect or extra_rects:
        return
    # 擦除眼睛区域
    for key in ['eye_L', 'eye_R']:
        ex, ey = face[key]
        for dy in range(3):
            for dx in range(3):
                if 0 <= ex+dx < w and 0 <= ey+dy < h:
                    px[ex+dx, ey+dy] = erase
    # 擦除鼻子
    nx, ny = face['nose']
    for dx in range(-1, 2):
        if 0 <= nx+dx < w:
            px[nx+dx, ny] = erase
    # 擦除嘴巴
    mx, my = face['mouth']
    for dy in range(-1, 3):
        for dx in range(-3, 4):
            if 0 <= mx+dx < w and 0 <= my+dy < h:
                px[mx+dx, my+dy] = erase
    # 擦除腮红
    for key in ['blush_L', 'blush_R']:
        bx, by = face[key]
        for dy in range(2):
            for dx in range(2):
                if 0 <= bx+dx < w and 0 <= by+dy < h:
                    px[bx+dx, by+dy] = erase

def render_frame(base, face, config, w, h, full_rect=None, extra_rects=None):
    """渲染单帧"""
    img = base.copy()
    # 头部上下平移（吃饭动画）
    offset_y = config.get('offset_y', 0)
    if offset_y != 0:
        shifted = Image.new("RGBA", (w, h), (0,0,0,0))
        shifted.paste(img, (0, offset_y))
        img = shifted
    erase_face(img, face, w, h, full_rect=full_rect, extra_rects=extra_rects)
    draw_eyes(img, face, config['eyes'])
    draw_nose(img, face)
    draw_mouth(img, face, config['mouth'])
    if config.get('blush'):
        draw_blush(img, face)
    if config.get('tear'):
        draw_tears(img, face)
    if config.get('bubbles'):
        draw_bubbles(img, config['bubbles'])
    if config.get('zz'):
        draw_zz(img)
    return img

# ============================================================
# 主流程
# ============================================================
def main():
    for stage, face, clean_path, prefix, full_rect, extra_rects in [
        ('kid', KID_FACE, TMP / 'dragon-kid-clean-base.png', 'dragon-kid-v2', None,
         [(24,10,28,14), (14,14,21,16), (24,15,27,19), (13,19,21,19),
          (18,21,22,22), (11,23,12,23), (22,23,22,23)]),
        ('adult', ADULT_FACE, TMP / 'dragon-adult-clean-base.png', 'dragon-adult-v2', (10, 14, 33, 24), None),
    ]:
        print(f"\n=== {stage} ===")
        base = Image.open(clean_path).convert("RGBA")
        w, h = base.size
        print(f"  base: {w}x{h}")

        # base 帧（默认表情 open+smile）
        base_frame = render_frame(base, face, {'eyes':'open', 'mouth':'smile'}, w, h,
                                   full_rect=full_rect, extra_rects=extra_rects)
        base_frame.save(SPRITES / f"{prefix}.png")
        print(f"  wrote {prefix}.png")

        # 全量 pose
        for pose_name, config in ALL_POSES:
            frame = render_frame(base, face, config, w, h,
                                 full_rect=full_rect, extra_rects=extra_rects)
            frame.save(SPRITES / f"{prefix}-{pose_name}.png")
        print(f"  wrote {len(ALL_POSES)} pose frames")

    print("\nDone!")

if __name__ == '__main__':
    main()
