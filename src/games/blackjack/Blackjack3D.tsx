import { useMemo, useRef } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { Rank } from './strategy';
import { cardArt, makeSuitDealer, BACK_ART, SUITS } from './deck';
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
const DEAL_S = 0.24;

export function BlackjackTable() {
  const gltf = useGLTF('/models/bar/table.glb');
  return <primitive object={gltf.scene} position={[0, 0, 2.0]} />;
}

useGLTF.preload('/models/bar/table.glb');

type CardProps = {
  rank: Rank;
  suit: 'S' | 'H' | 'D' | 'C';
  down?: boolean;
  target: [number, number, number];
  delay: number;
  tilt?: number;
};

/** Flies a card in from the shoe, with an arc and a settling twist. */
function useDeal(root: React.RefObject<Group | null>, target: [number, number, number], delay: number, tilt = 0) {
  const startedAt = useRef<number | null>(null);
  useFrame((state) => {
    const node = root.current;
    if (!node) return;
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime + delay;
    const t = Math.min(1, Math.max(0, (state.clock.elapsedTime - startedAt.current) / DEAL_S));
    const eased = 1 - (1 - t) ** 4;
    node.position.set(
      SHOE[0] + (target[0] - SHOE[0]) * eased,
      SHOE[1] + (target[1] - SHOE[1]) * eased + Math.sin(Math.PI * t) * 0.12,
      SHOE[2] + (target[2] - SHOE[2]) * eased,
    );
    node.rotation.set(-Math.PI / 2, 0, tilt + (1 - eased) * 0.6);
  });
}

function Card({ rank, suit, down, target, delay, tilt = 0 }: CardProps) {
  const url = down ? BACK_ART : (cardArt({ rank, suit }) ?? BACK_ART);
  const texture = useTexture(url);
  const root = useRef<Group>(null);
  useDeal(root, target, delay, tilt);

  return (
    <group ref={root}>
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial map={texture} roughness={0.5} metalness={0.02} />
      </mesh>
    </group>
  );
}

/** The hole card: flies in face down, then turns over on the felt when revealed. */
function HoleCard({ rank, suit, down, target, delay, tilt = 0 }: CardProps) {
  const face = useTexture(cardArt({ rank, suit }) ?? BACK_ART);
  const back = useTexture(BACK_ART);
  const root = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const landed = useRef<number | null>(null);
  useDeal(root, target, delay, tilt);

  useFrame((state) => {
    const node = flip.current;
    if (!node) return;
    if (down) {
      node.rotation.x = 0;
      landed.current = null;
      return;
    }
    if (landed.current === null) landed.current = state.clock.elapsedTime;
    // a beat, then a clean half turn
    const t = Math.min(1, Math.max(0, (state.clock.elapsedTime - landed.current - 0.12) / 0.26));
    node.rotation.x = Math.PI * (1 - (1 - t) ** 3);
  });

  return (
    <group ref={root}>
      <group ref={flip}>
        <mesh>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshStandardMaterial map={back} roughness={0.5} metalness={0.02} />
        </mesh>
        <mesh rotation={[Math.PI, 0, 0]}>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshStandardMaterial map={face} roughness={0.5} metalness={0.02} />
        </mesh>
      </group>
    </group>
  );
}

const PER_ROW = 3;
const SPACING = 0.21;
const ROW_OVERLAP = 0.155;

/** Cards sit three to a row; a fourth starts a new row overlapping the first. */
function slot(index: number, total: number, baseZ: number, towardsCentre: 1 | -1): [number, number, number] {
  const row = Math.floor(index / PER_ROW);
  const col = index % PER_ROW;
  const count = Math.min(PER_ROW, total - row * PER_ROW);
  const x = (col - (count - 1) / 2) * SPACING;
  const z = baseZ + towardsCentre * row * ROW_OVERLAP;
  return [x, TABLE_Y + 0.004 + index * 0.0006, z];
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

  const dealerTotal = state.dealer.length;
  const playerTotal = state.player.length;
  const holeRank = state.dealer[1] ?? 'A';
  const holeSuit = suits.dealer[1] ?? 'S';

  return (
    <group position={[0, 0, 2.0]}>
      {state.dealer[0] && (
        <Card
          rank={state.dealer[0]}
          suit={suits.dealer[0]!}
          target={slot(0, dealerTotal, -0.50, 1)}
          delay={0}
          tilt={-0.03}
        />
      )}
      <HoleCard
        rank={holeRank}
        suit={holeSuit}
        down={state.holeHidden}
        target={slot(1, dealerTotal, -0.50, 1)}
        delay={0.09}
        tilt={0.03}
      />
      {state.dealer.slice(2).map((rank, i) => (
        <Card
          key={`d-${i}`}
          rank={rank}
          suit={suits.dealer[i + 2]!}
          target={slot(i + 2, dealerTotal, -0.50, 1)}
          delay={i * 0.06}
          tilt={(i - 1) * 0.03}
        />
      ))}
      {state.player.map((rank, i) => (
        <Card
          key={`p-${i}`}
          rank={rank}
          suit={suits.player[i]!}
          target={slot(i, playerTotal, 0.50, -1)}
          delay={0.18 + i * 0.07}
          tilt={(i % 2 === 0 ? -1 : 1) * 0.03}
        />
      ))}
    </group>
  );
}
