"""The pinball cabinet on the bar's left wall: life size, with detail.

Blender is Z-up. The cabinet faces +X and scales around its floor-level origin.

Run:

    blender -b --python art/build_pinball_cabinet.py
"""

import math
import pathlib

import bpy
from mathutils import Matrix

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

S = 1.5
ART = TEX / "pinball-cabinet-art.jpg"


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def artwork(name, roughness, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness

    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(ART), check_existing=True)
    tex.extension = "EXTEND"
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if emission:
        nodes.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission
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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius * S,
                                        location=tuple(v * S for v in loc))
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v * S for v in p) for p in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def print_panel(name, vertices, mat, crop=(0, 0, 1, 1)):
    obj = mesh_object(name, vertices, [(0, 1, 2, 3)], mat)
    u0, v0, u1, v1 = crop
    uv = obj.data.uv_layers.new().uv
    for i, coord in enumerate(((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
        uv[i].vector = coord
    return obj


def face_text(text, size, at, mat):
    bpy.ops.object.text_add(location=tuple(v * S for v in at),
                            rotation=(math.pi / 2, 0, math.pi / 2))
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size * S
    obj.data.space_character = 1.2
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target="MESH")


def build():
    clear()

    lacquer = artwork("Printed cabinet art with satin laminate", 0.46, 0.18)
    field_print = artwork("Glossy playfield print", 0.36, 0.52)
    screen = artwork("Backlit backglass print", 0.38, 1.30)
    black = plain("Black cabinet laminate", (0.023, 0.026, 0.036, 1), 0.51)
    legs = plain("Black powder-coated steel", (0.045, 0.051, 0.061, 1), 0.47, 0.48)
    steel = plain("Satin nickel trim", (0.54, 0.56, 0.61, 1), 0.29, 0.65)
    rubber = plain("Speaker grille and seals", (0.010, 0.013, 0.018, 1), 0.85)
    glass = plain("Clear smoked playfield glass", (0.57, 0.72, 0.80, 1), 0.12)
    glass.surface_render_method = "BLENDED"
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.085
    amber = plain("Amber score display", (1.0, 0.38, 0.065, 1), 0.34, emission=2.5)
    cyan = plain("Ice-blue playfield inserts", (0.055, 0.62, 1.0, 1), 0.37, emission=2.1)
    red = plain("Red illuminated controls", (0.88, 0.035, 0.08, 1), 0.38, emission=1.8)
    purple = plain("Ultraviolet lane inserts", (0.45, 0.11, 0.94, 1), 0.37, emission=2.1)
    cream = plain("Ivory flippers and bumper shells", (0.80, 0.77, 0.68, 1), 0.42)
    display = plain("Smoked score window", (0.038, 0.013, 0.012, 1), 0.28)
    front_axis = (0, math.pi / 2, 0)

    # A rigid cabinet below a sloped, glass-covered playfield.
    slope = math.atan(0.13)
    tail, nose, half, base = -0.625, 0.625, 0.344, 0.535
    corners = [(tail, -half), (nose, -half), (nose, half), (tail, half)]
    body = mesh_object("Tapered cabinet shell",
                       [(x, y, base) for x, y in corners] +
                       [(x, y, 0.823 - 0.13 * x) for x, y in corners],
                       [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], black)
    bevel(body, 0.007 * S)
    for side in (-1, 1):
        a, b = (-0.608, 0.608) if side < 0 else (0.608, -0.608)
        y = side * 0.346
        print_panel(f"Side artwork {side}",
                    [(a, y, 0.55), (b, y, 0.55),
                     (b, y, 0.807 - 0.13 * b), (a, y, 0.807 - 0.13 * a)],
                    lacquer, (0.01, 0.26, 0.99, 0.72))
        for x in (0.49, -0.49):
            box("Cabinet leg", (0.045, 0.05, 0.575), (x, side * 0.295, 0.294), legs, bev=0.004)
            box("Leg leveller", (0.069, 0.064, 0.016), (x, side * 0.295, 0.008), legs, bev=0.003)
        cyl("Flipper button bezel", 0.027, 0.010, (0.49, side * 0.351, 0.715), steel,
            rot=(math.pi / 2, 0, 0), vertices=24)
        cyl("Flipper button", 0.020, 0.012, (0.49, side * 0.357, 0.715), red,
            rot=(math.pi / 2, 0, 0), vertices=24)

    print_panel("Front cabinet artwork",
                [(0.627, -0.326, 0.549), (0.627, 0.326, 0.549),
                 (0.627, 0.326, 0.728), (0.627, -0.326, 0.728)],
                lacquer, (0.0, 0.35, 0.77, 0.70))
    box("Coin door surround", (0.021, 0.227, 0.141), (0.631, 0, 0.635), legs, bev=0.006)
    box("Coin door", (0.010, 0.204, 0.123), (0.647, 0, 0.636), rubber, bev=0.004)
    for y in (-0.042, 0.042):
        box("Coin return", (0.009, 0.035, 0.027), (0.656, y, 0.659), legs, bev=0.003)
        box("Coin slot", (0.011, 0.019, 0.0035), (0.661, y, 0.662), steel)
    for y, mat in ((-0.237, red), (0.213, amber), (0.27, cyan)):
        cyl("Front control bezel", 0.024, 0.011, (0.636, y, 0.664), steel, front_axis, 24)
        cyl("Front control lens", 0.017, 0.012, (0.644, y, 0.664), mat, front_axis, 24)

    before_field = set(bpy.context.scene.objects)
    box("Playfield backing", (1.14, 0.592, 0.017), (0, 0, 0.809), black, bev=0.005)
    print_panel("Playfield artwork", [(0.553, -0.286, 0.828), (0.553, 0.286, 0.828),
                                    (-0.553, 0.286, 0.828), (-0.553, -0.286, 0.828)],
                field_print, (0.18, 0.01, 0.81, 0.99))
    for side in (-1, 1):
        box("Nickel side rail", (1.28, 0.038, 0.060), (0, side * 0.322, 0.855), steel, bev=0.006)
        box("Playfield inner gasket", (1.13, 0.025, 0.021), (0, side * 0.296, 0.87), rubber, bev=0.003)
        box("Lane insert rail", (0.62, 0.009, 0.017), (-0.11, side * 0.255, 0.835), purple, bev=0.002)
        box("Flipper", (0.123, 0.033, 0.022), (0.414, side * 0.063, 0.836), cream,
            rot=(0, 0, -1.09 * side), bev=0.010)
        box("Slingshot", (0.125, 0.046, 0.028), (0.222, side * 0.158, 0.846), red,
            rot=(0, 0, 0.60 * side), bev=0.008)
    box("Lockdown bar", (0.076, 0.709, 0.047), (0.625, 0, 0.866), steel, bev=0.009)
    box("Rear glass channel", (0.06, 0.677, 0.04), (-0.579, 0, 0.871), legs, bev=0.006)
    box("Glass cover", (1.129, 0.587, 0.005), (-0.003, 0, 0.889), glass, bev=0.001)
    for x, y, mat in ((-0.245, -0.12, cyan), (-0.33, 0.053, purple), (-0.095, 0.102, amber)):
        cyl("Pop bumper body", 0.043, 0.033, (x, y, 0.836), cream, vertices=32)
        cyl("Pop bumper cap", 0.039, 0.012, (x, y, 0.856), mat, vertices=32)
    for index in range(7):
        x = -0.43 + 0.104 * index
        y = 0.068 * math.sin(index * 0.92)
        cyl("Playfield insert", 0.016, 0.004, (x, y, 0.831), (amber, cyan, purple)[index % 3], vertices=16)
    box("Shooter lane guide", (0.79, 0.012, 0.024), (-0.091, 0.220, 0.836), steel, bev=0.003)
    sphere("Chrome pinball", 0.015, (0.28, 0.25, 0.835), steel)

    hinge = Matrix.Translation((0, 0, 0.84 * S))
    pitch = hinge @ Matrix.Rotation(slope, 4, "Y") @ hinge.inverted()
    bpy.context.view_layer.update()
    for obj in set(bpy.context.scene.objects) - before_field:
        obj.matrix_world = pitch @ obj.matrix_world

    # Upright backbox with a backlit picture, dot-style score, and twin speakers.
    box("Backbox shell", (0.162, 0.664, 0.462), (-0.704, 0, 1.078), black, bev=0.009)
    for side in (-1, 1):
        x1, x2 = (-0.773, -0.625) if side < 0 else (-0.625, -0.773)
        y = side * 0.333
        print_panel("Backbox side print", [(x1, y, 0.86), (x2, y, 0.86),
                                          (x2, y, 1.297), (x1, y, 1.297)],
                    lacquer, (0.60, 0.06, 0.92, 0.92))
        box("Backbox nickel upright", (0.026, 0.020, 0.456),
            (-0.618, side * 0.319, 1.079), steel, bev=0.003)
    box("Backbox top crown", (0.162, 0.666, 0.023), (-0.704, 0, 1.312), legs, bev=0.004)
    box("Backglass bezel", (0.016, 0.605, 0.312), (-0.618, 0, 1.135), rubber, bev=0.006)
    print_panel("Illuminated backglass artwork",
                [(-0.608, -0.286, 0.995), (-0.608, 0.286, 0.995),
                 (-0.608, 0.286, 1.279), (-0.608, -0.286, 1.279)],
                screen, (0.0, 0.12, 1.0, 0.88))
    box("Title bezel", (0.007, 0.578, 0.040), (-0.603, 0, 1.015), black, bev=0.003)
    face_text("NEON PINBALL", 0.027, (-0.598, 0, 1.015), cyan)
    box("Speaker and score panel", (0.022, 0.607, 0.120), (-0.614, 0, 0.926), black, bev=0.005)
    box("Score window", (0.012, 0.310, 0.066), (-0.599, 0, 0.927), display, bev=0.007)
    face_text("00 000 000", 0.033, (-0.591, 0, 0.928), amber)
    for y in (-0.236, 0.236):
        cyl("Speaker nickel ring", 0.043, 0.014, (-0.596, y, 0.928), steel, front_axis, 32)
        cyl("Recessed speaker grille", 0.036, 0.012, (-0.588, y, 0.928), rubber, front_axis, 32)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "pinball-cabinet.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False)
    print(f"wrote {path.name} {path.stat().st_size / 1024:.1f} KB, scale {S}x")


build()
