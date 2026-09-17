#!/usr/bin/env python3
"""Inspect exported dragon pixels without importing or running the generator."""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "assets" / "sprites"
SOURCE = ROOT / "tmp-dragon-concept"
DARK = (45, 55, 35, 255)
WHITE = (255, 255, 240, 255)
GROUND = (205, 197, 185, 255)
BLUE = {(150, 210, 245, 255), (89, 159, 204, 255)}
ZZ = (40, 40, 50, 255)
WALK = (0, -2, -1, 0, 1, -1, 0)
POSES = ["idle-0", "idle-1", "blink", "droopy"] + [
    f"{group}-{index}" for group, count in (
        ("eat", 3), ("excited", 3), ("grunt", 2), ("happy", 3),
        ("sad", 2), ("sleep", 2), ("walk", 7), ("wash", 2)
    ) for index in range(count)
]
# Pixel anchors measured in the exported neutral frames (including lower padding).
STAGES = {
    "kid": ((36, 38), "dragon-kid-clean-base.png", 1, ((10, 12), (22, 12)), 17, 16, 19, 3),
    "teen": ((40, 44), "dragon-teen-v4-clean-base.png", 0, ((7, 12), (18, 12)), 13.5, 15, 17, 4),
    "adult": ((44, 48), "dragon-adult-clean-base.png", 1, ((15, 18), (25, 18)), 21, 22, 25, 5),
}
RESTORED_TEEN = {
    (20,37),(21,37),(22,37),(23,37),(25,37),(26,37),(27,37),(28,37),
    (29,37),(30,37),(31,37),(32,37),(12,38),(20,38),(21,38),(22,38),
    (23,38),(27,38),(28,38),(29,38),(30,38),(12,39),(20,39),(21,39),
    (22,39),(20,40),(21,40),(22,40),
}


def pixels(image, predicate=lambda color: color[3] != 0):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if predicate(image.getpixel((x, y)))}


def components(points, diagonal=False):
    remaining = set(points)
    found = []
    steps = ((-1,0),(1,0),(0,-1),(0,1))
    if diagonal:
        steps += ((-1,-1),(-1,1),(1,-1),(1,1))
    while remaining:
        component = {remaining.pop()}
        queue = deque(component)
        while queue:
            x, y = queue.popleft()
            for dx, dy in steps:
                point = (x + dx, y + dy)
                if point in remaining:
                    remaining.remove(point)
                    component.add(point)
                    queue.append(point)
        found.append(component)
    return found


def translated(points, dy):
    return {(x, y + dy) for x, y in points}


def check_stage(stage, spec):
    size, source, padding, eyes, axis, nose_y, mouth_y, mouth_width = spec
    frames = {name: Image.open(SPRITES / f"dragon-{stage}-v2{('-' + name) if name else ''}.png")
              for name in ["", *POSES]}
    assert len(list(SPRITES.glob(f"dragon-{stage}-v2*.png"))) == 29, stage
    for name, image in frames.items():
        assert image.mode == "RGBA" and image.size == size, (stage, name, "format")
        assert set(image.getchannel("A").getdata()) == {0, 255}, (stage, name, "alpha")
        assert all(image.getpixel(point)[3] == 0 for point in (
            (0, 0), (size[0]-1, 0), (0, size[1]-1), (size[0]-1, size[1]-1)
        )), (stage, name, "background")
    base = frames[""]
    body = pixels(base)
    original = Image.open(SOURCE / source).convert("RGBA")
    original_body = pixels(original)
    if stage == "teen":
        raw = Image.open(SOURCE / "dragon-teen-v4_001-base.png").convert("RGBA")
        shadow = {(x, y) for x, y in original_body if y >= 36 and original.getpixel((x, y)) == GROUND}
        assert len(shadow) == 53, "approved teen shadow mask changed"
        assert not RESTORED_TEEN & original_body, "approved teen cleanup source changed"
        assert all(base.getpixel(point) == raw.getpixel(point) for point in RESTORED_TEEN), "green leg/tail restoration"
        assert not pixels(base, lambda color: color == GROUND) & {(x,y) for y in range(36,44) for x in range(40)}, "ground shadow returned"
        original_body = (original_body | RESTORED_TEEN) - shadow
    assert body == translated(original_body, padding), (stage, "approved silhouette changed")
    empty = pixels(base, lambda color: color[3] == 0)
    for region in components(empty):
        assert any(x in (0,size[0]-1) or y in (0,size[1]-1) for x,y in region), (stage, "transparent body hole", sorted(region))

    # Open pupils remain equally sized, and closed pupils contain no stale glints.
    for x, y in eyes:
        open_colors = list(base.crop((x,y,x+3,y+3)).getdata())
        closed_colors = list(frames["blink"].crop((x,y,x+3,y+3)).getdata())
        assert open_colors.count(DARK) == 8 and open_colors.count(WHITE) == 1, (stage, "open eye")
        assert closed_colors.count(DARK) == 3 and WHITE not in closed_colors, (stage, "blink residue")
    assert (eyes[0][0] + eyes[1][0] + 2) / 2 == axis, (stage, "eye axis")
    nose = [x for x in range(int(axis)-2, int(axis)+3) if base.getpixel((x,nose_y)) == DARK]
    assert (min(nose) + max(nose)) / 2 == axis, (stage, "nose alignment")
    mouth = {(x,y) for x in range(int(axis)-3,int(axis)+4) for y in (mouth_y,mouth_y+1)
             if base.getpixel((x,y)) == DARK}
    assert max(x for x,y in mouth) - min(x for x,y in mouth) + 1 == mouth_width, (stage, "mouth scale")
    assert all((int(2*axis-x),y) in mouth for x,y in mouth), (stage, "mouth symmetry")
    assert mouth_y > nose_y + 1, (stage, "nose/mouth gap")

    for group, count in (("idle",2),("eat",3),("happy",3),("excited",3),("grunt",2),("sad",2),("sleep",2)):
        assert len({frames[f"{group}-{i}"].tobytes() for i in range(count)}) == count, (stage, group, "frozen frames")
    assert base.tobytes() == frames["idle-0"].tobytes(), (stage, "neutral contract")
    offsets = {"idle-1": -1, "eat-1": -1, "eat-2": 1,
               "excited-1": -2, "excited-2": -1, "grunt-1": 1,
               "happy-0": 1, "happy-1": -2,
               **{f"walk-{index}": dy for index,dy in enumerate(WALK)}}
    for name, image in frames.items():
        if not name.startswith(("sleep-", "wash-")):
            assert pixels(image) == translated(body, offsets.get(name,0)), (stage,name,"body clipped or expression added a hole")
    for index, dy in enumerate(WALK):
        image = frames[f"walk-{index}"]
        assert pixels(image) == translated(body,dy), (stage,index,"walk clipping")
        assert image.crop(image.getbbox()).tobytes() == base.crop(base.getbbox()).tobytes(), (stage,index,"walk body/face distortion")
    expressions = []
    for index, dy in enumerate((0,-1,1)):
        image = frames[f"eat-{index}"]
        assert pixels(image) == translated(body,dy), (stage,index,"eat clipping")
        expressions.append(image.crop((eyes[0][0],eyes[0][1]+dy,eyes[1][0]+3,mouth_y+4+dy)).tobytes())
    assert len(set(expressions)) == 3, (stage,"eat expressions identical after movement removed")

    for index in range(2):
        image = frames[f"wash-{index}"]
        bubbles = pixels(image, lambda color: color in BLUE)
        assert len(components(bubbles, diagonal=True)) == 5, (stage,index,"bubble count")
        assert not bubbles & body, (stage,index,"bubble overlap")
        assert all(x > size[0]/2 if index == 0 else x < size[0]/2 for x,y in bubbles), (stage,index,"bubble side")
        assert all(image.getpixel(point) == base.getpixel(point) for point in body), (stage,index,"bubble erased body")
        sleep = frames[f"sleep-{index}"]
        letters = pixels(sleep, lambda color: color == ZZ)
        assert len(components(letters, diagonal=True)) == 2, (stage,index,"Z count")
        assert not letters & body, (stage,index,"Z overlap")
        assert pixels(sleep) - letters == body, (stage,index,"sleep silhouette")
    print(f"PASS dragon {stage}: 29 frames; source silhouette, transparent holes, face, motion, bubbles and Z")


if __name__ == "__main__":
    for stage, spec in STAGES.items():
        check_stage(stage, spec)
    print("PASS all 87 dragon sprites")
