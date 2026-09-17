#!/usr/bin/env python3
"""Read-only contracts for approved cat sprites and the shared, unchanged egg.

These checks inspect the exported PNGs, not the generator's implementation.
The old hand-drawn cat's exact coordinates and side-view walk no longer apply.
"""
import hashlib
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
SIZES = {"baby": (36, 38), "kid": (36, 38), "adult": (44, 48)}
GROUPS = {
    "idle": 2, "eat": 3, "sleep": 2, "happy": 3, "excited": 3,
    "grunt": 2, "sad": 2, "wash": 2, "walk": 7,
}
POSES = ("blink", "droopy") + tuple(
    f"{group}-{i}" for group, count in GROUPS.items() for i in range(count)
)
WALK_Y = (0, -2, -1, 0, 1, -1, 0)
EAT_Y = (0, -1, 1)

# Independently reviewed opaque face areas on the approved, cleaned artwork.
# Kept here rather than imported from the rendering code so a misplaced face
# cannot silently move the acceptance region along with it.
FACE_REGIONS = {
    "baby": (9, 14, 21, 22),
    "kid": (10, 15, 25, 22),
    "adult": (13, 17, 26, 27),
}

# Decoded RGBA pixels, ordered by filename, from the shared egg before this
# cat-only change. Compression may change; its artwork and frame set may not.
EGG_PIXEL_DIGEST = "96151c8ef420ca4403e4e2857a797c96ef724839c49786c48d87f7c6c2142de3"


def load(name, size, sprites=SPRITES):
    path = sprites / f"{name}.png"
    assert path.is_file(), f"missing sprite: {path.name}"
    with Image.open(path) as source:
        assert source.mode == "RGBA", f"{name}: expected RGBA, got {source.mode}"
        image = source.copy()
    assert image.size == size, f"{name}: {image.size}, expected {size}"
    alpha = image.getchannel("A")
    assert alpha.getbbox(), f"{name}: empty sprite"
    assert set(alpha.getdata()) == {0, 255}, f"{name}: requires crisp transparent/opaque pixels"
    w, h = size
    assert all(alpha.getpixel(p) == 0 for p in ((0, 0), (w-1, 0), (0, h-1), (w-1, h-1))), (
        f"{name}: background must be transparent"
    )
    return image


def opaque_pixels(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y))[3] == 255}


def content(image):
    return image.crop(image.getchannel("A").getbbox())


def aligned_face(image, box, dy=0):
    left, top, right, bottom = box
    assert 0 <= top + dy < bottom + dy <= image.height, "face moved out of canvas"
    return image.crop((left, top + dy, right, bottom + dy))


def best_vertical_offset(base_pixels, frame_pixels):
    """Align silhouettes independently of the generator's pose parameters."""
    return max(range(-3, 4), key=lambda dy: (
        len({(x, y + dy) for x, y in base_pixels} & frame_pixels), -abs(dy)
    ))


def check_face(image, box, name, dy=0):
    face = aligned_face(image, box, dy)
    pixels = list(face.getdata())
    assert all(p[3] == 255 for p in pixels), f"{name}: face has transparent holes"
    dark = sum(r < 135 and g < 110 and b < 110 for r, g, b, _ in pixels)
    assert 4 <= dark < len(pixels) // 2, f"{name}: face must contain readable features and a solid backing"


def components(points):
    pending = set(points)
    result = []
    while pending:
        seed = pending.pop()
        component, queue = {seed}, [seed]
        while queue:
            x, y = queue.pop()
            for neighbor in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if neighbor in pending:
                    pending.remove(neighbor)
                    component.add(neighbor)
                    queue.append(neighbor)
        result.append(component)
    return result


def blue_pixels(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            for r, g, b, a in [image.getpixel((x, y))]
            if a == 255 and r < 200 and g >= r + 15 and b >= g + 15}


def check_walk(stage, base, frames):
    base_box = base.getchannel("A").getbbox()
    baseline = content(base)
    pixel_count = len(opaque_pixels(base))
    for i, dy in enumerate(WALK_Y):
        name = f"{stage} walk-{i}"
        frame = frames[f"walk-{i}"]
        bbox = frame.getchannel("A").getbbox()
        assert bbox == (base_box[0], base_box[1]+dy, base_box[2], base_box[3]+dy), (
            f"{name}: whole sprite must hop by {dy}px without changing its silhouette"
        )
        assert len(opaque_pixels(frame)) == pixel_count, f"{name}: moving clipped the sprite"
        cropped = content(frame)
        assert cropped.size == baseline.size and cropped.tobytes() == baseline.tobytes(), (
            f"{name}: face and body must move together; no leg edits or lost pixels"
        )


def check_wash(stage, base, frames):
    base_pixels = opaque_pixels(base)
    for phase, side in ((0, "right"), (1, "left")):
        frame = frames[f"wash-{phase}"]
        bubbles = blue_pixels(frame)
        clusters = components(bubbles)
        assert len([c for c in clusters if len(c) >= 2]) >= 5, (
            f"{stage} wash-{phase}: needs at least five separate blue bubbles"
        )
        assert all((x >= frame.width / 2) if side == "right" else (x < frame.width / 2)
                   for x, _ in bubbles), f"{stage} wash-{phase}: bubbles belong on the {side}"
        dy = best_vertical_offset(base_pixels, opaque_pixels(frame))
        moved_body = {(x, y + dy) for x, y in base_pixels}
        assert not bubbles & moved_body, f"{stage} wash-{phase}: bubbles overlap the cat/ears"


def check_egg(sprites=SPRITES):
    paths = sorted(sprites.glob("cat-egg-v2*.png"))
    assert len(paths) == 18, "the shared egg must retain its base and 17 poses"
    digest = hashlib.sha256()
    for path in paths:
        image = load(path.stem, (29, 44), sprites)
        digest.update(path.name.encode() + b"\0" + image.tobytes())
    assert digest.hexdigest() == EGG_PIXEL_DIGEST, "cat redraw changed the shared egg artwork"


def check_cat_sprites(sprites=SPRITES):
    assert len(POSES) == 28
    bases = []
    for stage, size in SIZES.items():
        prefix = f"cat-{stage}-v2"
        base = load(prefix, size, sprites)
        frames = {pose: load(f"{prefix}-{pose}", size, sprites) for pose in POSES}
        bases.append(base.tobytes())
        base_pixels = opaque_pixels(base)
        box = FACE_REGIONS[stage]
        check_face(base, box, stage)
        assert base.tobytes() == frames["idle-0"].tobytes(), f"{stage}: idle-0 must be the approved stance"
        base_box = base.getchannel("A").getbbox()
        assert base_box[1] >= 2 and base_box[3] <= base.height - 2, (
            f"{stage}: stance needs two clear rows above/below for animation"
        )
        for pose, frame in frames.items():
            frame_pixels = opaque_pixels(frame)
            dy = best_vertical_offset(base_pixels, frame_pixels)
            check_face(frame, box, f"{stage} {pose}", dy)
            if not pose.startswith(("wash-", "sleep-", "sad-")):
                assert frame_pixels == {(x, y + dy) for x, y in base_pixels}, (
                    f"{stage} {pose}: animation must preserve the cat silhouette without clipping"
                )
        for group, count in GROUPS.items():
            if group != "walk":
                assert len({frames[f"{group}-{i}"].tobytes() for i in range(count)}) == count, (
                    f"{stage} {group}: every animation frame must visibly differ"
                )
        assert aligned_face(base, box).tobytes() != aligned_face(frames["blink"], box).tobytes(), (
            f"{stage}: blinking must change the face"
        )
        eating_faces = [aligned_face(frames[f"eat-{i}"], box, dy).tobytes()
                        for i, dy in enumerate(EAT_Y)]
        assert len(set(eating_faces)) == 3, f"{stage}: eat must have three expressions, not just three positions"
        check_walk(stage, base, frames)
        check_wash(stage, base, frames)
    assert len(set(bases)) == 3, "the three growth stages must have distinct artwork"
    check_egg(sprites)


def main():
    check_cat_sprites()
    print("cat redraw contract: PASS (87 cat frames; shared egg unchanged)")


if __name__ == "__main__":
    main()
