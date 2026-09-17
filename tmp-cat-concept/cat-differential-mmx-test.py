#!/usr/bin/env python3
"""
cat 差分渲染脚本（pixel-pet-sprite-workflow 骨架 + cat 锚点表）
流程：mmx 出图 → quantize → clean-base → 本脚本 → 接入 PET_FRAMES → build

三阶段：baby(小奶猫 36×38) / kid(猫崽 36×38) / adult(大猫 44×48)
base 量化后五官丢失 → 程序按锚点擦除残留 + 重画对称脸。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
CONCEPT = ROOT / "tmp-cat-concept"

# ============================================================
# 调色板（猫：橙毛 + 深棕五官）
# ============================================================
EYE_DARK   = (87, 51, 41, 255)    # 深棕眼珠/鼻/嘴
EYE_WHITE  = (255, 253, 247, 255) # 眼高光
MOUTH_DARK = (87, 51, 41, 255)
LIGHT_HI   = (255, 190, 70, 255)  # 星眼高光/食物碎屑
BLUSH      = (244, 132, 145, 255) # 腮红
TEAR       = (159, 183, 255, 255) # 蓝泪
BUBBLE     = (150, 210, 245, 255) # 蓝气泡
ZZ         = (57, 38, 43, 255)    # Zz 深色
INK        = (57, 38, 43, 255)

# 擦除填充色：mmx 实际脸部色（按 base 真实像素校准）
# 不再沿用 gpt base 的 FACE_WHITE=(250,238,215) — 与 mmx baby/kid/adult 实际脸部色差 4-8/16-24，会留浅肉色块
MMX_FACE = {
    "baby":  (252, 245, 229, 255),  # mmx baby 脸部/口鼻底色
    "kid":   (254, 242, 216, 255),  # mmx kid 脸部/口鼻底色
    "adult": (254, 222, 191, 255),  # mmx adult 脸部/口鼻底色
}
FACE_WHITE = MMX_FACE["kid"]  # 兼容旧引用

# ============================================================
# 猫三阶段锚点表（按 mmx base 真实像素校准，2026-09-16）
# 用 PIL 扫描 mmx 1024 原图 + 量化后 base 反推的 bbox 中心点
# ============================================================
BABY_FACE = {
    # mmx baby 量化后双眼 bbox: 左 (12-14, 14-15), 右 (19-21, 14-15)
    'eye_L': (12, 14), 'eye_R': (19, 14),
    'highlight_L': (13, 14), 'highlight_R': (20, 14),
    'nose': (15, 17),   # 脸部中心 (13, 17) 附近
    'mouth': (15, 19),  # 鼻下 2px
    'blush_L': (9, 17), 'blush_R': (22, 17),
    'tear_L': (12, 17), 'tear_R': (20, 17),
    'erase_color': MMX_FACE["baby"],
}

KID_FACE = {
    # mmx kid 量化后双眼 bbox: 左 (13-15, 17-18), 右 (20-22, 17-18)
    'eye_L': (13, 17), 'eye_R': (20, 17),
    'highlight_L': (14, 17), 'highlight_R': (21, 17),
    'nose': (16, 19),
    'mouth': (16, 21),
    'blush_L': (10, 19), 'blush_R': (22, 19),
    'tear_L': (12, 19), 'tear_R': (22, 19),
    'erase_color': MMX_FACE["kid"],
}

ADULT_FACE = {
    # mmx adult 量化后双眼 bbox: 左 (13-16, 15-19), 右 (23-26, 15-19)
    # 鼻嘴按 adult 脸部中心 (20, 22) 推断
    'eye_L': (13, 17), 'eye_R': (24, 17),
    'highlight_L': (14, 17), 'highlight_R': (25, 17),
    'nose': (18, 21),
    'mouth': (18, 24),
    'blush_L': (11, 22), 'blush_R': (27, 22),
    'tear_L': (12, 20), 'tear_R': (26, 20),
    'erase_color': MMX_FACE["adult"],
    'extra_erase': [(11, 14, 18, 20), (22, 14, 29, 20)],  # 覆盖 mmx 漂出的"大圆眼+眼白+红轮廓"
}

# 气泡（参考 fox 布局：右侧/左侧交替，≥5 个，大小不一，放头部外侧）
BUBBLES_BABY = {
    "R": [(31, 3, 3), (34, 7, 2), (30, 8, 2), (35, 12, 2), (32, 14, 2)],
    "L": [(3, 6, 3), (5, 2, 2), (1, 10, 2), (6, 12, 2), (2, 14, 2)],
}
BUBBLES_ADULT = {
    "R": [(38, 4, 3), (41, 8, 2), (37, 10, 2), (42, 13, 2), (39, 15, 2)],
    "L": [(4, 8, 3), (6, 4, 2), (2, 12, 2), (7, 15, 2), (3, 16, 2)],
}
ZZ_BABY = [(31, 9, 4), (27, 14, 2)]   # 大 4x4 + 小 2x2 错开；baby 右耳在 x29-30 y2-7，Zz 下移避让
ZZ_ADULT = [(38, 6, 4), (34, 11, 2)]

STAGES = [
    {
        'name': 'baby',
        'base': str(CONCEPT / 'cat-baby-mmx-clean-v2.png'),
        'prefix': 'cat-baby-v2',
        'w': 36, 'h': 38,
        'face': BABY_FACE,
        'erase_extra': [(11, 13, 16, 18), (18, 13, 22, 18)],  # 覆盖 baby 真实眼位 bbox
        'bubbles': (BUBBLES_BABY["R"], BUBBLES_BABY["L"]),
        'zz_pos': ZZ_BABY,
    },
    {
        'name': 'kid',
        'base': str(CONCEPT / 'cat-kid-mmx-clean.png'),
        'prefix': 'cat-kid-v2',
        'w': 36, 'h': 38,
        'face': KID_FACE,
        'erase_extra': [(12, 16, 16, 19), (19, 16, 22, 19)],  # 覆盖 kid 真实眼位 bbox
        'bubbles': (BUBBLES_BABY["R"], BUBBLES_BABY["L"]),
        'zz_pos': ZZ_BABY,
    },
    {
        'name': 'adult',
        'base': str(CONCEPT / 'cat-adult-mmx-clean-v2.png'),  # v2 已清掉底部地面阴影
        'prefix': 'cat-adult-v2',
        'w': 44, 'h': 48,
        'face': ADULT_FACE,
        'erase_extra': ADULT_FACE['extra_erase'],  # 大擦除区覆盖"大圆眼+眼白+红轮廓"
        'bubbles': (BUBBLES_ADULT["R"], BUBBLES_ADULT["L"]),
        'zz_pos': ZZ_ADULT,
    },
]

# ============================================================
# 绘制逻辑（通用骨架，仅颜色常量按 cat 调整）
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
    elif state == 'squeeze':
        for ex, ey in ((ex_L, ey_L), (ex_R, ey_R)):
            px[ex, ey+1] = EYE_DARK
            px[ex+1, ey] = EYE_DARK
            px[ex+1, ey+2] = EYE_DARK
            px[ex+2, ey+1] = EYE_DARK
    elif state == 'arc':
        for ex, ey in ((ex_L, ey_L), (ex_R, ey_R)):
            px[ex, ey+1] = EYE_DARK
            px[ex+1, ey] = EYE_DARK
            px[ex+2, ey+1] = EYE_DARK
    elif state == 'star':
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
    if state == 'smile':
        px[mx-1, my] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my] = MOUTH_DARK
    elif state == 'laugh':
        px[mx-2, my] = MOUTH_DARK
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my+1] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
        px[mx+2, my] = MOUTH_DARK
    elif state == 'frown':
        px[mx-1, my+1] = MOUTH_DARK
        px[mx, my] = MOUTH_DARK
        px[mx+1, my+1] = MOUTH_DARK
    elif state == 'crumbs':
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
    px = img.load()
    if bubbles_override:
        bubbles_r, bubbles_l = bubbles_override
    else:
        bubbles_r, bubbles_l = BUBBLES_BABY["R"], BUBBLES_BABY["L"]
    blist = bubbles_r if side == 'R' else bubbles_l
    for bx, by, size in blist:
        for dy in range(size):
            for dx in range(size):
                if size == 3 and dx*dx + dy*dy > 4:
                    continue
                nx, ny = bx+dx, by+dy
                if 0 <= nx < img.width and 0 <= ny < img.height:
                    px[nx, ny] = BUBBLE


def draw_zz(img, zz_pos=None):
    px = img.load()
    for zx, zy, size in (zz_pos or ZZ_BABY):
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


def _offset_face(face, dy):
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
            result[k] = v
        else:
            result[k] = off(v)
    return result


def render_frame(base, face, config, full_rect=None, extra_rects=None,
                 bubbles_override=None, zz_pos=None):
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


def render_test_grid(stages=('baby', 'kid', 'adult')):
    """渲染测试网格：base/idle/blink/droopy/excited/sleep/wash（12x 放大）"""
    poses = [('base', {'eyes': 'open', 'mouth': 'smile'}),
             ('idle', {'eyes': 'open', 'mouth': 'smile'}),
             ('blink', {'eyes': 'closed', 'mouth': 'smile'}),
             ('droopy', {'eyes': 'lid', 'mouth': 'frown'}),
             ('excited', {'eyes': 'star', 'mouth': 'laugh', 'blush': True}),
             ('sleep', {'eyes': 'closed', 'mouth': 'smile', 'zz': True}),
             ('wash', {'eyes': 'open', 'mouth': 'smile', 'bubbles': 'R'})]
    scale = 12
    for st in STAGES:
        if st['name'] not in stages:
            continue
        base = Image.open(st['base']).convert("RGBA")
        cell_w, cell_h = base.size
        gap = 6 * scale
        W = (cell_w * scale + gap) * len(poses) + gap
        H = cell_h * scale + 2 * gap
        grid = Image.new("RGBA", (W, H), (255, 253, 247, 255))
        for i, (name, cfg) in enumerate(poses):
            img = render_frame(base, st['face'], cfg, full_rect=st.get('erase_full'),
                               extra_rects=st.get('erase_extra'),
                               bubbles_override=st.get('bubbles'), zz_pos=st.get('zz_pos'))
            big = img.resize((cell_w * scale, cell_h * scale), Image.NEAREST)
            grid.paste(big, (gap + i * (cell_w * scale + gap), gap), big)
        d = ImageDraw.Draw(grid)
        d.text((gap, H - gap - 12), st['name'], fill=(100, 60, 50, 255))
        out = CONCEPT / f"TEST-{st['name']}-faces.png"
        grid.save(out)
        print(f"  test grid saved: {out}")


def main():
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        render_test_grid(sys.argv[2:] or ('baby', 'kid', 'adult'))
        return
    for st in STAGES:
        print(f"\n=== {st['name']} ===")
        base = Image.open(st['base']).convert("RGBA")
        w, h = base.size
        print(f"  base: {w}x{h}  (期望 {st.get('w')}x{st.get('h')})")
        if w != st.get('w') or h != st.get('h'):
            print(f"  ⚠ 尺寸不匹配，请检查 clean base！")
        prefix = st['prefix']
        base_frame = render_frame(base, st['face'], {'eyes': 'open', 'mouth': 'smile'},
                                  full_rect=st.get('erase_full'), extra_rects=st.get('erase_extra'),
                                  bubbles_override=st.get('bubbles'), zz_pos=st.get('zz_pos'))
        base_frame.save(SPRITES / f"{prefix}.png")
        print(f"  wrote {prefix}.png")
        for pose_name, config in ALL_POSES:
            frame = render_frame(base, st['face'], config,
                                 full_rect=st.get('erase_full'), extra_rects=st.get('erase_extra'),
                                 bubbles_override=st.get('bubbles'), zz_pos=st.get('zz_pos'))
            frame.save(SPRITES / f"{prefix}-{pose_name}.png")
        print(f"  wrote {len(ALL_POSES)} pose frames")
    print("\nDone!")


if __name__ == '__main__':
    main()
