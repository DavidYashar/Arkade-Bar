"""Build a stylized riverbank cannon for The Narrows."""

import math
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_boat import OUT, cyl, plain, rod, rounded_box


def marker(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    olive = plain("Olive enamel", (.24, .28, .12, 1), .65, .12)
    edge = plain("Faded olive edges", (.34, .38, .19, 1), .58, .12)
    rubber = plain("Charcoal tires", (.036, .043, .039, 1), .88)
    dark = plain("Dark steel", (.08, .095, .085, 1), .48, .38)
    steel = plain("Barrel steel", (.27, .29, .27, 1), .42, .42)

    mount_height = .68
    carriage = marker("Carriage")
    marker("Carriage_Pivot", (0, 0, mount_height)).parent = carriage
    rounded_box("Axle housing", (.48, 1.20, .21), (0, 0, .34), olive).parent = carriage
    rounded_box("Trunnion cradle", (.58, .28, .29), (0, 0, .52), olive).parent = carriage
    for side in (-1, 1):
        y = side * .57
        for name, radius, width, material in [
            ("Tire", .32, .17, rubber), ("Sidewall", .26, .18, dark), ("Wheel hub", .15, .205, edge),
        ]:
            cyl(name, radius, width, (0, y, .32), material, (math.pi / 2, 0, 0)).parent = carriage
        start = (-.08, side * .20, .33)
        foot = (-1.18, side * .73, .10)
        rod("Splayed support", start, foot, .10, olive).parent = carriage
        rounded_box("Ground shoe", (.37, .31, .10), (foot[0], foot[1], .055), edge).parent = carriage
        rounded_box("Cradle cheek", (.52, .11, .32), (0, side * .19, .61), olive).parent = carriage
        cyl("Pivot cap", .10, .06, (0, side * .26, mount_height), edge, (math.pi / 2, 0, 0)).parent = carriage
    rod("Front support", (.12, 0, .30), (.74, 0, .10), .085, olive).parent = carriage
    rounded_box("Front ground shoe", (.26, .28, .095), (.76, 0, .05), edge).parent = carriage

    barrel = marker("Barrel")
    marker("Barrel_Pivot").parent = barrel
    rounded_box("Breech housing", (.75, .27, .32), (-.17, 0, 0), olive).parent = barrel
    rounded_box("Breech cap", (.21, .31, .35), (-.49, 0, 0), dark).parent = barrel
    rod("Barrel shroud", (.06, 0, 0), (.80, 0, 0), .092, dark).parent = barrel
    rod("Long barrel", (.69, 0, 0), (1.63, 0, 0), .055, steel).parent = barrel
    for y in (-.09, .09):
        rounded_box("Muzzle collar", (.24, .06, .12), (1.68, y, 0), dark).parent = barrel
    for z in (-.065, .065):
        rounded_box("Muzzle rim", (.095, .24, .045), (1.7525, 0, z), dark).parent = barrel
    marker("Muzzle", (1.80, 0, 0)).parent = barrel
    barrel.location.z = mount_height
    barrel.rotation_euler.y = -.24

    bpy.ops.export_scene.gltf(filepath=str(OUT / "narrows-cannon.glb"), export_format="GLB",
                              export_yup=True, export_apply=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
