"""The dart, to the reference photo.

A 140 mm steel tip dart, in the reference's proportions:

    point    30 mm   slim steel needle
    barrel   32 mm   brass, two collars and a fine knurled grip
    shaft    24 mm   dark green, tapering
    flight   49 mm   four curved green fins with rounded shoulders

The point is at the origin and the dart runs along +X, so a dart can be placed
exactly where it entered the board.

    blender -b --python art/build_dart.py
"""

import math
import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
OUT.mkdir(parents=True, exist_ok=True)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def plain(name, color, roughness=0.4, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def tube(name, radius, length, x0, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=length,
        location=(x0 + length / 2, 0, 0), rotation=(0, math.pi / 2, 0),
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def cone(name, r_front, r_back, length, x0, mat, vertices=32):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=r_front, radius2=r_back, depth=length,
        location=(x0 + length / 2, 0, 0), rotation=(0, math.pi / 2, 0),
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def ring(name, radius, x, mat, minor=0.0003):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius, minor_radius=minor,
        location=(x, 0, 0), rotation=(0, math.pi / 2, 0),
        major_segments=32, minor_segments=6,
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def leaf_fin(name, mat, angle):
    """Sweep a single radial fin from the shaft to its rounded trailing edge."""
    profile = (
        ((.0905, .0007), (.099, .007), (.107, .017), (.122, .0198)),
        ((.122, .0198), (.132, .0217), (.1379, .0184), (.1391, .0150)),
        ((.1391, .0150), (.1403, .0116), (.1408, .0060), (.1408, .0007)),
    )
    edge = [profile[0][0]]
    steps, across = 12, 8
    for controls in profile:
        for step in range(1, steps + 1):
            t = step / steps
            s = 1 - t
            weights = (s**3, 3 * s * s * t, 3 * s * t * t, t**3)
            edge.append(tuple(sum(weight * point[i] for weight, point in zip(weights, controls))
                              for i in (0, 1)))

    verts = []
    shades = []
    for x, radius in edge:
        for j in range(across + 1):
            u = j / across
            camber = radius * .115 * math.sin(math.pi * u)
            verts.append((x, radius * u, camber))
            brightness = .78 + .22 * u + .24 * u**10
            shades.append((.085 * brightness, .245 * brightness, .035 * brightness, 1))

    faces = []
    for i in range(len(edge) - 1):
        for j in range(across):
            a = i * (across + 1) + j
            b = a + 1
            c = a + (across + 1)
            d = c + 1
            faces.append((a, c, d, b))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    tint = mesh.color_attributes.new(name="Fin tint", type="FLOAT_COLOR", domain="POINT")
    for value, color in zip(tint.data, shades):
        value.color = color
    mesh.color_attributes.active_color = tint
    for face in mesh.polygons:
        face.use_smooth = True

    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = (math.radians(angle), 0, 0)

    solid = ob.modifiers.new("thickness", "SOLIDIFY")
    solid.thickness = 0.00065
    solid.offset = 0
    bevel_mod = ob.modifiers.new("edge", "BEVEL")
    bevel_mod.width = 0.00022
    bevel_mod.segments = 2
    bevel_mod.limit_method = "ANGLE"
    ob.data.materials.append(mat)
    return ob


def build():
    clear()

    steel = plain("dart_steel", (0.80, 0.81, 0.83, 1), 0.15, 1.0)
    brass = plain("dart_brass", (0.46, 0.33, 0.13, 1), 0.30, 0.92)
    brass_dark = plain("dart_brass_dark", (0.30, 0.21, 0.08, 1), 0.42, 0.85)
    flight = plain("Olive green dart fins", (1, 1, 1, 1), 0.49)
    nodes = flight.node_tree.nodes
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Fin tint"
    flight.node_tree.links.new(tint.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    shaft_green = plain("dart_shaft", (0.02, 0.13, 0.05, 1), 0.35)

    # point: 30 mm
    cone("point", 0.00005, 0.0016, 0.028, 0.0, steel)
    tube("point_shoulder", 0.0017, 0.004, 0.028, steel)

    # barrel: 32 mm from 0.031 to 0.063
    tube("barrel_front", 0.0030, 0.005, 0.031, brass)
    cone("barrel_step", 0.0030, 0.0036, 0.004, 0.036, brass)
    tube("grip", 0.0036, 0.020, 0.040, brass_dark)
    for i in range(2):
        ring(f"grip_edge_{i}", 0.00362, 0.0405 + i * 0.019, brass, 0.00016)
    cone("barrel_tail", 0.0036, 0.0028, 0.005, 0.060, brass)
    tube("barrel_back", 0.0028, 0.003, 0.065, brass)

    # shaft: 24 mm, dark green, tapering into the flight
    cone("shaft", 0.0026, 0.0016, 0.024, 0.068, shaft_green)
    ring("shaft_collar", 0.0019, 0.091, brass, 0.0003)

    # Four separate leaves meet at the shaft, with no overlapping full-width wings.
    for angle in (0, 90, 180, 270):
        leaf_fin(f"flight_{angle}", flight, angle)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "dart.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.0f} KB")


build()
