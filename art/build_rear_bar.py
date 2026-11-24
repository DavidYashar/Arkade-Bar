"""Build the rounded walnut rear bar and export its materials and fixtures."""

from math import ceil, cos, hypot, pi, sin
from pathlib import Path
from random import Random
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_entrance_facade import box, join_beveled_pieces, material


ROOT = Path(__file__).resolve().parents[1]
COUNTER = (8.18, 0.98, 7.05)  # Width, depth, Blender Y.
COUNTER_DEPTH = 0.89
FRONT = COUNTER[2] - COUNTER_DEPTH / 2
PANEL_BOTTOM, PANEL_TOP = 0.105, 1.14
BACK_BOTTOM, BACK_TOP = 0.96, 3.20
SHELVES = (1.83, 2.50)
COUNTER_NEON = (3.56, 1.133)  # Half-width and height.
CABINET_NEON = tuple((2.69, z - .048) for z in SHELVES) + ((2.69, 3.184),)
COUNTER_DIAGONALS = ((-3.59, -2.91), (2.61, 3.29))
BACK_DIAGONALS = ((-3.59, -2.78), (2.78, 3.59))
RNG = Random(168)


def wood_material(name, grain, roughness, wash=None):
    mat = material(name, (0.90, 0.83, 0.74), roughness)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    wood_uv = nodes.new("ShaderNodeUVMap")
    wood_uv.uv_map = "Grain"
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = grain
    links.new(wood_uv.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if wash:
        uv = nodes.new("ShaderNodeUVMap")
        uv.uv_map = "Fixture spill"
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = wash
        links.new(uv.outputs["UV"], texture.inputs["Vector"])
        links.new(texture.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 1.0
    return mat


def fixture_wash(name, width, bottom, top, diagonals, diagonal_heights, horizontal_strips):
    """Bake the close-range glow from the neon strips onto the walnut."""
    size_x, size_y = 1024, 384
    x = np.linspace(-width / 2, width / 2, size_x)[None, :]
    z = np.linspace(bottom, top, size_y)[:, None]
    spill = np.zeros((size_y, size_x), dtype=np.float32)
    lower, upper = diagonal_heights
    fraction = np.clip((z - lower) / (upper - lower), 0, 1)
    end_distance = z - np.clip(z, lower, upper)
    for a, b in diagonals:
        line = a + (b - a) * fraction
        spill += 0.34 * np.exp(-np.hypot(x - line, end_distance) / 0.058)
    for half_width, height in horizontal_strips:
        end_distance = np.maximum(np.abs(x) - half_width, 0)
        vertical = height - z
        spill += 0.36 * np.exp(-np.hypot(end_distance, vertical) / 0.088) * (vertical >= 0)

    # A black row lets the hidden and rear faces sample a neutral texel.
    spill[:2] = 0
    pixels = np.ones((size_y, size_x, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(spill[:, :, None] * (1.0, 0.31, 0.068), 0, 1)
    # Blender's byte image and the exported PNG store sRGB RGB values.
    rgb = pixels[:, :, :3]
    rgb[:] = np.where(rgb <= 0.0031308, 12.92 * rgb, 1.055 * rgb ** (1 / 2.4) - 0.055)
    image = bpy.data.images.new(name, width=size_x, height=size_y, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    return image


def grain_crop():
    # Crop inside a single board in the existing walnut texture and rotate its grain.
    u0 = RNG.uniform(0.23, 0.44)
    v0 = RNG.choice((0.095, 0.249, 0.403, 0.557, 0.713, 0.866))
    return u0, v0, RNG.choice((-1, 1))


def board_uv(crop, across, along):
    u, v, direction = crop
    return u + direction * (along - 0.5) * 0.31, v + (across - 0.5) * 0.091


def set_uv(obj, mapper, wash=None):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new()
    uv.name = "Grain"
    spill = mesh.uv_layers.new(name="Fixture spill", do_init=False) if wash else None
    for face in mesh.polygons:
        for i in face.loop_indices:
            p = mesh.vertices[mesh.loops[i].vertex_index].co
            uv.uv[i].vector = mapper(p, face.normal)
            if spill:
                spill.uv[i].vector = wash(p + obj.location, face.normal)


def upright(name, x, y, width, depth, bottom, top, mat, wash):
    height = top - bottom
    obj = box(name, (width, depth, height), (x, y, (bottom + top) / 2), mat, 0.0015)
    crop = grain_crop()
    set_uv(obj, lambda p, n: board_uv(crop, (p.y / depth if abs(n.x) > 0.5 else p.x / width) + 0.5,
                                        p.z / height + 0.5), wash)
    return obj


def round_outline(width, depth, y, radius, segments=12):
    points = []
    for sx, sy, angle in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
        cx, cy = sx * (width / 2 - radius), y + sy * (depth / 2 - radius)
        for i in range(segments + 1):
            rad = (angle + i * 90 / segments) * pi / 180
            points.append((cx + radius * cos(rad), cy + radius * sin(rad)))
    return points


def rounded_slab(name, width, depth, y, radius, bottom, top, mat, bevel):
    path = round_outline(width, depth, y, radius)
    count = len(path)
    vertices = [(x, py, z) for z in (bottom, top) for x, py in path]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    set_uv(obj, lambda p, n: (0.5 + (p.y - y if abs(n.x) > .72 else p.x) * .31,
                              0.5 + (p.y - y) * .50 if abs(n.z) > .5 else
                              0.557 + (p.z - (bottom + top) / 2) * .33))
    if bevel:
        modifier = obj.modifiers.new("Soft edge", "BEVEL")
        modifier.width, modifier.segments = bevel, 3
        modifier.limit_method = "ANGLE"
        modifier.harden_normals = True
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def counter_cladding(mat, backing):
    width, depth, y = 7.93, COUNTER_DEPTH, COUNTER[2]
    rounded_slab("Counter substrate", width - .014, depth - .014, y, .39,
                 PANEL_BOTTOM, PANEL_TOP, backing, 0)
    path = round_outline(width, depth, y, .397, segments=16)
    points, faces, crops = [], [], []
    for (ax, ay), (bx, by) in zip(path, path[1:] + path[:1]):
        length = hypot(bx - ax, by - ay)
        count = ceil(length / .156)
        inset = .0011 / length if length > .08 else 0
        crop = grain_crop()
        for i in range(count):
            if length > .08:
                crop = grain_crop()
            first = len(points)
            for t, z in ((i / count + inset, PANEL_BOTTOM), ((i + 1) / count - inset, PANEL_BOTTOM),
                         ((i + 1) / count - inset, PANEL_TOP), (i / count + inset, PANEL_TOP)):
                points.append((ax + (bx - ax) * t, ay + (by - ay) * t, z))
            faces.append(tuple(range(first, first + 4)))
            crops.append(crop)
    mesh = bpy.data.meshes.new("Counter veneer boards")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="Grain")
    spill = mesh.uv_layers.new(name="Fixture spill", do_init=False)
    for face, crop in zip(mesh.polygons, crops):
        for i, (across, along) in zip(face.loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
            p = points[mesh.loops[i].vertex_index]
            uv.uv[i].vector = board_uv(crop, across, along)
            spill.uv[i].vector = (p[0] / width + .5, .009 + .982 * along) if face.normal.y < -.2 else (.5, 0)


def strip(name, coords, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.use_fill_caps = True
    path = curve.splines.new("POLY")
    path.points.add(len(coords) - 1)
    for point, xyz in zip(path.points, coords):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    grain = bpy.data.images.load(str(ROOT / "public/textures/floor-walnut.webp"))
    counter_wash = fixture_wash("Counter fixture spill", 7.93, PANEL_BOTTOM, PANEL_TOP,
                                COUNTER_DIAGONALS, (PANEL_BOTTOM + .004, PANEL_TOP - .003),
                                (COUNTER_NEON,))
    back_wash = fixture_wash("Cabinet fixture spill", 7.34, BACK_BOTTOM, BACK_TOP, BACK_DIAGONALS,
                             (1.27, 3.14), CABINET_NEON)
    counter_wood = wood_material("Vertical walnut counter veneer", grain, .44, counter_wash)
    cabinet_wood = wood_material("Vertical walnut cabinet veneer", grain, .45, back_wash)
    edge_wood = wood_material("Satin walnut slabs", grain, .31)
    backing = material("Walnut recesses", (.055, .023, .010), .62)
    toe = material("Graphite plinth", (.031, .026, .022), .36, .32)
    led = material("Warm-white linear LED diffuser", (1.0, .42, .10), .33)
    shader = led.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (1, .36, .072, 1)
    shader.inputs["Emission Strength"].default_value = 4.5

    rounded_slab("Recessed counter plinth", 7.66, .80, COUNTER[2], .36, .005, .115, toe, .015)
    counter_cladding(counter_wood, backing)
    rounded_slab("Rounded walnut countertop", *COUNTER, .45, 1.145, 1.275, edge_wood, .023)
    half_width, z = COUNTER_NEON
    strip("Counter straight neon", [(-half_width, FRONT - .024, z),
                                     (half_width, FRONT - .024, z)], .010, led)
    for a, b in COUNTER_DIAGONALS:
        strip("Counter diagonal inlay", [(a, FRONT - .002, PANEL_BOTTOM + .004),
                                          (b, FRONT - .002, PANEL_TOP - .003)], .010, led)

    def cabinet_spill(p, n):
        return (p.x / 7.34 + .5, .009 + .982 * (p.z - BACK_BOTTOM) / (BACK_TOP - BACK_BOTTOM)) \
            if n.y < -.5 else (.5, 0)

    box("Cabinet backing", (7.34, .12, 2.24), (0, 8.81, 2.08), backing, .008)
    boards = []
    for left, right, y, depth in ((-2.77, 2.77, 8.723, .06),
                                  (-3.67, -2.77, 8.57, .366),
                                  (2.77, 3.67, 8.57, .366)):
        count = ceil((right - left) / .15)
        width = (right - left) / count
        for i in range(count):
            boards.append(upright("Cabinet walnut board", left + (i + .5) * width, y, width - .002,
                                  depth, BACK_BOTTOM, BACK_TOP, cabinet_wood, cabinet_spill))
    join_beveled_pieces(boards, "Open cabinet backing and uprights")
    for x in (-2.77, 2.77):
        upright("Shelf end rail", x, 8.51, .058, .42, 1.16, 3.20, edge_wood, None)
    for z in (1.25, *SHELVES):
        rounded_slab("Cabinet shelf", 5.52, .39, 8.515, .030, z - .035, z + .035, edge_wood, .011)

    for a, b in BACK_DIAGONALS:
        strip("Cabinet diagonal inlay", [(a, 8.385, 1.27), (b, 8.385, 3.14)], .010, led)
    rounded_slab("Rounded walnut canopy", 7.93, .76, 8.47, .34, 3.198, 3.425, edge_wood, .023)
    for row, (half_width, z) in enumerate(CABINET_NEON, start=1):
        strip(f"Cabinet row {row} neon", [(-half_width, 8.39, z), (half_width, 8.39, z)], .009, led)

    bpy.ops.export_scene.gltf(filepath=str(ROOT / "public/models/bar/arkade-rear-bar.glb"),
                              export_format="GLB", export_yup=True, export_apply=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
