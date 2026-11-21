"""The pinball cabinet on the bar's left wall: life size, with detail.

Blender is Z-up: every size and position is (width x, depth y, height z) before the
SCALE factor. The playfield carries the same furniture as the playable table -
bumpers, slingshots, inserts, a lane - so the cabinet you walk up to reads as the
machine you then play.

Run:

    blender -b --python art/build_pinball_cabinet.py
"""

import math
import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

# Life size, the same as the playable table.
S = 1.0


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def image_material(name, image_path, roughness=0.5, repeat=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness

    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(image_path), check_existing=True)
    tex.extension = "REPEAT"

    coord = nodes.nodes.new("ShaderNodeTexCoord")
    mapping = nodes.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (repeat, repeat, 1)
    nodes.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nodes.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def emissive_image(name, image_path, strength=3.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.35
    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(image_path), check_existing=True)
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    # Blender 5 names these Emission Color / Emission Strength.
    if "Emission Color" in bsdf.inputs:
        nodes.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def plain(name, color, roughness=0.5, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def bevel(ob, width, segments=2):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def box(name, size, loc, mat, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0] * S, loc[1] * S, loc[2] * S), rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0] * S, size[1] * S, size[2] * S)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    if bev:
        bevel(ob, bev * S)
    return ob


def cyl(name, radius, depth, loc, mat, rot=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius * S,
        depth=depth * S,
        location=(loc[0] * S, loc[1] * S, loc[2] * S),
        rotation=rot,
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def sphere(name, radius, loc, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * S, location=(loc[0] * S, loc[1] * S, loc[2] * S))
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def build():
    clear()

    wood = image_material("pinball_wood", TEX / "wood-rail.png", roughness=0.4, repeat=2)
    slate = plain("pinball_slate", (0.05, 0.06, 0.075, 1), 0.5)
    dark = plain("pinball_dark", (0.04, 0.035, 0.03, 1), 0.55)
    steel = plain("pinball_steel", (0.62, 0.63, 0.66, 1), 0.28, metallic=0.95)
    brass = plain("pinball_brass", (0.55, 0.4, 0.16, 1), 0.3, metallic=0.9)
    rubber = plain("pinball_rubber", (0.9, 0.9, 0.88, 1), 0.7)
    glass = plain("pinball_glass", (0.5, 0.7, 0.8, 1), 0.05)
    glass.blend_method = "BLEND"
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.12

    amber = plain("pinball_amber", (1.0, 0.55, 0.15, 1), 0.35, emission=4.0)
    cyan = plain("pinball_cyan", (0.2, 0.8, 1.0, 1), 0.35, emission=4.0)
    red = plain("pinball_red", (1.0, 0.2, 0.25, 1), 0.4, emission=3.0)
    purple = plain("pinball_purple", (0.7, 0.35, 1.0, 1), 0.35, emission=4.0)
    cream = plain("pinball_cream", (0.95, 0.9, 0.78, 1), 0.4)
    backglass = emissive_image("pinball_backglass", TEX / "pinball-backglass.png", 2.2)

    # body and playfield (z 0.585 .. 0.825)
    box("body", (1.23, 0.69, 0.24), (0, 0, 0.705), wood, bev=0.012)
    box("body_lower", (1.16, 0.62, 0.05), (0, 0, 0.575), dark, bev=0.01)
    box("playfield", (1.10, 0.56, 0.02), (0, 0, 0.835), slate)
    box("playfield_border", (1.14, 0.60, 0.012), (0, 0, 0.83), dark)

    # rails: a 0.05 frame around the playfield
    box("rail_left", (1.24, 0.05, 0.055), (0, 0.315, 0.862), wood, bev=0.008)
    box("rail_right", (1.24, 0.05, 0.055), (0, -0.315, 0.862), wood, bev=0.008)
    box("rail_near", (0.05, 0.69, 0.055), (0.615, 0, 0.862), wood, bev=0.008)
    box("rail_far", (0.05, 0.69, 0.055), (-0.615, 0, 0.862), wood, bev=0.008)

    # the glass, a shadow of a sheet
    box("glass", (1.12, 0.58, 0.006), (0, 0, 0.905), glass)

    # playfield furniture: three bumpers, two slingshots, inserts
    for i, (bx, bz, mat) in enumerate([(0.24, -0.10, cyan), (0.02, 0.0, amber), (0.24, 0.10, purple)]):
        cyl(f"bumper_body_{i}", 0.042, 0.03, (bx, bz, 0.852), cream, vertices=40)
        cyl(f"bumper_cap_{i}", 0.03, 0.012, (bx, bz, 0.872), mat, vertices=40)
        sphere(f"bumper_dome_{i}", 0.02, (bx, bz, 0.878), mat)
    for side, mat in ((1, red), (-1, red)):
        box(
            f"slingshot_{side}",
            (0.14, 0.028, 0.05),
            (0.18, side * 0.16, 0.858),
            mat,
            rot=(0, 0, math.radians(38 * side)),
            bev=0.006,
        )
    for i, (ix, iz, mat) in enumerate(
        [(-0.18, -0.12, amber), (-0.18, 0.12, cyan), (-0.32, 0.0, purple), (0.36, -0.20, amber), (0.36, 0.20, cyan)]
    ):
        cyl(f"insert_{i}", 0.018, 0.004, (ix, iz, 0.842), mat, vertices=24)
    # lane arrows up the right side
    for i in range(3):
        box(f"lane_arrow_{i}", (0.03, 0.02, 0.004), (0.44, -0.22 + i * 0.03, 0.842), cyan)

    # lockdown bar and apron at the player end
    box("lockdown", (0.07, 0.70, 0.055), (0.635, 0, 0.885), steel, bev=0.012)
    box("apron", (0.09, 0.60, 0.10), (0.60, 0, 0.865), dark, bev=0.008)
    cyl("start_button", 0.022, 0.02, (0.62, -0.14, 0.93), red)
    cyl("launch_button", 0.018, 0.02, (0.62, 0.14, 0.93), steel)

    # flipper buttons on each side
    for side in (1, -1):
        cyl(f"flipper_button_{side}", 0.022, 0.03, (0.55, side * 0.36, 0.78), red, rot=(math.pi / 2, 0, 0), vertices=24)

    # coin door on the front face
    box("coin_door", (0.02, 0.28, 0.22), (0.625, 0, 0.42), dark, bev=0.005)
    box("coin_slot_a", (0.012, 0.06, 0.02), (0.632, -0.07, 0.46), brass)
    box("coin_slot_b", (0.012, 0.06, 0.02), (0.632, 0.07, 0.46), brass)

    # backbox with the lit backglass
    box("backbox", (0.15, 0.64, 0.46), (-0.70, 0, 1.05), wood, bev=0.012)
    box("backbox_frame", (0.03, 0.60, 0.42), (-0.615, 0, 1.05), dark, bev=0.006)
    box("backbox_glass", (0.006, 0.54, 0.34), (-0.598, 0, 1.05), backglass)
    box("backbox_lid", (0.20, 0.72, 0.035), (-0.70, 0, 1.29), wood, rot=(0, 0.14, 0), bev=0.008)
    box("backbox_light", (0.05, 0.58, 0.02), (-0.70, 0, 1.315), amber)

    # legs, feet and levellers
    for sx in (1, -1):
        for sy in (1, -1):
            x = sx * 0.545
            y = sy * 0.27
            box(f"leg_{sx}_{sy}", (0.07, 0.07, 0.58), (x, y, 0.29), dark, bev=0.008)
            box(f"foot_{sx}_{sy}", (0.10, 0.10, 0.035), (x, y, 0.018), steel, bev=0.006)
            cyl(f"leveller_{sx}_{sy}", 0.02, 0.03, (x, y, 0.055), brass, vertices=20)

    # chrome trim along the body's bottom edge
    for side in (1, -1):
        box(f"trim_{side}", (1.20, 0.012, 0.012), (0, side * 0.352, 0.60), brass)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "pinball-cabinet.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.1f} KB, scale {S}x")


build()
