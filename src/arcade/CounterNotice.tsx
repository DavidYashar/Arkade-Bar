import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

const WIDTH = .55;
const FACE = .29;
const STOCK = .004;
const FOLD = .37;
const HALF_SPREAD = Math.sin(FOLD) * FACE / 2;
const MID_HEIGHT = Math.cos(FOLD) * FACE / 2 + STOCK / 2;

function makeNotice() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 540;
  const ink = canvas.getContext('2d')!;
  const paper = ink.createLinearGradient(0, 0, 0, canvas.height);
  paper.addColorStop(0, '#fff4d9');
  paper.addColorStop(.53, '#f3dfb7');
  paper.addColorStop(1, '#e8cca0');
  ink.fillStyle = paper;
  ink.fillRect(0, 0, canvas.width, canvas.height);

  ink.strokeStyle = '#876133';
  ink.lineWidth = 3;
  ink.strokeRect(26, 26, 972, 488);
  ink.lineWidth = 1.5;
  ink.strokeRect(38, 38, 948, 464);
  const curl = new Path2D('M0 78C0 34 29 34 29 62C29 87 2 81 12 65M0 78C0 36 27 9 76 9M0 78C48 78 42 48 27 49');
  for (const [x, y, sx, sy] of [[53, 45, 1, 1], [971, 45, -1, 1], [53, 495, 1, -1], [971, 495, -1, -1]] as const) {
    ink.save();
    ink.translate(x, y);
    ink.scale(sx, sy);
    ink.lineWidth = 3;
    ink.stroke(curl);
    ink.restore();
  }

  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.fillStyle = '#432b28';
  ink.font = 'italic 92px "Palatino Linotype", "Book Antiqua", Georgia, serif';
  ink.fillText('We will', 512, 212);
  ink.font = 'bold italic 106px "Palatino Linotype", "Book Antiqua", Georgia, serif';
  ink.fillText('come back soon', 512, 326, 849);
  ink.fillStyle = '#926333';
  for (const y of [113, 425]) {
    ink.fill(new Path2D(`M512 ${y - 11}L522 ${y}L512 ${y + 11}L502 ${y}Z`));
    ink.fillRect(449, y - 1, 44, 2);
    ink.fillRect(531, y - 1, 44, 2);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function makeFootShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1, .5);
  const fade = ctx.createRadialGradient(64, 64, 8, 64, 64, 63);
  fade.addColorStop(0, 'rgba(20, 10, 5, .45)');
  fade.addColorStop(1, 'rgba(20, 10, 5, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

export function CounterNotice() {
  const { print, shadow } = useMemo(() => ({ print: makeNotice(), shadow: makeFootShadow() }), []);
  useEffect(() => () => {
    print.dispose();
    shadow.dispose();
  }, [print, shadow]);

  // The walnut counter's top is y=1.275. Both feet sit on it, facing the aisle.
  return (
    <group name="Counter notice — We will come back soon" position={[0, 1.275, -6.82]} rotation={[0, -.07, 0]}>
      <mesh position={[0, .001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[.66, .31]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, MID_HEIGHT, -HALF_SPREAD]} rotation={[FOLD, 0, 0]}>
        <boxGeometry args={[WIDTH, FACE, STOCK]} />
        <meshStandardMaterial color="#e8cda3" roughness={.94} />
      </mesh>
      <group position={[0, MID_HEIGHT, HALF_SPREAD]} rotation={[-FOLD, 0, 0]}>
        <mesh>
          <boxGeometry args={[WIDTH, FACE, STOCK]} />
          <meshStandardMaterial color="#f3dfb7" roughness={.92} />
        </mesh>
        <mesh position={[0, 0, STOCK / 2 + .0003]}>
          <planeGeometry args={[WIDTH - .001, FACE - .001]} />
          <meshStandardMaterial map={print} emissive="#edd2a5" emissiveIntensity={.13} roughness={.92} />
        </mesh>
      </group>
    </group>
  );
}
