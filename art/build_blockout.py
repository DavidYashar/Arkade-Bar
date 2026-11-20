"""Arkade Bar, grey box. Run with:

    blender -b --python art/build_blockout.py

Geometry only: no textures, no detail. The point is to agree on the room, the
layout and the camera frames before any wood or neon is modelled for real.
"""

import math
import pathlib

import bpy
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
MODELS = ROOT / "public" / "models" / "bar"
ART = pathlib.Path(r"C:\Users\yasha\Deepseek harness Projects\duel-dudes-art")
MODELS.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- palette
INK = (0.035, 0.035, 0.04, 1)
WALNUT = (0.16, 0.09, 0.05, 1)
BRICK = (0.24, 0.12, 0.09, 1)
CONCRETE = (0.20, 0.19, 0.18, 1)
LEATHER = (0.42, 0.24, 0.13, 1)
BRASS = (0.55, 0.40, 0.12, 1)
CLAY = (0.55, 0.55, 0.55, 1)
NEON_PINK = (1.0, 0.10, 0.55, 1)
NEON_AMBER = (1.0, 0.62, 0.20, 1)
NEON_CYAN = (0.10, 0.85, 1.0, 1)
GLASS = (0.10, 0.12, 0.14, 1)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# The factory reset below removes every datablock, so it must run before any
# material is created.
clear()


def material(name, color, emission=0.0, roughness=0.7, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


def box(name, size, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(mat)
    return ob


def cyl(name, radius, depth, loc, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def torus(name, major, minor, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def sphere(name, radius, loc, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=16, ring_count=12)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def plane(name, size, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0], size[1], 1)
    ob.data.materials.append(mat)
    return ob


# --------------------------------------------------------------------------- room
W, D, H = 14.0, 18.0, 4.2          # width X, depth Y, height Z
FRONT = -D / 2                     # entrance wall
BACK = D / 2                       # bar wall

m_ink = material("ink", INK, roughness=0.6)
m_walnut = material("walnut", WALNUT, roughness=0.55)
m_brick = material("brick", BRICK, roughness=0.9)
m_concrete = material("concrete", CONCRETE, roughness=0.35)
m_leather = material("leather", LEATHER, roughness=0.45)
m_brass = material("brass", BRASS, roughness=0.3, metallic=1.0)
m_clay = material("clay", CLAY, roughness=0.8)
m_glass = material("glass", GLASS, roughness=0.15)
m_pink = material("neon_pink", NEON_PINK, emission=2.6)
m_amber = material("neon_amber", NEON_AMBER, emission=2.2)
m_cyan = material("neon_cyan", NEON_CYAN, emission=2.6)
m_screen = material("screen", (0.10, 0.20, 1.0, 1), emission=1.6)
m_warm = material("warm_cove", (1.0, 0.75, 0.45, 1), emission=1.8)


def build_room():
    plane("floor", (W, D), (0, 0, 0), m_concrete)
    plane("ceiling", (W, D), (0, 0, H), m_ink, rot=(math.pi, 0, 0))
    box("wall_back", (W, 0.2, H), (0, BACK, H / 2), m_walnut)
    box("wall_front", (0.9, 0.2, H), (-W / 2 + 0.45, FRONT, H / 2), m_brick)
    box("wall_front_r", (W / 2 - 0.9, 0.2, H), (W / 2 - 2.3, FRONT, H / 2), m_walnut)
    box("wall_left", (0.2, D, H), (-W / 2, 0, H / 2), m_brick)
    box("wall_right", (0.2, D, H), (W / 2, 0, H / 2), m_walnut)

    # slatted timber on the back wall, the identity of the room
    for i in range(40):
        x = -6.6 + i * 0.34
        box(f"slat_{i}", (0.06, 0.06, H - 0.6), (x, BACK - 0.16, (H - 0.6) / 2 + 0.2), m_walnut)

    # coves: warm light along the wall tops
    box("cove_left", (0.06, D - 1.0, 0.05), (-W / 2 + 0.12, 0, H - 0.35), m_warm)
    box("cove_right", (0.06, D - 1.0, 0.05), (W / 2 - 0.12, 0, H - 0.35), m_warm)
    box("cove_back", (W - 1.2, 0.06, 0.05), (0, BACK - 0.2, H - 0.35), m_warm)

    # exposed ducts, two runs along the depth
    for x in (-3.2, 3.2):
        cyl(f"duct_{x}", 0.32, D - 1.0, (x, 0, H - 0.55), m_ink, rot=(math.pi / 2, 0, 0), verts=20)

    # entrance: the opening only. Frame, track and leaves are built in the browser,
    # all from the same numbers, so they cannot disagree.


def build_bar():
    # counter across the back, a little in front of the wall
    box("bar_body", (7.2, 0.62, 1.05), (0, BACK - 1.35, 0.525), m_walnut)
    box("bar_top", (7.4, 0.78, 0.07), (0, BACK - 1.35, 1.09), m_leather)
    box("bar_underlight", (7.2, 0.05, 0.04), (0, BACK - 1.02, 0.10), m_warm)

    # back bar: shelves and bottles
    box("backbar", (7.0, 0.35, 2.6), (0, BACK - 0.28, 1.3), m_walnut)
    for shelf in range(3):
        z = 1.15 + shelf * 0.55
        box(f"shelf_{shelf}", (6.6, 0.30, 0.04), (0, BACK - 0.30, z), m_walnut)
        for i in range(22):
            x = -3.1 + i * 0.29
            cyl(f"bottle_{shelf}_{i}", 0.035, 0.24 if i % 3 else 0.30,
                (x, BACK - 0.30, z + 0.15), m_glass, verts=8)

    # six stools
    for i in range(6):
        x = -2.5 + i * 1.0
        cyl(f"stool_leg_{i}", 0.04, 0.65, (x, BACK - 2.05, 0.325), m_ink, verts=8)
        cyl(f"stool_seat_{i}", 0.19, 0.07, (x, BACK - 2.05, 0.69), m_leather, verts=16)

    # brass ring light above the room centre
    torus("ring_a", 2.2, 0.035, (0, 0.5, H - 0.75), m_warm)
    torus("ring_b", 1.5, 0.03, (0, -3.2, H - 0.95), m_warm)


def build_cabinet(name, loc, rot_z, screen_mat):
    cabinet = box(name, (0.86, 0.92, 1.86), (loc[0], loc[1], 0.93), mat=material(f"{name}_body", INK))
    cabinet.rotation_euler[2] = rot_z
    # marquee and screen are children of nothing; place them in world for the blockout
    front = Vector((math.sin(rot_z), math.cos(rot_z), 0))
    off = loc[0] + front.x * 0.47, loc[1] + front.y * 0.47
    marquee = box(f"{name}_marquee", (0.80, 0.03, 0.22), (off[0], off[1], 1.86), m_amber)
    marquee.rotation_euler[2] = rot_z
    screen = plane(f"{name}_screen", (0.62, 0.52), (off[0], off[1], 1.28), screen_mat, rot=(math.pi / 2, 0, rot_z))
    # neon trim down the sides
    for side in (-1, 1):
        trim = box(f"{name}_trim_{side}", (0.05, 0.05, 1.62),
                   (loc[0] + front.x * 0.02 + math.cos(rot_z) * side * 0.44,
                    loc[1] + front.y * 0.02 - math.sin(rot_z) * side * 0.44, 0.95),
                   m_pink if side < 0 else m_cyan)
        trim.rotation_euler[2] = rot_z


def build_cabinets():
    # Three on the left wall, two on the right, all facing the room centre.
    for i, y in enumerate((-3.4, -1.6, 0.2)):
        build_cabinet(f"cab_l{i + 1}", (-W / 2 + 1.1, y), math.radians(75), m_screen)
    for i, y in enumerate((-2.4, -0.6)):
        build_cabinet(f"cab_r{i + 1}", (W / 2 - 1.1, y), math.radians(-75), m_screen)


def build_tables():
    # the card table, centre stage, under the ring light
    box("card_table", (2.3, 1.25, 0.08), (0, -2.0, 0.74), m_walnut)
    box("card_felt", (2.1, 1.05, 0.02), (0, -2.0, 0.79), material("felt", (0.02, 0.13, 0.08, 1)))
    for i, (dx, dy) in enumerate(((-1.0, -0.9), (0.0, -1.05), (1.0, -0.9), (-1.0, 1.0), (1.0, 1.0), (0.0, 1.1))):
        x, y = dx, -2.0 + dy
        cyl(f"card_chair_leg_{i}", 0.03, 0.44, (x, y, 0.22), m_ink, verts=8)
        box(f"card_chair_seat_{i}", (0.46, 0.46, 0.07), (x, y, 0.46), m_leather)
        box(f"card_chair_back_{i}", (0.46, 0.06, 0.48), (x, y + (0.22 if dy > 0 else -0.22), 0.70), m_leather)

    # a few game tables down the middle
    for i, (x, y) in enumerate(((-3.4, -5.6), (3.4, -5.6), (-3.2, 2.6), (3.2, 2.6))):
        box(f"game_table_{i}", (1.5, 0.95, 0.07), (x, y, 0.74), m_walnut)
        for side in (-1, 1):
            box(f"game_chair_{i}_{side}", (0.44, 0.44, 0.06), (x, y + side * 0.72, 0.45), m_leather)
            box(f"game_chair_back_{i}_{side}", (0.44, 0.05, 0.45), (x, y + side * 0.94, 0.68), m_leather)


def build_lounge():
    # chesterfield corner at the front left, with a rug
    plane("rug", (3.4, 2.4), (-4.3, -6.0, 0.01), material("rug", (0.30, 0.12, 0.08, 1)))
    box("sofa_seat", (2.1, 0.85, 0.40), (-4.3, -6.7, 0.30), m_leather)
    box("sofa_back", (2.1, 0.18, 0.75), (-4.3, -7.1, 0.62), m_leather)
    for side in (-1, 1):
        box(f"sofa_arm_{side}", (0.18, 0.85, 0.55), (-4.3 + side * 1.05, -6.7, 0.42), m_leather)
    box("coffee_table", (1.3, 0.7, 0.35), (-4.3, -4.9, 0.17), m_walnut)

    # plants at the corners
    for i, (x, y) in enumerate(((-6.2, -7.6), (6.2, -7.6), (-6.2, 2.0), (6.2, 2.0))):
        cyl(f"pot_{i}", 0.28, 0.55, (x, y, 0.27), m_ink)
        sphere(f"plant_{i}", 0.55, (x, y, 1.05), material(f"leaf_{i}", (0.10, 0.28, 0.10, 1)))


def sign_ghost():
    # pixel ghost, eleven wide, blocks of 0.09
    pattern = [
        "00111111100",
        "01111111110",
        "11111111111",
        "11100100111",
        "11100100111",
        "11111111111",
        "11111111111",
        "11011011011",
    ]
    y0, z0 = 0.4, 3.05
    for r, row in enumerate(pattern):
        for c, ch in enumerate(row):
            if ch == "1":
                box(f"ghost_{r}_{c}", (0.04, 0.10, 0.10),
                    (-W / 2 + 0.18, y0 + c * 0.11, z0 - r * 0.11), m_pink)


def sign_gamepad():
    y0, z0 = 0.8, 3.0
    box("pad_body", (0.04, 0.9, 0.36), (W / 2 - 0.18, y0, z0), m_amber)
    for side in (-1, 1):
        box(f"pad_grip_{side}", (0.04, 0.28, 0.34), (W / 2 - 0.18, y0 + side * 0.5, z0 - 0.1), m_amber)


def sign_crown():
    # over the card table: the mark from the card backs
    z = 2.9
    box("crown_base", (1.5, 0.05, 0.12), (0, BACK - 0.25, z), m_amber)
    for side in (-1, 0, 1):
        box(f"crown_spike_{side}", (0.16, 0.05, 0.34), (side * 0.6, BACK - 0.25, z + 0.2), m_amber)
    box("crown_cap", (0.22, 0.05, 0.10), (0, BACK - 0.25, z + 0.42), m_amber)


def sign_beer():
    x0, z0 = 2.4, 2.95
    box("mug_body", (0.42, 0.04, 0.5), (x0, BACK - 0.22, z0), m_amber)
    box("mug_handle", (0.16, 0.04, 0.26), (x0 + 0.32, BACK - 0.22, z0), m_amber)
    box("mug_foam", (0.5, 0.04, 0.10), (x0, BACK - 0.22, z0 + 0.3), m_amber)


def build_exterior():
    # the street side of the front wall
    box("facade_l", (W / 2 - 2.2, 0.3, 3.6), (-W / 4 - 1.1, FRONT - 0.25, 1.8), m_ink)
    box("facade_r", (W / 2 - 2.2, 0.3, 3.6), (W / 4 + 1.1, FRONT - 0.25, 1.8), m_ink)
    box("facade_top", (4.4, 0.3, 0.5), (0, FRONT - 0.25, 3.4), m_ink)
    for i in range(24):
        x = -5.4 + i * 0.47
        if abs(x) < 2.5:
            continue
        box(f"f_slat_{i}", (0.10, 0.10, 3.2), (x, FRONT - 0.45, 1.6), m_walnut)
    box("sign_backing", (5.4, 0.20, 0.85), (0, FRONT - 0.55, 3.05), m_ink)
    box("sign_text", (4.6, 0.10, 0.30), (0, FRONT - 0.66, 3.05), m_amber)
    # outside: sidewalk and street edge
    plane("sidewalk", (W + 10.0, 6.0), (0, FRONT - 3.0, -0.01), m_concrete)
    box("kerb", (W + 10.0, 0.25, 0.12), (0, FRONT - 6.0, 0.06), m_ink)
    for i, x in enumerate((-3.2, 3.2)):
        cyl(f"planter_{i}", 0.36, 0.7, (x, FRONT - 1.0, 0.35), m_ink)
        sphere(f"palm_{i}", 0.62, (x, FRONT - 1.0, 1.05), material(f"palm_leaf_{i}", (0.08, 0.22, 0.08, 1)))


def build_lights():
    def area(name, loc, energy, size, color=(1.0, 0.72, 0.45)):
        light = bpy.data.lights.new(name, type="AREA")
        light.energy = energy
        light.size = size
        light.color = color
        ob = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (math.radians(90), 0, 0)
        return ob

    area("key_room", (0, 0.0, H - 0.4), 700, 6.0)
    area("key_bar", (0, BACK - 1.4, H - 0.6), 320, 3.0)
    area("key_front", (0, FRONT + 2.0, H - 0.6), 260, 3.0)
    area("fill_left", (-W / 2 + 1.0, 0.0, 3.0), 150, 4.0, (0.85, 0.55, 0.85))
    area("fill_right", (W / 2 - 1.0, 0.0, 3.0), 150, 4.0, (0.45, 0.60, 1.0))
    area("street", (0, FRONT - 3.0, 4.0), 900, 5.0, (1.0, 0.78, 0.55))
    area("street_low", (0, FRONT - 1.2, 1.0), 200, 2.0, (1.0, 0.65, 0.40))


def camera(name, loc, look_at, lens=24):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    direction = Vector(look_at) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def build_cameras():
    return [
        ("01_exterior", camera("cam_exterior", (0, FRONT - 8.6, 1.65), (0, FRONT - 0.2, 1.75), 26)),
        ("02_entrance", camera("cam_entrance", (0, FRONT + 0.9, 1.65), (0, BACK - 1.4, 1.6), 26)),
        ("03_room", camera("cam_room", (-4.9, -6.9, 2.05), (1.0, 2.6, 1.35), 22)),
        ("07_room_right", camera("cam_room_r", (4.9, -6.4, 1.95), (-1.0, 2.4, 1.30), 24)),
        ("08_doorway", camera("cam_door", (0, -8.2, 1.65), (0, BACK - 1.4, 1.55), 26)),
        ("04_table", camera("cam_table", (2.9, -4.2, 1.85), (0, -2.0, 0.80), 34)),
        ("05_cabinets", camera("cam_cabinets", (-3.4, -4.6, 1.65), (-W / 2 + 1.1, -1.2, 1.25), 28)),
        ("06_bar", camera("cam_bar", (0, 0.6, 1.62), (0, BACK - 1.4, 1.45), 32)),
    ]


def render(cameras):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 675
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.01, 0.01, 0.012, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9

    for name, cam in cameras:
        scene.camera = cam
        scene.render.filepath = str(ART / f"blockout-{name}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", name)


def main():
    build_room()
    build_bar()
    build_cabinets()
    build_tables()
    build_lounge()
    sign_ghost()
    sign_gamepad()
    sign_crown()
    sign_beer()
    build_exterior()
    build_lights()
    cams = build_cameras()

    # export everything as one glb for the browser
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS / "blockout.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "blockout.blend"))
    render(cams)
    print("done")


main()
