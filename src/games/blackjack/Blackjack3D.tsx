import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { DoubleSide } from 'three';
import type { Group, Mesh } from 'three';
import type { Rank } from './strategy';
import { cardArt, dealSuits, BACK_ART, SUITS } from './deck';
import type { BlackjackState } from './useBlackjack';
import { playDeal } from '@/lib/sfx';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
for (const rank of RANKS) {
  for (const suit of SUITS) useTexture.preload(`/cards/${rank}${suit}.webp`);
}
useTexture.preload('/cards/back.webp');

export const CARD_W = 0.20;
export const CARD_H = 0.28;
export const BLACKJACK_TABLE_XZ = [0, 2] as const;
const TABLE_Y = 0.862;

/**
 * Where a card comes from, and how long it takes to land. The shoe has to sit inside
 * the seated camera's frame, or a card spends its flight off screen and simply appears
 * on the felt. Straight down from 2.15 with a 90 degree lens, the felt is visible from
 * z 0.8 to 3.2 at card height, so the shoe sits just inside that edge.
 */
const SHOE: [number, number, number] = [0.85, 0.95, 0.9];
/**
 * A portrait phone sees about half a metre either side of the felt at card height,
 * so the shoe moves in. Otherwise a card spends its whole flight off screen and
 * simply appears on the table.
 */
const SHOE_NARROW: [number, number, number] = [0.45, 0.95, 1.12];
export const DEAL_S = 0.32;

/** When the player's n-th card leaves the shoe, in seconds. The opening pair is
 * spaced so the deal reads player, dealer, player, dealer; a hit card flies at once. */
export const playerDelay = (index: number) => (index === 1 ? 0.32 : 0);

export function BlackjackTable({ receiveShadow = false }: { receiveShadow?: boolean }) {
  const gltf = useGLTF('/models/bar/table.glb');
  useLayoutEffect(() => {
    gltf.scene.traverse((node) => {
      if ((node as Mesh).isMesh) node.receiveShadow = receiveShadow;
    });
  }, [gltf.scene, receiveShadow]);
  return <primitive object={gltf.scene} position={[BLACKJACK_TABLE_XZ[0], 0, BLACKJACK_TABLE_XZ[1]]} />;
}

useGLTF.preload('/models/bar/table.glb');

type CardProps = {
  rank: Rank;
  suit: 'S' | 'H' | 'D' | 'C';
  down?: boolean;
  target: [number, number, number];
  delay: number;
  shoe: [number, number, number];
  tilt?: number;
};

/** Flies a card in from the shoe, with an arc and a settling twist. */
function useDeal(root: React.RefObject<Group | null>, target: [number, number, number], delay: number, shoe: [number, number, number], tilt = 0) {
  const startedAt = useRef<number | null>(null);
  const sounded = useRef(false);
  useFrame((state) => {
    const node = root.current;
    if (!node) return;
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime + delay;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    // A card that has not been dealt yet must not sit at the shoe waiting: hide it
    // until its turn, then let it fly. The slide is heard on the frame it leaves.
    node.visible = elapsed >= 0;
    if (elapsed < 0) return;
    if (!sounded.current) {
      sounded.current = true;
      playDeal(0.6);
    }
    const t = Math.min(1, Math.max(0, elapsed / DEAL_S));
    const eased = 1 - (1 - t) ** 4;
    node.position.set(
      shoe[0] + (target[0] - shoe[0]) * eased,
      shoe[1] + (target[1] - shoe[1]) * eased + Math.sin(Math.PI * t) * 0.12,
      shoe[2] + (target[2] - shoe[2]) * eased,
    );
    node.rotation.set(-Math.PI / 2, 0, tilt + (1 - eased) * 0.6);
  });
}

function Card({ rank, suit, down, target, delay, shoe, tilt = 0 }: CardProps) {
  const url = down ? BACK_ART : (cardArt({ rank, suit }) ?? BACK_ART);
  const texture = useTexture(url);
  const root = useRef<Group>(null);
  useDeal(root, target, delay, shoe, tilt);

  return (
    <group ref={root}>
      <mesh castShadow>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial map={texture} roughness={0.5} metalness={0.02} shadowSide={DoubleSide} />
      </mesh>
    </group>
  );
}

/** The hole card: flies in face down, then turns over on the felt when revealed. */
function HoleCard({ rank, suit, down, target, delay, shoe, tilt = 0 }: CardProps) {
  const face = useTexture(cardArt({ rank, suit }) ?? BACK_ART);
  const back = useTexture(BACK_ART);
  const root = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const landed = useRef<number | null>(null);
  useDeal(root, target, delay, shoe, tilt);

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
        <mesh castShadow>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshStandardMaterial map={back} roughness={0.5} metalness={0.02} shadowSide={DoubleSide} />
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

/**
 * Cards sit three to a row, anchored so the second card is always at the centre:
 * the first sits half a step to its left, and adding a third never shifts the pair.
 * A fourth card starts a new row further down the table, overlapping the first.
 */
function slot(index: number, baseZ: number): [number, number, number] {
  const row = Math.floor(index / PER_ROW);
  const col = index % PER_ROW;
  const x = (col - 1) * SPACING;
  const z = baseZ + row * ROW_OVERLAP;
  return [x, TABLE_Y + 0.004 + index * 0.0006, z];
}

export function BlackjackCards({ state }: { state: BlackjackState }) {
  const size = useThree(({ size: viewport }) => viewport);
  // Each side is dealt its own faces, keyed by seed, hand and position, so a hit can
  // never repaint the dealer's up card.
  const suits = useMemo(() => {
    const seed = state.seed || 'seed';
    return {
      dealer: dealSuits(seed, state.index, state.dealer, 0).map((card) => card.suit),
      player: dealSuits(seed, state.index, state.player, 7).map((card) => card.suit),
    };
  }, [state.seed, state.index, state.player, state.dealer]);

  if (state.phase === 'idle') return null;

  const narrow = size.width / Math.max(1, size.height) < 0.9;
  const shoe = narrow ? SHOE_NARROW : SHOE;
  const holeRank = state.dealer[1] ?? 'A';
  const holeSuit = suits.dealer[1] ?? 'S';

  return (
    <group position={[0, 0, 2.0]}>
      {state.dealer[0] && (
        <Card
          key={`${state.index}-up`}
          rank={state.dealer[0]}
          suit={suits.dealer[0]!}
          target={slot(0, -0.50)}
          delay={0.16}
          shoe={shoe}
          tilt={-0.03}
        />
      )}
      <HoleCard
        key={`${state.index}-hole`}
        rank={holeRank}
        suit={holeSuit}
        down={state.holeHidden}
        target={slot(1, -0.50)}
        delay={0.48}
        shoe={shoe}
        tilt={0.03}
      />
      {state.dealer.slice(2).map((rank, i) => (
        <Card
          key={`${state.index}-d-${i}`}
          rank={rank}
          suit={suits.dealer[i + 2]!}
          target={slot(i + 2, -0.50)}
          delay={0}
          shoe={shoe}
          tilt={(i - 1) * 0.03}
        />
      ))}
      {state.player.map((rank, i) => (
        <Card
          key={`${state.index}-p-${i}`}
          rank={rank}
          suit={suits.player[i]!}
          target={slot(i, 0.50)}
          delay={playerDelay(i)}
          shoe={shoe}
          tilt={(i % 2 === 0 ? -1 : 1) * 0.03}
        />
      ))}
    </group>
  );
}
