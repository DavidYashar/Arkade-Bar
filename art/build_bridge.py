"""The river bridge: an arched timber walkway with a post and rail balustrade.

Span runs along X, the walkway across Y, height along Z. Built to be captured
from above and dropped across the river in the game.

    blender -b --python art/build_bridge.py
"""

import math
import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
OUT.mkdir(parents=True, exist_ok=True)

SPAN = 7.2
WIDTH = 2.6
RISE = 0.95
THICK = 0.2
RAIL = 0.95


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def plain(name, color, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def box(name, size, at, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    return ob


def arch(x: float) -> float:
    return RISE * (1 - (x / (SPAN / 2)) ** 2)


def build():
    clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    deck_mat = plain("Bridge deck", (.62, .47, .26, 1), .62)
    rail_mat = plain("Bridge rail", (.55, .41, .22, 1), .58)
    iron_mat = plain("Bridge iron", (.10, .11, .12, 1), .45, .7)

    segments = 16
    for i in range(segments):
        x0 = -SPAN / 2 + (SPAN / segments) * i
        x1 = x0 + SPAN / segments
        mid = (x0 + x1) / 2
        slope = math.atan2(arch(x1) - arch(x0), x1 - x0)
        box(f"Deck plank {i}", (SPAN / segments * 1.02, WIDTH, THICK), (mid, 0, arch(mid)), deck_mat, (0, -slope, 0))

        for side in (-1, 1):
            post_x = x1
            box(f"Post {i} {side}", (.10, .10, RAIL), (post_x, side * (WIDTH / 2 - .08), arch(post_x) + RAIL / 2 + THICK / 2), rail_mat)
            box(f"Top rail {i} {side}", (SPAN / segments * 1.02, .09, .09),
                (mid, side * (WIDTH / 2 - .08), arch(mid) + RAIL + THICK / 2), rail_mat, (0, -slope, 0))
            box(f"Mid rail {i} {side}", (SPAN / segments * 1.02, .07, .07),
                (mid, side * (WIDTH / 2 - .08), arch(mid) + RAIL * .55 + THICK / 2), rail_mat, (0, -slope, 0))

    # iron piers under each end, with a pair of struts
    for side in (-1, 1):
        for along in (-1, 1):
            x = side * (SPAN / 2 - .55)
            box(f"Pier {side} {along}", (.16, .16, 1.7), (x, along * .78, arch(x) - .95), iron_mat)
            box(f"Strut {side} {along}", (.11, .11, 1.35),
                (x + along * .28, .78 * along, arch(x) - .62), iron_mat, (0, along * .32, 0))

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "narrows-bridge.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    print(f"wrote {path.name} {path.stat().st_size / 1024:.0f} KB")


build()
