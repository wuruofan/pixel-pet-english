#!/usr/bin/env python3
"""
pixel-pet-sprite-workflow — mmx 图量化到 sprite 尺寸（纯 PIL，通用）

用法：python3 quantize.py <输入图> <输出图> [宽] [高]
  例：python3 quantize.py tmp-fox-concept/fox-kid_001.jpg tmp-fox-concept/fox-kid-quant.png 36 38

要点：
  - 8x LANCZOS 放大 → 24 色 MEDIANCUT 量化 → NEAREST 缩小（保留细节、像素干净）
  - 自动检测背景色并去除（目标尺寸外区域透明）
  - 24 色量化后 mmx 深色眼/嘴常被合并进身体主色 → 脸由差分脚本程序绘制（勿用 mmx 量化的脸）
"""
import sys
from pathlib import Path
from PIL import Image


def detect_bbox(img, tolerance=25):
    """从四角检测背景色，找到非背景区域 bbox。返回 ((x0,y0,x1,y1), bg_color)"""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if sum(abs(px[x, y][i] - bg[i]) for i in range(3)) > tolerance * 3:
                min_x, min_y = min(min_x, x), min(min_y, y)
                max_x, max_y = max(max_x, x), max(max_y, y)
    return (min_x, min_y, max_x + 1, max_y + 1), bg


def quantize(src_path, out_path, target_w, target_h, margin_ratio=0.03, colors=24):
    img = Image.open(src_path).convert("RGBA")
    bbox, bg = detect_bbox(img)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mx, my = int(bw * margin_ratio), int(bh * margin_ratio)
    crop = img.crop((max(0, bbox[0] - mx), max(0, bbox[1] - my),
                     min(img.width, bbox[2] + mx), min(img.height, bbox[3] + my)))
    # 补成正方形（居中）
    side = max(crop.size)
    square = Image.new("RGBA", (side, side), bg + (255,))
    square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    # 8x 放大 → 量化 → NEAREST 缩小
    big = square.resize((target_w * 8, target_h * 8), Image.LANCZOS)
    bg_rgb = Image.new("RGB", big.size, bg)
    bg_rgb.paste(big, mask=big.split()[3])
    q = bg_rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    final = q.convert("RGBA").resize((target_w, target_h), Image.NEAREST)
    final.save(out_path)
    print(f"saved {out_path} ({target_w}x{target_h})")
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    w, h = int(sys.argv[3]), int(sys.argv[4])
    quantize(src, out, w, h)
