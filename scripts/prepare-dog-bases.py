#!/usr/bin/env python3
"""Quantize the approved transparent dog references without redrawing their faces.

Source PNGs are preserved unchanged in assets/sprite-bases. Alpha cleanup keeps
the character's largest connected component, then the project's 8x LANCZOS /
NEAREST reduction maps the artwork onto a shared cream-and-gold palette.
Only tiny enclosed alpha specks are filled; substantial or lower-body gaps need
inspection, so the space between feet cannot silently become solid coat.
The output reserves room for a two-pixel hop and side decorations.
"""
import argparse
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "sprite-bases"
PALETTE = [
    (255, 241, 211),  # muzzle, chest, paws
    (248, 215, 166),  # cream shadow
    (235, 190, 131),  # warm paw shading
    (231, 169, 113),  # peach-gold toes (kept distinct from pink cheeks)
    (215, 153, 89),   # paw and cream contour
    (255, 207, 120),  # pale baby gold
    (255, 184, 82),   # warm gold
    (249, 169, 58),   # adult gold
    (232, 143, 44),   # golden shadow
    (207, 113, 31),   # ear and coat outlines
    (179, 88, 24),    # deepest gold
    (110, 66, 45),    # nose, mouth
    (44, 27, 22),     # eyes
    (255, 253, 244),  # eye highlights
    (246, 161, 131),  # cheeks
]
STAGES = {
    "baby": ((36, 38), (26, 29)),
    "kid": ((36, 38), (28, 32)),
    "adult": ((44, 48), (34, 41)),
}
# The approved baby/adult references have a rightward tail. A one-pixel shift
# centers their body mass while preserving at least four pixels beside the tail.
HORIZONTAL_OFFSETS = {"baby": 1, "kid": 0, "adult": 1}


def keep_largest_component(image):
    """Remove detached alpha noise while preserving diagonal pixel connections."""
    width, height = image.size
    alpha = image.getchannel("A")
    mask = bytearray(value >= 128 for value in alpha.getdata())
    largest = []
    for start in range(len(mask)):
        if not mask[start]:
            continue
        mask[start] = 0
        component = [start]
        queue = deque([start])
        while queue:
            point = queue.popleft()
            x, y = point % width, point // width
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        index = ny * width + nx
                        if mask[index]:
                            mask[index] = 0
                            queue.append(index)
                            component.append(index)
        if len(component) > len(largest):
            largest = component
    assert largest, "source contains no opaque dog"
    cleaned_alpha = bytearray(width * height)
    for index in largest:
        cleaned_alpha[index] = 255
    result = image.copy()
    result.putalpha(Image.frombytes("L", image.size, bytes(cleaned_alpha)))
    # Transparent RGB never contributes a hidden fringe on the final grid.
    transparent = Image.new("RGBA", image.size)
    transparent.paste(result, mask=result.getchannel("A"))
    return transparent


def fill_enclosed_holes(image):
    """Fill tiny interior specks; reject ambiguous leg/tail gaps for inspection."""
    width, height = image.size
    px = image.load()
    exterior = set()
    queue = deque()
    for y in range(height):
        for x in range(width):
            if (x in (0, width - 1) or y in (0, height - 1)) and not px[x, y][3]:
                exterior.add((x, y))
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < width and 0 <= ny < height and (nx,ny) not in exterior and not px[nx,ny][3]:
                exterior.add((nx,ny))
                queue.append((nx,ny))
    holes = {(x,y) for y in range(height) for x in range(width)
             if not px[x,y][3] and (x,y) not in exterior}
    pending = set(holes)
    bottom = image.getchannel("A").getbbox()[3]
    while pending:
        region = {pending.pop()}
        queue = deque(region)
        while queue:
            x, y = queue.popleft()
            for point in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if point in pending:
                    pending.remove(point)
                    region.add(point)
                    queue.append(point)
        assert len(region) <= 2 and max(y for x,y in region) < bottom - 5, (
            "inspect possible leg/tail gap before filling alpha", sorted(region)
        )
    while holes:
        updates = {}
        for x, y in sorted(holes):
            neighbors = [px[nx,ny] for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))
                         if 0 <= nx < width and 0 <= ny < height and px[nx,ny][3]]
            if neighbors:
                # A stable neighboring coat color keeps the hard pixel grid.
                updates[(x,y)] = max(neighbors, key=neighbors.count)
        assert updates, "enclosed region has no opaque boundary"
        for point, color in updates.items():
            px[point] = color
        holes.difference_update(updates)
    return image


def prepare(stage):
    size, fit = STAGES[stage]
    source = Image.open(OUTPUT / f"dog-{stage}-source.png").convert("RGBA")
    # Crop first to avoid spending component work on a large transparent border.
    source = source.crop(source.getchannel("A").point(lambda alpha: 255 if alpha >= 128 else 0).getbbox())
    dog = keep_largest_component(source)
    dog = dog.crop(dog.getchannel("A").getbbox())
    scale = min(fit[0] / dog.width, fit[1] / dog.height)
    target = (round(dog.width * scale), round(dog.height * scale))
    dog = dog.resize((target[0] * 8, target[1] * 8), Image.Resampling.LANCZOS)
    dog = dog.resize(target, Image.Resampling.NEAREST)
    px = dog.load()
    for y in range(dog.height):
        for x in range(dog.width):
            r, g, b, alpha = px[x,y]
            if alpha < 150:
                px[x,y] = (0,0,0,0)
            else:
                nearest = min(PALETTE, key=lambda color: sum((color[i] - (r,g,b)[i]) ** 2 for i in range(3)))
                px[x,y] = nearest + (255,)
    dog = keep_largest_component(dog)
    result = Image.new("RGBA", size)
    shift = HORIZONTAL_OFFSETS[stage]
    result.paste(dog, ((size[0] - dog.width) // 2 + shift, size[1] - 3 - dog.height))
    result = fill_enclosed_holes(result)
    left, top, right, bottom = result.getchannel("A").getbbox()
    margin = (size[0] - fit[0]) // 2 - abs(shift)
    assert left >= margin and size[0] - right >= margin, (stage, "side decoration margin")
    assert top >= 2 and size[1] - bottom >= 3, (stage, "vertical motion margin")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stages", nargs="*", metavar="STAGE", help="baby, kid, adult; defaults to all three")
    args = parser.parse_args()
    unknown = set(args.stages) - set(STAGES)
    if unknown:
        parser.error(f"unknown stage: {', '.join(sorted(unknown))}")
    for stage in args.stages or STAGES:
        image = prepare(stage)
        image.save(OUTPUT / f"dog-{stage}-quantized.png")
        colors = sorted({color[:3] for color in image.getdata() if color[3]})
        print(f"{stage}: size={image.size}, bbox={image.getchannel('A').getbbox()}, colors={colors}")


if __name__ == "__main__":
    main()
