import { useCallback, useEffect, useRef, useState } from 'react';
import {
  V0,
  dealerTurn,
  drawPlayer,
  handScript,
  isNatural,
  outcomeOf,
  type DealtHand,
  type Outcome,
} from './round';
import { readHand, type Action, type Rank } from './strategy';
import { playPlace } from '@/lib/sfx';
import { DEAL_S, playerDelay } from './Blackjack3D';
import { pointsFor, type HandScore } from './score';

export type Phase = 'idle' | 'deciding' | 'dealer' | 'verdict' | 'summary';

const VERDICT_MS = 2800;
const REVEAL_HOLE_MS = 520;
const DEALER_DRAW_MS = 620;

export type BlackjackState = {
  phase: Phase;
  index: number;
  hands: number;
  player: readonly Rank[];
  dealer: readonly Rank[];
  holeHidden: boolean;
  remaining: number;
  /** The hand just settled, or null while it is being played. */
  outcome: Outcome | null;
  /** One entry per hand played so far. */
  results: readonly (HandScore | null)[];
  seed: string;
};

const empty: BlackjackState = {
  phase: 'idle',
  index: 0,
  hands: V0.hands,
  player: [],
  dealer: [],
  holeHidden: true,
  remaining: V0.secondsPerHand,
  outcome: null,
  results: [],
  seed: '',
};

export function useBlackjack(paused = false) {
  const [state, setState] = useState<BlackjackState>(empty);
  const seed = useRef('');
  const script = useRef<DealtHand[]>([]);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handState = useCallback(
    (index: number, results: readonly (HandScore | null)[]): BlackjackState => {
      const hand = script.current[index]!;
      return {
        ...empty,
        phase: 'deciding',
        index,
        hands: script.current.length,
        player: hand.cards,
        dealer: [hand.dealerUp],
        holeHidden: true,
        remaining: V0.secondsPerHand,
        results,
        seed: seed.current,
      };
    },
    [],
  );

  /** The dealer turns its hole card, draws while under 17, then the hand is settled. */
  const dealerPlays = useCallback(
    (index: number, cards: Rank[], startDelayMs = REVEAL_HOLE_MS) => {
      const deal = script.current[index];
      if (!deal) return;
      const total = readHand(cards).total;
      const busted = total > 21;
      const dealer = dealerTurn(seed.current, index, deal, busted);
      const all = dealer.cards;

      setState((s) => ({
        ...s,
        phase: 'dealer',
        player: cards,
        dealer: [all[0]!],
        holeHidden: true,
        outcome: null,
        remaining: 0,
      }));

      const step = (i: number) => {
        if (i >= all.length) {
          const outcome: Outcome = busted ? 'lose' : outcomeOf(cards, total, busted, dealer);
          const dealerBust = readHand(all).total > 21;
          setState((s) => {
            const results = [...s.results];
            results[index] = { outcome, points: pointsFor(outcome, dealerBust) };
            return { ...s, phase: 'verdict', dealer: all, holeHidden: false, outcome, results };
          });
          const id = window.setTimeout(() => {
            setState((s) =>
              index + 1 >= script.current.length
                ? { ...s, phase: 'summary' }
                : handState(index + 1, s.results),
            );
          }, VERDICT_MS);
          timers.current.push(id);
          return;
        }
        if (i === 1) playPlace(0.6);
        setState((s) => ({
          ...s,
          dealer: all.slice(0, i + 1),
          holeHidden: i < 1 ? s.holeHidden : false,
        }));
        const id = window.setTimeout(() => step(i + 1), i === 1 ? REVEAL_HOLE_MS : DEALER_DRAW_MS);
        timers.current.push(id);
      };

      const id = window.setTimeout(() => step(1), startDelayMs);
      timers.current.push(id);
    },
    [handState],
  );

  const resolve = useCallback(
    (action: Action) => {
      const index = state.index;
      const hand = script.current[index];
      if (!hand || state.phase !== 'deciding') return;

      if (action === 'hit') {
        const cards = [...state.player, drawPlayer(seed.current, index, state.player.length)];
        if (readHand(cards).total > 21) {
          // the dealer turns once the busting card has landed
          const landedMs = (playerDelay(cards.length - 1) + DEAL_S) * 1000 + 25;
          dealerPlays(index, cards, landedMs);
        } else {
          setState((s) => ({ ...s, player: cards }));
        }
        return;
      }

      const cards: Rank[] =
        action === 'double'
          ? [...state.player, drawPlayer(seed.current, index, 1)]
          : [...state.player];
      dealerPlays(index, cards);
    },
    [state.index, state.phase, state.player, dealerPlays],
  );

  const start = useCallback(() => {
    clearTimers();
    const stamp = `${Date.now()}`;
    seed.current = stamp;
    script.current = handScript(stamp, V0);
    setState(handState(0, []));
  }, [handState, clearTimers]);

  const leave = useCallback(() => {
    clearTimers();
    setState(empty);
  }, [clearTimers]);

  // the clock runs while a decision is open; when it runs out the hand stands
  useEffect(() => {
    if (paused || state.phase !== 'deciding') return;
    const started = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, V0.secondsPerHand - (performance.now() - started) / 1000);
      setState((s) => (s.phase === 'deciding' ? { ...s, remaining: left } : s));
      if (left <= 0) {
        window.clearInterval(id);
        resolve('stand');
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [paused, state.phase, state.index, resolve]);

  return {
    state,
    start,
    leave,
    answer: resolve,
    isNaturalHole: state.dealer.length === 1 && isNatural(state.player),
  };
}
