import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import type { Object3D } from 'three';
import { BackSide, CanvasTexture, LinearFilter, MeshBasicMaterial, MeshStandardMaterial, PointLight, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';
import type { View } from './views';
import { VIEWS } from './views';
import { blocked, insideBounds, DOOR_AT } from './colliders';
import { BlackjackCards, BlackjackTable } from '@/games/blackjack/Blackjack3D';
import type { BlackjackState } from '@/games/blackjack/useBlackjack';

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
  onPosition,
}: {
  view: View;
  look: Look;
  move: React.RefObject<{ x: number; z: number }>;
  onDoor: (open: boolean) => void;
  seat: boolean;
  onPosition: (x: number, z: number) => void;
}) {
  const camera = useThree((s) => s.camera);
  const pos = useRef(new Vector3(view.position[0], EYE, view.position[2]));
  const doorOpen = useRef(false);
  const keys = useRef(new Set<string>());
  const frame = useRef(0);

  useEffect(() => {
    pos.current.set(view.position[0], EYE, view.position[2]);
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

  // The model's own walls step aside; the interior walls are drawn as planes
  // with UVs we control, so the planks always run upright.
  useEffect(() => {
    scene.traverse((node) => {
      const mesh = node as Object3D & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      const hide = ['wall_left', 'wall_right', 'wall_back', 'card_table', 'card_felt'];
      if (hide.includes(mesh.name) || mesh.name.startsWith('card_chair')) {
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
    <group position={[0, 3.12, 9.62]}>
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
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
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
  const wood = useTexture('/textures/wood-wall.png');

  const walls: { pos: [number, number, number]; rotY: number; w: number; h: number }[] = [
    { pos: [-6.86, 2.1, 0], rotY: Math.PI / 2, w: 18, h: 4.2 },
    { pos: [6.86, 2.1, 0], rotY: -Math.PI / 2, w: 18, h: 4.2 },
    { pos: [0, 2.1, -8.86], rotY: 0, w: 14, h: 4.2 },
  ];

  return (
    <group>
      {walls.map((wall, index) => {
        const tex = wood.clone();
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        // the sample holds four planks across; planks are ~0.2 m wide, 1.8 m long
        tex.repeat.set((wall.w / 0.85) / 4 * 4, wall.h / 1.8);
        return (
          <mesh key={index} position={wall.pos} rotation={[0, wall.rotY, 0]}>
            <planeGeometry args={[wall.w, wall.h]} />
            <meshStandardMaterial map={tex} color={0x8f8170} roughness={0.74} metalness={0.02} />
          </mesh>
        );
      })}
    </group>
  );
}


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
  onPosition,
}: {
  view: View;
  look: Look;
  move: React.RefObject<{ x: number; z: number }>;
  seat: boolean;
  blackjack: BlackjackState;
  onPosition: (x: number, z: number) => void;
}) {
  const [doorOpen, setDoorOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.door = doorOpen ? 'open' : 'closed';
  }, [doorOpen]);

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: VIEWS[0]!.position, fov: 90, near: 0.05, far: 400 }}>
      <color attach="background" args={['#070d0a']} />
      <fog attach="fog" args={['#070d0a', 20, 55]} />
      <ambientLight intensity={0.55} color="#ffd9a8" />
      <hemisphereLight args={['#ffcf9a', '#0a1a12', 0.5]} />
      <pointLight position={[0, 3.6, 6.5]} intensity={22} distance={16} color="#ffbf73" />
      <pointLight position={[0, 3.6, -3.0]} intensity={16} distance={14} color="#ffbf73" />
      <pointLight position={[-5.6, 2.6, -0.6]} intensity={10} distance={10} color="#ff3fae" />
      <pointLight position={[5.6, 2.6, -1.4]} intensity={10} distance={10} color="#35d8ff" />
      <pointLight position={[0, 4.2, 13.5]} intensity={18} distance={14} color="#ffbf73" />
      {/* symmetric pair: the entrance must read the same on both sides */}
      <pointLight position={[-3.4, 2.6, 6.6]} intensity={10} distance={11} color="#ffbf73" />
      <pointLight position={[3.4, 2.6, 6.6]} intensity={10} distance={11} color="#ffbf73" />
      <DebugScene />
      <Player
        view={view}
        look={look}
        move={move}
        onDoor={setDoorOpen}
        seat={seat}
        onPosition={onPosition}
      />
      <BlackjackTable />
      <Suspense fallback={null}>
        <BlackjackCards state={blackjack} />
      </Suspense>
      <Doors open={doorOpen} />
      <SkyStars />
      <LabelAnchors />
      <NeonSign />
      <WoodWalls />
      <Blockout />
    </Canvas>
  );
}

export type { Look };
