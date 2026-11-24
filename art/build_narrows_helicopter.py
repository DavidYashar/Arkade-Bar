"""Build the low-poly desert helicopter for The Narrows."""
import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_boat import OUT, cyl, mesh, plain, recalculate_normals, rod, rounded_box


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    camo = [plain(name, (*color, 1), .65) for name, color in (
        ("Desert sand", (.61, .36, .18)), ("Dark ochre", (.35, .16, .067)),
        ("Pale sand", (.77, .50, .27)), ("Dry earth", (.46, .24, .10)),
    )]
    graphite = plain("Dark nose and rotors", (.025, .032, .035, 1), .44)
    glass = plain("Dark cockpit glazing", (.025, .065, .074, 1), .24)
    metal = plain("Skid aluminum", (.39, .43, .44, 1), .43, .40)
    stations = [(1.39,.11,.08,.24), (1.06,.26,.09,.44), (.57,.34,.08,.73),
                (.12,.35,.11,.99), (-.48,.29,.17,.80), (-.76,.20,.30,.64), (-1.56,.075,.48,.63)]
    verts = []
    for y, w, lo, hi in stations:
        verts.extend([(x*w,y,lo+(hi-lo)*z) for x,z in
                      ((-.57,0),(.57,0),(1,.29),(.75,.84),(.52,1),(-.52,1),(-.75,.84),(-1,.29))])
    faces = [tuple(reversed(range(8)))]
    for front in range(len(stations)-1):
        for side in range(8):
            a = front*8+side
            b = front*8+(side+1)%8
            faces.append((a,b,b+8,a+8))
    faces.append(tuple(range(len(verts)-8,len(verts))))
    fuselage = mesh("Angular desert fuselage", verts, faces, camo[0])
    for mat in (*camo[1:], graphite, glass):
        fuselage.data.materials.append(mat)
    rng = random.Random(723)
    for face in fuselage.data.polygons:
        band, side = divmod(face.index-1,8)
        if face.index == 0 or band == 0:
            face.material_index = 4
        elif band in (1,2) and side in (2,3,5,6):
            face.material_index = 5
        else:
            face.material_index = rng.choice((0,0,1,2,3))
    recalculate_normals(fuselage)

    for side in (-1,1):
        x = side*.37
        rod("Landing skid", (x,-.75,.035),(x,.84,.035),.024,metal)
        rod("Curved skid nose", (x,.84,.035),(x,1.00,.115),.021,metal)
        for y in (-.48,.53):
            rod("Skid strut", (side*.22,y,.20),(x,y,.035),.022,metal)
        wing = mesh("Stub wing", [(side*.26,-.45,.47),(side*.73,-.52,.38),
                                     (side*.77,-.18,.40),(side*.29,.06,.53)],
                    [(0,1,2,3)], graphite)
        wing.modifiers.new("Wing thickness", "SOLIDIFY").thickness = .055
    fin = mesh("Tail fin", [(0,-1.60,.49),(0,-1.60,.94),(0,-1.41,1.00),(0,-1.18,.60)],
               [(0,1,2,3)], graphite)
    fin.modifiers.new("Tail thickness", "SOLIDIFY").thickness = .045
    for theta in (0, math.pi/2):
        dy, dz = .24*math.cos(theta), .24*math.sin(theta)
        rod("Tail rotor blade", (-.065,-1.49-dy,.77-dz), (-.065,-1.49+dy,.77+dz), .013, graphite)

    rounded_box("Rotor gearbox", (.34,.42,.17), (0,-.06,.87), camo[1])
    cyl("Rotor shaft", .043, .20, (0,-.06,1.00), metal)
    rotor = bpy.data.objects.new("Main Rotor", None)
    bpy.context.collection.objects.link(rotor)
    rotor.location = (0,-.06,1.12)
    for i in range(4):
        theta = i*math.pi/2
        blade = rounded_box("Main rotor blade", (1.39,.073,.022), (.75*math.cos(theta),.75*math.sin(theta),0), graphite, .009)
        blade.parent = rotor
        blade.rotation_euler.z = theta + .035
    cap = cyl("Rotor hub", .087, .056, (0,0,0), graphite)
    cap.parent = rotor

    rounded_box("Nose mount", (.17,.18,.10), (0,1.19,.125), graphite)
    for side in (-1,1):
        rod("Arcade nose detail", (side*.041,1.24,.13),(side*.041,1.45,.12), .018, graphite)
    marker = bpy.data.objects.new("Muzzle", None)
    bpy.context.collection.objects.link(marker)
    marker.location = (0,1.46,.12)

    bpy.ops.export_scene.gltf(filepath=str(OUT / "narrows-helicopter.glb"), export_format="GLB",
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False)


if __name__ == "__main__":
    build()
