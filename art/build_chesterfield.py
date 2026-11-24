"""Build the three-seat tufted leather couch for Arkade Bar."""

from math import cos, exp, pi, sin
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_jukebox import batch_materials, box, material


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/models/bar/chesterfield.glb"


def leather():
    """Bake a repeatable grain into color and normal maps for glTF."""
    size = 512
    rng = np.random.default_rng(831)
    frequencies = np.fft.fftfreq(size)
    radius = np.hypot(frequencies[:, None], frequencies[None, :])
    white = np.fft.fft2(rng.standard_normal((size, size)))

    def band(low, high):
        values = np.fft.ifft2(white * (np.exp(-(radius / high) ** 2) -
                                        np.exp(-(radius / low) ** 2))).real
        return values / values.std()

    mottles = band(.004, .022) * .035 + band(.022, .08) * .021
    pores = band(.08, .23) * .15 + band(.23, .42) * .04
    color = np.clip(np.array([.49, .259, .117])[None, None, :] *
                    (1 + mottles[:, :, None] + pores[:, :, None] * .09), 0, 1)
    dx = np.roll(pores, 1, axis=1) - np.roll(pores, -1, axis=1)
    dy = np.roll(pores, 1, axis=0) - np.roll(pores, -1, axis=0)
    normal = np.stack((dx, dy, np.ones_like(dx)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)

    mat = material("Cognac leather", (.22, .079, .024), .41)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    for label, values, colorspace in [
        ("Cognac grain", color, "sRGB"), ("Leather pores", normal * .5 + .5, "Non-Color"),
    ]:
        img = bpy.data.images.new(label, width=size, height=size, alpha=False)
        img.colorspace_settings.name = colorspace
        pixels = np.concatenate((values, np.ones((size, size, 1))), axis=2)
        img.pixels.foreach_set(pixels.astype(np.float32).ravel())
        img.pack()
        node = nodes.new("ShaderNodeTexImage")
        node.image = img
        if colorspace == "sRGB":
            links.new(node.outputs["Color"], shader.inputs["Base Color"])
        else:
            bump = nodes.new("ShaderNodeNormalMap")
            bump.inputs["Strength"].default_value = .16
            links.new(node.outputs["Color"], bump.inputs["Color"])
            links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


def mesh(name, vertices, faces, mat, uv_coords, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    uv = data.uv_layers.new()
    for face in data.polygons:
        face.use_smooth = smooth
        for loop in face.loop_indices:
            uv.data[loop].uv = uv_coords[data.loops[loop].vertex_index]
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def grid(name, point, rows, columns, mat, uv_scale, reverse=False):
    vertices = [point(col / columns, row / rows)
                for row in range(rows + 1) for col in range(columns + 1)]
    uvs = [(col / columns * uv_scale[0], row / rows * uv_scale[1])
           for row in range(rows + 1) for col in range(columns + 1)]
    stride = columns + 1
    faces = [(i, i + 1, i + stride + 1, i + stride)
             for row in range(rows) for col in range(columns) for i in [row * stride + col]]
    if reverse:
        faces = [face[::-1] for face in faces]
    return mesh(name, vertices, faces, mat, uvs)


def seam(name, points, radius, mat, closed=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 2
    line = data.splines.new("POLY")
    line.points.add(len(points) - 1)
    for node, (x, y, z) in zip(line.points, points):
        node.co = (x, y, z, 1)
    line.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)


def buttons(name, points, radius, mat):
    """Batch button and nail heads into a single rounded mesh facing the room."""
    cap = [(0, -.6, 0)]
    for spread, depth in ((.62, -.48), (1, -.15), (1, .2)):
        cap.extend((spread * cos(i * pi / 5), depth, spread * sin(i * pi / 5)) for i in range(10))
    pattern = [(0, i + 1, (i + 1) % 10 + 1) for i in range(10)]
    for start in (1, 11):
        pattern.extend((start + i, start + i + 10, start + (i + 1) % 10 + 10, start + (i + 1) % 10)
                       for i in range(10))
    vertices, faces = [], []
    for x, y, z in points:
        offset = len(vertices)
        vertices.extend((x + a * radius, y + b * radius, z + c * radius) for a, b, c in cap)
        faces.extend(tuple(offset + i for i in face) for face in pattern)
    return mesh(name, vertices, faces, mat, [(0, 0)] * len(vertices))


def tuft(u, v, depth):
    # Two crossing seam families form diamonds. Their intersections pull deeper for the buttons.
    a, b = abs(sin(pi * (u + v))), abs(sin(pi * (u - v)))
    crease = .12 * (exp(-(a / .19) ** 2) + exp(-(b / .19) ** 2))
    dimple = .72 * exp(-((a / .35) ** 2 + (b / .35) ** 2))
    fullness = .46 * (a * b) ** .65
    return depth * (fullness - crease - dimple)


def backrest(s, t):
    x = 1.024 * (2 * s - 1)
    z = .434 + .530 * t
    roll = max(0, (t - .83) / .17)
    padding = .018 * sin(pi * t) + tuft(x / .296, (z - .508) / .250, .075 * (1 - .8 * roll))
    return x * (1 - .030 * roll ** 2), .206 + .102 * t + .086 * roll ** 2 - padding, z


def back_cap(s, t):
    x, y, z = backrest(s, 1)
    return x, y + (.468 - y) * t, z + .008 * sin(pi * t) - .024 * t ** 2


def signed_power(x, power):
    return abs(x) ** power * (1 if x >= 0 else -1)


def cushion_outline(x, angle, width=1, depth=1):
    return x + .311 * width * signed_power(cos(angle), .24), -.126 + .367 * depth * signed_power(sin(angle), .26)


def cushion(x, mat, piping):
    # The rings round the seams into a soft crown while retaining a broad, flat seat.
    profile = [(.370, .87), (.378, .95), (.398, .99), (.447, 1), (.487, .99),
               (.506, .95), (.520, .87), (.531, .70), (.538, .46), (.542, .18), (.542, .002)]
    count = 96
    vertices, uvs = [], []
    for z, scale in profile:
        for j in range(count):
            px, py = cushion_outline(x, j * 2 * pi / count, scale, scale)
            vertices.append((px, py, z + .007 * sin(pi * (py + .493) / .734)))
            uvs.append(((px - x) * 1.7, py * 1.7))
    faces = [(row * count + j, row * count + (j + 1) % count,
              (row + 1) * count + (j + 1) % count, (row + 1) * count + j)
             for row in range(len(profile) - 1) for j in range(count)]
    faces.append(tuple(range(len(vertices) - count, len(vertices))))
    mesh("Seat cushion", vertices, faces, mat, uvs)
    for z, scale in [(.381, .965), (.505, .955)]:
        seam("Cushion welt", [(*cushion_outline(x, j * 2 * pi / count, scale, scale), z)
                             for j in range(count)], .0036, piping, True)


# This closed silhouette follows the upright post around the outward curl of each arm.
ARM = [(.924, .192), (1.145, .187), (1.165, .652), (1.244, .683),
       (1.286, .774), (1.246, .865), (1.141, .932), (1.019, .939),
       (.914, .890), (.853, .806), (.830, .681), (.840, .451)]


def arm_profile(u):
    count = len(ARM)
    position = u * count
    i, t = int(position), position % 1
    p0, p1, p2, p3 = [ARM[(i + offset) % count] for offset in (-1, 0, 1, 2)]
    return tuple(.5 * (2 * b + (-a + c) * t + (2*a - 5*b + 4*c - d) * t*t +
                         (-a + 3*b - 3*c + d) * t*t*t) for a, b, c, d in zip(p0, p1, p2, p3))


def arm(s, t, side):
    x, z = arm_profile(s)
    turn = max(0, min(1, (z - .66) / .18))
    width = .947 + .053 * sin(pi * t)
    detail = tuft(s * 6.0, t * 3.2, .039) * turn * sin(pi * t) ** .65
    return side * (1.044 + (x - 1.044) * width), -.510 + .994 * t, .555 + (z - .555) * width + detail


def arm_pad(cap, side, mat):
    rings = [(1, 0), (.965, .008), (.89, .017), (.65, .023), (.32, .026)]
    count = len(cap)
    cx, cz = side * 1.045, .555
    vertices = [(cx + (x - cx) * scale, y - bulge, cz + (z - cz) * scale)
                for scale, bulge in rings for x, y, z in cap]
    faces = [(row * count + i, row * count + (i + 1) % count,
              (row + 1) * count + (i + 1) % count, (row + 1) * count + i)
             for row in range(len(rings) - 1) for i in range(count)]
    faces.append(tuple(range(len(vertices) - count, len(vertices))))
    if side < 0:
        faces = [face[::-1] for face in faces]
    mesh("Padded scroll end", vertices, faces, mat, [(x * 1.8, z * 1.8) for x, _, z in vertices])


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hide = leather()
    welt = material("Dark leather welting", (.108, .033, .012), .47)
    button_leather = material("Covered leather buttons", (.178, .057, .017), .39)
    nail = material("Antique brass nail heads", (.39, .231, .103), .36, .62)
    wood = material("Dark turned walnut", (.066, .024, .010), .32)

    box("Upholstered base", 0, .005, .242, 2.244, .962, .254, hide, .048)
    box("Seat support", 0, .008, .355, 1.988, .924, .084, hide, .023)
    box("Back upholstery shell", 0, -.447, .655, 2.11, .092, .614, hide, .038)

    grid("Tensioned diamond tufting", backrest, 76, 230, hide, (3.4, .9))
    grid("Rolled top of backrest", back_cap, 12, 180, hide, (3.4, .14))
    back_buttons = []
    for row in range(4):
        z = .508 + .125 * row
        for col in range(-3, 4):
            x = (col + .5 * (row % 2)) * .296
            if abs(x) < .975:
                bx, by, bz = backrest((x / 1.024 + 1) / 2, (z - .434) / .530)
                back_buttons.append((bx, by - .007, bz))
    buttons("Deep-set back buttons", back_buttons, .010, button_leather)
    seam("Top back welt", [backrest(i / 160, 1) for i in range(161)], .004, welt)

    for center in (-.639, 0, .639):
        cushion(center, hide, welt)

    for side in (-1, 1):
        grid("Shaped rolled arm", lambda s, t: arm(s, t, side), 83, 146, hide,
             (1.75, 1.7), reverse=side > 0)
        cap = [arm(i / 160, 0, side) for i in range(160)]
        cap_uv = [(x * 1.8, z * 1.8) for x, _, z in cap]
        order = tuple(range(160)) if side > 0 else tuple(range(159, -1, -1))
        arm_pad(cap, side, hide)
        rear = [arm(i / 160, 1, side) for i in range(160)]
        mesh("Rear arm upholstery", rear, [order[::-1]], hide, cap_uv, smooth=False)
        seam("Rolled arm piping", [(x, y - .004, z) for x, y, z in cap], .005, welt, True)
        nailing = [((x - side * 1.045) * .92 + side * 1.045, y - .016, (z - .555) * .92 + .555)
                   for x, y, z in cap[::2]]
        buttons("Arm nailhead border", nailing, .0039, nail)

    for z in (.146, .325):
        seam("Front apron welt", [(-.958, -.476, z), (.958, -.476, z)], .004, welt)
        buttons("Apron nailhead border", [(-.948 + i * .017, -.481, z) for i in range(112)], .0036, nail)
    buttons("Apron buttons", [(i * .261, -.480, .225) for i in range(-3, 4)], .010, button_leather)

    for x in (-1.013, 1.013):
        for y in (-.388, .386):
            rings = [(.028, .012), (.034, .022), (.046, .066), (.054, .081),
                     (.055, .095), (.045, .101), (.063, .111), (.060, .152)]
            grid("Turned walnut foot",
                 lambda s, t: (x + rings[round(t * 7)][0] * cos(s * 2*pi),
                               y + rings[round(t * 7)][0] * sin(s * 2*pi), rings[round(t * 7)][1]),
                 7, 32, wood, (.25, .2))
            box("Concealed foot pad", x, -y, .007, .045, .043, .014, wood, .005)

    batch_materials("Chesterfield")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_yup=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
