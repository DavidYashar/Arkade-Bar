import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Outcome } from './round';

const LABEL: Record<Outcome, string> = {
  blackjack: 'BLACKJACK',
  win: 'YOU WIN',
  lose: 'YOU LOSE',
  push: 'DRAW',
};

const COLOR: Record<Outcome, string> = {
  blackjack: '#f4d488',
  win: '#a9f0c4',
  lose: '#f0a99a',
  push: '#e8e1d1',
};

function paint(word: string, color: string): THREE.Texture {
  const width = 1024;
  const height = 288;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);

  ctx.font = '600 132px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0.14em';
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.fillText(word, width / 2, height / 2 + 4);
  // a second pass, tighter, to give the letters a body rather than a halo
  ctx.shadowBlur = 8;
  ctx.fillText(word, width / 2, height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The hand's result, written on the felt. It is a flat plane lying on the table,
 * not a panel: no frame, no box, just the words.
 */
export function TableResult({ outcome }: { outcome: Outcome | null }) {
  const label = outcome ? LABEL[outcome] : '';
  const texture = useMemo(
    () => (outcome ? paint(label, COLOR[outcome]) : null),
    [outcome, label],
  );
  const mesh = useRef<THREE.Mesh>(null);
  const born = useState(() => performance.now())[0];
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const node = mesh.current;
    if (!node || !material.current) return;
    const age = (performance.now() - born) / 1000;
    const rise = Math.min(1, age / 0.28);
    const eased = 1 - (1 - rise) ** 3;
    node.scale.setScalar(0.94 + eased * 0.06);
    node.position.y = 0.868 + eased * 0.008;
    material.current.opacity = eased;
  });

  if (!outcome || !texture) return null;

  return (
    <mesh ref={mesh} position={[0, 0.868, 2.0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.5, 0.42]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
