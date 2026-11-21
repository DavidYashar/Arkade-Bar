"""A potted palm, built from geometry rather than a sphere.

Run inside Blender through build_blockout.py, or on its own:

    blender -b --python art/palm.py
"""

import math

import bpy
from mathutils import Vector

UP = Vector((0, 0, 1))


def _material(name, color, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def _box(name, size, loc, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def _quad(verts, faces, a, b, c, d):
    i = len(verts)
    verts.extend([a, b, c, d])
    faces.append((i, i + 1, i + 2))
    faces.append((i, i + 2, i + 3))


def _leaflet(verts, faces, base, direction, length, width, droop):
    """One leaflet: a narrow blade that widens then comes to a point."""
    lateral = direction.cross(UP)
    if lateral.length < 1e-6:
        lateral = Vector((1, 0, 0))
    lateral.normalize()

    stations = [
        (0.0, width * 0.35, 0.0),
        (0.35, width, -droop * 0.25),
        (0.7, width * 0.7, -droop * 0.6),
        (1.0, 0.0, -droop),
    ]
    points = []
    for t, w, drop in stations:
        center = base + direction * (length * t) + UP * drop
        points.append((center - lateral * (w / 2), center + lateral * (w / 2)))

    for i in range(len(points) - 1):
        a, b = points[i]
        c, d = points[i + 1]
        _quad(verts, faces, a, c, d, b)


def build_palm(name, location, height=1.75, reach=1.02, fronds=18, seed=0):
    """A palm in a square planter: one leaf mesh, one pot."""
    x0, y0, z0 = location
    pot_h = 0.78
    pot_w = 0.78

    pot = _material(f"{name}_pot", (0.075, 0.070, 0.065, 1), 0.75)
    soil = _material(f"{name}_soil", (0.10, 0.065, 0.04, 1), 0.95)
    leaf = _material(f"{name}_leaf", (0.050, 0.185, 0.060, 1), 0.5)

    _box(f"{name}_pot", (pot_w, pot_w, pot_h), (x0, y0, z0 + pot_h / 2), pot, bevel=0.03)
    _box(f"{name}_rim", (pot_w + 0.05, pot_w + 0.05, 0.06), (x0, y0, z0 + pot_h - 0.03), pot, bevel=0.02)
    _box(f"{name}_soil", (pot_w - 0.10, pot_w - 0.10, 0.05), (x0, y0, z0 + pot_h - 0.04), soil)

    verts = []
    faces = []
    top = z0 + pot_h

    for f in range(fronds):
        angle = (2 * math.pi * f / fronds) + (seed * 0.37) + math.sin(f * 2.3 + seed) * 0.10
        fh = height * (0.70 + 0.30 * (((f * 7 + seed) % 5) / 5))
        fr = reach * (0.78 + 0.28 * (((f * 3 + seed) % 4) / 4))

        n = 32
        pts = []
        for i in range(n + 1):
            t = i / n
            r = fr * (t ** 1.12)
            z = fh * (1 - (1 - t) ** 1.45) - 0.55 * fh * (t ** 3)
            pts.append(Vector((x0 + r * math.cos(angle), y0 + r * math.sin(angle), top + z)))

        # rachis: a thin ribbon along the spine
        side = Vector((-math.sin(angle), math.cos(angle), 0)) * 0.012
        for i in range(n):
            a, b = pts[i], pts[i + 1]
            _quad(verts, faces, a - side, a + side, b + side, b - side)

        # leaflets, paired along the rachis
        for i in range(2, n):
            t = i / n
            p = pts[i]
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
            lateral = Vector((-math.sin(angle), math.cos(angle), 0))
            length = 0.62 * (math.sin(math.pi * min(1.0, 0.06 + t * 0.94)) ** 0.5)
            if length < 0.05:
                continue
            for s in (-1, 1):
                lift = 0.22 + 0.16 * math.sin(f * 1.7 + i * 0.6)
                direction = (lateral * (s * 0.95) + tangent * 0.55 + UP * lift).normalized()
                _leaflet(verts, faces, p, direction, length, 0.085, 0.10)

    mesh = bpy.data.meshes.new(f"{name}_fronds")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    ob = bpy.data.objects.new(f"{name}_fronds", mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(leaf)
    return ob


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_palm("palm_left", (-3.2, -10.0, 0.0), seed=1)
    build_palm("palm_right", (3.2, -10.0, 0.0), seed=4)
    bpy.ops.wm.save_as_mainfile(filepath="//palm_preview.blend")
    print("saved palm_preview.blend")


if __name__ == "__main__":
    main()
