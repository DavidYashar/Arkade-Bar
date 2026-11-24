import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { playPlace, playTap } from '@/lib/sfx';
import { BOARD_RADIUS_MM, CHARGE_SECONDS, RELEASE_MAX, RELEASE_MIN, releaseDart, type Shot } from './board';
import type { DartsState, Landed } from './useDarts';
import { paintChalkTall, type ChalkRow } from './chalk';

/** The board is a standard 451 mm one, drawn 1.5 times over so it reads across the room. */
export const BOARD_SCALE = 1.5;
const BOARD_Z = 6.4;

export const DARTS = {
  wallX: 6.86,
  boardY: 1.73,
  boardZ: BOARD_Z,
  radius: 0.2255 * BOARD_SCALE,
  oche: [6.86 - 0.06 - 2.37, 1.62, BOARD_Z] as [number, number, number],
};

const FACE_X = DARTS.wallX - 0.012;
const S = BOARD_SCALE / 1000;
const WORLD = (xMm: number, yMm: number): [number, number, number] => [
  FACE_X,
  DARTS.boardY + yMm * S,
  DARTS.boardZ + xMm * S,
];

const AIM_SPEED = 150;
const DART_SCALE = 1.15;
const THROW_FROM: [number, number, number] = [DARTS.oche[0] + .5, DARTS.oche[1] - .04, DARTS.oche[2] + .02];
const NEEDLE = new THREE.Vector3(-1, 0, 0);

/** Three darts already in the board when nobody is playing. */
const IDLE_DARTS: Array<{ x: number; y: number; twist: number }> = [
  { x: 2, y: 96, twist: 0.25 },
  { x: -58, y: -34, twist: -0.35 },
  { x: 74, y: 22, twist: 0.5 },
];



function useChalkboard(rows: ChalkRow[], round: number, writing: number) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 460;
    c.height = 700;
    return c;
  }, []);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintChalkTall(ctx, canvas.width, canvas.height, rows, round, writing);
    texture.needsUpdate = true;
  }, [canvas, round, rows, texture, writing]);

  return texture;
}

function useDartModel() {
  const gltf = useGLTF('/models/bar/dart.glb');
  return useMemo(() => gltf.scene.clone(true), [gltf.scene]);
}

function StuckDart({ x, y, twist = 0, duration }: { x: number; y: number; twist?: number; duration?: number }) {
  const dart = useDartModel();
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  const target = useMemo(() => WORLD(x, y), [x, y]);
  const rotation = useMemo(() => {
    const direction = duration === undefined ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(
      target[0] - THROW_FROM[0],
      target[1] - THROW_FROM[1] - 4.9 * duration ** 2,
      target[2] - THROW_FROM[2],
    ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(NEEDLE, direction);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(NEEDLE, twist));
  }, [duration, target, twist]);

  useFrame((_, delta) => {
    if (duration === undefined || !group.current || age.current >= .36) return;
    age.current = Math.min(.36, age.current + delta);
    const t = age.current;
    group.current.quaternion.copy(rotation);
    group.current.rotateY(Math.sin(t * 76) * (1 - t / .36) * .08);
  });

  return (
    <group ref={group} position={target} quaternion={rotation} scale={DART_SCALE}>
      <primitive object={dart} />
    </group>
  );
}

function FallingDart({ x, y }: { x: number; y: number }) {
  const dart = useDartModel();
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  const start = useMemo(() => WORLD(x, y), [x, y]);
  const drift = useMemo(() => new THREE.Euler(Math.random() * 2, Math.random() * 6, Math.random() * 2), []);
  const floor = 0.035;

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    age.current = Math.min(2, age.current + delta);
    const t = age.current;
    const drop = 4.9 * t * t;
    const yPos = Math.max(floor, start[1] - drop);
    node.position.set(start[0] - Math.min(0.30, 0.16 * t), yPos, start[2] + Math.sin(t * 2.6) * 0.03);
    node.rotation.set(drift.x + t * 7, drift.y + t * 4, drift.z + t * 5);
  });

  return (
    <group ref={group} position={start} scale={DART_SCALE}>
      <primitive object={dart} />
    </group>
  );
}

function FlyingDart({ shot, onImpact, onFinish }: { shot: Shot; onImpact: (shot: Shot) => void; onFinish: () => void }) {
  const dart = useDartModel();
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  const impacted = useRef(false);
  const finished = useRef(false);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => WORLD(shot.x, shot.y), [shot.x, shot.y]);
  const rebounds = shot.bounce || Math.hypot(shot.x, shot.y) > BOARD_RADIUS_MM;

  useFrame((_, delta) => {
    const node = group.current;
    if (!node || finished.current) return;
    age.current += delta;
    const t = Math.min(1, age.current / shot.duration);
    const arc = 4.9 * shot.duration ** 2;
    node.position.set(
      THREE.MathUtils.lerp(THROW_FROM[0], target[0], t),
      THREE.MathUtils.lerp(THROW_FROM[1], target[1], t) + arc * t * (1 - t),
      THREE.MathUtils.lerp(THROW_FROM[2], target[2], t),
    );
    direction.set(target[0] - THROW_FROM[0], target[1] - THROW_FROM[1] + arc * (1 - 2 * t),
                  target[2] - THROW_FROM[2]).normalize();
    node.quaternion.setFromUnitVectors(NEEDLE, direction);
    if (t < 1) return;

    if (!impacted.current) {
      impacted.current = true;
      onImpact(shot);
      if (rebounds) playTap(.65);
      else playPlace(.5);
    }
    const fall = age.current - shot.duration;
    if (rebounds && fall < .38) {
      node.position.set(target[0] - 1.25 * fall, target[1] + .35 * fall - 4.9 * fall ** 2,
                        target[2] + .25 * fall);
      node.rotateZ(fall * 14);
      return;
    }
    finished.current = true;
    onFinish();
  });

  return (
    <group ref={group} position={THROW_FROM} scale={DART_SCALE}>
      <primitive object={dart} />
    </group>
  );
}
/** The dart in hand: only while a throw is actually being set up. */
function HandDart({
  charging,
  power,
  aim,
}: {
  charging: boolean;
  power: { current: number };
  aim: { current: { x: number; y: number } };
}) {
  const dart = useDartModel();
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    const t = clock.elapsedTime;
    const tremble = charging ? power.current * 0.006 : 0;
    node.position.set(
      DARTS.oche[0] + 0.5 + Math.sin(t * 1.7) * 0.004 + Math.sin(t * 21) * tremble,
      DARTS.oche[1] - 0.04 + Math.cos(t * 1.3) * 0.004 + Math.cos(t * 19) * tremble,
      DARTS.oche[2] + 0.02 + Math.sin(t * 1.1) * 0.004,
    );
    // the point always looks at the target it will be thrown at
    const [tx, ty, tz] = WORLD(aim.current.x, aim.current.y);
    const dir = new THREE.Vector3(tx - node.position.x, ty - node.position.y, tz - node.position.z).normalize();
    node.quaternion.setFromUnitVectors(NEEDLE, dir);
  });

  return (
    <group ref={group} scale={DART_SCALE * 0.95}>
      <primitive object={dart} />
    </group>
  );
}

export function DartsBoard({
  state,
  onThrow,
  active,
  mobile = false,
}: {
  state: DartsState;
  onThrow: (shot: Shot) => void;
  active: boolean;
  mobile?: boolean;
}) {
  const { scene: boardScene } = useGLTF('/models/bar/dartboard.glb');
  const { scene: chalkboard } = useGLTF('/models/bar/chalkboard.glb');
  const { scene: lights } = useGLTF('/models/bar/arkade-darts-lights.glb');
  const [writing, setWriting] = useState(0);
  const rows = useMemo(() => state.rounds.map((value, index) => ({ index, value })), [state.rounds]);
  const chalk = useChalkboard(rows, state.round, writing);

  const aim = useRef({ x: 0, y: 0 });
  const visibleAim = useRef({ x: 0, y: 0 });
  const power = useRef(0);
  const charge = useRef<{ pointer: number; started: number } | null>(null);
  const keys = useRef(new Set<string>());
  const meter = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [flight, setFlight] = useState<Shot | null>(null);
  const throwing = useRef(false);

  const canThrow = active && state.phase === 'aiming' && flight === null;

  useEffect(() => {
    if (active && state.phase !== 'idle' && state.phase !== 'summary') return;
    throwing.current = false;
    setFlight(null);
    aim.current = { x: 0, y: 0 };
    visibleAim.current = { x: 0, y: 0 };
  }, [active, state.phase]);

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        if (e.code.startsWith('Arrow')) e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      blur();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [active]);

  useEffect(() => {
    if (!canThrow) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || charge.current || throwing.current) return;
      // Controls are not the table: only the throw key may start a dart.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-darts-ui]')) return;
      if (target?.closest('button, a, input') && !target.closest('[data-darts-throw]')) return;
      charge.current = { pointer: e.pointerId, started: performance.now() };
      power.current = 0;
      setIsCharging(true);
    };
    const cancel = () => {
      charge.current = null;
      power.current = 0;
      setIsCharging(false);
    };
    const up = (e: PointerEvent) => {
      const held = charge.current;
      if (e.button !== 0 || held?.pointer !== e.pointerId) return;
      cancel();
      const { x, y } = visibleAim.current;
      throwing.current = true;
      setFlight(releaseDart(x, y, (performance.now() - held.started) / 1000, Math.random()));
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [canThrow]);

  useEffect(() => {
    if (state.phase !== 'settled') return;
    setWriting(0);
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / 900);
      setWriting(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.round]);

  useFrame(({ clock }, delta) => {
    if (canThrow) {
      const fineAim = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight');
      const step = Math.min(delta, 0.05) * AIM_SPEED * (fineAim ? .22 : 1);
      if (keys.current.has('ArrowLeft')) aim.current.x -= step;
      if (keys.current.has('ArrowRight')) aim.current.x += step;
      if (keys.current.has('ArrowUp')) aim.current.y += step;
      if (keys.current.has('ArrowDown')) aim.current.y -= step;
      const limit = 205;
      aim.current.x = THREE.MathUtils.clamp(aim.current.x, -limit, limit);
      aim.current.y = THREE.MathUtils.clamp(aim.current.y, -limit, limit);

      const held = charge.current ? (performance.now() - charge.current.started) / 1000 : 0;
      power.current = Math.min(1, held / CHARGE_SECONDS);

      const t = clock.elapsedTime;
      const tremor = 1.6 + Math.min(16, Math.max(0, power.current - RELEASE_MAX) * 24 + Math.max(0, held - CHARGE_SECONDS) * 7);
      const shakeX = Math.sin(t * 9.1) * tremor + Math.sin(t * 3.3) * 2.4;
      const shakeY = Math.cos(t * 8.3) * tremor + Math.cos(t * 2.7) * 2.2;
      visibleAim.current.x = aim.current.x + shakeX;
      visibleAim.current.y = aim.current.y + shakeY;
    }

    const bar = meter.current;
    if (bar) {
      const p = power.current;
      bar.scale.y = Math.max(0.02, p);
      bar.position.y = -0.22 + (0.44 * p) / 2;
      bar.visible = active;
      bar.material.color.set(p >= RELEASE_MIN && p <= RELEASE_MAX ? '#9cff91' : p > RELEASE_MAX ? '#ff7450' : '#ffb347');
    }
  });

  return (
    <group>
      {/* the board from Blender: sisal face, wire spider, brown rim */}
      <group position={[FACE_X, DARTS.boardY, DARTS.boardZ]} scale={BOARD_SCALE}>
        <primitive object={boardScene} />
      </group>

      {/* the chalkboard from Blender, with the chalk written on its slate. On a
          phone it is a flat panel at the top instead, so the board gets the middle. */}
      {!mobile && (
      <group position={[DARTS.wallX - 0.004, DARTS.boardY + 0.05, DARTS.boardZ - 0.66]}>
        <primitive object={chalkboard} />
        <mesh position={[-0.040, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.38, 0.62]} />
          <meshStandardMaterial map={chalk} roughness={0.95} />
        </mesh>
      </group>
      )}


      {/* the oche */}
      <mesh position={[DARTS.oche[0], 0.006, DARTS.oche[2]]}>
        <boxGeometry args={[0.06, 0.012, 1.1]} />
        <meshStandardMaterial color="#8a6a2a" metalness={0.7} roughness={0.35} />
      </mesh>

      <primitive object={lights} position={[DARTS.wallX, DARTS.boardY, DARTS.boardZ]} />

      {/* in the room, three darts wait in the board; in a game, only what has been thrown */}
      {!active && IDLE_DARTS.map((dart, i) => <StuckDart key={`idle-${i}`} x={dart.x} y={dart.y} twist={dart.twist} />)}
      {state.current.filter((dart) => dart.sticks && !dart.fallen).map((dart) => (
        <StuckDart key={dart.id} x={dart.x} y={dart.y} duration={dart.duration} />
      ))}
      {state.current.filter((dart) => dart.fallen).map((dart) => (
        <FallingDart key={`fall-${dart.id}`} x={dart.x} y={dart.y} />
      ))}
      {active && flight && <FlyingDart shot={flight} onImpact={onThrow} onFinish={() => {
        throwing.current = false;
        setFlight(null);
      }} />}
      {canThrow && <HandDart charging={isCharging} power={power} aim={visibleAim} />}

    </group>
  );
}

useGLTF.preload('/models/bar/dartboard.glb');
useGLTF.preload('/models/bar/chalkboard.glb');
useGLTF.preload('/models/bar/arkade-darts-lights.glb');
useGLTF.preload('/models/bar/dart.glb');

