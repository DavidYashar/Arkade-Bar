"""Build the gray patrol boat for The Narrows."""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_boat import OUT, mesh, plain, recalculate_normals, rod, rounded_box


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gray = plain("Patrol gray", (.22, .25, .28, 1), .51, .16)
    deck = plain("Light gray deck paint", (.36, .39, .40, 1), .56)
    charcoal = plain("Dark rails and mast", (.07, .085, .092, 1), .46, .22)
    glass = plain("Blue gray bridge glass", (.07, .15, .18, 1), .29, .14)
    stripe = plain("Light gray bow marking", (.56, .60, .61, 1), .55)

    stations = [(1.48, .035, .37), (1.04, .40, .32), (.52, .66, .31),
                (-.52, .68, .30), (-1.33, .50, .30), (-1.46, .33, .30)]
    points = []
    for y, beam, freeboard in stations:
        points.extend([(-beam, y, freeboard), (beam, y, freeboard),
                       (-beam * .68, y, -.05), (beam * .68, y, -.05)])
    faces = [(0, 2, 3, 1)]
    for i in range(0, len(points) - 4, 4):
        j = i + 4
        faces.extend([(i, i + 1, j + 1, j), (i, j, j + 2, i + 2),
                      (i + 1, i + 3, j + 3, j + 1), (i + 2, j + 2, j + 3, i + 3)])
    j = len(points) - 4
    faces.append((j, j + 1, j + 3, j + 2))
    hull = mesh("Angular patrol hull", points, faces, gray)
    hull.data.materials.append(deck)
    hull.data.materials.append(stripe)
    for i, face in enumerate(hull.data.polygons):
        if i % 4 == 1 and i < len(faces) - 1:
            face.material_index = 1
        elif i in (2, 3):
            face.material_index = 2
    recalculate_normals(hull)

    # Low, forward-sloping wheelhouse with four paneled front windows.
    cabin_points = [(-.47, .59, .32), (.47, .59, .32), (.47, -.66, .31), (-.47, -.66, .31),
                    (-.37, .30, .80), (.37, .30, .80), (.39, -.62, .80), (-.39, -.62, .80)]
    cabin = mesh("Sloped bridge cabin", cabin_points, [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5),
                 (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], gray)
    recalculate_normals(cabin)
    for i, x in enumerate((-.29, -.096, .096, .29)):
        rounded_box(f"Bridge windscreen {i + 1}", (.158, .018, .23), (x, .424, .617), glass).rotation_euler.x = math.radians(31)
    rounded_box("Bridge roof rim", (.82, .96, .058), (0, -.16, .803), deck)
    for side in (-1, 1):
        for y in (-.06, -.33, -.54):
            rounded_box("Side bridge window", (.02, .17, .19), (side * .413, y, .666), glass, .01)
        x = side * .49
        rod("Aft safety rail", (x, -.67, .47), (side * .39, -1.23, .47), .014, charcoal)
        for y in (-.72, -1.00):
            rod("Aft rail stanchion", (side * .45, y, .30), (side * .45, y, .47), .013, charcoal)
        rod("Raked radar mast", (side * .25, -.46, .83), (side * .105, -.49, 1.17), .024, charcoal)
    rod("Radar crossbar", (-.17, -.49, 1.04), (.17, -.49, 1.04), .018, charcoal)
    rounded_box("Radar dome", (.24, .13, .08), (0, -.49, 1.18), deck)
    rounded_box("Bow deck fitting", (.19, .22, .10), (0, .83, .39), charcoal)
    marker = bpy.data.objects.new("Muzzle", None)
    bpy.context.collection.objects.link(marker)
    marker.location = (0, .94, .41)

    bpy.ops.export_scene.gltf(filepath=str(OUT / "narrows-patrol-boat.glb"), export_format="GLB",
                              export_yup=True, export_apply=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
