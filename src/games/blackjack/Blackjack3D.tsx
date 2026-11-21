import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import type { Rank } from './strategy';
import { cardArt, makeSuitDealer, BACK_ART } from './deck';
import type { BlackjackState } from './useBlackjack';

const CARD_W = 0.31;
const CARD_H = 0.44;
const TABLE_Y = 0.835;

/** The blackjack table itself: felt, rail, pedestal. It replaces the grey box. */
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
  position,
  tilt,
}: {
  rank: Rank;
  suit: 'S' | 'H' | 'D' | 'C';
  down?: boolean;
  position: [number, number, number];
  tilt?: number;
}) {
  const url = down ? BACK_ART : (cardArt({ rank, suit }) ?? BACK_ART);
  const texture = useTexture(url);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, tilt ?? 0]}>
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
      {/* dealer, far side: the up card, then a face-down hole until the settle */}
      {state.holeHidden && (
        <Card rank={'A'} suit={'S'} down position={[0.17, TABLE_Y + 0.003, -0.32]} tilt={0.02} />
      )}
      {state.dealer.map((rank, i) => (
        <Card
          key={`d-${i}`}
          rank={rank}
          suit={suits.dealer[i]!}
          down={state.holeHidden && i > 0}
          position={[-0.17 + i * 0.34, TABLE_Y + 0.002 + i * 0.001, -0.32]}
          tilt={(i - 1) * 0.03}
        />
      ))}
      {/* the player, near side */}
      {state.player.map((rank, i) => (
        <Card
          key={`p-${i}`}
          rank={rank}
          suit={suits.player[i]!}
          position={[-0.17 + i * 0.34, TABLE_Y + 0.004 + i * 0.001, 0.30]}
          tilt={(i - 1) * 0.035}
        />
      ))}
    </group>
  );
}

