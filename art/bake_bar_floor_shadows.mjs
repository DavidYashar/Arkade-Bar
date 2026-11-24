/** Bake the fixed furniture shadows from the exported Blender models.
 * Run from the project root: node art/bake_bar_floor_shadows.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { BufferGeometry, DoubleSide, Ray, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

const WIDTH = 700;
const HEIGHT = 900;
const FLOOR_WIDTH = 14;
const FLOOR_DEPTH = 18;

async function loadGeometry(name) {
  const source = await readFile(`public/models/bar/${name}.glb`);
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
  const binary = source.subarray(28 + jsonLength);
  // Use the authored transforms and polygons. Materials and images are irrelevant to this bake.
  delete json.images;
  delete json.textures;
  delete json.materials;
  for (const { primitives } of json.meshes) {
    for (const primitive of primitives) delete primitive.material;
  }
  const data = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4, 0x20);
  data.copy(padded);
  const header = Buffer.from(source.subarray(0, 20));
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12);
  const glb = Buffer.concat([header, padded, source.subarray(20 + jsonLength)]);
  const { scene } = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
  return scene;
}

function coordinates(source, name) {
  const [, x, z] = source.match(new RegExp(`\\b${name} = \\[([^,]+), ([^\\]]+)\\]`));
  return [Number(x), Number(z)];
}

const placements = await readFile('src/arcade/colliders.ts', 'utf8');
const blackjack = await readFile('src/games/blackjack/Blackjack3D.tsx', 'utf8');
const narrowsScale = Number(placements.match(/NARROWS_SCALE = ([\d.]+)/)[1]);
const jukebox = coordinates(placements, 'JUKEBOX_AT');
// The lounge couch shares the jukebox's Z coordinate in colliders.ts.
const chesterfieldX = Number(placements.match(/CHESTERFIELD_AT = \[([^,]+),/)[1]);
const furniture = [
  ['table', coordinates(blackjack, 'BLACKJACK_TABLE_XZ'), 0, 1],
  ['pinball-cabinet', coordinates(placements, 'PINBALL_AT'), 0, 1],
  ['brick-blitz-table', coordinates(placements, 'BRICK_BLITZ_AT'), Math.PI, 1],
  ['narrows-cabinet', coordinates(placements, 'NARROWS_AT'), Math.PI / 2, narrowsScale],
  ['jukebox', jukebox, -Math.PI / 2, 1],
  ['chesterfield', [chesterfieldX, jukebox[1]], Math.PI / 2, 1],
  ['chesterfield', coordinates(placements, 'ENTRANCE_COUCH_AT'), Math.PI, 1, .012],
];
const casters = [];
for (const [name, [x, z], yaw, scale, lift = 0] of furniture) {
  const scene = await loadGeometry(name);
  scene.position.set(x, lift, z);
  scene.rotation.y = yaw;
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
    geometry.applyMatrix4(mesh.matrixWorld);
    casters.push(geometry.index ? geometry.toNonIndexed() : geometry);
  });
}
const tree = new MeshBVH(mergeGeometries(casters));
const ceiling = await loadGeometry('arkade-ceiling');
ceiling.updateMatrixWorld();
const spots = [];
const emitterOffsets = [[0, 0], [-.15, -.09], [-.09, .15], [.15, .09], [.09, -.15]];
ceiling.traverse((light) => {
  if (!light.isSpotLight) return;
  const center = light.getWorldPosition(new Vector3());
  const axis = light.target.getWorldPosition(new Vector3()).sub(center).normalize();
  if (axis.y >= 0) return;
  spots.push({
    center, axis,
    intensity: light.intensity,
    range: light.distance,
    outer: Math.cos(light.angle),
    inner: Math.cos(light.angle * (1 - light.penumbra)),
    samples: emitterOffsets.map(([x, z]) => center.clone().add(new Vector3(x, 0, z))),
  });
});
if (spots.length !== 14) throw new Error(`Expected 14 downward ceiling lights, found ${spots.length}`);

const ray = new Ray();
const lightToFloor = new Vector3();
const directShadow = new Float32Array(WIDTH * HEIGHT);
const contactShadow = new Float32Array(WIDTH * HEIGHT);
const contactDirections = Array.from({ length: 6 }, (_, index) => {
  const angle = index * Math.PI / 3;
  return new Vector3(Math.cos(angle), 1.35, Math.sin(angle)).normalize();
});
const unit = (value) => Math.max(0, Math.min(1, value));

for (let row = 0; row < HEIGHT; row++) {
  for (let column = 0; column < WIDTH; column++) {
    ray.origin.set((column + .5) * FLOOR_WIDTH / WIDTH - FLOOR_WIDTH / 2, .002,
      (row + .5) * FLOOR_DEPTH / HEIGHT - FLOOR_DEPTH / 2);
    let total = 0;
    let blocked = 0;
    for (const spot of spots) {
      lightToFloor.subVectors(ray.origin, spot.center);
      const distance = lightToFloor.length();
      if (distance >= spot.range) continue;
      const cosine = lightToFloor.dot(spot.axis) / distance;
      const cone = unit((cosine - spot.outer) / (spot.inner - spot.outer));
      const falloff = (1 - (distance / spot.range) ** 4) ** 2;
      const strength = spot.intensity * cone ** 2 * (3 - 2 * cone)
        * (-lightToFloor.y) / distance ** 3 * falloff;
      total += strength;
      if (strength <= .012) continue;
      for (const sample of spot.samples) {
        ray.direction.subVectors(sample, ray.origin);
        const length = ray.direction.length();
        ray.direction.multiplyScalar(1 / length);
        if (tree.raycastFirst(ray, DoubleSide, 0, length)) blocked += strength / spot.samples.length;
      }
    }

    const index = row * WIDTH + column;
    directShadow[index] = .72 * blocked / (total + .65);
    if (blocked <= .005) continue;
    for (const direction of contactDirections) {
      ray.direction.copy(direction);
      const hit = tree.raycastFirst(ray, DoubleSide, 0, .36);
      if (hit) contactShadow[index] += (1 - hit.distance / .36) ** 2 / contactDirections.length;
    }
  }
}

// Blend the emitter samples without blurring the feet and pedestal contact shadows.
const stride = 1 + 4 * WIDTH;
const pixels = Buffer.alloc(stride * HEIGHT);
for (let row = 0; row < HEIGHT; row++) {
  for (let column = 0; column < WIDTH; column++) {
    let blurred = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const y = Math.max(0, Math.min(HEIGHT - 1, row + dy));
        const x = Math.max(0, Math.min(WIDTH - 1, column + dx));
        blurred += directShadow[y * WIDTH + x] * (2 - Math.abs(dy)) * (2 - Math.abs(dx)) / 16;
      }
    }
    const contact = contactShadow[row * WIDTH + column];
    const alpha = Math.min(.72, 1 - (1 - blurred) * (1 - .55 * contact));
    pixels[row * stride + 4 + column * 4] = Math.round(255 * alpha);
  }
}

function pngChunk(name, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length);
  chunk.write(name, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}
const dimensions = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 8, 6, 0, 0, 0]);
dimensions.writeUInt32BE(WIDTH, 0);
dimensions.writeUInt32BE(HEIGHT, 4);
const path = 'public/textures/arkade-floor-shadows.png';
await writeFile(path, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', dimensions),
  pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
]));
console.log(`Baked ${furniture.length} models under ${spots.length} ceiling lights to ${path}.`);
