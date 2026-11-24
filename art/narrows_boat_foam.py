"""Bake a looping, transparent boat-foam atlas for the Narrows river material."""
import sys
from pathlib import Path

import bpy
import numpy as np

SIZE = 256
FRAMES = 12
TAU = 2 * np.pi
x, y = np.meshgrid(
    (np.arange(SIZE, dtype=np.float32) + .5) / SIZE - .5,
    (np.arange(SIZE, dtype=np.float32) + .5) / SIZE,
)
rng = np.random.default_rng(74831)
atlas = np.zeros((SIZE * 3, SIZE * 4, 4), dtype=np.float32)


def smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def field(u, v, grid):
    """Evaluate a periodic, smoothly interpolated noise tile."""
    rows, columns = grid.shape
    ix, iy = np.floor(u).astype(int), np.floor(v).astype(int)
    a = smooth(0, 1, u - ix)
    b = smooth(0, 1, v - iy)
    return (
        (1 - a) * (1 - b) * grid[iy % rows, ix % columns]
        + a * (1 - b) * grid[iy % rows, (ix + 1) % columns]
        + (1 - a) * b * grid[(iy + 1) % rows, ix % columns]
        + a * b * grid[(iy + 1) % rows, (ix + 1) % columns]
    )


def cellular(u, v, points):
    """Use near-equal distances to two bubbles to draw the thin foam walls."""
    rows, columns, _ = points.shape
    ix, iy = np.floor(u).astype(int), np.floor(v).astype(int)
    nearest = np.full_like(u, 9)
    second = nearest.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            a, b = ix + dx, iy + dy
            seed = points[b % rows, a % columns]
            distance = (a + seed[:, :, 0] - u) ** 2 + (b + seed[:, :, 1] - v) ** 2
            second = np.minimum(second, np.maximum(nearest, distance))
            nearest = np.minimum(nearest, distance)
    return 1 - smooth(.015, .22, second - nearest)


eddy = rng.random((7, 15))
mist = rng.random((19, 26))
bubbles = .14 + .72 * rng.random((24, 42, 2))
for frame in range(FRAMES):
    time = frame / FRAMES
    swell = field(x * 14 + 6, y * 20 - time * 7, eddy)
    turbulence = field(x * 49 + 12, y * 70 - time * 19, mist)
    lace = cellular(x * 55 + 22 + swell * 1.4, y * 65 - time * 24 + turbulence, bubbles)
    tail = np.maximum(0, (y - .18) / .82)
    bow = smooth(.025, .16, y)
    fade = bow * (1 - smooth(.61, .995, y))
    distance = np.abs(x)
    # Pressure waves form two widening shoulders behind the hull.
    flank = .066 + .355 * tail ** 1.13 + (swell - .5) * (.011 + .024 * tail)
    flank_width = .014 + .034 * tail
    shoulder = np.exp(-((distance - flank) / flank_width) ** 2)
    feather = np.exp(-((distance - flank + .026 + tail * .028) / (.020 + tail * .048)) ** 2)
    wave_break = .58 + .42 * turbulence
    # Dense propeller wash behind the transom, thinning toward the end.
    stern = smooth(.20, .31, y)
    center = np.exp(-(distance / (.035 + .084 * tail)) ** 2) * stern
    core = center * np.exp(-tail * 1.6) * (.16 + .36 * swell + .23 * turbulence + .25 * lace)
    foam = np.clip((1.35 * shoulder * wave_break * (.32 + .68 * lace)
                    + .66 * feather * lace * turbulence + 1.58 * core) * fade, 0, 1)
    churn = (shoulder * .27 + feather * .19 + center * .34) * fade
    alpha = np.clip(foam + churn * (1 - foam), 0, .97)
    whiteness = np.clip(foam / np.maximum(alpha, .001), 0, 1)
    color = np.stack((.25 + .72 * whiteness, .68 + .30 * whiteness,
                      .78 + .21 * whiteness, alpha), axis=-1)
    row, column = divmod(frame, 4)
    atlas[row * SIZE:(row + 1) * SIZE, column * SIZE:(column + 1) * SIZE] = color

target = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
image = bpy.data.images.new("Boat wake foam", width=SIZE * 4, height=SIZE * 3, alpha=True)
image.colorspace_settings.name = "Non-Color"
image.pixels.foreach_set(atlas[::-1].copy().ravel())
image.filepath_raw = str(target)
image.file_format = "PNG"
image.save()
print(f"Baked {FRAMES} boat wake frames to {target}", flush=True)

