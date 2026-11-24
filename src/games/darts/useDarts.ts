import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD_RADIUS_MM, readHit, type Shot } from './board';

export type Phase = 'idle' | 'aiming' | 'settled' | 'summary';
export type Landed = { x: number; y: number; score: number; id: number; sticks: boolean; duration: number; fallen?: boolean };

export const SETS = 5;
const DARTS_PER_SET = 3;

export type DartsState = {
  phase: Phase;
  round: number;
  dartIndex: number;
  rounds: (number | null)[];
  current: Landed[];
  last: { text: string; timing: Shot['timing'] } | null;
  total: number;
  throws: number;
};

function newGame(phase: Phase): DartsState {
  return {
    phase, round: 0, dartIndex: 0, rounds: Array<null>(SETS).fill(null),
    current: [], last: null, total: 0, throws: 0,
  };
}

export function useDarts() {
  const [state, setState] = useState(() => newGame('idle'));
  const live = useRef(state);
  const timer = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => window.clearTimeout(timer.current), []);
  useEffect(() => clearTimer, [clearTimer]);

  const update = useCallback((next: DartsState) => {
    live.current = next;
    setState(next);
  }, []);

  const throwAt = useCallback((shot: Shot) => {
    const before = live.current;
    if (before.phase !== 'aiming') return;

    const hit = readHit(shot.x, shot.y);
    const throws = before.throws + 1;
    // a dart landing on one already in the board knocks it out, and drops itself: no score
    const CLASH_MM = 11;
    const clash = before.current.some(
      (item) => item.sticks && !item.fallen && Math.hypot(item.x - hit.x, item.y - hit.y) < CLASH_MM,
    );
    const score = shot.bounce || clash ? 0 : hit.score;
    const dart: Landed = {
      x: hit.x, y: hit.y, score, id: throws, duration: shot.duration,
      sticks: !shot.bounce && !clash && Math.hypot(hit.x, hit.y) <= BOARD_RADIUS_MM,
      fallen: clash,
    };
    const current = before.current
      .map((item) => (
        item.sticks && !item.fallen && Math.hypot(item.x - hit.x, item.y - hit.y) < CLASH_MM
          ? { ...item, fallen: true }
          : item
      ))
      .concat(dart);
    const dartIndex = current.length;
    const endTurn = dartIndex === DARTS_PER_SET;
    const points = current.reduce((sum, item) => sum + item.score, 0);
    const rounds = [...before.rounds];
    if (endTurn) rounds[before.round] = points;
    const hitText = clash ? 'Clipped a dart, no score' : shot.bounce ? 'Wire bounce-out' : score === 0 ? 'Miss' : hit.label;
    const next: DartsState = {
      ...before, rounds, current, throws, dartIndex, total: before.total + score,
      phase: endTurn ? 'settled' : 'aiming',
      last: { text: hitText, timing: shot.timing },
    };
    update(next);

    if (endTurn) {
      timer.current = window.setTimeout(() => {
        if (next.round === SETS - 1) {
          update({ ...next, phase: 'summary' });
          return;
        }
        update({
          ...next, round: next.round + 1, dartIndex: 0, current: [], phase: 'aiming', last: null,
        });
      }, 1500);
    }
  }, [update]);

  const start = useCallback(() => {
    clearTimer();
    update(newGame('aiming'));
  }, [clearTimer, update]);

  const leave = useCallback(() => {
    clearTimer();
    update(newGame('idle'));
  }, [clearTimer, update]);

  return { state, start, leave, throwAt };
}
