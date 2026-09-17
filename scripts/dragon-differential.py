#!/usr/bin/env python3
"""Render the approved dragon artwork with reproducible repairs and animation.

The selected kid/teen/adult bases stay the source of the silhouette and coat.
The teen's original quantized reference restores green pixels accidentally
removed during background cleanup; its gray ground shadow is removed separately.
Faces are painted before the whole sprite hops, so features cannot lag behind.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp-dragon-concept"
SPRITES = ROOT / "assets" / "sprites"
EYE_DARK = (45, 55, 35, 255)
EYE_WHITE = (255, 255, 240, 255)
BLUSH = (240, 140, 100, 255)
TEAR = (120, 200, 240, 255)
BUBBLE = (150, 210, 245, 255)
BUBBLE_RIM = (89, 159, 204, 255)
ZZ = (40, 40, 50, 255)
GOLD = (255, 216, 105, 255)
GROUND = (205, 197, 185, 255)

# Measured against the approved quantized references, not the old redraw.
# Rectangles here are inclusive. Each erase is clipped to the source silhouette.
STAGES = {
    "kid": {
        "source": "dragon-kid-clean-base.png", "size": (36, 38), "pad_y": 1,
        "skin": (134, 165, 97, 255),
        "eyes": ((10, 11), (22, 11)), "nose": (17, 15), "nose_width": 1,
        "mouth": (17, 18), "mouth_width": 3,
        "blush": ((10, 16), (24, 16)),
        "erase": ((10, 10, 13, 14), (21, 10, 25, 15), (13, 13, 22, 20)),
        "zz": ((31, 4, 4), (30, 11, 3)),
    },
    "teen": {
        "source": "dragon-teen-v4-clean-base.png", "size": (40, 44), "pad_y": 0,
        "skin": (154, 207, 135, 255),
        "eyes": ((7, 12), (18, 12)), "nose": (13, 15), "nose_width": 2,
        "mouth": (13, 17), "mouth_width": 4,
        "blush": ((8, 16), (20, 16)),
        "erase": ((7, 12, 10, 15), (16, 11, 21, 16), (10, 14, 19, 19)),
        "zz": ((35, 4, 4), (35, 11, 3)),
    },
    "adult": {
        "source": "dragon-adult-clean-base.png", "size": (44, 48), "pad_y": 1,
        "skin": (152, 187, 131, 255),
        "eyes": ((15, 17), (25, 17)), "nose": (20, 21), "nose_width": 3,
        "mouth": (21, 24), "mouth_width": 5,
        "blush": ((12, 21), (29, 21)),
        "erase": ((13, 16, 18, 20), (24, 16, 29, 20), (18, 21, 24, 25)),
        "zz": ((39, 4, 4), (38, 12, 3)),
    },
}

ALL_POSES = [
    ("idle-0", {}), ("idle-1", {"offset_y": -1}),
    ("blink", {"eyes": "closed"}),
    ("droopy", {"eyes": "lid", "mouth": "frown"}),
    ("eat-0", {}),
    ("eat-1", {"eyes": "arc", "mouth": "laugh", "offset_y": -1}),
    ("eat-2", {"mouth": "crumbs", "offset_y": 1}),
    ("excited-0", {"eyes": "star", "mouth": "laugh", "blush": True}),
    ("excited-1", {"eyes": "star", "mouth": "laugh", "blush": True, "offset_y": -2}),
    ("excited-2", {"eyes": "star", "mouth": "laugh", "blush": True, "offset_y": -1}),
    ("grunt-0", {"eyes": "squeeze", "mouth": "frown"}),
    ("grunt-1", {"eyes": "squeeze", "mouth": "tiny", "offset_y": 1}),
    ("happy-0", {"eyes": "arc", "blush": True, "offset_y": 1}),
    ("happy-1", {"eyes": "arc", "blush": True, "offset_y": -2}),
    ("happy-2", {"eyes": "arc", "blush": True}),
    ("sad-0", {"mouth": "frown", "tear": 0}),
    ("sad-1", {"mouth": "frown", "tear": 1}),
    ("sleep-0", {"eyes": "closed", "mouth": "tiny", "zz": 0}),
    ("sleep-1", {"eyes": "closed", "mouth": "tiny", "zz": 1}),
    *[(f"walk-{i}", {"offset_y": dy}) for i, dy in enumerate((0, -2, -1, 0, 1, -1, 0))],
    ("wash-0", {"bubbles": "R"}), ("wash-1", {"bubbles": "L"}),
]


def prepare_base(stage):
    cfg = STAGES[stage]
    image = Image.open(TMP / cfg["source"]).convert("RGBA")
    assert image.size == cfg["size"]
    px = image.load()
    if stage == "teen":
        reference = Image.open(TMP / "dragon-teen-v4_001-base.png").convert("RGBA")
        assert reference.size == image.size
        for y in range(image.height):
            for x in range(image.width):
                r, g, b, a = reference.getpixel((x, y))
                # Restore only actual green artwork from the approved source;
                # the white/gray space between the legs must stay transparent.
                if px[x, y][3] == 0 and a == 255 and g > r + 10 and g > b + 15:
                    px[x, y] = (r, g, b, a)
                if y >= 36 and px[x, y] == GROUND:
                    px[x, y] = (0, 0, 0, 0)
    for x0, y0, x1, y1 in cfg["erase"]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if px[x, y][3]:
                    px[x, y] = cfg["skin"]
    return image


def draw_face(image, cfg, pose):
    draw = ImageDraw.Draw(image)
    state = pose.get("eyes", "open")
    for index, (x, y) in enumerate(cfg["eyes"]):
        if state == "open":
            draw.rectangle((x, y, x + 2, y + 2), fill=EYE_DARK)
            draw.point((x + 1, y), fill=EYE_WHITE)
        elif state == "closed":
            draw.line((x, y + 1, x + 2, y + 1), fill=EYE_DARK)
        elif state == "lid":
            draw.line((x, y + 1, x + 2, y + 1), fill=EYE_DARK)
            draw.point((x + 2, y + 2), fill=EYE_DARK)
        elif state == "arc":
            draw.line([(x, y + 1), (x + 1, y), (x + 2, y + 1)], fill=EYE_DARK)
        elif state == "squeeze":
            edge = x if index == 0 else x + 2
            draw.line([(edge, y), (x + 1, y + 1), (edge, y + 2)], fill=EYE_DARK)
        elif state == "star":
            draw.line((x + 1, y, x + 1, y + 2), fill=EYE_DARK)
            draw.line((x, y + 1, x + 2, y + 1), fill=EYE_DARK)
            draw.point((x + 1, y + 1), fill=GOLD)
    nx, ny = cfg["nose"]
    draw.line((nx, ny, nx + cfg["nose_width"] - 1, ny), fill=EYE_DARK)
    mx, my = cfg["mouth"]
    width = cfg["mouth_width"]
    left, right = mx - (width - 1) // 2, mx + width // 2
    centers = (mx, mx + 1) if width % 2 == 0 else (mx, mx)
    mouth = pose.get("mouth", "smile")
    if mouth == "tiny":
        draw.line((centers[0], my, centers[1], my), fill=EYE_DARK)
    elif mouth == "frown":
        draw.point((left, my + 1), fill=EYE_DARK)
        draw.point((right, my + 1), fill=EYE_DARK)
        draw.line((left + 1, my, right - 1, my), fill=EYE_DARK)
    elif mouth == "laugh":
        draw.rectangle((left, my, right, my + 1), fill=EYE_DARK)
        draw.line((centers[0], my + 1, centers[1], my + 1), fill=BLUSH)
    else:
        draw.point((left, my), fill=EYE_DARK)
        draw.point((right, my), fill=EYE_DARK)
        draw.line((left + 1, my + 1, right - 1, my + 1), fill=EYE_DARK)
        if mouth == "crumbs":
            for x, y, color in ((left-2,my-1,(200,160,80,255)), (right+2,my-1,(200,160,80,255)),
                                (left-1,my+2,(220,180,100,255)), (right+1,my+2,(220,180,100,255))):
                draw.point((x, y), fill=color)
    if pose.get("blush"):
        for x, y in cfg["blush"]:
            draw.rectangle((x, y, x + 1, y + 1), fill=BLUSH)
    if "tear" in pose:
        for x, y in cfg["eyes"]:
            ty = y + 3 + pose["tear"]
            draw.line((x + 1, ty, x + 1, ty + 1), fill=TEAR)


def draw_bubbles(image, side):
    draw = ImageDraw.Draw(image)
    w = image.width
    spots = [(w-5,5,3),(w-4,11,2),(w-5,17,3),(w-4,23,2),(w-5,29,3)] if side == "R" else [
        (1,4,3),(2,10,2),(1,16,3),(2,22,2),(1,28,3)]
    for x, y, size in spots:
        assert image.crop((x, y, x + size, y + size)).getchannel("A").getbbox() is None, "bubble overlaps dragon"
        draw.rectangle((x, y, x + size - 1, y + size - 1), fill=BUBBLE_RIM)
        draw.point((x, y), fill=EYE_WHITE)
        draw.point((x + 1, y + 1), fill=BUBBLE)
        if size == 3:
            draw.point((x + 1, y), fill=BUBBLE)
            draw.point((x + 2, y + 1), fill=BUBBLE)


def draw_zz(image, cfg, phase):
    draw = ImageDraw.Draw(image)
    for x, y, size in cfg["zz"]:
        y -= phase
        assert image.crop((x, y, x + size, y + size)).getchannel("A").getbbox() is None, "Z overlaps dragon"
        draw.line([(x, y), (x + size - 1, y), (x, y + size - 1), (x + size - 1, y + size - 1)], fill=ZZ)


def render_frame(base, stage, pose):
    cfg = STAGES[stage]
    image = base.copy()
    draw_face(image, cfg, pose)
    dy = cfg["pad_y"] + pose.get("offset_y", 0)
    if dy:
        moved = Image.new("RGBA", image.size)
        moved.paste(image, (0, dy))
        assert sum(image.getchannel("A").getdata()) == sum(moved.getchannel("A").getdata()), (
            stage, pose, "clipped animation"
        )
        image = moved
    if "bubbles" in pose:
        draw_bubbles(image, pose["bubbles"])
    if "zz" in pose:
        draw_zz(image, cfg, pose["zz"])
    return image


def preview(rows, destination):
    poses = ("idle-0", "blink", "eat-0", "eat-1", "eat-2", "happy-1", "sad-1", "sleep-1", "wash-0", "wash-1", "walk-1")
    sheet = Image.new("RGB", (len(poses) * 152, 3 * 182 + 25), (220, 225, 225))
    draw = ImageDraw.Draw(sheet)
    for col, name in enumerate(poses):
        draw.text((col*152 + 4, 7), name, fill=(30,30,30))
    for row, (stage, base) in enumerate(rows.items()):
        for col, pose in enumerate(poses):
            frame = render_frame(base, stage, dict(ALL_POSES)[pose])
            canvas = Image.new("RGBA", (48,48))
            canvas.paste(frame, ((48-frame.width)//2, 48-frame.height))
            canvas = canvas.resize((144,144), Image.Resampling.NEAREST)
            sheet.paste(canvas, (col*152,row*182+25), canvas)
            draw.text((col*152+4,row*182+172),stage,fill=(30,30,30))
    sheet.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--preview-only", action="store_true")
    args = parser.parse_args()
    rows = {stage: prepare_base(stage) for stage in STAGES}
    for stage, base in rows.items():
        frames = {"": render_frame(base, stage, {})}
        frames.update({f"-{name}": render_frame(base, stage, config) for name, config in ALL_POSES})
        if not args.preview_only:
            for suffix, image in frames.items():
                image.save(SPRITES / f"dragon-{stage}-v2{suffix}.png")
        print(f"{stage}: {len(frames)} frames, {base.width}x{base.height}")
    if args.preview:
        preview(rows, args.preview)


if __name__ == "__main__":
    main()
