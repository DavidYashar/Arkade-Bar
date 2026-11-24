"""Model and aim the wall-mounted light for the darts station."""

from math import radians
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parents[1] / "public/models/bar/arkade-darts-lights.glb"


def material(name, color, roughness, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def cylinder(name, center, axis, radius, depth, mat, front_radius=None):
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=radius,
                                   radius2=radius if front_radius is None else front_radius,
                                   depth=depth, location=center,
                                   rotation=axis.to_track_quat("Z", "Y").to_euler())
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    bevel = obj.modifiers.new("Soft metal edges", "BEVEL")
    bevel.width = .0015
    bevel.segments = 3
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def fixture(metal, brass, glass):
    # The dartboard is at local Y 0 and the chalkboard is at local Y +.66.
    lens = Vector((-.73, .33, .62))
    axis = (Vector((-.028, .33, .025)) - lens).normalized()
    wall = Vector((-.018, lens.y, .80))
    head = lens - .091 * axis
    pivot = Vector((head.x, lens.y, wall.z))

    cylinder("Darts lamp wall plate", wall, Vector((1, 0, 0)), .078, .024, metal)
    for start, end in ((wall, pivot), (pivot, head)):
        cylinder("Darts lamp mounting arm", (start + end) / 2, (end - start).normalized(),
                 .014, (end - start).length + .01, metal)
    cylinder("Darts lamp housing", lens - axis * .069, axis, .060, .127, metal, .109)
    cylinder("Darts lamp brass rim", lens - axis * .004, axis, .110, .014, brass)
    bulb = cylinder("Darts lamp visible bulb", lens + axis * .004, axis, .095, .006, glass)

    source = bpy.data.lights.new("Darts lamp wide beam", "SPOT")
    source.color = (1.0, .79, .56)
    source.energy = 24
    source.spot_size = radians(98)
    source.spot_blend = .65
    source.use_custom_distance = True
    source.cutoff_distance = 2.3
    light = bpy.data.objects.new(source.name, source)
    bpy.context.collection.objects.link(light)
    light.location = bulb.location + axis * .003
    light.rotation_euler = axis.to_track_quat("-Z", "Y").to_euler()


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    metal = material("Blackened bronze housings", (.045, .033, .024), .36, .60)
    brass = material("Brushed brass rims", (.33, .21, .081), .31, .70)
    glass = material("Warm spotlight lens", (1.00, .77, .48), .24, emission=3.8)

    fixture(metal, brass, glass)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_yup=True,
                              export_apply=True, export_cameras=False, export_lights=True,
                              export_import_convert_lighting_mode="RAW")


if __name__ == "__main__":
    build()
