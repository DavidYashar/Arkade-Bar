import { useMemo, useRef } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { SUITS } from './deck';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { Rank } from './strategy';
import { cardArt, makeSuitDealer, BACK_ART } from './deck';
import type { BlackjackState } from './useBlackjack';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
for (const rank of RANKS) {
  for (const suit of SUITS) useTexture.preload(`/cards/${rank}${suit}.webp`);
}
useTexture.preload('/cards/back.webp');

export const CARD_W = 0.20;
export const CARD_H = 0.28;
const TABLE_Y = 0.862;

/** Where a card comes from, and how long it takes to land. */
const SHOE: [number, number, number] = [0.95, 0.95, 0.05];
const DEAL_S = 0.3;

export function BlackjackTable() {
  const gltf = useGLTF('/models/bar/table.glb');
  return <primitive object={gltf.scene} position={[0, 0, 2.0]} />;
}

useGLTF.preload('/models/bar/table.glb');

function Card({
  rank,
  suit,
  down,
  target,
  delay,
  tilt,
}: {
  rank: Rank;
  suit: 'S' | 'H' | 'D' | 'C';
  down?: boolean;
  target: [number, number, number];
  delay: number;
  tilt?: number;
}) {
  const url = down ? BACK_ART : (cardArt({ rank, suit }) ?? BACK_ART);
  const texture = useTexture(url);
  const mesh = useRef<Mesh>(null);
  const startedAt = useRef<number | null>(null);

  useFrame((state) => {
    const node = mesh.current;
    if (!node) return;
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime + delay;
    const t = Math.min(1, Math.max(0, (state.clock.elapsedTime - startedAt.current) / DEAL_S));
    const eased = 1 - (1 - t) ** 3;

    node.position.set(
      SHOE[0] + (target[0] - SHOE[0]) * eased,
      SHOE[1] + (target[1] - SHOE[1]) * eased + Math.sin(Math.PI * t) * 0.07,
      SHOE[2] + (target[2] - SHOE[2]) * eased,
    );
    node.rotation.z = (tilt ?? 0) + (1 - eased) * 0.35;
  });

  return (
    <mesh ref={mesh} position={SHOE} rotation={[-Math.PI / 2, 0, tilt ?? 0]}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial map={texture} roughness={0.5} metalness={0.02} />
    </mesh>
  );
}

export function BlackjackCards({ state }: { state: BlackjackState }) {
  const suits = useMemo(() => {
    const dealer = makeSuitDealer(state.seed || 'seed');
    return {
      player: state.player.map((rank) => dealer.next(rank)),
      dealer: state.dealer.map((rank) => dealer.next(rank)),
    };
  }, [state.seed, state.player, state.dealer]);

  if (state.phase === 'idle') return null;

  return (
    <group position={[0, 0, 2.0]}>
      {state.holeHidden && (
        <Card
          rank="A"
          suit="S"
          down
          target={[0.10, TABLE_Y + 0.003, -0.50]}
          delay={0.18}
          tilt={0.03}
        />
      )}
      {state.dealer.map((rank, i) => (
        <Card
          key={`d-${i}`}
          rank={rank}
          suit={suits.dealer[i]!}
          down={state.holeHidden && i > 0}
          target={[-0.10 + i * 0.21, TABLE_Y + 0.004, -0.50]}
          delay={i * 0.09}
          tilt={(i - 1) * 0.03}
        />
      ))}
      {state.player.map((rank, i) => (
        <Card
          key={`p-${i}`}
          rank={rank}
          suit={suits.player[i]!}
          target={[-0.10 + i * 0.21, TABLE_Y + 0.006, 0.50]}
          delay={0.24 + i * 0.09}
          tilt={(i - 1) * 0.035}
        />
      ))}
    </group>
  );
}
