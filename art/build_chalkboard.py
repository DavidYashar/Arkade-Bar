"""The chalkboard: a dark slate in a mitred walnut frame, portrait.

Size 0.50 x 0.74 m, frame 0.06 m wide, 0.03 m deep. Faces -X, so it hangs on a wall
that looks into the room.

    blender -b --python art/build_chalkboard.py
"""

import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

W = 0.50
H = 0.74
F = 0.06
D = 0.048


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def image_material(name, path, roughness=0.5, repeat=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(path), check_existing=True)
    coord = nodes.nodes.new("ShaderNodeTexCoord")
    mapping = nodes.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (repeat, repeat, 1)
    nodes.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nodes.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def plain(name, color, roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def prism(name, corners, x_front, x_back, mat):
    """A four cornered prism, extruded between two X planes."""
    verts = [(x_front, y, z) for y, z in corners] + [(x_back, y, z) for y, z in corners]
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def build():
    clear()
    walnut = image_material("chalk_frame", TEX / "walnut-frame.png", roughness=0.38, repeat=1.4)
    slate = plain("chalk_slate", (0.045, 0.048, 0.050, 1), 0.88)

    # four mitred rails: each trapezoid runs from an outer corner to the inner opening
    hw, hh = W / 2, H / 2
    iw, ih = hw - F, hh - F
    rails = [
        [(-hw, hh), (hw, hh), (iw, ih), (-iw, ih)],          # top
        [(-hw, -hh), (-iw, -ih), (iw, -ih), (hw, -hh)],      # bottom
        [(-hw, hh), (-hw, -hh), (-iw, -ih), (-iw, ih)],      # left
        [(hw, hh), (iw, ih), (iw, -ih), (hw, -hh)],          # right
    ]
    for i, corners in enumerate(rails):
        rail = prism(f"rail_{i}", corners, -D, 0.0, walnut)
        bev = rail.modifiers.new("round", "BEVEL")
        bev.width = 0.006
        bev.segments = 3
        bev.limit_method = "ANGLE"

    # the slate sits just inside the opening
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-D + 0.020, 0, 0))
    board = bpy.context.object
    board.name = "slate"
    board.scale = (0.012, iw * 2, ih * 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    board.data.materials.append(slate)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "chalkboard.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.1f} KB")


build()
