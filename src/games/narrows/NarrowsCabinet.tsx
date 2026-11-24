import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, SRGBColorSpace } from 'three';
import { BlurredBarFloor } from '@/arcade/BlurredBarFloor';
import { ReadySignal } from '@/arcade/ReadySignal';

const CABINET_URL = '/models/bar/narrows-cabinet.glb';
const ATTRACT_URL = '/textures/narrows-attract.png';
const SCREEN_NAME = 'NarrowsScreen';
// Dimensions and slope of the display built by art/build_narrows_cabinet.py.
const SCREEN_CENTER = [0, 1.073, .09] as const;
const SCREEN_TILT = Math.PI / 20;
// The solid rear rail spans from the screen pocket to the cabinet's far edge.
const REAR_RAIL_Z = -.64;
const REAR_RAIL_Y = SCREEN_CENTER[1] + .04 - REAR_RAIL_Z * Math.sin(SCREEN_TILT);

function RearRailInscription() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 208;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = [
      { text: 'shoot: space', y: 61, size: 64 },
      { text: 'left and right: left arrow & right arrow.', y: 144, size: 46 },
    ];
    for (const { text, y, size } of lines) {
      ctx.font = `bold ${size}px Georgia, serif`;
      ctx.strokeStyle = '#392015';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, 512, y + 2, 964);
      ctx.fillStyle = '#e9cd91';
      ctx.fillText(text, 512, y, 964);
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh name="Rescue Boat controls inscription" position={[0, REAR_RAIL_Y + .002, REAR_RAIL_Z]}
      rotation={[SCREEN_TILT - Math.PI / 2, 0, 0]}>
      <planeGeometry args={[.84, .17]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function NarrowsCabinet({
  board, position, rotation = 0, scale = 1, onClick,
}: {
  board?: HTMLCanvasElement;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const { scene } = useGLTF(CABINET_URL);
  const attract = useTexture(ATTRACT_URL);
  const screen = useMemo(() => {
    const texture = board ? new CanvasTexture(board) : attract.clone();
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    if (board) {
      // crop the pale sky strip at the head of the board, so the glass starts on
      // the river and the strip sits up behind the wooden frame
      texture.repeat.set(.94, .875);
      texture.offset.set(.03, .125);
    }
    if (!board) {
      // Center the still inside the portrait display without distorting it.
      const image = attract.image as HTMLImageElement;
      const crop = (2 / 3) / (image.width / image.height);
      texture.repeat.x = crop;
      texture.offset.x = (1 - crop) / 2;
    }
    texture.needsUpdate = true;
    return texture;
  }, [board, attract]);
  const { object, material } = useMemo(() => {
    const object = scene.clone(true);
    const material = new MeshBasicMaterial({ map: screen, toneMapped: false });
    const display = object.getObjectByName(SCREEN_NAME);
    if (display instanceof Mesh) display.material = material;
    return { object, material };
  }, [scene, screen]);

  useEffect(() => () => {
    material.dispose();
    screen.dispose();
  }, [material, screen]);
  useFrame(() => {
    if (board) screen.needsUpdate = true;
  });

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale} onClick={onClick} name="The Narrows cabinet">
      <primitive object={object} />
      {board && <RearRailInscription />}
    </group>
  );
}

function PlayCamera() {
  const camera = useThree(({ camera }) => camera);
  const { width, height } = useThree(({ size }) => size);
  useLayoutEffect(() => {
    if ((!('isPerspectiveCamera' in camera) && !(camera instanceof OrthographicCamera)) || !width || !height) return;
    const aspect = width / height;
    if (camera instanceof PerspectiveCamera) {
      const [, py, pz] = SCREEN_CENTER;
      const tiltSin = Math.sin(SCREEN_TILT);
      const tiltCos = Math.cos(SCREEN_TILT);
      // On a phone you are not standing at the cabinet: the camera looks straight
      // down the screen's normal, so the frame and the board read flat, no angle.
      const headOn = typeof window !== 'undefined'
        && window.matchMedia('(pointer: coarse)').matches;
      const off = headOn ? 0 : -Math.PI / 5.4;
      const halfTan = Math.tan((31 * Math.PI) / 360);
      // Head on, the frame is sized off the surface's height: it fills MOST of it,
      // with a strip left at the bottom for controls and a hair at the top.
      const FACE_HEIGHT = 1.57;
      const FILL = .8;
      const reach = headOn
        ? FACE_HEIGHT / (FILL * 2 * halfTan)
        : Math.max(2.66, 1.02 / (2 * halfTan * aspect), 1.5 / (2 * halfTan));
      // A lift of the aim moves the cabinet up, opening the strip at the bottom.
      // The screen sits above the cabinet's middle, so the aim drops to even the
      // gap above and below the frame.
      const lift = headOn ? -FACE_HEIGHT * .0545 : 0;
      const normal = [0, tiltCos, tiltSin] as const;
      const up = [0, tiltSin, -tiltCos] as const;
      camera.fov = 31;
      camera.aspect = aspect;
      camera.position.set(
        normal[0] * reach * Math.cos(off) + up[0] * reach * Math.sin(off),
        py + normal[1] * reach * Math.cos(off) + up[1] * reach * Math.sin(off),
        pz + normal[2] * reach * Math.cos(off) + up[2] * reach * Math.sin(off),
      );
      camera.up.set(...up);
      camera.lookAt(
        SCREEN_CENTER[0] - up[0] * lift,
        SCREEN_CENTER[1] - up[1] * lift,
        SCREEN_CENTER[2] - up[2] * lift,
      );
      camera.updateProjectionMatrix();
      return;
    }
    if (!(camera instanceof OrthographicCamera)) return;
    const viewHeight = Math.max(1.62, 1.09 / aspect);
    camera.left = -viewHeight * aspect / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.zoom = 1;
    const [, y, z] = SCREEN_CENTER;
    const sin = Math.sin(SCREEN_TILT);
    const cos = Math.cos(SCREEN_TILT);
    // The glass is viewed 30 degrees off its normal, so the board reads as a
    // surface you are standing at rather than a flat picture.
    const off = Math.PI / 6;
    const reach = 2.85;
    const normal = [0, cos, sin] as const;
    const up = [0, sin, -cos] as const;
    camera.position.set(
      normal[0] * reach * Math.cos(off) + up[0] * reach * Math.sin(off),
      y + normal[1] * reach * Math.cos(off) + up[1] * reach * Math.sin(off),
      z + normal[2] * reach * Math.cos(off) + up[2] * reach * Math.sin(off),
    );
    camera.up.set(...up);
    camera.lookAt(...SCREEN_CENTER);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);
  return null;
}

/**
 * The bar floor behind the cabinet. It is scenery, not the game: on a phone the
 * cabinet stands on a plain dark field so the wooden frame is the whole picture.
 */
function BarFloor({ minAspect = 1.05 }: { minAspect?: number }) {
  const { width, height } = useThree(({ size }) => size);
  if (!width || !height || width / height < minAspect) return null;
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return null;
  return <BlurredBarFloor />;
}

export function NarrowsCabinetDisplay({ board, onReady }: { board: HTMLCanvasElement; onReady?: () => void }) {
  return (
    <Canvas className="absolute inset-0"
      dpr={[1, 1.5]} camera={{ fov: 34, near: .05, far: 16 }} gl={{ antialias: true }}>
      <color attach="background" args={['#24180f']} />
      <ambientLight intensity={1.25} color="#f5e3ca" />
      <directionalLight position={[-2, 4, 1.5]} intensity={2.0} color="#ffdcb0" />
      <directionalLight position={[2, 2, -1]} intensity={.65} color="#acd2c6" />
      <PlayCamera />
      <NarrowsCabinet board={board} />
      <ReadySignal onReady={onReady} />
      <BarFloor />
    </Canvas>
  );
}

useGLTF.preload(CABINET_URL);
