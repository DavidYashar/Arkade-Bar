import { useEffect, useMemo } from 'react';
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, MeshPhysicalMaterial, SRGBColorSpace } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

type Profile = readonly (readonly [height: number, radius: number])[];

const BOTTLES = [
  { profile: [[0,.79],[.04,1],[.49,.96],[.60,.86],[.73,.40],[.96,.28],[1,0]], depth:.84, corners:1, label:[.18,.44] },
  { profile: [[0,.89],[.055,1],[.55,1],[.67,.88],[.76,.42],[.94,.34],[1,0]], depth:.68, corners:.45, label:[.18,.48] },
  { profile: [[0,.72],[.10,.97],[.38,1],[.52,.88],[.66,.54],[.80,.42],[.94,.41],[1,0]], depth:.79, corners:.72, label:[.17,.37] },
  { profile: [[0,.71],[.065,.82],[.35,.90],[.60,1],[.68,.97],[.78,.59],[.95,.43],[1,0]], depth:.76, corners:.50, label:[.30,.55] },
  { profile: [[0,.78],[.07,1],[.42,1],[.53,.74],[.64,.33],[.95,.26],[1,0]], depth:.78, corners:1, label:[.16,.39] },
  { profile: [[0,.86],[.08,.98],[.37,.93],[.56,1],[.62,.94],[.71,.47],[.94,.38],[1,0]], depth:.56, corners:.64, label:[.16,.39] },
  { profile: [[0,.80],[.06,.91],[.35,.75],[.51,.81],[.62,1],[.70,.95],[.81,.52],[.94,.43],[1,0]], depth:.75, corners:.55, label:[.24,.53] },
  { profile: [[0,.75],[.06,.95],[.30,1],[.49,.92],[.59,.67],[.68,.36],[.94,.30],[1,0]], depth:.83, corners:1, label:[.17,.43] },
] as const;

const GLASSES = [
  // Rocks, stemmed, tall, and coupe. The profiles turn inward at the lip.
  [[0,.73],[.07,.85],[.91,.99],[1,1],[1,.87],[.92,.86],[.15,.72],[.15,0]],
  [[0,.75],[.05,.80],[.10,.14],[.42,.14],[.45,.37],[.64,.81],[.93,1],[1,.98],[1,.89],[.66,.71],[.49,.35],[.49,0]],
  [[0,.67],[.055,.83],[.94,1],[1,1],[1,.88],[.91,.88],[.12,.72],[.12,0]],
  [[0,.78],[.06,.82],[.12,.18],[.43,.16],[.49,.40],[.70,.89],[.87,1],[.89,.90],[.73,.79],[.54,.39],[.54,0]],
] as const satisfies readonly Profile[];

const ROWS = [
  { y:1.285, glasses:[1,9,16], names:['Tawny','Bracken','Stillwater','Fable','Rook','Honeycomb','Cedar','Juniper','Mosaic','Clove','Sundown','Barley','Vale','Oxbow','Thistle','Ember'] },
  { y:1.865, glasses:[3,11,18], names:['Meridian','Northcote','Drift','Lark','Copper','Wren','Saffron','Grove','Smoke','Brassleaf','Palisade','Briar','Lantern','Vesper','Flint','Tern'] },
  { y:2.535, glasses:[0,7,14], names:['Orchard','Rime','Foxglove','Silverset','Harbor','Spindle','Creek','Morrow','Plume','Roan','Alder','Wild Rye','Dusk','Cairn','Fennel','Starling'] },
] as const;

const PALETTES = [
  ['#50220e','#d9872a','#e49b43'],
  ['#302016','#a85b39','#d99f67'],
  ['#142d1b','#587749','#71965e'],
  ['#3e1e28','#953b3d','#c3715a'],
  ['#4d3923','#cfa66d','#ead3a5'],
  ['#1c3838','#4d8b8d','#95b3a2'],
  ['#554318','#ab841d','#e0bc53'],
  ['#272c20','#69703f','#a2aa67'],
] as const;

const PAPER = ['#edd3a3','#203c35','#642927','#d5bd8c','#192f3a','#eac18b','#50301e','#cbcbbb'];
const INK = ['#472514','#e8cc92','#f4deb4','#402211','#dfc896','#392532','#efdcac','#2d3834'];
const SIDES = 16;
const TAU = Math.PI * 2;

type Surface = { position:number[]; color:number[]; uv:number[] };

function surface(): Surface {
  return { position: [], color: [], uv: [] };
}

function meshGeometry(data: Surface, smooth = false) {
  let geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(data.position, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(data.color, 4));
  if (smooth) {
    // Weld the bottle body at the angular seam to keep reflections continuous.
    const welded = mergeVertices(geometry);
    geometry.dispose();
    geometry = welded;
  } else {
    geometry.setAttribute('uv', new Float32BufferAttribute(data.uv, 2));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function widthAt(profile: Profile, height: number) {
  for (let i = 1; i < profile.length; i++) {
    const [y, width] = profile[i]!;
    if (height <= y) {
      const [from, previous] = profile[i - 1]!;
      return previous + (width - previous) * (height - from) / (y - from);
    }
  }
  return 0;
}

type Vessel = {
  x: number; y: number; z: number; height: number;
  radius: number; depth: number; corners: number; yaw: number;
  opacity?: (height: number) => number;
};

function shell(
  data: Surface, vessel: Vessel, profile: Profile,
  shade: (angle: number, height: number) => Color,
  start = 0, sweep = TAU, segments = SIDES,
  map = (u: number, v: number) => [u, v],
) {
  const cosYaw = Math.cos(vessel.yaw), sinYaw = Math.sin(vessel.yaw);
  const curve = (value: number) => Math.sign(value) * Math.abs(value) ** vessel.corners;
  const heightSpan = profile.at(-1)![0] - profile[0]![0];
  const rings = profile.map(([height, radius]) =>
    Array.from({ length: segments + 1 }, (_, i) => {
      const u = i / segments;
      const angle = start + u * sweep;
      const x = curve(Math.sin(angle)) * vessel.radius * radius;
      const z = curve(Math.cos(angle)) * vessel.radius * radius * vessel.depth;
      return {
        pos: [vessel.x + x * cosYaw + z * sinYaw, vessel.y + height * vessel.height, vessel.z - x * sinYaw + z * cosYaw],
        color: shade(angle, height),
        alpha: vessel.opacity?.(height) ?? 1,
        uv: map(u, (height - profile[0]![0]) / heightSpan),
      };
    }));
  for (let r = 1; r < rings.length; r++) {
    for (let i = 0; i < segments; i++) {
      const bottom = rings[r - 1]!, top = rings[r]!;
      for (const point of [bottom[i]!, bottom[i + 1]!, top[i + 1]!, bottom[i]!, top[i + 1]!, top[i]!]) {
        data.position.push(...point.pos);
        data.color.push(point.color.r, point.color.g, point.color.b, point.alpha);
        data.uv.push(...point.uv);
      }
    }
  }
}

function makeShelfStock() {
  const bottles = surface(), caps = surface(), glass = surface(), labels = surface();
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  let seed = 1941;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let id = 0;
  const white = new Color('#ffffff');

  ROWS.forEach(({ y, glasses, names }, row) => {
    let index = 0;
    for (let slot = 0; slot < 19; slot++) {
      const x = (slot - 9) * .281 + (random() - .5) * .035;
      const z = -8.535 + (random() - .5) * .060;
      if ((glasses as readonly number[]).includes(slot)) {
        for (let pair = 0; pair < 2; pair++) {
          const style = (row + slot + pair) % GLASSES.length;
          const vessel = { x: x + (pair ? .063 : -.063), y, z: z - pair * .042,
            height: (style === 1 ? .222 : style === 2 ? .181 : .148) * (.91 + random() * .20),
            radius: .047 + random() * .009, depth: 1, corners: 1, yaw: random() * TAU };
          shell(glass, vessel, GLASSES[style]!, (angle, height) => new Color('#f6c587')
            .lerp(white, (.33 + .50 * Math.abs(Math.sin(angle * 2)) ** 10) * (.56 + height * .42)));
        }
        continue;
      }
      const style = BOTTLES[(slot * 5 + row * 3 + Math.floor(id / 5)) % BOTTLES.length]!;
      const palette = PALETTES[(slot * 3 + row * 5 + index) % PALETTES.length]!;
      const shape: Profile = style.profile.map(([v, radius], i) =>
        [v, radius * (i === 0 ? 1 : .91 + random() * .18)]);
      const vessel = { x, y, z, radius: .087 + random() * .032, depth: style.depth,
        height: .31 + random() * (row === 0 ? .17 : .26),
        corners: style.corners, yaw: (random() - .5) * .36 };
      const edge = new Color(palette[0]), middle = new Color(palette[1]), light = new Color(palette[2]);
      const liquid = .30 + random() * .31;
      const bodyProfile = [...shape.slice(0, -1), [.967, shape.at(-2)![1]] as const, [.969, 0] as const]
        .filter(([v]) => v < liquid - .008 || v > liquid + .008);
      bodyProfile.push([liquid - .007, widthAt(shape, liquid - .007)], [liquid + .007, widthAt(shape, liquid + .007)]);
      bodyProfile.sort(([a], [b]) => a - b);
      shell(bottles, {
        ...vessel,
        opacity: (height) => {
          const base = Math.max(0, 1 - height / .09);
          return (height < liquid ? .62 : .25) + .23 * base;
        },
      }, bodyProfile, (_angle, height) => {
        if (height < .04) return edge.clone().lerp(middle, .40);
        return (height < liquid ? middle : light).clone().lerp(edge, height < liquid ? .22 : .08);
      });
      const capRadius = shape.at(-2)![1];
      const cap = new Color(['#322a20','#a87836','#6c2427','#26342d','#b9ae95'][id % 5]!);
      shell(caps, vessel, [[.859,capRadius*.94],[.868,capRadius*1.13],[.982,capRadius*1.16],[1,capRadius*.95],[1,0]],
        (angle, height) => cap.clone().multiplyScalar(.70 + .33 * Math.cos(angle - .6) ** 4 + (height > .96 ? .16 : 0)));

      const [bottom, top] = style.label;
      const labelShape: Profile = [bottom, ...bodyProfile.filter(([v]) => v > bottom && v < top).map(([v]) => v), top]
        .map((v) => [v, widthAt(bodyProfile, v) + .007]);
      const col = id % 8, atlasRow = Math.floor(id / 8);
      // Match the body's angular steps so the label sits just above the glass.
      shell(labels, vessel, labelShape, () => white, -TAU * 3 / SIDES, TAU * 6 / SIDES, 6,
        (u, v) => [(col * 128 + 4 + 120 * u) / 1024, 1 - (atlasRow * 128 + 123 - 118 * v) / 768]);
      const cx = col * 128, cy = atlasRow * 128;
      const finish = id % PAPER.length;
      ctx.fillStyle = PAPER[finish]!;
      ctx.fillRect(cx, cy, 128, 128);
      ctx.strokeStyle = INK[finish]!;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx + 10, cy + 10, 108, 108);
      ctx.fillStyle = INK[finish]!;
      ctx.textAlign = 'center';
      ctx.font = '26px Georgia, serif';
      ctx.fillText(['✶','◆','✦','◈'][id % 4]!, cx + 64, cy + 48);
      ctx.font = 'bold 23px Georgia, serif';
      ctx.fillText(names[index]!, cx + 64, cy + 81, 100);
      ctx.fillRect(cx + 35, cy + 95, 58, 2);
      id++;
      index++;
    }
  });

  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  return { atlas, bottles: meshGeometry(bottles, true), caps: meshGeometry(caps),
    labels: meshGeometry(labels), glass: meshGeometry(glass) };
}

function makeBottleGlass() {
  const material = new MeshPhysicalMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
    roughness: .11, ior: 1.48, clearcoat: .65, clearcoatRoughness: .09,
    emissive: '#a05b1c', emissiveIntensity: .055,
  });
  // Suggest the reflections of the long shelf strips without a second scene render.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float rim = pow(1.0 - facing, 3.0);
      float brightOffset = normal.x - 0.64;
      float warmOffset = normal.x + 0.79;
      float brightStrip = exp(-140.0 * brightOffset * brightOffset);
      float warmStrip = exp(-75.0 * warmOffset * warmOffset);
      float shoulder = smoothstep(0.48, 0.97, normal.y) * facing;
      outgoingLight += vec3(1.0, 0.79, 0.51) * (0.55 * brightStrip + 0.20 * rim + 0.16 * shoulder);
      outgoingLight += vec3(1.0, 0.49, 0.17) * 0.36 * warmStrip;
      diffuseColor.a = clamp(diffuseColor.a + 0.37 * rim + 0.23 * brightStrip + 0.13 * warmStrip, 0.0, 0.95);
      #include <opaque_fragment>
    `);
  };
  return material;
}

export function RearBarShelfStock() {
  const stock = useMemo(makeShelfStock, []);
  const bottleGlass = useMemo(makeBottleGlass, []);
  useEffect(() => () => {
    bottleGlass.dispose();
    stock.atlas.dispose();
    stock.bottles.dispose();
    stock.caps.dispose();
    stock.labels.dispose();
    stock.glass.dispose();
  }, [stock, bottleGlass]);

  return (
    <group name="Back-bar shelf stock">
      <mesh geometry={stock.bottles} material={bottleGlass} />
      <mesh geometry={stock.caps}>
        <meshStandardMaterial vertexColors roughness={.44} />
      </mesh>
      <mesh geometry={stock.labels}>
        <meshStandardMaterial map={stock.atlas} roughness={.69} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={stock.glass}>
        <meshStandardMaterial vertexColors transparent opacity={.46} depthWrite={false} roughness={.25}
          emissive="#efaa55" emissiveIntensity={.13} />
      </mesh>
    </group>
  );
}
