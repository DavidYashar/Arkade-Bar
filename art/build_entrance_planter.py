"""Build a broad-leaf plant in a glazed stoneware pot for the bar entrance."""

from math import cos, pi, sin, tau
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parents[1] / "public/models/bar/arkade-entrance-planter.glb"
UP = Vector((0, 0, 1))


def material(name, color, roughness, coat=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = 0.33
    return mat


def mesh_object(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    return obj


def vessel(mat, profile=None, name="Pale sage stoneware"):
    # The profile runs from the base to the rounded lip, then down the inside.
    profile = profile or [
        (0.002, 0.002), (0.236, 0.002), (0.261, 0.017), (0.278, 0.039),
        (0.285, 0.075), (0.298, 0.415), (0.299, 0.477), (0.296, 0.491),
        (0.287, 0.500), (0.275, 0.497), (0.268, 0.485), (0.266, 0.470),
        (0.249, 0.090), (0.002, 0.090),
    ]
    steps = 64
    vertices = [(r * cos(tau * j / steps), r * sin(tau * j / steps), z)
                for r, z in profile for j in range(steps)]
    faces = []
    for i in range(len(profile) - 1):
        for j in range(steps):
            k = (j + 1) % steps
            faces.append((i * steps + j, i * steps + k, (i + 1) * steps + k, (i + 1) * steps + j))
    mesh_object(name, vertices, faces, mat)


def potting_mix(mat):
    rng = Random(63)
    steps = 48
    vertices = [(0, 0, 0.452)]
    for ring in range(1, 8):
        radius = 0.265 * ring / 7
        for j in range(steps):
            angle = tau * j / steps
            vertices.append((radius * cos(angle), radius * sin(angle), 0.450 + rng.uniform(-0.008, 0.008)))
    faces = [(0, 1 + j, 1 + (j + 1) % steps) for j in range(steps)]
    for i in range(6):
        current = 1 + i * steps
        next_ring = current + steps
        for j in range(steps):
            k = (j + 1) % steps
            faces.append((current + j, next_ring + j, next_ring + k, current + k))
    mesh_object("Textured potting soil", vertices, faces, mat)


def curve(name, mat, depth):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = depth
    data.bevel_resolution = 2
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    return obj


def strand(curve_object, points, thickness):
    spline = curve_object.data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for i, (point, radius) in enumerate(zip(points, thickness)):
        spline.points[i].co = (*point, 1)
        spline.points[i].radius = radius


def foliage(leaf_mats, petiole_mat, vein_mat):
    stalks = curve("Green stalks", petiole_mat, 0.012)
    veins = curve("Leaf veins", vein_mat, 0.001)
    leaves = [
        # azimuth, blade origin height, radial spread, blade rise, half width, hue
        (18, 0.86, 0.55, 0.14, 0.135, 1),
        (158, 0.99, 0.64, 0.13, 0.155, 0),
        (282, 0.89, 0.42, 0.11, 0.111, 2),
        (80, 1.08, 0.49, 0.31, 0.130, 1),
        (224, 1.08, 0.61, 0.31, 0.150, 0),
        (323, 1.10, 0.61, 0.27, 0.152, 0),
        (126, 1.17, 0.49, 0.62, 0.137, 2),
        (349, 1.20, 0.53, 0.65, 0.131, 1),
        (193, 1.16, 0.32, 0.69, 0.124, 1),
        (264, 1.03, 0.27, 0.54, 0.109, 2),
        (54, 0.72, 0.31, 0.12, 0.078, 2),
        (190, 0.72, 0.27, 0.11, 0.079, 1),
    ]
    for index, (degrees, height, spread, rise, half_width, hue) in enumerate(leaves):
        angle = degrees * pi / 180
        radial = Vector((cos(angle), sin(angle), 0))
        side = Vector((-sin(angle), cos(angle), 0))
        base = radial * 0.15 + UP * height
        stalk_points = [radial * (0.037 + 0.113 * t * t) + UP * (0.447 + (height - 0.447) * t)
                        for t in (0, 0.18, 0.35, 0.55, 0.72, 0.87, 1)]
        strand(stalks, stalk_points, (1.15, 1.05, 0.94, 0.85, 0.74, 0.65, 0.53))

        def blade(t, u):
            center = base + radial * (spread * t) + UP * (rise * t + 0.10 * sin(pi * t))
            center += side * (0.031 * sin(pi * t + index * 0.45) * t)
            width = half_width * max(0.005, sin(pi * t) ** 0.84) * (1.10 - 0.25 * t)
            lift = (0.03 * u * u + 0.018 * u * sin(t * 5 + index)) * sin(pi * t)
            return center + side * (u * width) - UP * lift

        length_steps, width_steps = 22, 8
        vertices = [blade(i / length_steps, 2 * j / width_steps - 1)
                    for i in range(length_steps + 1) for j in range(width_steps + 1)]
        faces = []
        stride = width_steps + 1
        for i in range(length_steps):
            for j in range(width_steps):
                a = i * stride + j
                faces.append((a, a + stride, a + stride + 1, a + 1))
        mesh_object("Pointed leaf", vertices, faces, leaf_mats[hue])
        steps = [i / 18 for i in range(19)]
        strand(veins, [blade(t, 0) + UP * 0.0017 for t in steps], [2.3 - 2.1 * t for t in steps])
        for t in (0.22, 0.34, 0.46, 0.58, 0.70):
            for sign in (-1, 1):
                strand(veins, [blade(t + 0.12 * u, sign * u) + UP * 0.0015
                               for u in (0, 0.25, 0.50, 0.72, 0.88)],
                       (0.68, 0.57, 0.44, 0.28, 0.08))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    vessel(material("Sage ceramic glaze", (0.55, 0.65, 0.54), 0.37, 0.28))
    potting_mix(material("Dark potting mix", (0.049, 0.028, 0.018), 0.96))
    foliage([
        material("Deep green foliage", (0.040, 0.155, 0.018), 0.40, 0.20),
        material("Fresh green foliage", (0.076, 0.233, 0.024), 0.41, 0.17),
        material("Young lime foliage", (0.144, 0.308, 0.034), 0.44, 0.12),
    ], material("Stems", (0.098, 0.202, 0.038), 0.56),
       material("Leaf ribs", (0.16, 0.29, 0.046), 0.59))

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.data.objects["Green stalks"]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_yup=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
