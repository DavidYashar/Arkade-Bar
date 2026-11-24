"""Export the Arkade Bar ceiling with Blender's glTF exporter."""

from math import cos, pi, sin, tau
from pathlib import Path
from random import Random

import bpy


OUT = Path(__file__).resolve().parents[1] / "public/models/bar/arkade-ceiling.glb"
FRONT_WALL = 8.895  # Blender -Y becomes Three.js +Z
BACK_WALL = -8.86
objects_by_material = {}


def material(name, color, roughness, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


def surface_texture(mat, color, grain, contrast):
    """Pack a seamless finish into the GLB. Broad variation sits below fine grain."""
    rng = Random(mat.name)
    size = 128
    layers = []
    for cols, rows in ((8, 8), grain, (size, size)):
        field = [[rng.uniform(-1, 1) for _ in range(cols)] for _ in range(rows)]
        layers.append((cols, rows, field))

    def sample(layer, u, v):
        cols, rows, field = layer
        x, y = u * cols, v * rows
        i, j = int(x), int(y)
        dx, dy = x - i, y - j
        dx, dy = dx * dx * (3 - 2 * dx), dy * dy * (3 - 2 * dy)
        a, b = field[j], field[(j + 1) % rows]
        return (1 - dy) * (a[i] * (1 - dx) + a[(i + 1) % cols] * dx) + dy * (
            b[i] * (1 - dx) + b[(i + 1) % cols] * dx
        )

    def srgb(linear):
        return 12.92 * linear if linear < 0.0031308 else 1.055 * linear ** (1 / 2.4) - 0.055

    pixels = []
    for y in range(size):
        for x in range(size):
            u, v = x / size, y / size
            shade = 1 + contrast * sum(weight * sample(layer, u, v)
                                       for weight, layer in zip((0.45, 0.40, 0.15), layers))
            pixels.extend((*[srgb(channel * shade) for channel in color], 1.0))
    image = bpy.data.images.new(mat.name + " finish", width=size, height=size, alpha=False)
    image.pixels.foreach_set(pixels)
    image.pack()
    tree = mat.node_tree
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    tree.links.new(texture.outputs["Color"], tree.nodes.get("Principled BSDF").inputs["Base Color"])


def finish(obj, mat, smooth=False):
    obj.data.materials.append(mat)
    objects_by_material.setdefault(mat.name, []).append(obj)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def box(size, at, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.dimensions = size
    mesh = obj.data
    uvs = mesh.uv_layers.active.uv
    for face in mesh.polygons:
        axes = [axis for axis in range(3) if abs(face.normal[axis]) < 0.5]
        for index in face.loop_indices:
            co = mesh.vertices[mesh.loops[index].vertex_index].co
            uvs[index].vector = tuple((co[axis] + 0.5) * size[axis] * 1.6 for axis in axes)
    finish(obj, mat)


def round_mesh(profile, at, mat, steps=32, *, duct=False):
    """Revolve a closed cross section around the vertical or duct axis."""
    vertices = []
    for radius, height in profile:
        for i in range(steps):
            angle = tau * i / steps
            u, v = radius * cos(angle), radius * sin(angle)
            vertices.append((u, -height, v) if duct else (u, v, height))
    faces = []
    for row in range(len(profile)):
        a = row * steps
        b = ((row + 1) % len(profile)) * steps
        for i in range(steps):
            j = (i + 1) % steps
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(mat.name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uvs = mesh.uv_layers.new().uv
    for face in mesh.polygons:
        row, i = divmod(face.index, steps)
        height_a = profile[row][1]
        height_b = profile[(row + 1) % len(profile)][1]
        u0, u1 = i / steps, (i + 1) / steps
        for index, uv in zip(face.loop_indices, ((u0, height_a), (u1, height_a),
                                                 (u1, height_b), (u0, height_b))):
            uvs[index].vector = uv
    obj = bpy.data.objects.new(mat.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    finish(obj, mat, smooth=True)
    # Keep annular faces planar while smoothing around cylinders and bevels.
    for row in range(len(profile)):
        if profile[row][1] == profile[(row + 1) % len(profile)][1]:
            for face in mesh.polygons[row * steps:(row + 1) * steps]:
                face.use_smooth = False


def sleeve(radius, bottom, top, at, mat, steps=32, *, duct=False, inner=None):
    inside = radius * 0.001 if inner is None else inner
    profile = [(radius, bottom), (radius, top), (inside, top), (inside, bottom)]
    round_mesh(profile, at, mat, steps, duct=duct)


def fixture_light(name, at, energy, distance, color, angle=None, *, upward=False):
    lamp = bpy.data.lights.new(name, "POINT" if angle is None else "SPOT")
    lamp.color = color
    lamp.energy = energy
    lamp.use_custom_distance = True
    lamp.cutoff_distance = distance
    if angle is not None:
        lamp.spot_size = angle
        lamp.spot_blend = 0.72
    fixture = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(fixture)
    fixture.location = at
    if upward:
        fixture.rotation_euler.x = pi


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    deck = material("Charcoal ceiling deck", (0.016, 0.010, 0.007), 0.9)
    joists = material("Smoked bronze beams", (0.058, 0.031, 0.017), 0.66, 0.16)
    hardware = material("Blackened steel hardware", (0.025, 0.018, 0.014), 0.49, 0.37)
    ducts = material("Satin bronze ductwork", (0.32, 0.21, 0.15), 0.34, 0.57)
    steel = material("Brushed gunmetal conduit", (0.14, 0.13, 0.12), 0.39, 0.53)
    seams = material("Duct seams and flanges", (0.17, 0.107, 0.077), 0.38, 0.49)
    amber = material("Amber ring diffuser", (1.0, 0.32, 0.045), 0.39, emission=3.8)
    warm = material("Warm spot diffusers", (1.0, 0.61, 0.28), 0.42, emission=3.1)
    for mat, color, grain, contrast in (
        (deck, (0.016, 0.010, 0.007), (30, 25), 0.38),
        (joists, (0.058, 0.031, 0.017), (47, 38), 0.34),
        (hardware, (0.025, 0.018, 0.014), (49, 41), 0.32),
        (ducts, (0.32, 0.21, 0.15), (88, 9), 0.27),
        (steel, (0.14, 0.13, 0.12), (88, 9), 0.27),
        (seams, (0.17, 0.107, 0.077), (60, 16), 0.24),
    ):
        surface_texture(mat, color, grain, contrast)

    box((13.94, 17.98, 0.08), (0, 0, 4.23), deck)
    for index in range(12):
        y = -8.18 + index * 1.48
        box((13.73, 0.16, 0.24), (0, y, 4.075), joists)
        box((13.73, 0.24, 0.055), (0, y, 3.965), joists)
    for x in (-5.3, -1.05, 1.05, 5.3):
        box((0.095, 17.72, 0.15), (x, 0, 4.09), hardware)
    box((0.054, 17.2, 0.056), (0, 0, 3.96), hardware)

    for side in (-1, 1):
        for x, radius, finish_mat, spacing in ((3.56, 0.255, ducts, 0.39), (2.86, 0.225, steel, 1.15)):
            at = (side * x, 0, 3.64)
            sleeve(radius, BACK_WALL, FRONT_WALL, at, finish_mat, 32, duct=True)
            for index in range(int(16.8 / spacing) + 1):
                z = -8.38 + index * spacing
                sleeve(radius + 0.006, z - 0.01, z + 0.01, at, seams, 24,
                       duct=True, inner=radius - 0.008)
            for wall, edge in ((BACK_WALL, BACK_WALL + 0.105), (FRONT_WALL, FRONT_WALL - 0.105)):
                lo, hi = sorted((wall, edge))
                sleeve(radius + 0.087, lo, hi, at, hardware, 32, duct=True, inner=radius - 0.008)
                for index in range(6):
                    angle = index * tau / 6
                    bolt_x = side * x + (radius + 0.060) * cos(angle)
                    bolt_z = 3.64 + (radius + 0.060) * sin(angle)
                    box((0.025, 0.020, 0.025), (bolt_x, -edge, bolt_z), seams)

    ring_y = -2.45
    ring = (0, ring_y, 0)
    round_mesh([(2.04, 3.37), (2.05, 3.39), (2.05, 3.48), (2.03, 3.50),
                (1.92, 3.50), (1.90, 3.48), (1.90, 3.39), (1.91, 3.37)], ring, hardware, 104)
    sleeve(2.023, 3.354, 3.384, ring, amber, 104, inner=1.929)
    for i in range(3):
        angle = (i + 0.2) * tau / 3
        at = (1.98 * cos(angle), ring_y + 1.98 * sin(angle), 0)
        sleeve(0.011, 3.48, 4.12, at, hardware, 8)
        fixture_light("Ring diffuser light", (at[0], at[1], 3.354), 24, 8.5,
                      (1, 0.65, 0.32), 2.35)
        fixture_light("Ring ceiling bounce", (at[0], at[1], 3.384), 2.5, 2.6,
                      (1, 0.61, 0.29), 2.55, upward=True)

    for x in (-2.45, 2.45):
        box((0.095, 14.7, 0.05), (x, -0.2, 3.89), hardware)
        for y in (-6.2, -2.8, 1.9, 5.05):
            at = (x, y, 0)
            sleeve(0.099, 3.685, 3.90, at, hardware, 20)
            sleeve(0.072, 3.681, 3.69, at, warm, 20)
            fixture_light("Ceiling track spot", (x, y, 3.681), 21, 7,
                          (1, 0.74, 0.46), 1.9)

    for x in (-2.10, 0, 2.10):
        at = (x, 6.75, 0)
        sleeve(0.015, 3.17, 4.12, at, hardware, 10)
        round_mesh([(0.29, 2.91), (0.28, 2.98), (0.23, 3.07), (0.13, 3.14),
                    (0.066, 3.17), (0.053, 3.17), (0.092, 3.13), (0.27, 2.91)],
                   at, hardware, 36)
        sleeve(0.228, 2.915, 2.928, at, warm, 36)
        fixture_light("Bar pendant wash", (x, 6.75, 2.915), 30, 6,
                      (1, 0.67, 0.34), 1.95)

    for x in (-6.79, 6.79):
        box((0.16, 17.76, 0.29), (x, 0, 4.025), hardware)
        box((0.065, 16.8, 0.045), (x, 0, 3.86), hardware)
    box((13.55, 0.065, 0.045), (0, 8.79, 3.86), hardware)

    # Batch pieces by material to keep draw calls low.
    for name, objects in objects_by_material.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = name

    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_yup=True,
                              export_cameras=False, export_lights=True,
                              export_import_convert_lighting_mode="RAW")


if __name__ == "__main__":
    build()
