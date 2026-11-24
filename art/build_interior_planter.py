"""Export the two-tone foliage and rounded pot used in the interior corners."""

from math import cos, pi, sin, tau
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_entrance_planter import UP, curve, material, mesh_object, potting_mix, strand, vessel


OUT = Path(__file__).resolve().parents[1] / "public/models/bar/arkade-interior-planter.glb"
PALETTES = (
    ((0.018, 0.21, 0.17), (0.043, 0.53, 0.37), (0.094, 0.071, 0.29)),
    ((0.064, 0.021, 0.18), (0.37, 0.040, 0.29), (0.015, 0.18, 0.24)),
    ((0.014, 0.10, 0.23), (0.034, 0.33, 0.48), (0.23, 0.04, 0.32)),
)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    vessel(material("Pearlescent lavender ceramic", (0.67, 0.65, 0.76), 0.30, 0.32), [
        (0.002, 0.002), (0.189, 0.002), (0.229, 0.019), (0.276, 0.061),
        (0.314, 0.128), (0.334, 0.218), (0.337, 0.315), (0.315, 0.437),
        (0.298, 0.487), (0.290, 0.500), (0.278, 0.498), (0.269, 0.488),
        (0.266, 0.468), (0.269, 0.439), (0.259, 0.360), (0.234, 0.13), (0.002, 0.13),
    ], name="Rounded lavender pot")
    potting_mix(material("Dark potting mix", (0.047, 0.026, 0.034), 0.94))
    stems = curve("Violet stems", material("Stems", (0.088, 0.042, 0.153), 0.49), 0.010)
    ribs = curve("Magenta midribs", material("Magenta midribs", (0.49, 0.084, 0.29), 0.50), 0.0015)
    veins = curve("Fine leaf veins", material("Fine leaf veins", (0.23, 0.086, 0.26), 0.50), 0.0008)
    veins.data.bevel_resolution = 0
    leaf_mat = material("Satin variegated foliage", (1, 1, 1), 0.39, 0.18)
    vertices, faces, tones = [], [], []
    leaves = [
        # Azimuth, blade base height, horizontal reach, tip rise, half-width, tilt, palette.
        (19, .74, .67, .05, .162, .39, 1), (87, .79, .62, .21, .153, -.42, 0),
        (151, .77, .63, .10, .164, .49, 2), (212, .75, .69, .14, .167, -.44, 0),
        (277, .78, .60, -.02, .154, .48, 1), (339, .82, .54, .26, .143, -.39, 2),
        (45, .87, .59, .39, .140, .22, 1), (112, .95, .37, .60, .125, -.50, 2),
        (183, .92, .52, .49, .146, -.35, 0), (246, .93, .37, .63, .129, .33, 1),
        (314, .91, .58, .52, .144, -.26, 2), (4, .97, .29, .60, .106, .39, 0),
        (142, .71, .43, .18, .126, -.16, 0), (293, .71, .49, .07, .138, -.23, 1),
    ]
    for index, (azimuth, height, reach, rise, half_width, tilt, palette) in enumerate(leaves):
        angle = azimuth * pi / 180
        direction = Vector((cos(angle), sin(angle), 0))
        across = Vector((-sin(angle), cos(angle), 0))
        rolled = across * cos(tilt) + UP * sin(tilt)
        base = direction * 0.12 + UP * height
        times = (0, .17, .36, .56, .76, 1)
        strand(stems, [direction * (.031 + .089 * t * t) + UP * (.447 + (height - .447) * t) for t in times],
               (1.18, 1, .93, .78, .67, .50))

        def blade(t, u):
            center = base + direction * (reach * t) + UP * (rise * t + .14 * sin(pi * t))
            center += across * (.044 * sin(pi * t) * cos(index))
            width = half_width * max(.008, sin(pi * t) ** .78) * (1.1 - .30 * t)
            fold = ((.052 * abs(u) ** 1.4) + .008 * sin(t * 60) * u * u) * sin(pi * t)
            return center + rolled * (u * width) - UP * fold

        dark, light, edge = [Vector(rgb) for rgb in PALETTES[palette]]
        start, rows, columns = len(vertices), 28, 12
        for i in range(rows + 1):
            t = i / rows
            for j in range(columns + 1):
                u = 2 * j / columns - 1
                vertices.append(blade(t, u))
                stripe = .5 + .5 * cos((t - .14 * abs(u)) * tau * 11)
                fill = dark.lerp(light, (.37 + .41 * sin(pi * t)) * (.86 + .14 * stripe))
                fill = fill.lerp(edge, abs(u) ** 1.8 * .77)
                tones.append((*fill, 1))
        for i in range(rows):
            for j in range(columns):
                a = start + i * (columns + 1) + j
                faces.append((a, a + columns + 1, a + columns + 2, a + 1))
        steps = [i / 22 for i in range(23)]
        strand(ribs, [blade(t, 0) + UP * .0017 for t in steps], [1.7 - 1.5 * t for t in steps])
        for t in (.14, .22, .30, .38, .46, .54, .62, .70, .78, .86):
            for side in (-1, 1):
                points = [blade(t + .093 * u, side * u) + UP * .0014 for u in (0, .21, .43, .66, .86)]
                strand(veins, points, (.76, .66, .50, .28, .10))

    leaves_mesh = mesh_object("Teal and purple foliage", vertices, faces, leaf_mat).data
    colors = leaves_mesh.color_attributes.new(name="Leaf colors", type="FLOAT_COLOR", domain="POINT")
    leaves_mesh.color_attributes.active_color = colors
    for i, rgba in enumerate(tones):
        colors.data[i].color = rgba

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = stems
    bpy.ops.object.convert(target="MESH")
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_vertex_color="ACTIVE",
                              export_yup=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
