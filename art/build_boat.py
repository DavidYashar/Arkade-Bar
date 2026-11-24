"""The rescue boat: a rigid inflatable hull with a bow gun.

Bow points along +Y in Blender, so on export (Y up) the bow points along -Z in
three, which is forward for the camera we chase it with.

    blender -b --python art/build_boat.py
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


def mesh(name, verts, faces, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if smooth:
        for poly in ob.data.polygons:
            poly.use_smooth = True
    return ob


def box(name, size, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    return ob


def cyl(name, radius, depth, loc, mat, rot=(0, 0, 0), vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def recalculate_normals(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def hull(mat):
    """A V hull: pointed bow, wide midship, squared stern, keel along the bottom."""
    stations = [
        (1.62, 0.02, 0.30),   # bow tip
        (1.24, 0.34, 0.34),
        (0.55, 0.58, 0.36),
        (-0.35, 0.60, 0.36),
        (-1.30, 0.50, 0.32),  # stern
    ]
    verts = []
    for y, half, deck_z in stations:
        verts.append((-half, y, deck_z))        # deck left
        verts.append((half, y, deck_z))         # deck right
        verts.append((-half * .45, y, -0.34))   # keel left
        verts.append((half * .45, y, -0.34))    # keel right

    faces = []
    for i in range(len(stations) - 1):
        a = i * 4
        b = (i + 1) * 4
        faces.append((a, a + 1, b + 1, b))          # deck strip
        faces.append((a, a + 2, b + 2, b))          # left side
        faces.append((a + 1, b + 1, b + 3, a + 3))  # right side
        faces.append((a + 2, a + 3, b + 3, b + 2))  # keel
    faces.append((0, 2, 3, 1))                      # bow cap
    last = (len(stations) - 1) * 4
    faces.append((last, last + 1, last + 3, last + 2))
    recalculate_normals(mesh("Hull", verts, faces, mat, smooth=True))


def tube(orange, rubber):
    """Sweep the rounded inflatable collar around the bow and out to both stern tips."""
    from mathutils import Vector

    sections = [
        ((-.49, -1.43), (-.59, -1.32), (-.62, -1.02), (-.61, -.53)),
        ((-.61, -.53), (-.61, .51), (-.49, 1.08), (-.28, 1.31)),
        ((-.28, 1.31), (-.14, 1.52), (.14, 1.52), (.28, 1.31)),
        ((.28, 1.31), (.49, 1.08), (.61, .51), (.61, -.53)),
        ((.61, -.53), (.62, -1.02), (.59, -1.32), (.49, -1.43)),
    ]
    path = []
    for a, b, c, d in ([Vector(p) for p in section] for section in sections):
        for j in range(12):
            t = j / 12
            u = 1 - t
            path.append(u**3 * a + 3*u*u*t*b + 3*u*t*t*c + t**3*d)
    path.append(Vector(sections[-1][-1]))
    rings = 20
    verts, faces = [], []
    for i, p in enumerate(path):
        direction = (path[min(i+1, len(path)-1)] - path[max(i-1, 0)]).normalized()
        outward = Vector((-direction.y, direction.x))
        t = i / (len(path)-1)
        taper = min(1, .08 + 9 * min(t, 1-t))
        for j in range(rings):
            a = j * math.tau / rings
            xy = p + outward * (.155 * taper * math.cos(a))
            verts.append((xy.x, xy.y, .34 + .154 * taper * math.sin(a)))
    for i in range(len(path)-1):
        for j in range(rings):
            a, b = i*rings+j, i*rings+(j+1)%rings
            faces.append((a, b, b+rings, a+rings))
    faces.extend([tuple(reversed(range(rings))), tuple(range(len(verts)-rings, len(verts)))])
    ob = mesh("Orange inflatable pontoons", verts, faces, orange, smooth=True)
    ob.data.materials.append(rubber)
    for face in ob.data.polygons[:-2]:
        if face.index % rings in (0, 18, 19):
            face.material_index = 1
    recalculate_normals(ob)


def rod(name, a, b, radius, mat):
    from mathutils import Vector

    a, b = Vector(a), Vector(b)
    axis = b - a
    return cyl(name, radius, axis.length, (a + b) / 2, mat, axis.to_track_quat("Z", "Y").to_euler(), 12)


def rounded_box(name, dimensions, center, mat, radius=.028):
    ob = box(name, dimensions, center, mat)
    bevel = ob.modifiers.new("Rounded edges", "BEVEL")
    bevel.width = radius
    bevel.segments = 3
    ob.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return ob


def fittings(deck_orange, ivory, rubber, aluminum, beacon):
    rounded_box("Orange control console", (.31, .29, .32), (0, .03, .49), deck_orange)
    rounded_box("Instrument panel", (.224, .02, .10), (0, -.122, .57), rubber, .009)
    bpy.ops.mesh.primitive_torus_add(major_radius=.082, minor_radius=.009, major_segments=24,
                                     minor_segments=8, location=(0, -.151, .55),
                                     rotation=(math.radians(75), 0, 0))
    bpy.context.object.name = "Steering wheel"
    bpy.context.object.data.materials.append(rubber)
    rounded_box("Seat base", (.40, .33, .08), (0, -.43, .40), ivory)
    rounded_box("Seat back", (.39, .08, .23), (0, -.57, .53), ivory)
    rounded_box("Transom", (.92, .10, .13), (0, -1.10, .39), deck_orange)
    rounded_box("Outboard motor", (.30, .28, .37), (0, -1.23, .46), aluminum, .07)
    rounded_box("Motor lower housing", (.16, .20, .17), (0, -1.25, .22), rubber, .025)

    for side in (-1, 1):
        x = side * .40
        rod("Stern frame upright", (x, -.74, .35), (x, -.95, .89), .021, rubber)
        rod("Stern frame brace", (x, -1.11, .35), (x, -.95, .89), .019, rubber)
        for y in (-.70, -.30, .20, .64):
            cyl("Pontoon grip patch", .058, .020, (side * (.57 if y < .25 else .52), y, .479), rubber, vertices=16)
    rod("Stern frame crossbar", (-.40, -.95, .89), (.40, -.95, .89), .021, rubber)
    cyl("Blue navigation beacon", .055, .058, (.19, -.95, .932), beacon)
    rod("Antenna", (-.24, -.95, .90), (-.25, -1.00, 1.17), .009, rubber)


def gun(body, dark):
    """Stylized arcade silhouette mounted on the bow deck."""
    cyl("Bow mount base", .095, .035, (0, .68, .368), dark)
    cyl("Arcade gun pedestal", .042, .22, (0, .68, .49), dark, vertices=14)
    rounded_box("Arcade gun casing", (.14, .25, .14), (0, .68, .65), body, .023)
    rounded_box("Arcade gun side block", (.09, .12, .105), (.093, .71, .638), dark, .013)
    rod("Arcade gun barrel silhouette", (0, .76, .67), (0, 1.22, .67), .026, dark)
    marker = bpy.data.objects.new("Muzzle", None)
    bpy.context.collection.objects.link(marker)
    marker.location = (0, 1.23, .67)


def build():
    clear()

    hull_orange = plain("Burnt orange hull", (.39, .071, .016, 1), .53)
    orange = plain("Safety orange inflatable rubber", (.86, .20, .037, 1), .49)
    deck_orange = plain("Orange deck and console", (.50, .114, .035, 1), .59)
    rubber = plain("Charcoal rubber and frame", (.026, .031, .033, 1), .56)
    ivory = plain("Light grey upholstery", (.59, .63, .62, 1), .67)
    aluminum = plain("Grey motor housing", (.30, .33, .34, 1), .37, .30)
    beacon = plain("Blue navigation lens", (.018, .12, .52, 1), .25)
    steel = plain("Arcade mount grey", (.16, .17, .19, 1), .45, .35)

    hull(hull_orange)
    deck_outline = [(0, 1.49), (-.48, .88), (-.50, -1.15), (.50, -1.15), (.48, .88)]
    mesh("Inset orange deck", [(x, y, .364) for x, y in deck_outline], [(0, 1, 2, 3, 4)], deck_orange)
    tube(orange, rubber)
    fittings(deck_orange, ivory, rubber, aluminum, beacon)
    gun(steel, rubber)

    bpy.ops.object.select_all(action="SELECT")
    path = OUT / "rescue-boat.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    print(f"wrote {path.name} {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    build()
