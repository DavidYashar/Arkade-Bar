"""Build the reference-inspired jukebox for Arkade Bar in Blender."""

from math import cos, pi, sin, sqrt
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/models/bar/jukebox.glb"
ARCH_CENTER = 1.47


def material(name, color, roughness=.45, metal=0, glow=0, grain=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if glow:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = glow
    if grain:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(str(ROOT / f"public/textures/{grain}"), check_existing=True)
        mat.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return mat


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        edges = obj.modifiers.new("Soft edges", "BEVEL")
        edges.width = bevel
        edges.segments = 3
        edges.harden_normals = True
        obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
    return obj


def box(name, x, depth, z, width, thickness, height, mat, bevel=.009):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -depth, z))
    obj = bpy.context.object
    obj.scale = (width, thickness, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def arc(radius, z, start=0, end=pi, steps=40):
    return [(radius * cos(angle), z + radius * sin(angle))
            for angle in (start + (end - start) * i / steps for i in range(steps + 1))]


def arch(radius, base, z=ARCH_CENTER):
    return [(radius, base), *arc(radius, z), (-radius, base)]


def panel(name, outline, back, front, mat, bevel=.004):
    """Extrude a counterclockwise outline in the front elevation, adding wood UVs."""
    count = len(outline)
    vertices = [(x, -depth, z) for depth in (front, back) for x, z in outline]
    sides = [(i, i + count, (i + 1) % count + count, (i + 1) % count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(range(count)), tuple(reversed(range(count, 2 * count))), *sides])
    mesh.update()
    uv = mesh.uv_layers.new()
    for face in mesh.polygons:
        for loop in face.loop_indices:
            x, y, z = vertices[mesh.loops[loop].vertex_index]
            uv.data[loop].uv = (x + .6 if face.index < 2 else -y * 1.6, z * .55)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, bevel)


def tube(name, points, depth, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, z) in zip(spline.points, points):
        point.co = (x, -depth, z, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def disc(name, x, depth, z, radius, thickness, mat, vertical=True):
    rotation = (pi / 2, 0, 0) if vertical else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=thickness,
                                      location=(x, -depth, z), rotation=rotation)
    obj = finish(bpy.context.object, name, mat, .002)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def batch_materials(prefix="Jukebox"):
    """Keep the decorative hardware to one draw call per material."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.object
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for name, objects in groups.items():
        if len(objects) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
        objects[0].name = f"{prefix} | {name}"


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    walnut = material("Walnut veneer", (.25, .085, .028), grain="wood-rail.png")
    dark = material("Dark lacquer", (.079, .022, .012), .28)
    brass = material("Aged brass", (.46, .29, .118), .36, .66)
    gold = material("Champagne trim", (.58, .40, .22), .3, .48)
    silver = material("Nickel ribs", (.46, .40, .31), .31, .56)
    ivory = material("Warm ivory tubes", (.92, .73, .48), .27, glow=.85)
    red = material("Crimson lamps", (.68, .028, .012), .29, glow=.75)
    burgundy = material("Burgundy interior", (.24, .035, .02), .37)
    vinyl = material("Black vinyl", (.023, .018, .014), .33)
    cloth = material("Dark woven speaker", (.056, .031, .014), .92)
    thread = material("Speaker weave", (.15, .093, .045), .85)
    paper = material("Track cards", (.68, .52, .31), .82)
    jade = material("Jade indicator", (.044, .28, .18), .35, glow=.42)

    # The flat rear starts at depth zero. The arch and each light channel have real depth.
    panel("Arched walnut case", arch(.565, .12), 0, .492, walnut, .017)
    panel("Dark perimeter", arch(.556, .123), .478, .525, dark, .01)
    panel("Walnut front", arch(.526, .145), .515, .548, walnut, .009)
    box("Brass plinth", 0, .259, .103, 1.105, .518, .132, brass, .024)
    box("Dark plinth cap", 0, .276, .169, 1.127, .55, .041, dark)
    for x in (-.435, .435):
        for depth in (.102, .423):
            disc("Brass foot", x, depth, .027, .078, .054, brass, vertical=False)

    for radius, depth, size, mat, foot in [
        (.508, .547, .020, brass, .31), (.480, .560, .038, ivory, .445),
        (.441, .560, .012, dark, .35), (.410, .554, .027, ivory, .64),
        (.378, .556, .013, brass, .64),
    ]:
        points = [(radius, foot), *arc(radius, ARCH_CENTER), (-radius, foot)]
        tube("Arched trim and light", points, depth, size, mat)
    for x in (-.477, .477):
        box("Walnut lower column", x, .546, .295, .165, .099, .256, dark, .022)
        for z in (.41, .429, .448):
            box("Column collar", x, .559, z, .17, .102, .015, dark, .004)
        for z in (1.365, 1.43, 1.495):
            box("Brass belt", x, .572, z, .173, .125, .022, brass, .005)
        for z in (1.397, 1.464):
            box("Red belt light", x, .606, z, .167, .059, .031, red, .006)
    tube("Crown crest rim", [(-.113, 1.969), (-.072, 1.915), (-.058, 1.838),
         (.058, 1.838), (.072, 1.915), (.113, 1.969)], .573, .014, brass)
    box("Crown red jewel", 0, .573, 1.878, .116, .075, .071, red, .02)

    # The upper window exposes a record stack and numbered selection cradle behind the arch.
    panel("Window surround", arch(.382, 1.398), .547, .563, dark)
    panel("Deep red window", arch(.351, 1.407), .563, .571, burgundy)
    tube("Window brass edging", arch(.362, 1.406), .578, .009, brass)
    tube("Curved changer backing trim", arc(.315, ARCH_CENTER, .30 * pi, .83 * pi), .575, .006, brass)
    tube("Curved changer backing trim", arc(.290, ARCH_CENTER, .31 * pi, .83 * pi), .575, .004, gold)
    for i in range(12):
        disc("Stacked records", -.127, .582, 1.460 + i * .009, .109, .0065, vinyl, vertical=False)
    disc("Record centre label", -.127, .582, 1.565, .038, .003, paper, vertical=False)
    for i in range(5):
        x, z = .064 + .031 * i, 1.58 - .019 * i
        ticket = box("Window title strip", x, .584, z, .053, .012, .027, paper, .002)
        ticket.rotation_euler.y = -.27
        box("Printed title line", x, .591, z, .032, .003, .003, burgundy, 0).rotation_euler.y = -.27
    tube("Record changer arm", [(.242, 1.567), (.237, 1.639), (.198, 1.687), (.139, 1.682)],
         .594, .011, brass)
    disc("Changer pivot", .247, .599, 1.568, .022, .016, gold)

    box("Selection backing", 0, .577, 1.356, .682, .097, .182, brass, .015)
    box("Selection face", 0, .631, 1.358, .636, .020, .153, paper, .006)
    for i in range(7):
        z = 1.301 + i * .019
        box("Fluted selector", 0, .645, z, .611, .016, .010, silver, .003)
    for x in (-.300, -.147, .147, .300):
        box("Selector divider", x, .644, 1.356, .030, .028, .171, gold, .005)
        for i in range(6):
            disc("Selector pilot light", x, .662, 1.303 + i * .021, .0065, .006,
                 red if abs(x) < .2 else ivory)
    box("Centre counter strip", 0, .646, 1.354, .015, .019, .114, red, .003)
    box("Button console", 0, .577, 1.166, .347, .097, .142, brass, .018)
    box("Title plate", 0, .632, 1.192, .256, .017, .049, ivory, .004)
    bpy.ops.object.text_add(location=(0, -.643, 1.191), rotation=(pi / 2, 0, 0))
    title = bpy.context.object
    title.data.body = "JUKEBOX"
    title.data.align_x = title.data.align_y = "CENTER"
    title.data.size = .025
    title.data.extrude = .0004
    finish(title, "Console plate lettering", burgundy)
    for i in range(8):
        x = (i - 3.5) * .034
        box("Track key", x, .633, 1.132, .025, .037, .043, paper, .003)
        box("Track key inset", x, .653, 1.126, .008, .005, .021, burgundy, .002)
    for x, lens in [(-.248, red), (.248, jade)]:
        box("Side control mount", x, .578, 1.178, .131, .088, .089, brass, .012)
        box("Side control lens", x, .628, 1.184, .088, .020, .042, lens, .006)
    box("Coin slot surround", -.302, .564, .263, .101, .039, .041, brass, .006)
    box("Coin slot opening", -.302, .586, .263, .052, .006, .013, vinyl, .001)

    # The lower grille traces the same U as the cream light, with crossed brass ribs.
    speaker_outline = arc(.235, .539, pi, 2 * pi) + [(.235, 1.082), (-.235, 1.082)]
    panel("Speaker surround", speaker_outline, .549, .573, dark)
    panel("Speaker cloth", speaker_outline, .572, .580, cloth)
    for i in range(42):
        z = .319 + i * .018
        half_width = sqrt(.228 ** 2 - min(0, z - .539) ** 2)
        tube("Grille cloth thread", [(-half_width, z), (half_width, z)], .582, .0016, thread)
    for slope in (-.59, .59):
        for index in range(-5, 6):
            offset = index * .105
            points = []
            for i in range(151):
                z = .312 + .00507 * i
                x = offset + slope * (z - .69)
                if x ** 2 + min(0, z - .539) ** 2 <= .232 ** 2:
                    points.append((x, z))
            if len(points) > 1:
                tube("Diamond lattice", [points[0], points[-1]], .596, .0065, brass)
    for radius, depth, size, mat, top in [
        (.270, .555, .049, ivory, 1.073), (.317, .55, .010, brass, 1.071),
        (.235, .588, .011, brass, 1.083),
    ]:
        tube("U-shaped grille trim", [(-radius, top), *arc(radius, .539, pi, 2 * pi),
                                      (radius, top)], depth, size, mat)
    for side in (-1, 1):
        points = []
        for i in range(36):
            angle = i * .21
            radius = .084 - i * .0021
            points.append((side * (.101 + radius * cos(angle)), .416 + radius * sin(angle)))
        tube("Art deco brass scroll", points, .611, .009, brass)
    disc("Medallion brass frame", 0, .611, .505, .078, .028, brass)
    disc("Medallion red enamel", 0, .629, .505, .064, .016, red)
    star = [((.050 if i % 2 == 0 else .021) * cos(i * pi / 8),
             .505 + (.050 if i % 2 == 0 else .021) * sin(i * pi / 8)) for i in range(16)]
    panel("Medallion starburst", star, .636, .640, ivory, 0)
    tube("Lower brass finial", [(0, .184), (0, .253), (.009, .303), (.022, .345)], .597, .012, brass)

    batch_materials()
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_yup=True,
                              export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
