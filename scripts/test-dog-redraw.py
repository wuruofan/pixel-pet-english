#!/usr/bin/env python3
"""Read-only image contracts for the golden retriever's three growth stages.

Inspect exported PNGs independently of the renderer. The old hand-drawn
coordinates, side-view walk, paw gestures, and palette are not contracts.
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

# Measured independently on the reviewed final PNG grid, not imported from
# generator anchors. Every pixel in these face interiors must stay opaque.
FACE_REGIONS = {
    "baby": (12, 14, 24, 23),
    "kid": (11, 12, 24, 21),
    "adult": (13, 12, 28, 23),
}
EGG_PIXEL_DIGEST = "96151c8ef420ca4403e4e2857a797c96ef724839c49786c48d87f7c6c2142de3"


def load(name, size, sprites):
    path = sprites / f"{name}.png"
    assert path.is_file(), f"missing sprite: {path.name}"
    with Image.open(path) as source:
        assert source.mode == "RGBA", f"{name}: expected RGBA, got {source.mode}"
        image = source.copy()
    assert image.size == size, f"{name}: {image.size}, expected {size}"
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    assert bbox, f"{name}: empty sprite"
    assert set(alpha.getdata()) == {0, 255}, f"{name}: alpha must be exactly transparent or opaque"
    return image


def opaque_pixels(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y))[3] == 255}


def components(points):
    """Eight-connected components: even a diagonal touch joins decorations."""
    remaining = set(points)
    result = []
    while remaining:
        seed = remaining.pop()
        component, queue = {seed}, [seed]
        while queue:
            x, y = queue.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbor = (x + dx, y + dy)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        queue.append(neighbor)
        result.append(component)
    return sorted(result, key=len, reverse=True)


def bounds(points):
    return (min(x for x, _ in points), min(y for _, y in points),
            max(x for x, _ in points) + 1, max(y for _, y in points) + 1)


def translate(points, dy):
    return {(x, y + dy) for x, y in points}


def check_padding(image, name):
    left, top, right, bottom = image.getchannel("A").getbbox()
    assert left > 0 and top > 0 and right < image.width and bottom < image.height, (
        f"{name}: leave transparent space around the complete sprite/effects"
    )


def is_dark(pixel):
    r, g, b, alpha = pixel
    return alpha == 255 and max(r, g, b) < 150


def is_blue(pixel):
    r, g, b, alpha = pixel
    return alpha == 255 and b >= r + 25 and b >= g + 8 and g >= r + 8


def face_pixels(image, box, dy=0):
    left, top, right, bottom = box
    assert 0 <= top + dy < bottom + dy <= image.height, "face moved outside canvas"
    return image.crop((left, top + dy, right, bottom + dy))


def check_face(image, box, name, dy=0):
    face = face_pixels(image, box, dy)
    pixels = list(face.getdata())
    assert all(pixel[3] == 255 for pixel in pixels), f"{name}: face has transparent holes"
    dark_count = sum(is_dark(pixel) for pixel in pixels)
    assert 4 <= dark_count < len(pixels) / 2, f"{name}: face needs readable dark features on solid fur"


def check_walk(stage, base, frames):
    original = opaque_pixels(base)
    original_box = bounds(original)
    original_content = base.crop(original_box).tobytes()
    for index, dy in enumerate(WALK_Y):
        name = f"{stage} walk-{index}"
        image = frames[f"walk-{index}"]
        pixels = opaque_pixels(image)
        assert pixels == translate(original, dy), f"{name}: hop clipped or changed the body silhouette"
        assert image.crop(bounds(pixels)).tobytes() == original_content, (
            f"{name}: face/body must translate together without leg edits or lost pixels"
        )


def check_effects(stage, frames):
    for phase, side in ((0, "right"), (1, "left")):
        image = frames[f"wash-{phase}"]
        chunks = components(opaque_pixels(image))
        assert len(chunks) == 6, f"{stage} wash-{phase}: body and five bubbles must be separated by clear pixels"
        for bubble in chunks[1:]:
            blue = {point for point in bubble if is_blue(image.getpixel(point))}
            assert len(blue) >= 2, f"{stage} wash-{phase}: every bubble needs visible blue pixels"
            assert all((x >= image.width / 2) if side == "right" else (x < image.width / 2)
                       for x, _ in bubble), f"{stage} wash-{phase}: bubbles must stay on the {side}"
    for phase in (0, 1):
        image = frames[f"sleep-{phase}"]
        chunks = components(opaque_pixels(image))
        assert len(chunks) == 3, f"{stage} sleep-{phase}: body and both Z letters must be separated by clear pixels"
        glyph_sizes = sorted((bounds(glyph)[2] - bounds(glyph)[0],
                              bounds(glyph)[3] - bounds(glyph)[1]) for glyph in chunks[1:])
        assert glyph_sizes == [(3, 3), (4, 4)], (
            f"{stage} sleep-{phase}: use readable 3px/4px Z letters, not a 2px solid dot"
        )
        for glyph in chunks[1:]:
            left, top, right, bottom = bounds(glyph)
            assert all(is_dark(image.getpixel(point)) for point in glyph), (
                f"{stage} sleep-{phase}: unexpected background speck instead of a Z"
            )
            expected = ({(x, top) for x in range(left, right)} |
                        {(x, bottom - 1) for x in range(left, right)} |
                        {(right - 1 - step, top + step) for step in range(1, bottom - top - 1)})
            assert glyph == expected, (
                f"{stage} sleep-{phase}: Z needs complete bars and a thin descending diagonal"
            )


def check_egg(sprites):
    paths = sorted(sprites.glob("cat-egg-v2*.png"))
    assert len(paths) == 18, "the shared egg must retain its base and 17 poses"
    digest = hashlib.sha256()
    for path in paths:
        image = load(path.stem, (29, 44), sprites)
        digest.update(path.name.encode() + b"\0" + image.tobytes())
    assert digest.hexdigest() == EGG_PIXEL_DIGEST, "dog redraw changed the shared egg artwork"


def check_dog_sprites(sprites=SPRITES):
    assert len(POSES) == 28
    expected = {f"dog-{stage}-v2{suffix}.png" for stage in SIZES
                for suffix in ("", *(f"-{pose}" for pose in POSES))}
    actual = {path.name for path in sprites.glob("dog-*-v2*.png")}
    assert actual == expected, f"dog frame set differs: missing={expected - actual}, unexpected={actual - expected}"
    assert set(FACE_REGIONS) == set(SIZES), "new dog face regions need independent visual calibration"
    bases = []
    for stage, size in SIZES.items():
        prefix = f"dog-{stage}-v2"
        base = load(prefix, size, sprites)
        frames = {pose: load(f"{prefix}-{pose}", size, sprites) for pose in POSES}
        bases.append(base.tobytes())
        original = opaque_pixels(base)
        assert len(components(original)) == 1, f"{stage}: base contains detached noise or body parts"
        check_padding(base, stage)
        base_box = bounds(original)
        assert base_box[1] >= 3 and base_box[3] <= base.height - 2, (
            f"{stage}: allow the full -2/+1 hop without losing the transparent margin"
        )
        check_face(base, FACE_REGIONS[stage], stage)
        assert base.tobytes() == frames["idle-0"].tobytes(), f"{stage}: idle-0 must equal the base"
        offsets = {}
        for pose, image in frames.items():
            name = f"{stage} {pose}"
            check_padding(image, name)
            chunks = components(opaque_pixels(image))
            if not pose.startswith(("wash-", "sleep-")):
                assert len(chunks) == 1, f"{name}: unexpected detached pixels/body parts"
            body = chunks[0]
            dy = bounds(body)[1] - base_box[1]
            offsets[pose] = dy
            assert -2 <= dy <= 1 and body == translate(original, dy), (
                f"{name}: keep the complete body silhouette and move face/body together"
            )
            check_face(image, FACE_REGIONS[stage], name, dy)
        for group, count in GROUPS.items():
            if group != "walk":
                assert len({frames[f"{group}-{i}"].tobytes() for i in range(count)}) == count, (
                    f"{stage} {group}: every animation frame must visibly differ"
                )
        assert face_pixels(base, FACE_REGIONS[stage]).tobytes() != face_pixels(
            frames["blink"], FACE_REGIONS[stage], offsets["blink"]).tobytes(), f"{stage}: blink must close the eyes"
        eating_faces = []
        for index, dy in enumerate(EAT_Y):
            image = frames[f"eat-{index}"]
            assert offsets[f"eat-{index}"] == dy, f"{stage} eat-{index}: wrong whole-body offset"
            eating_faces.append(face_pixels(image, FACE_REGIONS[stage], dy).tobytes())
        assert len(set(eating_faces)) == 3, f"{stage}: eat needs three distinct expressions after aligning the head"
        check_walk(stage, base, frames)
        check_effects(stage, frames)
    assert len(set(bases)) == 3, "the three growth stages need distinct artwork"
    check_egg(sprites)


def main():
    check_dog_sprites()
    print("dog redraw contract: PASS (87 golden retriever frames; shared egg unchanged)")


if __name__ == "__main__":
    main()
