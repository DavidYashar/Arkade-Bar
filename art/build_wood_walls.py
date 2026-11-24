"""Build the interior wall lining from the reference in public/textures."""

import json
import random
import struct
from array import array
from math import sqrt
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "public/textures/wood-wall.png"
OUTPUT = ROOT / "public/models/bar/arkade-wood-walls.glb"
HEIGHT = 4.2
BEVEL = 0.0015
RECESS = 0.0025
SIDE_WALL_X = 6.86
DOOR_WALL_EDGE_X = 2.37
ENTRY_LINING_Z = 8.895

# Crop inside the individual boards so the joints in the photo stay off the mesh.
# Pixel bounds, from the upper-left of the 374 x 677 reference.
GRAIN_CROPS = (
    (4, 5, 72, 301),
    (4, 314, 72, 671),
    (83, 100, 190, 671),
    (201, 5, 308, 235),
    (201, 250, 308, 671),
    (322, 5, 370, 671),
)


def wall_mesh(width, rng):
    positions, normals, uvs, colors, indices = [], [], [], [], []

    def quad(points, texcoords, shades):
        a, b, c, _ = points
        edge1 = [b[i] - a[i] for i in range(3)]
        edge2 = [c[i] - a[i] for i in range(3)]
        x, y, z = edge1
        u, v, w = edge2
        normal = (y * w - z * v, z * u - x * w, x * v - y * u)
        length = sqrt(sum(value * value for value in normal))
        start = len(positions)
        positions.extend(points)
        normals.extend([tuple(value / length for value in normal)] * 4)
        uvs.extend(texcoords)
        colors.extend((shade, shade, shade) for shade in shades)
        indices.extend(start + i for i in (0, 1, 2, 0, 2, 3))

    def board(left, bottom, right, top):
        x0, y0, x1, y1 = rng.choice(GRAIN_CROPS)
        margin = (y1 - y0) * rng.uniform(0.03, 0.16)
        u0, u1 = x0 / 374, x1 / 374
        if rng.random() < 0.5:
            u0, u1 = u1, u0
        v0, v1 = (y1 - margin * rng.random()) / 677, (y0 + margin * rng.random()) / 677
        texcoords = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        tone = rng.uniform(0.81, 1.0)
        outer = [(left, bottom, -RECESS), (right, bottom, -RECESS),
                 (right, top, -RECESS), (left, top, -RECESS)]
        face = [(left + BEVEL, bottom + BEVEL, 0), (right - BEVEL, bottom + BEVEL, 0),
                (right - BEVEL, top - BEVEL, 0), (left + BEVEL, top - BEVEL, 0)]
        quad(face, texcoords, [tone] * 4)
        for i in range(4):
            j = (i + 1) % 4
            quad([outer[i], outer[j], face[j], face[i]],
                 [texcoords[i], texcoords[j], texcoords[j], texcoords[i]],
                 [tone * 0.51, tone * 0.51, tone, tone])

    left = 0
    previous_joints = []
    while left < width:
        right = left + rng.uniform(0.16, 0.25)
        if width - right < 0.11:
            right = width
        joints = []
        bottom = 0
        top = rng.uniform(0.52, 1.9)
        while top < HEIGHT - 0.38:
            joint = top
            while any(abs(joint - other) < 0.14 for other in previous_joints):
                joint += 0.16
            if joint >= HEIGHT - 0.38:
                break
            board(left, bottom, right, joint)
            joints.append(joint)
            bottom = joint
            top = bottom + rng.uniform(1.05, 2.2)
        board(left, bottom, right, HEIGHT)
        previous_joints = joints
        left = right
    return positions, normals, uvs, colors, indices


def build():
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def add_view(data, target=None):
        binary.extend(bytes((-len(binary)) % 4))
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        views.append(view)
        binary.extend(data)
        return len(views) - 1

    def attribute(rows, kind, bounds=False):
        view = add_view(array("f", (value for row in rows for value in row)).tobytes(), 34962)
        accessor = {"bufferView": view, "componentType": 5126, "count": len(rows), "type": kind}
        if bounds:
            columns = list(zip(*rows))
            accessor.update(min=[min(axis) for axis in columns], max=[max(axis) for axis in columns])
        accessors.append(accessor)
        return len(accessors) - 1

    # Each wall's rotation turns the board faces into the room. The corners
    # meet at the finished surface, with the bevel recessed behind it.
    for index, (name, width, position, rotation) in enumerate((
        ("Left wall", 17.86, [-SIDE_WALL_X, 0, 9], [0, sqrt(0.5), 0, sqrt(0.5)]),
        ("Right wall", 17.86, [SIDE_WALL_X, 0, -8.86], [0, -sqrt(0.5), 0, sqrt(0.5)]),
        ("Back wall", 2 * SIDE_WALL_X, [-SIDE_WALL_X, 0, -8.86], [0, 0, 0, 1]),
        # Overlay the two inward faces. The existing wall boxes still provide
        # the exterior finish and the reveals around the glass door.
        ("Entry left", SIDE_WALL_X - DOOR_WALL_EDGE_X,
         [-DOOR_WALL_EDGE_X, 0, ENTRY_LINING_Z], [0, 1, 0, 0]),
        ("Entry right", SIDE_WALL_X - DOOR_WALL_EDGE_X,
         [SIDE_WALL_X, 0, ENTRY_LINING_Z], [0, 1, 0, 0]),
    )):
        positions, normals, uvs, colors, indices = wall_mesh(width, random.Random(4700 + index))
        attributes = {
            "POSITION": attribute(positions, "VEC3", bounds=True),
            "NORMAL": attribute(normals, "VEC3"),
            "TEXCOORD_0": attribute(uvs, "VEC2"),
            "COLOR_0": attribute(colors, "VEC3"),
        }
        view = add_view(array("H", indices).tobytes(), 34963)
        accessors.append({"bufferView": view, "componentType": 5123, "count": len(indices), "type": "SCALAR"})
        meshes.append({"name": name, "primitives": [
            {"attributes": attributes, "indices": len(accessors) - 1, "material": 0}
        ]})
        nodes.append({"name": name, "mesh": index, "translation": position, "rotation": rotation})

    image_view = add_view(REFERENCE.read_bytes())
    binary.extend(bytes((-len(binary)) % 4))
    gltf = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"name": "Arkade Bar wood wall lining", "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [{"name": "Wood boards", "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0}, "baseColorFactor": [0.62, 0.62, 0.62, 1],
            "metallicFactor": 0, "roughnessFactor": 0.72,
        }}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"source": 0, "sampler": 0}],
        "images": [{"bufferView": image_view, "mimeType": "image/png"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    metadata = json.dumps(gltf, separators=(",", ":")).encode()
    metadata += b" " * ((-len(metadata)) % 4)
    header = struct.pack("<4sIIII", b"glTF", 2, 28 + len(metadata) + len(binary), len(metadata), 0x4E4F534A)
    OUTPUT.write_bytes(header + metadata + struct.pack("<II", len(binary), 0x004E4942) + binary)


if __name__ == "__main__":
    build()
