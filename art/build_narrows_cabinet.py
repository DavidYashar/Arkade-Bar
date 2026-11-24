"""Build the life-size Narrows cabinet and its recessed, UV-mapped display."""
from math import cos, pi, sin
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/models/bar/narrows-cabinet.glb"
TILT = pi / 20
SCREEN_WIDTH, SCREEN_LENGTH = .78, 1.17
SCREEN_Y, SCREEN_Z = -.09, 1.073


def material(name, rgb, roughness, metal=0, glow=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Emission Color"].default_value = (*rgb, 1)
    shader.inputs["Emission Strength"].default_value = glow
    return mat


def box(name, size, at, mat, bevel=.01, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=(angle, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        edges = obj.modifiers.new("Rounded edges", "BEVEL")
        edges.width = bevel
        edges.segments = 3
        edges.harden_normals = True
        obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
    return obj


def deck_point(x, along, lift):
    return (x, SCREEN_Y + cos(TILT) * along - sin(TILT) * lift,
            SCREEN_Z + sin(TILT) * along + cos(TILT) * lift)


def deck(name, size, x, along, lift, mat, bevel=.01):
    return box(name, size, deck_point(x, along, lift), mat, bevel, TILT)


def button(name, x, along, radius, mat, depth=.022, seat=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth,
                                       location=deck_point(x, along, seat + depth / 2),
                                       rotation=(TILT, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wood = material("Satin walnut", (.24, .11, .052), .45)
    grain = wood.node_tree.nodes.new("ShaderNodeTexImage")
    grain.image = bpy.data.images.load(str(ROOT / "public/textures/wood-rail.png"))
    coordinates = wood.node_tree.nodes.new("ShaderNodeTexCoord")
    wood.node_tree.links.new(coordinates.outputs["Generated"], grain.inputs["Vector"])
    wood.node_tree.links.new(grain.outputs["Color"],
                            wood.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    dark = material("Charcoal steel", (.037, .042, .040), .46, .46)
    black = material("Black screen gasket", (.016, .020, .019), .55)
    brass = material("Brushed brass", (.50, .29, .10), .34, .61)
    teal = material("River green controls", (.055, .29, .24), .34)
    lit = material("Amber lettering and lamp", (.97, .58, .25), .4, glow=.65)
    standby = material("Display glass", (.014, .063, .063), .22)

    # one object: the frame and the skirt under it, cut from a single solid.
    # the top follows the playing surface angle, the pocket holds the display,
    # and the sides drop from the frame corners a short way to a level base
    half_w, half_l = .495, .82
    frame_h = .04
    base = .66
    top_front = SCREEN_Z + sin(TILT) * -half_l + frame_h
    top_back = SCREEN_Z + sin(TILT) * half_l + frame_h
    verts = [
        (-half_w, -half_l, base), (half_w, -half_l, base),
        (half_w, half_l, base), (-half_w, half_l, base),
        (-half_w, -half_l, top_front), (half_w, -half_l, top_front),
        (half_w, half_l, top_back), (-half_w, half_l, top_back),
    ]
    faces = [
        (3, 2, 1, 0), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new("Cabinet body")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    body = bpy.data.objects.new("Cabinet body", mesh)
    bpy.context.scene.collection.objects.link(body)
    body.data.materials.append(wood)

    # cut the display pocket into the frame face, 40 mm deep
    bpy.ops.mesh.primitive_cube_add(size=1, location=deck_point(0, 0, .05), rotation=(TILT, 0, 0))
    cutter = bpy.context.object
    cutter.name = "Pocket cutter"
    cutter.scale = (SCREEN_WIDTH, SCREEN_LENGTH, .1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    pocket = body.modifiers.new("Display pocket", "BOOLEAN")
    pocket.operation = "DIFFERENCE"
    pocket.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=pocket.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    # the poster, cut to a band, wrapped over both long sides
    art = bpy.data.materials.new("Side art")
    art.use_nodes = True
    art_shader = art.node_tree.nodes.get("Principled BSDF")
    art_shader.inputs["Roughness"].default_value = .58
    art_image = art.node_tree.nodes.new("ShaderNodeTexImage")
    art_image.image = bpy.data.images.load(str(ROOT / "public/textures/rescue-boat-sideband.jpg"))
    art_image.extension = "EXTEND"
    art.node_tree.links.new(art_image.outputs["Color"], art_shader.inputs["Base Color"])
    art.node_tree.links.new(art_image.outputs["Color"], art_shader.inputs["Emission Color"])
    art_shader.inputs["Emission Strength"].default_value = .22
    # the boolean leaves an empty material slot behind, clear it before adding art
    for index in range(len(body.data.materials) - 1, -1, -1):
        if body.data.materials[index] is None:
            body.data.materials.pop(index=index)
    body.data.materials.append(art)
    art_index = len(body.data.materials) - 1

    # the boolean leaves its own uv map behind; keep one, and make it the active one
    for existing in list(body.data.uv_layers):
        body.data.uv_layers.remove(existing)
    layer = body.data.uv_layers.new(name="UVMap")
    body.data.uv_layers.active = layer
    for poly in body.data.polygons:
        if abs(poly.normal.x) < .9:
            continue
        poly.material_index = art_index
        for loop_index in poly.loop_indices:
            co = body.data.vertices[body.data.loops[loop_index].vertex_index].co
            top = SCREEN_Z + sin(TILT) * co.y + frame_h
            layer.data[loop_index].uv = ((co.y + half_l) / (half_l * 2),
                                         (co.z - base) / max(.001, top - base))

    round_edges = body.modifiers.new("Rounded edges", "BEVEL")
    round_edges.width = .01
    round_edges.segments = 3
    round_edges.limit_method = "ANGLE"

    # four legs from the base to the floor
    for x in (-.40, .40):
        for y in (-.52, .62):
            box("Steel cabinet leg", (.098, .098, .64), (x, y, .34), dark, .012)
            box("Adjustable foot", (.112, .112, .03), (x, y, .015), dark)

    # black bezel and glass, down inside the pocket
    bpy.ops.mesh.primitive_plane_add(size=1, location=deck_point(0, 0, .0015), rotation=(TILT, 0, 0))
    bezel = bpy.context.object
    bezel.name = "Display bezel"
    bezel.scale = (.87, 1.27, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bezel.data.materials.append(black)

    bpy.ops.mesh.primitive_plane_add(size=1, location=deck_point(0, 0, .0025), rotation=(TILT, 0, 0))
    monitor = bpy.context.object
    monitor.name = "NarrowsScreen"
    monitor.scale = (SCREEN_WIDTH, SCREEN_LENGTH, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    monitor.data.materials.append(standby)

    # controls and lettering stand on the frame face
    for x in (-.316, -.239):
        button("Steering control", x, -.702, .026, teal, seat=frame_h)
    button("Throttle control", .245, -.702, .026, teal, seat=frame_h)
    button("Fire control", .324, -.702, .029, lit, seat=frame_h)
    bpy.ops.object.text_add(location=deck_point(0, -.706, frame_h + .003), rotation=(TILT, 0, 0))
    label = bpy.context.object
    label.name = "Rescue Boat brass lettering"
    label.data.body = "RESCUE BOAT"
    label.data.align_x = label.data.align_y = "CENTER"
    label.data.size = .046
    label.data.space_character = 1.12
    label.data.extrude = .0015
    label.data.materials.append(lit)
    bpy.ops.object.convert(target="MESH")

    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_yup=True,
                              export_apply=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()

