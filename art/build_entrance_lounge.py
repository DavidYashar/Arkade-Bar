"""Build the entrance coffee table and woven rug in Blender."""

from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_jukebox import batch_materials, finish, material


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/models/bar/entrance-lounge.glb"
RUG_Y, RUG_TOP = -.80, .012


def rounded_outline(width, depth, radius, y=0):
    points = []
    for corner, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        for step in range(17):
            angle = (corner + step / 16) * pi / 2
            points.append((sx * (width / 2 - radius) + radius * cos(angle),
                           y + sy * (depth / 2 - radius) + radius * sin(angle)))
    return points


def slab(name, width, depth, radius, y, bottom, top, mat, bevel):
    outline = rounded_outline(width, depth, radius, y)
    count = len(outline)
    vertices = [(x, py, z) for z in (top, bottom) for x, py in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2 * count)))]
    faces.extend((i, i + count, (i + 1) % count + count, (i + 1) % count)
                 for i in range(count))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    uv = data.uv_layers.new()
    for face in data.polygons:
        for index in face.loop_indices:
            x, py, _ = vertices[data.loops[index].vertex_index]
            uv.data[index].uv = (x / width + .5, (py - y) / depth + .5)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat, bevel)


def tapered_leg(name, foot, top, foot_radius, top_radius, mat):
    axis = Vector(top) - Vector(foot)
    center = Vector(foot) + axis * .5
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=foot_radius, radius2=top_radius,
                                  depth=axis.length, location=center,
                                  rotation=axis.to_track_quat("Z", "Y").to_euler())
    obj = finish(bpy.context.object, name, mat, .002)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4


def weave():
    """Create a flatweave with paired pinstripes and a muted olive border."""
    size = 1024
    y, x = np.indices((size, size))
    border_distance = np.minimum.reduce((x, y, size - 1 - x, size - 1 - y))
    rng = np.random.default_rng(631)
    yarn = np.where((x // 2 + y // 2) % 2, -.050, .046)
    fibers = rng.normal(0, .034, (size, size)) + rng.normal(0, .021, (1, size))
    shade = 1 + yarn + fibers
    colors = np.empty((size, size, 3), dtype=np.float32)
    colors[:] = (.53, .47, .36)
    colors[border_distance < 85] = (.29, .30, .245)
    colors[border_distance < 8] = (.195, .195, .160)
    for low, high in ((22, 26), (31, 34), (70, 74)):
        colors[(border_distance >= low) & (border_distance < high)] = (.64, .555, .408)

    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(colors * shade[:, :, None], 0, 1)
    image = bpy.data.images.new("Olive and flax flatweave", width=size, height=size, alpha=False)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    mat = material("Woven wool", (.27, .22, .14), .94)
    nodes = mat.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    mat.node_tree.links.new(texture.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return mat


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    walnut = material("Walnut tabletop", (.24, .103, .039), .36, grain="wood-rail.png")
    edge = material("End-grain walnut", (.15, .057, .020), .45)
    steel = material("Dark bronze legs", (.061, .044, .030), .35, .65)
    foot = material("Brushed brass ferrules", (.40, .235, .095), .34, .6)

    slab("Cloth rug", 3.18, 3.10, .105, RUG_Y, .003, RUG_TOP, weave(), .003)
    slab("Softened walnut tabletop", 1.40, .66, .235, 0, .391, .443, walnut, .013)
    slab("Recessed table apron", 1.15, .50, .163, 0, .365, .395, edge, .009)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mount = (sx * .477, sy * .181, .384)
            pad = (sx * .548, sy * .227, RUG_TOP)
            joint = (pad[0] * .994, pad[1] * .990, .048)
            tapered_leg("Tapered coffee table leg", joint, mount, .015, .029, steel)
            tapered_leg("Brass foot", pad, joint, .013, .016, foot)

    batch_materials("Entrance lounge")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_yup=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
