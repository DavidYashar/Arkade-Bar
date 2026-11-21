"""The blackjack table: felt, padded leather rim, wood rail, turned pedestal.

Run:

    blender -b --python art/build_table.py

Exports public/models/bar/table.glb with the textures embedded.
"""

import math
import pathlib

import bpy

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "public" / "models" / "bar"
TEX = ROOT / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def image_material(name, image_path, roughness=0.6, repeat=1.0, tint=(1, 1, 1, 1)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree
    bsdf = nodes.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Base Color"].default_value = tint

    tex = nodes.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(image_path), check_existing=True)
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"

    coord = nodes.nodes.new("ShaderNodeTexCoord")
    mapping = nodes.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (repeat, repeat, 1)
    nodes.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nodes.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nodes.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nodes.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    return mat


def plain_material(name, color, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def cylinder(name, r_bottom, r_top, depth, loc, mat, verts=96):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r_bottom, radius2=r_top, depth=depth, location=loc
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def torus(name, major, minor, loc, mat, major_seg=96, minor_seg=20):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        location=loc,
        major_segments=major_seg,
        minor_segments=minor_seg,
    )
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def smooth(ob):
    for poly in ob.data.polygons:
        poly.use_smooth = True


def build():
    clear()

    felt = image_material("felt", TEX / "felt.png", roughness=0.95, repeat=3)
    wood = image_material("rail_wood", TEX / "wood-rail.png", roughness=0.42, repeat=8)
    leather = plain_material("rail_leather", (0.34, 0.18, 0.10, 1), 0.45)
    dark = plain_material("table_dark", (0.10, 0.07, 0.05, 1), 0.55)
    brass = plain_material("brass", (0.30, 0.22, 0.09, 1), 0.45, metallic=0.6)

    # pedestal, turned: three stacked rings
    cylinder("foot", 0.46, 0.40, 0.06, (0, 0, 0.03), dark)
    cylinder("post", 0.16, 0.13, 0.56, (0, 0, 0.33), dark)
    torus("post_ring", 0.17, 0.035, (0, 0, 0.20), brass, 64, 12)
    cylinder("hub", 0.34, 0.30, 0.10, (0, 0, 0.66), dark)

    # table body: a thick disc that the felt and rails sit on
    cylinder("body", 1.40, 1.36, 0.10, (0, 0, 0.76), dark)

    # felt, inset under the rim
    felt_disc = cylinder("felt_top", 1.26, 1.26, 0.035, (0, 0, 0.835), felt)
    smooth(felt_disc)

    # wood rail around the outside, rounded
    torus("rail_wood", 1.33, 0.095, (0, 0, 0.83), wood, 120, 28)
    smooth(bpy.context.object)

    # leather pad on the rail, the part your wrists rest on
    torus("rail_leather", 1.33, 0.052, (0, 0, 0.885), leather, 120, 20)
    smooth(bpy.context.object)

    # brass trim just inside the rail
    torus("trim", 1.235, 0.012, (0, 0, 0.856), brass, 120, 10)

    # export
    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "table.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.1f} KB")


build()
