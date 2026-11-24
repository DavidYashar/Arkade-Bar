"""The dartboard, built to the reference photo: sisal face, wire spider, brown rim.

The face is a textured disc, the wires are real geometry lying just proud of it, and
the rim is a ring. The board's face looks along -X, so it can be mounted on a wall
that faces the room.

    blender -b --python art/build_dartboard.py
"""

import math
import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

R = 0.2255          # a 451 mm board
DEPTH = 0.03


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def plain(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def face_material():
    mat = bpy.data.materials.new("board_face")
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(TEX / "dartboard.png"), check_existing=True)
    tex.interpolation = "Linear"
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def face_mesh(mat):
    segments = 96
    verts = [(0.0, 0.0, 0.0)]
    for i in range(segments):
        a = (i / segments) * math.tau
        verts.append((0.0, math.cos(a) * R, math.sin(a) * R))
    faces = []
    for i in range(segments):
        faces.append((0, 1 + i, 1 + (i + 1) % segments))

    mesh = bpy.data.meshes.new("board_face")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_i in poly.loop_indices:
            vi = mesh.loops[loop_i].vertex_index
            x, y, z = verts[vi]
            uv.data[loop_i].uv = (0.5 - y / (2 * R), 0.5 + z / (2 * R))

    ob = bpy.data.objects.new("board_face", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def body(mat):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=96, radius=R, depth=DEPTH,
        location=(DEPTH / 2 + 0.001, 0, 0), rotation=(0, math.pi / 2, 0),
    )
    ob = bpy.context.object
    ob.name = "board_body"
    ob.data.materials.append(mat)
    return ob


def rim(mat):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=R + 0.004, minor_radius=0.009,
        location=(0.004, 0, 0), rotation=(0, math.pi / 2, 0),
        major_segments=96, minor_segments=16,
    )
    ob = bpy.context.object
    ob.name = "board_rim"
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def wire(mat, start, end, radius=0.0007):
    """A straight piece of wire between two points on the face."""
    import mathutils

    p0 = mathutils.Vector(start)
    p1 = mathutils.Vector(end)
    mid = (p0 + p1) / 2
    delta = p1 - p0
    length = delta.length
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8, radius=radius, depth=length, location=mid,
    )
    ob = bpy.context.object
    ob.name = "wire"
    quat = delta.to_track_quat("Z", "Y")
    ob.rotation_euler = quat.to_euler()
    ob.data.materials.append(mat)
    return ob


def ring_wire(mat, radius_mm):
    r = radius_mm / 1000
    bpy.ops.mesh.primitive_torus_add(
        major_radius=r, minor_radius=0.0007,
        location=(-0.0008, 0, 0), rotation=(0, math.pi / 2, 0),
        major_segments=96, minor_segments=8,
    )
    ob = bpy.context.object
    ob.name = "wire_ring"
    ob.data.materials.append(mat)
    return ob


def build():
    clear()

    sisal = plain("board_sisal", (0.10, 0.08, 0.06, 1), 0.95)
    rim_mat = plain("board_rim", (0.34, 0.22, 0.12, 1), 0.45)
    steel = plain("board_wire", (0.75, 0.75, 0.72, 1), 0.3, 0.9)

    face_mesh(face_material())
    body(sisal)
    rim(rim_mat)

    # twenty radial wires, stopping at the doubles
    for i in range(20):
        a = -math.pi / 2 + (i + 0.5) * (math.tau / 20)
        outer = 0.170
        wire(steel, (-0.0008, 0.0, 0.0), (-0.0008, math.cos(a) * outer, math.sin(a) * outer))

    for mm in (6.35, 15.9, 99.0, 107.0, 162.0, 170.0):
        ring_wire(steel, mm)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "dartboard.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.0f} KB")


build()
