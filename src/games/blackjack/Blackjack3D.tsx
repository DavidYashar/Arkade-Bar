import { useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { Rank } from './strategy';
import { cardArt, makeSuitDealer, BACK_ART } from './deck';
import type { BlackjackState } from './useBlackjack';

export const CARD_W = 0.30;
export const CARD_H = 0.42;
const TABLE_Y = 0.845;

/** Where a card comes from, and how long it takes to land. */
const SHOE: [number, number, number] = [0.95, 0.95, 0.05];
const DEAL_S = 0.3;

export function BlackjackTable() {
  return (
    <group position={[0, 0, 2.0]}>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.34, 0.46, 0.72, 24]} />
        <meshStandardMaterial color="#1a1410" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[1.32, 1.42, 0.10, 48]} />
        <meshStandardMaterial color="#2a1c12" roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.80, 0]}>
        <cylinderGeometry args={[1.22, 1.22, 0.03, 48]} />
        <meshStandardMaterial color="#0b3f2a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.815, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 48]} />
        <meshStandardMaterial color="#093524" roughness={0.95} />
      </mesh>
    </group>
  );
}

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
          target={[0.15, TABLE_Y + 0.003, 0.02]}
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
          target={[-0.14 + i * 0.30, TABLE_Y + 0.004, 0.02]}
          delay={i * 0.09}
          tilt={(i - 1) * 0.03}
        />
      ))}
      {state.player.map((rank, i) => (
        <Card
          key={`p-${i}`}
          rank={rank}
          suit={suits.player[i]!}
          target={[-0.15 + i * 0.30, TABLE_Y + 0.006, 0.62]}
          delay={0.24 + i * 0.09}
          tilt={(i - 1) * 0.035}
        />
      ))}
    </group>
  );
}
