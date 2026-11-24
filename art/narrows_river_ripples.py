"""Bake a periodic slope and height map from Blender's Ocean modifier."""
import sys
from pathlib import Path

import bpy
import numpy as np

target = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
mesh = bpy.data.meshes.new("River wave source")
surface = bpy.data.objects.new("River wave source", mesh)
bpy.context.scene.collection.objects.link(surface)
ocean = surface.modifiers.new("Short wind ripples", "OCEAN")
ocean.geometry_mode = "GENERATE"
ocean.resolution = ocean.viewport_resolution = 16
ocean.spatial_size = 42
ocean.wind_velocity = 16
ocean.wave_scale = 1.2
ocean.choppiness = 0
ocean.wave_alignment = .38
ocean.wave_direction = .65
ocean.wave_scale_min = .075
ocean.random_seed = 17
ocean.time = 3.36
bpy.context.view_layer.update()

evaluated = surface.evaluated_get(bpy.context.evaluated_depsgraph_get())
vertices = evaluated.data.vertices
size = round(len(vertices) ** .5)
assert size * size == len(vertices)
positions = np.empty(len(vertices) * 3, dtype=np.float32)
vertices.foreach_get("co", positions)
grid = positions.reshape((size, size, 3))
if abs(grid[0, 1, 0] - grid[0, 0, 0]) < 1e-4:
    grid = grid.transpose((1, 0, 2))
height = grid[:-1, :-1, 2]
spacing = ocean.spatial_size / (size - 1)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * spacing)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * spacing)
gain = max(np.quantile(np.abs([dx, dy]), .998), .0001)
relief = (height - height.mean()) / max(np.max(np.abs(height - height.mean())), .0001)

image = bpy.data.images.new("River ripple slopes", width=size - 1, height=size - 1, alpha=False)
image.colorspace_settings.name = "Non-Color"
pixels = np.stack((.5 + .46 * dx / gain, .5 + .46 * dy / gain, .5 + .48 * relief,
                   np.ones_like(height)), axis=-1).clip(0, 1).astype(np.float32)
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw = str(target)
image.file_format = "PNG"
image.save()
print(f"Baked {size - 1} x {size - 1} Blender Ocean slopes to {target}", flush=True)

