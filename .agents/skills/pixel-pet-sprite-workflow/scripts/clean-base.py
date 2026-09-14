#!/usr/bin/env python3
"""
pixel-pet-sprite-workflow — 背景/地面阴影清除（flood fill + 孤立像素清理，纯 PIL 通用）

用法：
  1. 自动模式：python3 clean-base.py <输入图> <输出图> <bg_r> <bg_g> <bg_b> [tolerance]
      从四边边缘 flood fill，把连通的背景色设为透明
  2. 手动补刀（Python REPL / 脚本内）：
      clean_isolated_pixels(img, bg_rgb, tol) — 清除 flood fill 漏掉的孤立阴影像素

要点：
  - mmx 图底部常有浅橙/浅灰地面阴影，需从底部边缘单独 flood fill（或手动补刀）
  - flood fill 可能漏掉不连通边缘的孤立像素（如 teen fox 左下角 5px 横线）
    → 量化后逐行检查最底 3 行 + 四角，发现非角色色立即清除
"""
import sys
from collections import deque
from PIL import Image


def flood_fill_transparent(img, bg_color, tolerance=30):
    """从四边边缘 flood fill，把连通的背景色设为透明。返回清除像素数。"""
    px = img.load()
    w, h = img.size
    visited = set()
    queue = deque()
    for x in range(w):
        queue.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        queue.extend([(0, y), (w - 1, y)])
    cleared = 0
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or x < 0 or x >= w or y < 0 or y >= h:
            continue
        visited.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if sum(abs((r, g, b)[i] - bg_color[i]) for i in range(3)) <= tolerance * 3:
            px[x, y] = (0, 0, 0, 0)
            cleared += 1
            queue.extend([(x+1, y), (x-1, y), (x, y+1), (x, y-1)])
    return cleared


def clean_isolated_pixels(img, bg_color, tolerance=30):
    """手动补刀：清除 flood fill 漏掉的孤立像素（四角 + 底部 3 行 + 左/右边缘 2 列）。"""
    px = img.load()
    w, h = img.size
    removed = 0
    for y in range(h):
        for x in range(w):
            if x in (0, 1, w-2, w-1) or y >= h - 3 or (x in (0, w-1)):
                r, g, b, a = px[x, y]
                if a > 0 and sum(abs((r, g, b)[i] - bg_color[i]) for i in range(3)) <= tolerance * 3:
                    px[x, y] = (0, 0, 0, 0)
                    removed += 1
    return removed


def main():
    if len(sys.argv) < 6:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    bg = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    tol = int(sys.argv[6]) if len(sys.argv) > 6 else 30
    img = Image.open(src).convert("RGBA")
    n1 = flood_fill_transparent(img, bg, tol)
    n2 = clean_isolated_pixels(img, bg, tol)
    img.save(out)
    print(f"cleared {n1} flood-fill + {n2} isolated px → saved {out}")


if __name__ == '__main__':
    main()
