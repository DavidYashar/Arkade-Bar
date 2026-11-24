"""Brick skin for the two exterior side walls.

The same idea as the walnut floor: the wall is not a repeated picture, it is
several thousand individual bricks. Each brick samples one randomly chosen face
from an atlas cut out of the reference photo, sits at its own depth, and carries
its own slight colour, so no seam ever repeats.

Run:

    blender -b --python art/build_side_brick.py
"""

import pathlib
import random

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"

WALL_X = 7.1          # the outer face of the side wall
WALL_Y = 9.3          # half the building's depth, tucked behind the facade
WALL_H = 4.3          # a little above the ceiling line
BRICK_L = 0.25        # nominal brick length
BRICK_H = 0.08        # nominal brick height
JOINT = 0.012         # mortar joint
JITTER = 0.012        # how much a brick's length may vary
DEPTH_MIN = 0.004
DEPTH_MAX = 0.010

ATLAS_COLS = 6
ATLAS_ROWS = 3


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def brick_material():
    mat = bpy.data.materials.new("rustic brick")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Metallic"].default_value = 0.0

    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(TEX / "rustic-brick-atlas.png"), check_existing=True)
    tex.interpolation = "Linear"
    tex.extension = "CLIP"

    attr = nodes.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"

    mix = nodes.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    nodes.links.new(tex.outputs["Color"], mix.inputs[1])
    nodes.links.new(attr.outputs["Color"], mix.inputs[2])
    nodes.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def mortar_material():
    mat = bpy.data.materials.new("mortar")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.035, 0.028, 0.024, 1)
    bsdf.inputs["Roughness"].default_value = 0.95
    return mat


def build_wall(side, seed):
    """side = +1 for the right wall, -1 for the left."""
    rng = random.Random(seed)
    x_face = side * WALL_X

    verts = []
    faces = []
    uvs = []          # per loop, filled in the same order as faces
    colours = []      # per vertex

    # mortar backing: a slab just behind the bricks
    back = [
        (x_face - side * 0.05, -WALL_Y, 0.0),
        (x_face - side * 0.05, WALL_Y, 0.0),
        (x_face - side * 0.05, WALL_Y, WALL_H),
        (x_face - side * 0.05, -WALL_Y, WALL_H),
    ]
    base = len(verts)
    verts.extend(back)
    colours.extend([(0.035, 0.028, 0.024, 1.0)] * 4)
    faces.append((base, base + 1, base + 2, base + 3))
    uvs.extend([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])

    rows = int(WALL_H / (BRICK_H + JOINT))
    for row in range(rows):
        z0 = row * (BRICK_H + JOINT)
        z1 = z0 + BRICK_H
        if z1 > WALL_H:
            break

        # every course starts somewhere else, the way a real bond runs
        cursor = -WALL_Y - rng.uniform(0.0, BRICK_L)
        while cursor < WALL_Y:
            length = BRICK_L + rng.uniform(-JITTER, JITTER)
            y0 = cursor + JOINT / 2
            y1 = min(cursor + length - JOINT / 2, WALL_Y)
            cursor += length
            if y1 - y0 < 0.04:
                continue

            depth = side * rng.uniform(DEPTH_MIN, DEPTH_MAX)
            # a small per-corner wobble so the edges are not machine straight
            wob = lambda: rng.uniform(-0.0018, 0.0018)
            corners = [
                (x_face + depth, y0 + wob(), z0 + wob()),
                (x_face + depth, y1 + wob(), z0 + wob()),
                (x_face + depth, y1 + wob(), z1 + wob()),
                (x_face + depth, y0 + wob(), z1 + wob()),
            ]

            cell = rng.randrange(ATLAS_COLS * ATLAS_ROWS)
            cx = cell % ATLAS_COLS
            cy = cell // ATLAS_COLS
            u0 = (cx + 0.01) / ATLAS_COLS
            v0 = 1.0 - (cy + 0.99) / ATLAS_ROWS
            u1 = (cx + 0.99) / ATLAS_COLS
            v1 = 1.0 - (cy + 0.01) / ATLAS_ROWS
            # flip some bricks so the grain does not run the same way on all of them
            if rng.random() < 0.5:
                u0, u1 = u1, u0

            tint = rng.uniform(0.90, 1.06)
            warm = rng.uniform(0.96, 1.04)
            colour = (
                min(1.0, tint * warm),
                min(1.0, tint),
                min(1.0, tint * (2.0 - warm)),
                1.0,
            )

            base = len(verts)
            verts.extend(corners)
            colours.extend([colour] * 4)
            faces.append((base, base + 1, base + 2, base + 3))
            if side > 0:
                uvs.extend([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
            else:
                uvs.extend([(u1, v0), (u0, v0), (u0, v1), (u1, v1)])

    mesh = bpy.data.meshes.new(f"brick_{'right' if side > 0 else 'left'}")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for i, uv in enumerate(uvs):
        uv_layer.data[i].uv = uv

    colour_layer = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="POINT")
    for i, c in enumerate(colours):
        colour_layer.data[i].color = c

    obj = bpy.data.objects.new(f"side_wall_{'right' if side > 0 else 'left'}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(brick_material())
    return obj


def build():
    clear()
    build_wall(1, seed=11)
    build_wall(-1, seed=29)

    # mortar slab lives in its own material on the same objects? keep it simple:
    # the backing quads use the brick material with a dark vertex colour, which is
    # already close to mortar, so no second material is needed.

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "arkade-side-brick.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_vertex_color="MATERIAL",
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.0f} KB")


build()
