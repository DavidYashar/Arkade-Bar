"""Model the stone-clad exterior facade and the frame around the neon sign."""

from pathlib import Path
from random import Random

import bpy


ROOT = Path(__file__).resolve().parents[1]
TOP = 4.3  # The exterior brick side walls end at this height.
INNER_X = 2.37
OUTER_X = 7.10


def material(name, color, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def box(name, dimensions, position, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def map_stone_crop(obj, u_scale, v_scale, rng):
    mesh = obj.data
    uv = mesh.uv_layers.active.uv
    width, depth, height = obj.dimensions
    u_size, v_size = max(width, depth) * u_scale, max(height, depth) * v_scale
    u_origin = rng.uniform(0.01, 0.99 - u_size)
    v_origin = rng.uniform(0.01, 0.99 - v_size)
    flip_x, flip_y = rng.choice((-1, 1)), rng.choice((-1, 1))
    for face in mesh.polygons:
        horizontal = 1 if abs(face.normal.x) > 0.5 else 0
        vertical = 1 if abs(face.normal.z) > 0.5 else 2
        for index in face.loop_indices:
            p = mesh.vertices[mesh.loops[index].vertex_index].co
            uv[index].vector = (u_origin + u_size / 2 + flip_x * p[horizontal] * u_scale,
                                v_origin + v_size / 2 + flip_y * p[vertical] * v_scale)


def stone_panel(left, right, bottom, top, face_depth, stone, rng):
    width, height = right - left, top - bottom
    obj = box("Cut Aberdeen stone slab", (width, 0.11, height),
              ((left + right) / 2, -face_depth + 0.055, (bottom + top) / 2), stone, 0.0035)
    map_stone_crop(obj, 0.36, 0.52, rng)
    return obj


def textured_stone(name, filename, roughness):
    stone = material(name, (1, 1, 1), roughness)
    texture = stone.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(ROOT / "public/textures" / filename))
    stone.node_tree.links.new(texture.outputs["Color"],
                              stone.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    return stone


def join_beveled_pieces(pieces, name):
    for piece in pieces:
        bpy.context.view_layer.objects.active = piece
        bpy.ops.object.modifier_apply(modifier="Soft edge")
    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    bpy.context.object.name = name


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone = textured_stone("Honed Aberdeen stone", "entrance-stone.jpg", 0.59)
    cream = textured_stone("Cream-speckled stone", "entrance-slat-stone.jpg", 0.50)
    backing = material("Recessed charcoal joints", (0.041, 0.029, 0.024), 0.86)
    frame = material("Blackened bronze sign frame", (0.079, 0.052, 0.034), 0.43, 0.53)
    trim = material("Satin brass inlay", (0.38, 0.231, 0.091), 0.41, 0.53)
    sign_back = material("Matte charcoal sign backing", (0.032, 0.022, 0.017), 0.77)
    rng = Random(5842)
    slabs = []
    breaks = ((0, 1.33, 2.98, 4.73), (0, 0.84, 2.39, 4.01, 4.73),
              (0, 1.57, 3.21, 4.73), (0, 1.04, 2.61, 3.84, 4.73))
    courses = (0, 1.025, 2.112, 3.205, TOP)
    for side in (-1, 1):
        box("Facade backing", (OUTER_X - INNER_X, 0.13, TOP),
            (side * (INNER_X + OUTER_X) / 2, -9.345, TOP / 2), backing)
        for offsets, bottom, top in zip(breaks, courses[:-1], courses[1:]):
            for start, end in zip(offsets, offsets[1:]):
                a, b = sorted((side * (INNER_X + start), side * (INNER_X + end)))
                slabs.append(stone_panel(a + 0.004, b - 0.004, bottom + 0.004,
                                         top if top == TOP else top - 0.004,
                                         rng.uniform(9.425, 9.429), stone, rng))

    join_beveled_pieces(slabs, "Staggered stone cladding")

    slats = []
    for i in range(24):
        x = -5.4 + i * 0.47
        if abs(x) < 2.5:
            continue
        slat = box("Cut cream stone bar", (0.10, 0.10, 3.2), (x, -9.45, 1.6), cream, 0.004)
        map_stone_crop(slat, 0.16, 0.257, rng)
        slats.append(slat)
    join_beveled_pieces(slats, "Cream stone entrance bars")

    # The outer rim finishes flush with the top of both exterior sides.
    bottom, width, surround = 3.12, 4.74, 0.105
    center = (bottom + TOP) / 2
    box("Recessed sign panel", (width, 0.13, TOP - bottom), (0, -9.405, center), sign_back, 0.012)
    for z in (bottom + surround / 2, TOP - surround / 2):
        box("Horizontal bronze frame", (width, 0.22, surround), (0, -9.505, z), frame, 0.013)
        box("Horizontal brass inlay", (width - 0.13, 0.018, 0.018), (0, -9.622, z), trim, 0.003)
    for side in (-1, 1):
        x = side * (width - surround) / 2
        box("Vertical bronze frame", (surround, 0.22, TOP - bottom - 2 * surround),
            (x, -9.505, center), frame, 0.013)
        box("Vertical brass inlay", (0.018, 0.018, TOP - bottom - surround + 0.018),
            (x, -9.622, center), trim, 0.003)

    bpy.ops.export_scene.gltf(filepath=str(ROOT / "public/models/bar/arkade-entrance-facade.glb"),
                              export_format="GLB", export_yup=True, export_apply=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
