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

export type Phase = 'idle' | 'deciding' | 'verdict' | 'summary';

const VERDICT_MS = 2600;

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

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const beginHand = useCallback((index: number) => {
    const hand = script.current[index];
    if (!hand) return;
    shownAt.current = performance.now();
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

  const settle = useCallback(
    (index: number, action: Action | null, cards: Rank[], answerCorrect: boolean | null) => {
      const hand = script.current[index];
      if (!hand) return;
      const total = readHand(cards).total;
      const busted = total > 21;
      const dealer = dealerTurn(seed.current, index, hand, busted);
      const outcome = busted ? 'lose' : outcomeOf(cards, total, busted, dealer);

      setState((s) => ({
        ...s,
        phase: 'verdict',
        player: cards,
        dealer: dealer.cards,
        holeHidden: false,
        verdict: answerCorrect,
        outcome,
        remaining: 0,
      }));

      const logged = decisions.current;
      const timer = window.setTimeout(() => next(logged, index), VERDICT_MS);
      timers.current.push(timer);
    },
    [next],
  );

  const resolve = useCallback(
    (action: Action) => {
      const index = state.index;
      const hand = script.current[index];
      if (!hand || state.phase !== 'deciding') return;
      const atMs = performance.now() - shownAt.current;
      decisions.current[index] = { atMs, taken: action };

      let cards: Rank[] = [...hand.cards];
      if (action === 'hit' || action === 'double') {
        cards = [...cards, drawPlayer(seed.current, index, 1)];
      }
      // A double takes exactly one card; a hit may keep going, but for the first
      // version one hit per hand resolves the hand.
      const correct = isCorrect(hand.cards, hand.dealerUp, action);
      settle(index, action, cards, correct);
    },
    [state.index, state.phase, settle],
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
        const hand = script.current[index];
        if (hand) settle(index, null, [...hand.cards], null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [state.phase, state.index, settle]);

  return { state, start, leave, answer: resolve, isNaturalHole: state.dealer.length === 1 && isNatural(state.player) };
}
