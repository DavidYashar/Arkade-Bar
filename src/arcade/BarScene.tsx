import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { Object3D } from 'three';
import { VIEWS, type View } from './views';

function CameraRig({ view }: { view: View }) {
  const camera = useThree((s) => s.camera);
  const target = useRef(view.target);

  useEffect(() => {
    target.current = view.target;
  }, [view]);

  useEffect(() => {
    camera.position.set(...view.position);
    camera.lookAt(...target.current);
    if ('fov' in camera) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, view]);

  return null;
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

export function BarScene({ view }: { view: View }) {
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: VIEWS[2]!.position, fov: 34, near: 0.1, far: 120 }}>
      <color attach="background" args={['#070d0a']} />
      <fog attach="fog" args={['#070d0a', 18, 46]} />
      <ambientLight intensity={0.55} color="#ffd9a8" />
      <hemisphereLight args={['#ffcf9a', '#0a1a12', 0.5]} />
      <pointLight position={[0, 3.6, 6.5]} intensity={22} distance={16} color="#ffbf73" />
      <pointLight position={[0, 3.6, -3.0]} intensity={16} distance={14} color="#ffbf73" />
      <pointLight position={[-5.6, 2.6, -0.6]} intensity={10} distance={10} color="#ff3fae" />
      <pointLight position={[5.6, 2.6, -1.4]} intensity={10} distance={10} color="#35d8ff" />
      <CameraRig view={view} />
      <Blockout />
    </Canvas>
  );
}
