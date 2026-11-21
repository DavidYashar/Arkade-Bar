import { useCallback, useEffect, useRef, useState } from 'react';
import {
  V0,
  dealerTurn,
  drawPlayer,
  gradeRound,
  handScript,
  isNatural,
  outcomeOf,
  type DealtHand,
  type LoggedDecision,
  type Outcome,
  type RoundResult,
} from './round';
import { isCorrect, readHand, type Action, type Rank } from './strategy';
import { playDeal, playPlace } from '@/lib/sfx';

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
  verdict: boolean | null;
  outcome: Outcome | null;
  result: RoundResult | null;
  canDouble: boolean;
  canSplit: boolean;
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
  verdict: null,
  outcome: null,
  result: null,
  canDouble: true,
  canSplit: false,
  seed: '',
};

export function useBlackjack() {
  const [state, setState] = useState<BlackjackState>(empty);
  const seed = useRef('');
  const script = useRef<DealtHand[]>([]);
  const decisions = useRef<Array<LoggedDecision | null>>([]);
  const shownAt = useRef(0);
  const timers = useRef<number[]>([]);
  const hole = useRef<Rank>('A');

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const beginHand = useCallback((index: number) => {
    const hand = script.current[index];
    if (!hand) return;
    shownAt.current = performance.now();
    // four cards leave the shoe as the hand is dealt
    for (let i = 0; i < 4; i += 1) {
      const id = window.setTimeout(() => playDeal(0.65), 120 + i * 110);
      timers.current.push(id);
    }
    // The hole is the card the dealer is dealt face down: the hand's second card.
    const cards = [...hand.cards, ...[]];
    hole.current = cards[0] ?? 'A';
    setState({
      ...empty,
      phase: 'deciding',
      index,
      hands: script.current.length,
      player: hand.cards,
      dealer: [hand.dealerUp],
      holeHidden: true,
      remaining: V0.secondsPerHand,
      canDouble: true,
      canSplit: false,
      seed: seed.current,
    });
  }, []);

  const finish = useCallback((logged: Array<LoggedDecision | null>) => {
    const result = gradeRound(script.current, logged, V0);
    setState((s) => ({ ...s, phase: 'summary', result }));
  }, []);

  const next = useCallback(
    (logged: Array<LoggedDecision | null>, index: number) => {
      if (index + 1 >= script.current.length) finish(logged);
      else beginHand(index + 1);
    },
    [beginHand, finish],
  );

  /** The dealer turns its hole card, draws while under 17, then the hand is judged. */
  const dealerPlays = useCallback(
    (index: number, cards: Rank[], action: Action | null, correct: boolean | null) => {
      const deal = script.current[index];
      if (!deal) return;
      const total = readHand(cards).total;
      const busted = total > 21;
      const dealer = dealerTurn(seed.current, index, deal, busted);
      const all = dealer.cards;
      const logged = decisions.current;

      setState((s) => ({ ...s, phase: 'dealer', player: cards, dealer: [all[0]!], holeHidden: true, verdict: null, remaining: 0 }));

      const step = (i: number) => {
        if (i >= all.length) {
          const outcome = busted ? 'lose' : outcomeOf(cards, total, busted, dealer);
          setState((s) => ({
            ...s,
            phase: 'verdict',
            dealer: all,
            holeHidden: false,
            verdict: correct,
            outcome,
          }));
          const id = window.setTimeout(() => next(logged, index), VERDICT_MS);
          timers.current.push(id);
          return;
        }
        if (i === 1) playPlace(0.6);
        else if (i > 1) playDeal(0.65);
        setState((s) => ({
          ...s,
          dealer: all.slice(0, i + 1),
          holeHidden: i < 1 ? s.holeHidden : false,
        }));
        const id = window.setTimeout(() => step(i + 1), i === 1 ? REVEAL_HOLE_MS : DEALER_DRAW_MS);
        timers.current.push(id);
      };

      const id = window.setTimeout(() => step(1), REVEAL_HOLE_MS);
      timers.current.push(id);
    },
    [next],
  );

  const resolve = useCallback(
    (action: Action) => {
      const index = state.index;
      const hand = script.current[index];
      if (!hand || state.phase !== 'deciding') return;
      const logged = decisions.current;
      if (logged[index] === null) {
        logged[index] = { atMs: performance.now() - shownAt.current, taken: action };
      }

      if (action === 'hit') {
        const drawn = drawPlayer(seed.current, index, state.player.length);
        const cards = [...state.player, drawn];
        playDeal(0.7);
        if (readHand(cards).total > 21) {
          // bust: the dealer shows its cards and the hand ends
          dealerPlays(index, cards, 'hit', isCorrect(hand.cards, hand.dealerUp, 'hit'));
        } else {
          setState((s) => ({ ...s, player: cards }));
        }
        return;
      }

      const cards: Rank[] = action === 'double' ? [...state.player, drawPlayer(seed.current, index, 1)] : [...state.player];
      if (action === 'double') playDeal(0.7);
      dealerPlays(index, cards, action, isCorrect(hand.cards, hand.dealerUp, action));
    },
    [state.index, state.phase, state.player, dealerPlays],
  );

  const start = useCallback(() => {
    clearTimers();
    const stamp = `${Date.now()}`;
    seed.current = stamp;
    script.current = handScript(stamp, V0);
    decisions.current = new Array(script.current.length).fill(null);
    beginHand(0);
  }, [beginHand, clearTimers]);

  const leave = useCallback(() => {
    clearTimers();
    setState(empty);
  }, [clearTimers]);

  // the clock runs while a decision is open
  useEffect(() => {
    if (state.phase !== 'deciding') return;
    const started = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, V0.secondsPerHand - (performance.now() - started) / 1000);
      setState((s) => (s.phase === 'deciding' ? { ...s, remaining: left } : s));
      if (left <= 0) {
        window.clearInterval(id);
        const index = state.index;
        decisions.current[index] = null;
        dealerPlays(index, [...state.player], null, null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [state.phase, state.index, state.player, dealerPlays]);

  return {
    state,
    start,
    leave,
    answer: resolve,
    isNaturalHole: state.dealer.length === 1 && isNatural(state.player),
  };
}
