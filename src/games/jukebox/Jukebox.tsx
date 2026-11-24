import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Group, MathUtils, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three';
import { JUKEBOX_AT } from '@/arcade/colliders';
import { JUKEBOX_TRACKS } from './tracks';

/** The hologram on the wall above the cabinet, just proud of the lining. */
const PROJECTION = new Vector3(0, 2.52, .07);
const PROJECTION_W = 2.6;
const PROJECTION_H = 1.0;

function paintTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function TrackButton({ slot, selected, focused, onSelect }: {
  slot: number;
  selected: boolean;
  focused: boolean;
  onSelect: (slot: number) => void;
}) {
  const button = useRef<Group>(null);
  const track = JUKEBOX_TRACKS[slot];
  const x = (slot % 5 - 2) * .108;
  const y = slot < 5 ? 1.177 : 1.12;
  const label = useMemo(() => paintTexture(128, 64, (ctx) => {
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#362015';
    ctx.fillText(String(slot + 1), 64, 34);
  }), [slot]);
  useEffect(() => () => label.dispose(), [label]);
  useFrame((_, dt) => {
    if (button.current) button.current.position.z = MathUtils.damp(button.current.position.z, selected ? .671 : .692, 19, dt);
  });

  return (
    <group position={[x, y, 0]}>
      <group ref={button} position-z={.692}>
        <mesh>
          <boxGeometry args={[.089, .042, .030]} />
          <meshStandardMaterial color={track ? '#d9b987' : '#777269'} roughness={.35}
            emissive={selected ? '#ffaa44' : '#000000'} emissiveIntensity={selected ? .25 : 0} />
        </mesh>
        <mesh position-z={.0155}>
          <planeGeometry args={[.085, .041]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} />
        </mesh>
      </group>
      {focused && track && (
        <mesh position-z={.713} onClick={(event) => {
          event.stopPropagation();
          onSelect(slot);
        }}>
          <planeGeometry args={[.108, .057]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

/** Green, cyan, blue, violet, pink, red, orange: the arc of the spectrum. */
const SPECTRUM_STOPS: [number, [number, number, number]][] = [
  [0, [61, 255, 154]],
  [.18, [56, 226, 232]],
  [.36, [63, 123, 255]],
  [.54, [180, 107, 255]],
  [.7, [255, 79, 163]],
  [.84, [255, 74, 61]],
  [1, [255, 176, 58]],
];

function spectrumColor(t: number): [number, number, number] {
  const at = Math.max(0, Math.min(1, t));
  for (let i = 1; i < SPECTRUM_STOPS.length; i += 1) {
    const [stop, color] = SPECTRUM_STOPS[i]!;
    const [prevStop, prev] = SPECTRUM_STOPS[i - 1]!;
    if (at > stop) continue;
    const k = (at - prevStop) / Math.max(1e-4, stop - prevStop);
    return [
      Math.round(prev[0] + (color[0] - prev[0]) * k),
      Math.round(prev[1] + (color[1] - prev[1]) * k),
      Math.round(prev[2] + (color[2] - prev[2]) * k),
    ];
  }
  return SPECTRUM_STOPS[SPECTRUM_STOPS.length - 1]![1];
}

const BARS = 76;

/**
 * The wall hologram: a live spectrum that rises out of the cabinet's projector.
 *
 * Bars are coloured along the arc of the spectrum and mirrored around a bright
 * core line, with three sine ribbons riding over them, so the shape breathes with
 * the music instead of flapping like a level meter.
 */
function SpectrumProjection({
  name,
  active,
  getAnalyser,
}: {
  name: string;
  active: boolean;
  getAnalyser: () => AnalyserNode | null;
}) {
  const panel = useRef<MeshBasicMaterial>(null);

  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return { ctx: canvas.getContext('2d')!, texture: map };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  // A fantasy face for the track name, loaded before the first caption is drawn.
  const [faceReady, setFaceReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const face = new FontFace('Jukebox Display', 'url(/fonts/uncial-antiqua.woff2)');
    face.load()
      .then((loaded) => {
        if (cancelled) return;
        document.fonts.add(loaded);
        setFaceReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const faceRef = useRef(faceReady);
  faceRef.current = faceReady;

  const camera = useThree(({ camera: cam }) => cam);
  const lastDraw = useRef(-1);
  const bins = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levels = useRef(new Float32Array(BARS));
  const frame = useRef(0);

  useFrame((state, dt) => {
    if (panel.current) {
      panel.current.opacity = MathUtils.damp(panel.current.opacity, active ? 1 : 0, 7, dt);
      panel.current.visible = active || panel.current.opacity > .002;
    }
    if (!active) return;

    // Skip the whole update when the wall is behind you: the music still plays.
    const forward = camera.getWorldDirection(new Vector3());
    const toPanel = new Vector3(JUKEBOX_AT[0] - 0.07, 2.52, JUKEBOX_AT[1]).sub(camera.position);
    if (toPanel.dot(forward) < 0.2) return;
    // Twelve frames a second is plenty for a spectrum, and a quarter of the cost.
    if (state.clock.elapsedTime - lastDraw.current < 1 / 12) return;

    const analyser = getAnalyser();
    if (analyser) {
      if (!bins.current || bins.current.length !== analyser.frequencyBinCount) {
        bins.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(bins.current);
      // Fast attack, slow release, and a log-ish spread so bass does not own every bar.
      const data = bins.current;
      const count = data.length;
      for (let i = 0; i < BARS; i += 1) {
        const tap = Math.min(count - 1, Math.floor(Math.pow(i / (BARS - 1), 1.55) * (count - 1)));
        const value = Math.pow(data[tap]! / 255, .72) * (1 + (i / BARS) * .3);
        levels.current[i] = Math.max(value, levels.current[i]! * .86);
      }
    } else {
      // Idle: the projector still breathes, so the wall reads as live before a track.
      const t = state.clock.elapsedTime;
      for (let i = 0; i < BARS; i += 1) {
        levels.current[i] = .16 + .10 * Math.sin(t * 1.4 + i * .22);
      }
    }

    // 30 fps is plenty for a wall hologram and leaves the GPU to the room.
    frame.current += 1;
    if (frame.current % 2 !== 0) return;

    lastDraw.current = state.clock.elapsedTime;
    const time = state.clock.elapsedTime;
    const W = 1024;
    const H = 384;
    const baseline = H * .5;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const barW = W / BARS;
    for (let i = 0; i < BARS; i += 1) {
      const level = levels.current[i]!;
      const h = 6 + level * H * .52;
      const x = i * barW + barW * .2;
      const w = barW * .6;
      const [r, g, b] = spectrumColor(i / (BARS - 1));
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, .22)`;
      ctx.fillRect(x - w * .8, baseline - h * 1.06, w * 2.6, h * 2.12);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, .92)`;
      ctx.fillRect(x, baseline - h, w, h * 2);
    }

    // the core line, white at the middle where the eye lands
    const line = ctx.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(120, 255, 210, 0)');
    line.addColorStop(.22, 'rgba(190, 255, 245, .55)');
    line.addColorStop(.5, 'rgba(255, 255, 255, .95)');
    line.addColorStop(.78, 'rgba(255, 225, 210, .55)');
    line.addColorStop(1, 'rgba(255, 180, 90, 0)');
    ctx.fillStyle = line;
    ctx.fillRect(0, baseline - 2, W, 4);

    // three ribbons riding the same spectrum
    for (let c = 0; c < 3; c += 1) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const p = x / W;
        const level = levels.current[Math.floor(p * (BARS - 1))]!;
        const amp = 8 + level * (26 + c * 14);
        const y = baseline + Math.sin(p * Math.PI * (3 + c) + time * (.85 + c * .3) + c * 1.9) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(214, 244, 255, ${.16 - c * .035})`;
      ctx.lineWidth = 1.6 - c * .3;
      ctx.stroke();
    }

    // the track, small, under the picture
    if (name) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = faceRef.current
        ? '400 28px "Jukebox Display", Georgia, serif'
        : '600 26px Georgia, serif';
      ctx.fillStyle = 'rgba(226, 244, 255, .62)';
      ctx.fillText(name.toUpperCase(), W / 2, H * .77, W - 140);
    }

    // Feather all four edges, so what lands on the wall has no border to it.
    ctx.globalCompositeOperation = 'destination-in';
    for (const horizontal of [true, false]) {
      const mask = horizontal
        ? ctx.createLinearGradient(0, 0, W, 0)
        : ctx.createLinearGradient(0, 0, 0, H);
      mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mask.addColorStop(.09, 'rgba(0, 0, 0, 1)');
      mask.addColorStop(.91, 'rgba(0, 0, 0, 1)');
      mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    texture.needsUpdate = true;
  });

  return (
    <group>
      <mesh position={PROJECTION}>
        <planeGeometry args={[PROJECTION_W, PROJECTION_H]} />
        <meshBasicMaterial ref={panel} map={texture} transparent opacity={0}
          blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export type JukeboxControls = {
  focused: boolean;
  selected: number | null;
  playing: number | null;
  lastPlayed: number | null;
  select: (slot: number) => void;
  getAnalyser: () => AnalyserNode | null;
};

export function Jukebox({ focused, selected, playing, lastPlayed, select, getAnalyser }: JukeboxControls) {
  const { scene } = useGLTF('/models/bar/jukebox.glb');
  const track = lastPlayed === null ? null : JUKEBOX_TRACKS[lastPlayed];
  return (
    <group name="Jukebox" position={[JUKEBOX_AT[0], 0, JUKEBOX_AT[1]]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={scene} />
      <mesh position={[0, 1.148, .661]}>
        <boxGeometry args={[.55, .122, .019]} />
        <meshStandardMaterial color="#58321e" metalness={.25} roughness={.45} />
      </mesh>
      {JUKEBOX_TRACKS.map((_, slot) => (
        <TrackButton key={slot} slot={slot} selected={selected === slot} focused={focused} onSelect={select} />
      ))}
      <SpectrumProjection name={track?.name ?? ''} active={playing !== null || focused} getAnalyser={getAnalyser} />
    </group>
  );
}
