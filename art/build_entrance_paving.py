"""Build the bevelled terracotta sidewalk in Blender and export it for the bar."""

from math import ceil, cos, pi, sin, sqrt
from pathlib import Path
from random import Random

import bpy


OUT = Path(__file__).resolve().parents[1] / "public/models/bar/arkade-entrance-paving.glb"
# Blender's -Y axis points toward the street. The outer edge meets the curb.
LEFT, RIGHT = -12.0, 12.0
CURB, DOOR = -14.875, -9.0
RADIUS = 0.204
GROUT = 0.011
BEVEL = 0.0025


def clip_to_sidewalk(polygon):
    """Clip the face and its UVs at the doorway, curb, and side edges."""
    for axis, limit, sign in ((0, LEFT, 1), (0, RIGHT, -1), (1, CURB, 1), (1, DOOR, -1)):
        output = []
        if not polygon:
            break
        previous = polygon[-1]
        for point in polygon:
            a = (previous[axis] - limit) * sign
            b = (point[axis] - limit) * sign
            if (a >= 0) != (b >= 0):
                fraction = a / (a - b)
                output.append(tuple(u + (v - u) * fraction for u, v in zip(previous, point)))
            if b >= 0:
                output.append(point)
            previous = point
        polygon = output
    return polygon


def clay_finish():
    rng = Random(839)
    size = 256
    colors = []
    for y in range(size):
        for x in range(size):
            mottling = 0.023 * sin(0.049 * x + 0.024 * y) * sin(0.071 * y - 0.032 * x)
            grain = rng.gauss(0, 0.014)
            pore = rng.uniform(0.07, 0.22) if rng.random() < 0.024 else 0
            value = mottling + grain - pore
            colors.extend((0.76 + value, 0.49 + value, 0.36 + value, 1))
    image = bpy.data.images.new("Fired clay grain", width=size, height=size, alpha=False)
    image.pixels.foreach_set(colors)
    image.pack()
    material = bpy.data.materials.new("Unglazed terracotta")
    material.use_nodes = True
    tree = material.node_tree
    shader = tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.82
    image_node = tree.nodes.new("ShaderNodeTexImage")
    image_node.image = image
    tree.links.new(image_node.outputs["Color"], shader.inputs["Base Color"])
    return material


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = Random(2019)
    vertices, faces, uv_coords, colors = [], [], [], []
    row_pitch = sqrt(3) * RADIUS
    column_pitch = 1.5 * RADIUS
    edge_radius = RADIUS - GROUT / sqrt(3)

    def add_face(points, shade):
        polygon = clip_to_sidewalk(points)
        if len(polygon) < 3:
            return
        start = len(vertices)
        for x, y, z, u, v in polygon:
            vertices.append((x, y, z))
            uv_coords.append((u, v))
            colors.append((shade, shade, shade, 1))
        faces.append(tuple(range(start, len(vertices))))

    for column in range(ceil((RIGHT - LEFT) / column_pitch) + 2):
        x = LEFT + column_pitch * column
        for row in range(ceil((DOOR - CURB) / row_pitch) + 2):
            y = CURB + row_pitch * (row - 0.65 + (column % 2) / 2)
            top_z = 0.002 + rng.uniform(-0.0007, 0.0007)
            shade = rng.uniform(0.81, 1.0)
            texture_turn = rng.randrange(6)
            top, edge = [], []
            for i in range(6):
                a = pi * i / 3
                uv_angle = pi * (i + texture_turn) / 3
                u, v = 0.5 + 0.48 * cos(uv_angle), 0.5 + 0.48 * sin(uv_angle)
                for ring, radius, z in ((top, edge_radius - BEVEL, top_z),
                                        (edge, edge_radius, -0.004)):
                    ring.append((x + radius * cos(a), y + radius * sin(a), z, u, v))
            add_face(top, shade)
            for i in range(6):
                j = (i + 1) % 6
                add_face([edge[i], edge[j], top[j], top[i]], shade * 0.83)

    mesh = bpy.data.meshes.new("Bevelled hex pavers")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    tiles = bpy.data.objects.new("Terracotta hex pavers", mesh)
    bpy.context.collection.objects.link(tiles)
    mesh.materials.append(clay_finish())
    uv_layer = mesh.uv_layers.new().uv
    tint = mesh.color_attributes.new(name="Tile tone", type="FLOAT_COLOR", domain="POINT")
    mesh.color_attributes.active_color = tint
    for index, loop in enumerate(mesh.loops):
        uv_layer[index].vector = uv_coords[loop.vertex_index]
    for index, rgba in enumerate(colors):
        tint.data[index].color = rgba
    grout_mesh = bpy.data.meshes.new("Recessed joints")
    grout_mesh.from_pydata([(LEFT, CURB, -0.005), (RIGHT, CURB, -0.005),
                          (RIGHT, DOOR, -0.005), (LEFT, DOOR, -0.005)], [], [(0, 1, 2, 3)])
    grout_mesh.update()
    grout = bpy.data.objects.new("Sand-coloured grout bed", grout_mesh)
    bpy.context.collection.objects.link(grout)
    mortar = bpy.data.materials.new("Matte sand mortar")
    mortar.use_nodes = True
    shader = mortar.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.44, 0.37, 0.30, 1)
    shader.inputs["Roughness"].default_value = 0.96
    grout_mesh.materials.append(mortar)

    # glTF multiplies the clay texture by the active per-tile tint.
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_vertex_color="ACTIVE",
                              export_yup=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
