import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Clone, useGLTF, useTexture } from '@react-three/drei';
import type { Object3D } from 'three';
import { BackSide, BufferAttribute, CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight, PropertyBinding, SpotLight, SRGBColorSpace, Vector3 } from 'three';
import type { View } from './views';
import { ReadySignal } from './ReadySignal';
import { VIEWS } from './views';
import { blocked, insideBounds, BRICK_BLITZ_AT, CHESTERFIELD_AT, DOOR_AT, ENTRANCE_COUCH_AT, ENTRANCE_PLANTERS, ENTRANCE_TABLE_AT, INTERIOR_PLANTERS, JUKEBOX_AT, NARROWS_AT, NARROWS_REACH, NARROWS_SCALE, NARROWS_YAW, PINBALL_AT } from './colliders';
import { BrickBlitzNeon, DartsNeon, JukeboxNeon, PinballNeon, RescueBoatNeon } from './ArcadeNeon';
import { BlackjackHangingSign } from './BlackjackHangingSign';
import { RearBarShelfStock } from './RearBarShelfStock';
import { CounterNotice } from './CounterNotice';
import { BlackjackCards, BlackjackTable } from '@/games/blackjack/Blackjack3D';
import { TableResult } from '@/games/blackjack/TableResult';
import type { BlackjackState } from '@/games/blackjack/useBlackjack';
import { DartsBoard, DARTS } from '@/games/darts/DartsBoard';
import type { DartsState } from '@/games/darts/useDarts';
import type { Shot } from '@/games/darts/board';
import { NarrowsCabinet } from '@/games/narrows/NarrowsCabinet';
import { Jukebox, type JukeboxControls } from '@/games/jukebox/Jukebox';

const EYE = 1.68;
const SPEED = 3.1;
const RADIUS = 0.34;
const DOOR_REACH = 5.0;

type Look = { yaw: number; pitch: number };

function Player({
  view,
  look,
  move,
  onDoor,
  seat,
  dartsCam,
  jukeboxView,
  onPosition,
}: {
  view: View;
  look: Look;
  move: React.RefObject<{ x: number; z: number }>;
  onDoor: (open: boolean) => void;
  seat: boolean;
  dartsCam: boolean;
  jukeboxView: boolean;
  onPosition: (x: number, z: number) => void;
  onReady?: () => void;
  /** The seated table, with its cards, is on screen and the deal may start. */
  onTableReady?: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const pos = useRef(new Vector3(view.position[0], EYE, view.position[2]));
  const doorOpen = useRef(false);
  const keys = useRef(new Set<string>());
  const frame = useRef(0);
  const [coarse] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    // A frame can point at a spot that a sofa or a table already occupies. Stand at
    // the nearest free place instead, or the player would spawn stuck inside furniture.
    const stand = (x: number, z: number): [number, number] => {
      if (!blocked(x, z, RADIUS, doorOpen.current) && insideBounds(x, z)) return [x, z];
      for (let r = 0.25; r <= 2; r += 0.25) {
        for (let i = 0; i < 16; i += 1) {
          const a = (i / 16) * Math.PI * 2;
          const nx = x + Math.cos(a) * r;
          const nz = z + Math.sin(a) * r;
          if (!blocked(nx, nz, RADIUS, doorOpen.current) && insideBounds(nx, nz)) return [nx, nz];
        }
      }
      return [x, z];
    };
    const [x, z] = stand(view.position[0], view.position[2]);
    pos.current.set(x, EYE, z);
    // same idea as dataset.pos: a hook for the movement tests, not for the UI
    document.body.dataset.view = view.id;
  }, [view]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, delta) => {
    const lens = camera as unknown as { fov: number; updateProjectionMatrix: () => void };
    if (jukeboxView) {
      camera.position.set(JUKEBOX_AT[0] - 2.71, 1.48, JUKEBOX_AT[1]);
      camera.lookAt(JUKEBOX_AT[0] - .45, 1.68, JUKEBOX_AT[1]);
      if (lens.fov !== 88) {
        lens.fov = 88;
        lens.updateProjectionMatrix();
      }
      return;
    }
    if (dartsCam) {
      camera.position.set(DARTS.oche[0], DARTS.oche[1], DARTS.oche[2]);
      if (coarse) {
        // Square on to the board, so it sits in the middle of a tall screen.
        camera.lookAt(DARTS.wallX, DARTS.boardY, DARTS.boardZ);
        // A little wider than the board, so it keeps a margin at both edges.
        if (lens.fov !== 44) {
          lens.fov = 44;
          lens.updateProjectionMatrix();
        }
        return;
      }
      camera.rotation.set(0.046, -Math.PI / 2, 0, 'YXZ');
      if (lens.fov !== 42) {
        lens.fov = 42;
        lens.updateProjectionMatrix();
      }
      return;
    }
    if (lens.fov !== 90) {
      lens.fov = 90;
      lens.updateProjectionMatrix();
    }
    if (seat) {
      camera.position.set(0, 2.15, 2.0);
      camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      return;
    }
    const step = Math.min(delta, 0.05) * SPEED;
    const dir = new Vector3();

    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) dir.z -= 1;
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) dir.z += 1;
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) dir.x -= 1;
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) dir.x += 1;
    if (move.current) {
      dir.x += move.current.x;
      dir.z += move.current.z;
    }
    if (dir.lengthSq() > 1) dir.normalize();

    if (dir.lengthSq() > 0) {
      const sin = Math.sin(look.yaw);
      const cos = Math.cos(look.yaw);
      // Local +x is right, local -z is forward; rotate into the world by the camera's yaw.
      const dx = dir.x * cos + dir.z * sin;
      const dz = -dir.x * sin + dir.z * cos;
      const nx = pos.current.x + dx * step;
      const nz = pos.current.z + dz * step;
      if (!blocked(nx, pos.current.z, RADIUS, doorOpen.current) && insideBounds(nx, pos.current.z)) {
        pos.current.x = nx;
      }
      if (!blocked(pos.current.x, nz, RADIUS, doorOpen.current) && insideBounds(pos.current.x, nz)) {
        pos.current.z = nz;
      }
    }

    const nearDoor =
      Math.hypot(pos.current.x - DOOR_AT[0], pos.current.z - DOOR_AT[1]) < DOOR_REACH;
    if (nearDoor !== doorOpen.current) {
      doorOpen.current = nearDoor;
      onDoor(nearDoor);
    }

    camera.position.copy(pos.current);
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');

    // Exposed for the movement tests, and handy when checking collision by hand.
    frame.current += 1;
    if (frame.current % 5 === 0) {
      document.body.dataset.pos = `${pos.current.x.toFixed(2)},${pos.current.z.toFixed(2)}`;
      onPosition(pos.current.x, pos.current.z);
    }
  });

  return null;
}

// Everything about the entrance comes from these numbers: frame, track, leaves.
const OPENING = 4.06;      // clear width between the posts
const LEAF = OPENING / 2 - 0.07; // 1.96, the fixed mullion takes the middle 0.14
const MULLION = 0.14;
const STILE = 0.12;
const DOOR_Z = 8.78;
const FRAME_Z = 9.0;
const HEAD = 3.12;         // top of the frame

function Doors({ open }: { open: boolean }) {
  const left = useRef<Object3D>(null);
  const right = useRef<Object3D>(null);

  useFrame((_, delta) => {
    const goals = [open ? -LEAF : 0, open ? LEAF : 0];
    [left, right].forEach((ref, index) => {
      const node = ref.current;
      if (!node) return;
      const goalX = goals[index] ?? 0;
      node.position.x += (goalX - node.position.x) * Math.min(1, delta * 3.2);
    });
  });

  const half = OPENING / 2;

  return (
    <group>
      {/* posts, lintel and track, all derived from OPENING */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (half + 0.17), HEAD / 2, FRAME_Z]}>
          <boxGeometry args={[0.34, HEAD, 0.36]} />
          <meshStandardMaterial color="#241f1b" roughness={0.45} metalness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, HEAD - 0.2, FRAME_Z]}>
        <boxGeometry args={[OPENING + 0.68, 0.4, 0.38]} />
        <meshStandardMaterial color="#241f1b" roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, HEAD - 0.48, DOOR_Z]}>
        <boxGeometry args={[OPENING + 1.4, 0.12, 0.22]} />
        <meshStandardMaterial color="#1f1b18" roughness={0.4} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.03, DOOR_Z]}>
        <boxGeometry args={[OPENING + 1.4, 0.06, 0.16]} />
        <meshStandardMaterial color="#171412" roughness={0.6} metalness={0.4} />
      </mesh>

      <mesh position={[0, 1.38, DOOR_Z - 0.03]}>
        <boxGeometry args={[MULLION, 2.7, 0.12]} />
        <meshStandardMaterial color="#2b2723" roughness={0.38} metalness={0.65} />
      </mesh>

      <group ref={left} position={[0, 0, DOOR_Z]}>
        <Leaf side={-1} />
      </group>
      <group ref={right} position={[0, 0, DOOR_Z]}>
        <Leaf side={1} />
      </group>
    </group>
  );
}

/** One sliding glass leaf. `side` only flips the sign; every size is shared. */
function Leaf({ side }: { side: -1 | 1 }) {
  const inner = side * (MULLION / 2);
  const outer = side * (MULLION / 2 + LEAF);
  const mid = (inner + outer) / 2;
  const glassWidth = LEAF - STILE * 2;

  return (
    <group>
      <mesh position={[mid, 1.38, 0]}>
        <boxGeometry args={[glassWidth, 2.5, 0.02]} />
        <meshStandardMaterial
          color="#cfe3dd"
          roughness={0.05}
          metalness={0.1}
          transparent
          opacity={0.16}
          side={2}
        />
      </mesh>
      {([
        [inner + side * (STILE / 2), STILE, 2.62, 1.36],
        [outer - side * (STILE / 2), STILE, 2.62, 1.36],
        [mid, LEAF, 0.12, 2.62],
        [mid, LEAF, 0.24, 0.14],
      ] as [number, number, number, number][]).map(([x, w, h, y], index) => (
        <mesh key={index} position={[x, y, 0]}>
          <boxGeometry args={[w, h, 0.10]} />
          <meshStandardMaterial color="#2b2723" roughness={0.38} metalness={0.65} />
        </mesh>
      ))}
      <mesh position={[mid, 1.08, 0.07]}>
        <boxGeometry args={[0.05, 0.4, 0.05]} />
        <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.95} />
      </mesh>
    </group>
  );
}

const REPLACED_BLOCKOUT_SURFACES = new Set([
  'wall_left', 'wall_right', 'wall_back', 'card_table', 'card_felt', 'floor', 'sidewalk',
  'ceiling', 'duct_-3.2', 'duct_3.2', 'ring_a', 'ring_b',
  'cove_left', 'cove_right', 'cove_back',
  'pad_body', 'pad_grip_-1', 'pad_grip_1',
  'facade_l', 'facade_r', 'facade_top',
  'bar_body', 'bar_top', 'bar_underlight', 'backbar',
  'rug', 'sofa_seat', 'sofa_back', 'sofa_arm_-1', 'sofa_arm_1', 'coffee_table',
].map((name) => PropertyBinding.sanitizeNodeName(name)));

function Blockout() {
  const gltf = useGLTF('/models/bar/blockout.glb');
  const scene = gltf.scene as Object3D;

  const { triangles, objects } = useMemo(() => {
    let tris = 0;
    let count = 0;
    scene.traverse((node) => {
      count += 1;
      const geometry = (node as Object3D & { geometry?: { index?: { count: number } | null; attributes?: { position?: { count: number } } } }).geometry;
      if (geometry?.attributes?.position) {
        const positions = geometry.attributes.position.count;
        tris += geometry.index ? geometry.index.count / 3 : positions / 3;
      }
    });
    return { triangles: Math.round(tris), objects: count };
  }, [scene]);

  useEffect(() => {
    document.title = `Arkade Bar · ${objects} objects · ${triangles.toLocaleString()} tris`;
    (window as unknown as { __scene?: Object3D }).__scene = scene;
  }, [objects, triangles, scene]);

  // Hide replaced or retired objects in the original room export.
  useEffect(() => {
    scene.traverse((node) => {
      const mesh = node as Object3D & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      if (REPLACED_BLOCKOUT_SURFACES.has(mesh.name) ||
          mesh.name.startsWith('card_chair') || mesh.name.startsWith('ghost_') ||
          mesh.name.startsWith('game_table_') || mesh.name.startsWith('game_chair_') ||
          mesh.name.startsWith('palm_left_') || mesh.name.startsWith('palm_right_') ||
          mesh.name.startsWith('plant_') || mesh.name.startsWith('f_slat_') ||
          mesh.name.startsWith('shelf_') || mesh.name.startsWith('bottle_') ||
          mesh.name.startsWith('stool_')) {
        mesh.visible = false;
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}


/** Pixel glyphs, so the neon reads as an arcade marquee rather than a web font. */
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

/** The neon above the door: pixel letters drawn into a canvas, then blinked. */
function NeonSign() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const text = 'ARKADE BAR';
    const gap = 1;
    const units = [...text].reduce((sum, ch) => sum + (GLYPHS[ch]?.[0]?.length ?? 3) + gap, 0) - gap;
    const pixel = Math.min(20, Math.floor((canvas.width * 0.88) / units));
    const width = units * pixel;
    const height = 7 * pixel;
    const x0 = (canvas.width - width) / 2;
    const y0 = (canvas.height - height) / 2;

    const pixelRect = (x: number, y: number, color: string, blur: number, inset: number) => {
      ctx.shadowColor = 'rgba(255, 150, 50, 0.95)';
      ctx.shadowBlur = blur;
      ctx.fillStyle = color;
      const s = pixel - inset * 2;
      ctx.beginPath();
      ctx.roundRect(x + inset, y + inset, s, s, 2);
      ctx.fill();
    };

    let cursor = x0;
    for (const ch of text) {
      const glyph = GLYPHS[ch] ?? GLYPHS[' ']!;
      for (let row = 0; row < 7; row += 1) {
        const line = glyph[row] ?? '';
        for (let col = 0; col < line.length; col += 1) {
          if (line[col] !== '1') continue;
          const px = cursor + col * pixel;
          const py = y0 + row * pixel;
          pixelRect(px, py, '#ff9a3c', 42, 2);
          pixelRect(px, py, '#ffd9a8', 18, 2);
          pixelRect(px, py, '#fff6e6', 0, 3);
        }
      }
      cursor += (glyph[0]?.length ?? 3) * pixel + gap * pixel;
    }

    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    return tex;
  }, []);

  const material = useRef<MeshBasicMaterial>(null);
  const glow = useRef<PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const hum = 0.88 + 0.07 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 27.7);
    const dip = Math.sin(t * 1.7) > 0.995 || Math.sin(t * 2.31) > 0.997 ? 0.35 : 1;
    if (material.current) material.current.opacity = hum * dip;
    if (glow.current) glow.current.intensity = 9 * hum * dip;
  });

  if (!texture) return null;

  return (
    <group position={[0, 3.71, 9.62]}>
      <mesh>
        <planeGeometry args={[4.4, 1.1]} />
        <meshBasicMaterial
          ref={material}
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
          opacity={0.92}
          alphaTest={0.02}
        />
      </mesh>
      <pointLight ref={glow} position={[0, -0.1, 0.9]} intensity={9} distance={9} color="#ffab55" />
    </group>
  );
}


/** The sky: NASA's star map on one inside-out sphere, carried with the camera. */
function SkyStars() {
  const texture = useTexture('/textures/sky_stars.avif');
  const pivot = useRef<Object3D>(null);
  const sphere = useRef<Object3D>(null);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  useFrame((_, delta) => {
    if (pivot.current) pivot.current.position.copy(camera.position);
    if (sphere.current) sphere.current.rotation.y += delta * 0.002;
  });

  return (
    <group ref={pivot} frustumCulled={false}>
      <mesh ref={sphere} renderOrder={-1000} frustumCulled={false} rotation={[Math.PI / 2 - 0.409, 0, 0]}>
        <sphereGeometry args={[250, 64, 32]} />
        <meshBasicMaterial
          map={texture}
          side={BackSide}
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function WoodWalls() {
  const { scene } = useGLTF('/models/bar/arkade-wood-walls.glb');
  return <primitive object={scene} />;
}

function BarCeiling({ blackjackShadows }: { blackjackShadows: boolean }) {
  const { scene } = useGLTF('/models/bar/arkade-ceiling.glb');
  useLayoutEffect(() => {
    // The first downward ring spot sits to the side of the felt and casts a readable card shadow.
    const spot = scene.getObjectByName(PropertyBinding.sanitizeNodeName('Ring diffuser light'));
    if (!(spot instanceof SpotLight) || !blackjackShadows) return;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.focus = 0.77;
    spot.shadow.bias = -0.00015;
    spot.shadow.normalBias = 0.001;
    return () => {
      spot.castShadow = false;
    };
  }, [scene, blackjackShadows]);
  return <primitive object={scene} />;
}

function RearBar() {
  const { scene } = useGLTF('/models/bar/arkade-rear-bar.glb');
  return (
    <>
      <primitive object={scene} />
      <RearBarShelfStock />
      <CounterNotice />
    </>
  );
}



/**
 * The outside of the two side walls.
 *
 * The room's inner walls are single-sided planes at x = +/-6.86, so from the street
 * you could see straight through them. These are the building's real sides: a brick
 * skin modelled brick by brick, each one sampling its own face from a photo atlas.
 */
function SideWalls() {
  const { scene } = useGLTF('/models/bar/arkade-side-brick.glb');
  return (
    <group>
      <primitive object={scene} />
      {/* wall washers, so the brick reads at night instead of going black */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <pointLight position={[side * 8.7, 3.6, 4.2]} intensity={16} distance={16} color="#ffcf9a" />
          <pointLight position={[side * 8.7, 3.6, -3.4]} intensity={16} distance={16} color="#ffcf9a" />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload('/models/bar/arkade-side-brick.glb');

/** Projects the two card rows so their labels can sit just outside them. */
function LabelAnchors() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const dealer = new Vector3(0, 0.845, 1.5).project(camera);
    const player = new Vector3(0, 0.845, 2.5).project(camera);
    const top = (v: Vector3) => (1 - (v.y * 0.5 + 0.5)) * 100;
    document.documentElement.style.setProperty('--label-dealer', `${top(dealer) - 9}%`);
    document.documentElement.style.setProperty('--label-player', `${top(player) + 6}%`);
  });
  return null;
}


/** The pinball machine on the left wall: the cabinet you actually play. */
function PinballCabinet() {
  const gltf = useGLTF('/models/bar/pinball-cabinet.glb');
  return <primitive object={gltf.scene} position={[PINBALL_AT[0], 0, PINBALL_AT[1]]} />;
}

useGLTF.preload('/models/bar/pinball-cabinet.glb');

function BrickBlitzCabinet() {
  const { scene } = useGLTF('/models/bar/brick-blitz-table.glb');
  return (
    <group position={[BRICK_BLITZ_AT[0], 0, BRICK_BLITZ_AT[1]]} rotation={[0, Math.PI, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function Chesterfield({ at, yaw, lift = 0 }: {
  at: readonly [number, number]; yaw: number; lift?: number;
}) {
  const { scene } = useGLTF('/models/bar/chesterfield.glb');
  return <Clone object={scene} position={[at[0], lift, at[1]]} rotation={[0, yaw, 0]} />;
}

function EntranceLounge() {
  const { scene } = useGLTF('/models/bar/entrance-lounge.glb');
  const shadows = useTexture('/textures/arkade-floor-shadows.png');
  const rugShadow = useMemo(() => {
    const rug = scene.getObjectByName(PropertyBinding.sanitizeNodeName('Entrance lounge | Woven wool'));
    if (!(rug instanceof Mesh)) return null;
    // Reuse the rug's outline so the floor bake continues onto its raised surface.
    const geometry = rug.geometry.clone();
    geometry.applyMatrix4(rug.matrix);
    const vertices = geometry.getAttribute('position');
    const uv = new Float32Array(vertices.count * 2);
    for (let i = 0; i < vertices.count; i++) {
      uv[2 * i] = (vertices.getX(i) + ENTRANCE_TABLE_AT[0] + 7) / 14;
      uv[2 * i + 1] = (9 - vertices.getZ(i) - ENTRANCE_TABLE_AT[1]) / 18;
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    return geometry;
  }, [scene]);
  useEffect(() => () => rugShadow?.dispose(), [rugShadow]);
  return (
    <>
      <Chesterfield at={ENTRANCE_COUCH_AT} yaw={Math.PI} lift={.012} />
      <primitive object={scene} position={[ENTRANCE_TABLE_AT[0], 0, ENTRANCE_TABLE_AT[1]]} />
      {rugShadow && (
        <mesh geometry={rugShadow} position={[ENTRANCE_TABLE_AT[0], .0005, ENTRANCE_TABLE_AT[1]]}>
          <meshBasicMaterial map={shadows} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

function BarFloor() {
  const { scene } = useGLTF('/models/bar/arkade-walnut-floor.glb');
  const shadows = useTexture('/textures/arkade-floor-shadows.png');
  return (
    <>
      <primitive object={scene} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .002, 0]}>
        <planeGeometry args={[14, 18]} />
        <meshBasicMaterial map={shadows} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

function EntrancePaving() {
  const { scene } = useGLTF('/models/bar/arkade-entrance-paving.glb');
  return <primitive object={scene} />;
}

function EntranceFacade() {
  const { scene } = useGLTF('/models/bar/arkade-entrance-facade.glb');
  return <primitive object={scene} />;
}

function EntrancePlanters() {
  const { scene } = useGLTF('/models/bar/arkade-entrance-planter.glb');
  return ENTRANCE_PLANTERS.map(([x, z], index) => (
    <Clone key={x} object={scene} position={[x, 0, z]} rotation={[0, index ? 0.72 : -0.28, 0]} />
  ));
}

function InteriorPlanters() {
  const { scene } = useGLTF('/models/bar/arkade-interior-planter.glb');
  return INTERIOR_PLANTERS.map(([x, z], index) => (
    <Clone key={index} object={scene} position={[x, 0, z]} rotation={[0, 0.35 + index * 1.31, 0]} />
  ));
}

// Six square views cover the room around the player, independent of window aspect.
const WARM_ROOM_ANGLES = [
  [0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2],
  [Math.PI / 2, 0], [-Math.PI / 2, 0],
] as const;

function WarmRoom({ onReady }: { onReady: () => void }) {
  const camera = useMemo(() => new PerspectiveCamera(90, 1, .05, 400), []);
  const frame = useRef(0);

  // Render one view per frame with the same renderer the player will use.
  // Positive priority runs after Player and replaces Fiber's default draw.
  useFrame(({ gl, scene, camera: playerCamera }) => {
    const step = frame.current++;
    const angle = WARM_ROOM_ANGLES[step - 1];
    if (angle) {
      const [pitch, yaw] = angle;
      camera.position.copy(playerCamera.position);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      gl.render(scene, camera);
      return;
    }
    gl.render(scene, playerCamera);
    // Draw the settled return view before the loader can start fading.
    if (step === WARM_ROOM_ANGLES.length + 1) onReady();
  }, 1);

  return null;
}

type JukeboxListenerUpdate = (x: number, y: number, z: number, fx: number, fy: number, fz: number, doorOpen: boolean) => void;

function JukeboxListener({ update, doorOpen }: { update: JukeboxListenerUpdate; doorOpen: boolean }) {
  const forward = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(forward);
    update(camera.position.x, camera.position.y, camera.position.z, forward.x, forward.y, forward.z, doorOpen);
  });
  return null;
}

function DebugScene() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const w = window as unknown as { __three?: Object3D; __camera?: unknown };
    w.__three = scene;
    w.__camera = camera;
  }, [scene, camera]);
  return null;
}

export function BarScene({
  view,
  look,
  move,
  seat,
  blackjack,
  darts,
  dartsOn,
  paused,
  onDartThrow,
  onNarrowsPlay,
  onPosition,
  onReady,
  onTableReady,
  onSeatedVisible,
  seatedVisibleKey,
  loadingId,
  warmRoom,
  jukebox,
}: {
  view: View;
  look: Look;
  move: React.RefObject<{ x: number; z: number }>;
  seat: boolean;
  blackjack: BlackjackState;
  darts: DartsState;
  dartsOn: boolean;
  paused?: boolean;
  onDartThrow: (shot: Shot) => void;
  onNarrowsPlay: () => void;
  onPosition: (x: number, z: number) => void;
  onReady?: () => void;
  /** The seated table and its cards are on screen. */
  onTableReady?: () => void;
  /** Fires a few drawn frames after the loading screen has gone, so the table is seen. */
  onSeatedVisible?: () => void;
  seatedVisibleKey?: number;
  loadingId?: number;
  warmRoom?: boolean;
  jukebox: JukeboxControls & { updateListener: JukeboxListenerUpdate };
}) {
  const [doorOpen, setDoorOpen] = useState(false);
  /** Phones stand at the oche looking straight at the board. */
  const [coarse] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    document.body.dataset.door = doorOpen ? 'open' : 'closed';
  }, [doorOpen]);

  return (
    <Canvas shadows={coarse ? (seat ? "percentage" : false) : "percentage"} dpr={coarse ? [1, 1.25] : [1, 2]} gl={{ antialias: !coarse }} frameloop={paused ? 'never' : 'always'} camera={{ position: VIEWS[0]!.position, fov: 90, near: 0.05, far: 400 }}>
      <color attach="background" args={['#070d0a']} />
      <fog attach="fog" args={['#070d0a', 20, 55]} />
      {!seat && (warmRoom && onReady
        ? <WarmRoom key={loadingId} onReady={onReady} />
        : <ReadySignal key={loadingId} onReady={onReady} />)}
      <ambientLight intensity={0.38} color="#ffd9a8" />
      <hemisphereLight args={['#ffcf9a', '#0a1a12', 0.35]} />
      <pointLight position={[0, 4.2, 13.5]} intensity={seat ? 10 : 18} distance={14} color="#ffbf73" />
      <DebugScene />
      <Player
        view={view}
        look={look}
        move={move}
        onDoor={setDoorOpen}
        seat={seat}
        dartsCam={dartsOn}
        jukeboxView={jukebox.focused}
        onPosition={onPosition}
      />
      <JukeboxListener update={jukebox.updateListener} doorOpen={doorOpen} />
      <SkyStars />
      <SideWalls />
      <DartsBoard state={darts} onThrow={onDartThrow} active={dartsOn} mobile={coarse} />
      <LabelAnchors />
      <BlackjackTable receiveShadow={seat} />
      {/* The room stays mounted while seated. Unmounting it meant the whole scene
          suspended on the way back up, which left the player outside in the stars. */}
      {(
        <>
          <Doors open={doorOpen} />
          <NeonSign />
          <WoodWalls />
          <BarFloor />
          <EntrancePaving />
          <EntranceFacade />
          <EntrancePlanters />
          <InteriorPlanters />
          <BarCeiling blackjackShadows={seat} />
          <BlackjackHangingSign />
          <Blockout />
          <RearBar />
          <PinballCabinet />
          <PinballNeon />
          <RescueBoatNeon />
          <BrickBlitzCabinet />
          <Jukebox {...jukebox} />
          <JukeboxNeon />
          <Chesterfield at={CHESTERFIELD_AT} yaw={Math.PI / 2} />
          <EntranceLounge />
          <NarrowsCabinet position={[NARROWS_AT[0], 0, NARROWS_AT[1]]} rotation={NARROWS_YAW} scale={NARROWS_SCALE} onClick={(event) => {
            const { x, z } = event.camera.position;
            if (dartsOn || jukebox.focused || event.delta > 6 || Math.hypot(x - NARROWS_AT[0], z - NARROWS_AT[1]) > NARROWS_REACH) return;
            event.stopPropagation();
            onNarrowsPlay();
          }} />
          <BrickBlitzNeon />
          <DartsNeon wallX={DARTS.wallX} boardZ={DARTS.boardZ} />
        </>
      )}
      {seat && (
        <>
          <Suspense fallback={null}>
            <BlackjackCards state={blackjack} />
            <ReadySignal key={loadingId} onReady={onTableReady ?? onReady} />
          </Suspense>
          <TableResult outcome={blackjack.phase === 'verdict' ? blackjack.outcome : null} />
          {seatedVisibleKey ? (
            <ReadySignal key={`seated-${seatedVisibleKey}`} onReady={onSeatedVisible} />
          ) : null}
        </>
      )}
    </Canvas>
  );
}

export type { Look };
