import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { Object3D } from 'three';
import { Vector3 } from 'three';
import type { View } from './views';
import { VIEWS } from './views';
import { blocked, insideBounds, DOOR_AT } from './colliders';

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
}: {
  view: View;
  look: Look;
  move: React.RefObject<{ x: number; z: number }>;
  onDoor: (open: boolean) => void;
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
    }
  });

  return null;
}

const DOOR_W = 1.96; // each leaf
const DOOR_Z = 8.8;
const MULLION = 0.14;

function Doors({ open }: { open: boolean }) {
  const left = useRef<Object3D>(null);
  const right = useRef<Object3D>(null);

  useFrame((_, delta) => {
    const goals = [open ? -DOOR_W : 0, open ? DOOR_W : 0];
    [left, right].forEach((ref, index) => {
      const node = ref.current;
      if (!node) return;
      const goalX = goals[index] ?? 0;
      node.position.x += (goalX - node.position.x) * Math.min(1, delta * 3.2);
    });
  });

  return (
    <group>
      <mesh position={[0, 2.78, DOOR_Z]}>
        <boxGeometry args={[9.4, 0.14, 0.24]} />
        <meshStandardMaterial color="#24211d" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.03, DOOR_Z]}>
        <boxGeometry args={[9.4, 0.06, 0.18]} />
        <meshStandardMaterial color="#1b1916" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* A fixed mullion at the centre, so the two panes are visibly identical. */}
      <mesh position={[0, 1.36, DOOR_Z - 0.02]}>
        <boxGeometry args={[MULLION, 2.7, 0.12]} />
        <meshStandardMaterial color="#2b2723" roughness={0.38} metalness={0.65} />
      </mesh>

      {/* One definition, mirrored: the leaves cannot differ. */}
      <group ref={left} position={[-MULLION / 2 - DOOR_W, 0, DOOR_Z]}>
        <Leaf />
      </group>
      <group ref={right} position={[MULLION / 2 + DOOR_W, 0, DOOR_Z]} scale={[-1, 1, 1]}>
        <Leaf />
      </group>
    </group>
  );
}

/** One sliding glass leaf, DOOR_W wide, built from its left edge. */
function Leaf() {
  const stile = 0.08;
  const glass = DOOR_W - stile * 2;
  const bars: [number, number, number, number, number][] = [
    [stile, 2.62, 0.10, stile / 2, 1.36],
    [stile, 2.62, 0.10, DOOR_W - stile / 2, 1.36],
    [DOOR_W, 0.12, 0.10, DOOR_W / 2, 2.62],
    [DOOR_W, 0.24, 0.10, DOOR_W / 2, 0.14],
  ];

  return (
    <group>
      <mesh position={[DOOR_W / 2, 1.38, 0]}>
        <boxGeometry args={[glass, 2.5, 0.02]} />
        <meshStandardMaterial
          color="#cfe3dd"
          roughness={0.05}
          metalness={0.1}
          transparent
          opacity={0.16}
          side={2}
        />
      </mesh>
      {bars.map(([w, h, d, x, y], index) => (
        <mesh key={index} position={[x, y, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#2b2723" roughness={0.38} metalness={0.65} />
        </mesh>
      ))}
      <mesh position={[DOOR_W - 0.08, 1.08, 0.07]}>
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
  }, [objects, triangles]);

  return <primitive object={scene} />;
}

export function BarScene({ view, look, move }: { view: View; look: Look; move: React.RefObject<{ x: number; z: number }> }) {
  const [doorOpen, setDoorOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.door = doorOpen ? 'open' : 'closed';
  }, [doorOpen]);

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: VIEWS[0]!.position, fov: 60, near: 0.05, far: 140 }}>
      <color attach="background" args={['#070d0a']} />
      <fog attach="fog" args={['#070d0a', 20, 55]} />
      <ambientLight intensity={0.55} color="#ffd9a8" />
      <hemisphereLight args={['#ffcf9a', '#0a1a12', 0.5]} />
      <pointLight position={[0, 3.6, 6.5]} intensity={22} distance={16} color="#ffbf73" />
      <pointLight position={[0, 3.6, -3.0]} intensity={16} distance={14} color="#ffbf73" />
      <pointLight position={[-5.6, 2.6, -0.6]} intensity={10} distance={10} color="#ff3fae" />
      <pointLight position={[5.6, 2.6, -1.4]} intensity={10} distance={10} color="#35d8ff" />
      <pointLight position={[0, 4.2, 13.5]} intensity={18} distance={14} color="#ffbf73" />
      <Player view={view} look={look} move={move} onDoor={setDoorOpen} />
      <Doors open={doorOpen} />
      <Blockout />
    </Canvas>
  );
}

export type { Look };
