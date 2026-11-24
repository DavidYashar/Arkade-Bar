"""Export the Brick Blitz table prop in the billiard game's proportions."""

from math import pi
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/models/bar/brick-blitz-table.glb"


def material(name, color, roughness, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def box(name, size, position, mat, radius=0.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if radius:
        bevel = obj.modifiers.new("Rounded corners", "BEVEL")
        bevel.width = radius
        bevel.segments = 2


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wood = material("Satin walnut rail", (0.16, 0.062, 0.026), 0.49)
    texture = wood.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(ROOT / "public/textures/wood-rail.png"))
    wood.node_tree.links.new(texture.outputs["Color"],
                             wood.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    charcoal = material("Charcoal powder coat", (0.027, 0.035, 0.032), 0.58, 0.16)
    gold = material("Aged brass", (0.47, 0.26, 0.083), 0.42, 0.43)
    felt = material("Green billiard cloth", (0.030, 0.176, 0.081), 0.95)
    cushion = material("Green rail cushions", (0.026, 0.123, 0.056), 0.87)
    amber = material("Amber marquee", (1, 0.48, 0.095), 0.40, emission=1.55)
    control = material("Ivory paddle", (0.80, 0.72, 0.53), 0.47)
    brick_materials = [
        material("Clay", (0.39, 0.089, 0.039), 0.92),
        material("Stone", (0.20, 0.23, 0.26), 0.86),
        material("Gold", (0.71, 0.44, 0.09), 0.37, 0.52),
        material("Blue glass", (0.15, 0.43, 0.53), 0.31, 0.25),
        material("Iron", (0.14, 0.17, 0.20), 0.48, 0.63),
    ]

    # Local +X faces the player. The rear of the brick field sits by the wall.
    box("Cabinet apron", (2.45, 1.78, 0.24), (0, 0, 0.67), charcoal, 0.032)
    box("Billiard bed", (2.24, 1.58, 0.034), (0, 0, 0.779), felt)
    for x in (-0.82, 0.82):
        box("Powder-coated pedestal", (0.25, 1.28, 0.56), (x, 0, 0.315), charcoal, 0.031)
        box("Recessed pedestal foot", (0.30, 1.37, 0.060), (x, 0, 0.032), charcoal, 0.012)
    for side in (-1, 1):
        box("Long walnut rail", (2.45, 0.104, 0.102), (0, side * 0.844, 0.823), wood)
        box("Long cushion", (2.25, 0.039, 0.060), (0, side * 0.778, 0.812), cushion)
        box("Side brass inlay", (2.23, 0.010, 0.012), (0, side * 0.893, 0.759), gold, 0.002)
        box("Short walnut rail", (0.102, 1.68, 0.102), (side * 1.174, 0, 0.823), wood)
        box("Short cushion", (0.037, 1.54, 0.060), (side * 1.103, 0, 0.812), cushion)
    box("Halfway line", (0.014, 1.48, 0.0015), (0, 0, 0.797), gold, 0)
    for row in range(5):
        for col in range(8):
            brick_mat = brick_materials[(row * 11 + col * 7) % 13 % len(brick_materials)] if (row + col * 2) % 5 == 0 else brick_materials[0]
            box("Brick", (0.075, 0.16, 0.075),
                (-0.98 + row * 0.095, (col - 3.5) * 0.174, 0.832), brick_mat, 0.006)
    blue = material("Blue lacquer cue ball", (0.030, 0.20, 0.65), 0.20, 0.16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.045,
                                        location=(0.74, -0.14, 0.842))
    ball = bpy.context.object
    ball.name = "Blue cue ball"
    ball.data.materials.append(blue)
    for face in ball.data.polygons:
        face.use_smooth = True
    box("Player paddle", (0.075, 0.33, 0.047), (0.985, 0, 0.822), control, 0.016)

    box("Arcade control apron", (0.16, 1.72, 0.115), (1.24, 0, 0.794), charcoal, 0.022)
    box("Marquee face", (0.022, 0.92, 0.137), (1.323, 0, 0.737), charcoal, 0.012)
    bpy.ops.object.text_add(location=(1.337, 0, 0.737), rotation=(pi / 2, 0, pi / 2))
    text = bpy.context.object
    text.name = "Brick Blitz marquee"
    text.data.body = "BRICK BLITZ"
    text.data.align_x = "CENTER"
    text.data.align_y = "CENTER"
    text.data.size = 0.103
    text.data.space_character = 1.14
    text.data.materials.append(amber)
    bpy.ops.object.convert(target="MESH")

    for radius, height, mat in ((0.036, 0.012, gold), (0.027, 0.016, amber)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=height,
                                           location=(1.25, 0.58, 0.852 + height / 2))
        bpy.context.object.name = "Serve button"
        bpy.context.object.data.materials.append(mat)

    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_yup=True,
                              export_apply=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
