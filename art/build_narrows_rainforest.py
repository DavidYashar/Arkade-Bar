"""Render the tropical riverbank sprite sheet used by The Narrows."""

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


TILE = 5.0
VIEW = Vector((0, -0.74, 0.67)).normalized()
UP = Vector((0, VIEW.z, -VIEW.y))
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "textures" / "narrows-rainforest.png"
rng = random.Random(4721)


def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .83 if name != "Rainforest foliage" else .64
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 21
    noise.inputs["Detail"].default_value = 3
    shades = nodes.new("ShaderNodeValToRGB")
    shades.color_ramp.elements[0].color = (*(v * .58 for v in color), 1)
    shades.color_ramp.elements[1].color = (*(v * 1.18 for v in color), 1)
    links.new(noise.outputs["Fac"], shades.inputs["Fac"])
    links.new(shades.outputs["Color"], shader.inputs["Base Color"])
    if name != "Rainforest foliage":
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .22
        bump.inputs["Distance"].default_value = .075
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return result


def stretch(obj, size, mat):
    obj.scale = size
    obj.data.materials.append(mat)
    return obj


def blob(at, size, mat, detail=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=1, location=at)
    obj = stretch(bpy.context.object, size, mat)
    obj.rotation_euler = tuple(rng.uniform(-.45, .45) for _ in range(3))
    for vertex in obj.data.vertices:
        vertex.co *= rng.uniform(.79, 1.19)
    for face in obj.data.polygons:
        face.use_smooth = True


def branch(base, tip, radius, mat):
    axis = tip - base
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=radius, radius2=radius * .52,
                                    depth=axis.length, location=(base + tip) / 2)
    obj = stretch(bpy.context.object, (1, 1, 1), mat)
    obj.rotation_euler = axis.to_track_quat('Z', 'Y').to_euler()


class Leaves:
    def __init__(self, colors):
        self.colors = colors
        self.vertices = []
        self.faces = []

    def leaf(self, start, tip, side, width, bend, color):
        rib = start.lerp(tip, .49) + Vector((0, 0, bend))
        edge = start.lerp(tip, .40)
        n = len(self.vertices)
        self.vertices.extend([start, edge + side * width, tip, edge - side * width, rib])
        for i in range(4):
            self.faces.append(((n + i, n + (i + 1) % 4, n + 4), color))

    def finish(self):
        mesh = bpy.data.meshes.new("Leaf mesh")
        mesh.from_pydata(self.vertices, [], [face for face, _ in self.faces])
        mesh.update()
        for color in self.colors:
            mesh.materials.append(color)
        for polygon, (_, color) in zip(mesh.polygons, self.faces):
            polygon.material_index = color
        obj = bpy.data.objects.new("Foliage", mesh)
        bpy.context.collection.objects.link(obj)


def broadleaf(origin, variety, bark, greens):
    height, spread = [(2.65, 1.18), (2.42, 1.47), (3.08, 1.05), (2.84, 1.31)][variety]
    fork = origin + Vector((.13, -.11, height * .57))
    branch(origin, fork, .134, bark)
    leaves = Leaves(greens)
    for i in range(10):
        angle = i * 2.4 + variety
        radial = spread * rng.uniform(.32, .86)
        crown = origin + Vector((math.cos(angle) * radial, math.sin(angle) * radial * .82,
                                 height + rng.uniform(-.50, .19) - radial * .20))
        if i < 5:
            branch(fork, crown, .063, bark)
        for _ in range(5):
            at = crown + Vector(tuple(rng.uniform(-.33, .33) for _ in range(3)))
            radius = rng.uniform(.27, .48)
            blob(at, (radius, radius * .78, radius * .66), rng.choice(greens[:3]))
            for _ in range(8):
                direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.5, .65))).normalized()
                side = Vector((-direction.y, direction.x, .03)).normalized()
                leaves.leaf(at + direction * radius * .75, at + direction * (radius + .23),
                            side, rng.uniform(.06, .14), .05, rng.randrange(len(greens)))
    leaves.finish()


def palm(origin, variety, bark, greens):
    height = (3.05, 2.65, 2.85)[variety]
    ring = [origin + Vector((.58 * (i / 9) ** 1.7 * (variety - 1), 0, height * i / 9)) for i in range(10)]
    for i in range(9):
        branch(ring[i], ring[i + 1], .11 - i * .006, bark)
    leaves = Leaves(greens)
    for i in range(12):
        angle = i * 2.4 + variety
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        sideways = Vector((-outward.y, outward.x, 0))
        length = rng.uniform(.92, 1.52)
        droop = rng.uniform(.36, .94)
        def rib(t):
            return ring[-1] + outward * length * t + Vector((0, 0, .39 * math.sin(math.pi * t) - t**2 * droop))
        for j in range(12):
            t = j / 12
            branch(rib(t), rib((j + 1) / 12), .021 * (1 - .8 * t), greens[2])
            width = (.12 + .30 * math.sin(math.pi * t)) * (1 - .62 * t)
            for sign in (-1, 1):
                point = rib(t)
                tip = point + outward * .33 + sideways * width * sign + Vector((0, 0, -.12 - .20 * t))
                leaves.leaf(point, tip, sideways, .066 * (1 - .6 * t), .045, rng.randrange(len(greens)))
    leaves.finish()


def understory(origin, variety, greens, grass=False):
    leaves = Leaves(greens)
    for i in range(45 if grass else 33):
        angle = i * 2.4
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        sideways = Vector((-outward.y, outward.x, 0))
        base = origin + outward * rng.uniform(.06, .68)
        length = rng.uniform(.25, .98) * (1 + .15 * variety)
        tip = base + outward * length + Vector((0, 0, length * rng.uniform(.47, 1.9)))
        width = length * (0.08 if grass else .30)
        leaves.leaf(base, tip, sideways, width, length * .37, rng.randrange(len(greens)))
    leaves.finish()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark = material("Damp bark", (.24, .16, .079))
    greens = [material("Rainforest foliage", color) for color in
              [(.048, .125, .026), (.073, .192, .031), (.125, .258, .04), (.205, .32, .045), (.097, .22, .081)]]
    rocks = [material("River stone", color) for color in
             [(.27, .245, .19), (.38, .34, .27), (.23, .26, .19), (.36, .30, .21)]]
    for tile in range(16):
        origin = Vector(((tile % 4 - 1.5) * TILE, 0, 0)) + UP * ((1.5 - tile // 4 - .32) * TILE)
        if tile < 4:
            broadleaf(origin, tile, bark, greens)
        elif tile < 7:
            palm(origin, tile - 4, bark, greens)
        elif tile < 13:
            understory(origin, (tile - 7) % 3, greens, grass=tile >= 10)
        else:
            for _ in range(4 + tile - 13):
                at = origin + Vector((rng.uniform(-.96, .96), rng.uniform(-.44, .44), .25))
                blob(at, (rng.uniform(.65, 1.01), rng.uniform(.38, .56), rng.uniform(.32, .61)),
                     rng.choice(rocks), detail=2)

    bpy.ops.object.camera_add(location=VIEW * 65)
    camera = bpy.context.object
    camera.rotation_euler = (-VIEW).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = TILE * 4
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type='SUN', location=(-4, -7, 8))
    sun = bpy.context.object
    sun.rotation_euler = Vector((.47, .48, -1)).to_track_quat('-Z', 'Y').to_euler()
    sun.data.energy = 2.25
    sun.data.color = (1, .89, .69)
    sun.data.angle = .18

    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("Overcast rainforest sky")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.43, .58, .66, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(OUTPUT)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
