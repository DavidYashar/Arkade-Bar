/**
 * Dartboard geometry and 501 arithmetic.
 *
 * The board is a circle of radius 225.5 mm. Scoring rings, in millimetres from the
 * centre: bull 0-6.35 (50), outer bull 6.35-15.9 (25), single, triple 99-107,
 * single, double 162-170. Anything outside 170 misses the board.
 *
 * Numbers run clockwise from the top in this order, which is the standard board.
 */

export const SECTORS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export const BOARD_RADIUS_MM = 225.5;
export const DOUBLE_OUT_MM = 170;
export const DOUBLE_IN_MM = 162;
export const TRIPLE_OUT_MM = 107;
export const TRIPLE_IN_MM = 99;
export const OUTER_BULL_MM = 15.9;
export const BULL_MM = 6.35;

export type Ring = 'single' | 'double' | 'triple' | 'outer-bull' | 'bull' | 'miss';

export type Hit = {
  /** Millimetres from the centre, to the board's right. */
  x: number;
  /** Millimetres from the centre, up the board. */
  y: number;
  sector: number;
  ring: Ring;
  score: number;
  /** A short label for the HUD: T20, D16, 25, BULL, MISS. */
  label: string;
};

export function readHit(x: number, y: number): Hit {
  const radius = Math.hypot(x, y);
  if (radius > DOUBLE_OUT_MM) {
    return { x, y, sector: 0, ring: 'miss', score: 0, label: 'MISS' };
  }
  if (radius <= BULL_MM) {
    return { x, y, sector: 25, ring: 'bull', score: 50, label: 'BULL' };
  }
  if (radius <= OUTER_BULL_MM) {
    return { x, y, sector: 25, ring: 'outer-bull', score: 25, label: '25' };
  }

  // angle measured clockwise from the top of the board
  const angle = (Math.atan2(x, y) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor((angle + Math.PI / 20) / (Math.PI / 10)) % 20;
  const sector = SECTORS[index]!;

  let ring: Ring = 'single';
  let multiplier = 1;
  if (radius >= TRIPLE_IN_MM && radius <= TRIPLE_OUT_MM) {
    ring = 'triple';
    multiplier = 3;
  } else if (radius >= DOUBLE_IN_MM) {
    ring = 'double';
    multiplier = 2;
  }

  const score = sector * multiplier;
  const label =
    ring === 'triple' ? `T${sector}` : ring === 'double' ? `D${sector}` : `${sector}`;
  return { x, y, sector, ring, score, label };
}

export type TurnScore = {
  hits: Hit[];
  total: number;
};

export function turnTotal(hits: readonly Hit[]): number {
  return hits.reduce((sum, hit) => sum + hit.score, 0);
}

/**
 * One dart against a starting number.
 *
 * 501 finishes on a double, and a turn that would take the score below zero, or
 * leave exactly one, is a bust and scores nothing.
 */
export type DartResult = {
  score: number;
  bust: boolean;
  finished: boolean;
};

export function applyDart(starting: number, hit: Hit): DartResult {
  const left = starting - hit.score;
  if (left < 0 || left === 1) {
    return { score: starting, bust: true, finished: false };
  }
  if (left === 0) {
    const doubled = hit.ring === 'double' || hit.ring === 'bull';
    return { score: 0, bust: !doubled, finished: doubled };
  }
  return { score: left, bust: false, finished: false };
}

export const CHARGE_SECONDS = 1.15;
export const RELEASE_MIN = 0.63;
export const RELEASE_MAX = 0.69;

export type Shot = {
  x: number;
  y: number;
  duration: number;
  bounce: boolean;
  timing: 'Released early' | 'Held too long' | null;
};

function nearWire(x: number, y: number): boolean {
  const r = Math.hypot(x, y);
  const rings = [BULL_MM, OUTER_BULL_MM, TRIPLE_IN_MM, TRIPLE_OUT_MM, DOUBLE_IN_MM, DOUBLE_OUT_MM];
  if (rings.some((ring) => Math.abs(r - ring) < .65)) return true;
  const wedge = Math.PI / 10;
  const angle = Math.atan2(x, y) / wedge;
  const distance = r * Math.abs(Math.sin((angle - Math.floor(angle) - .5) * wedge));
  return r > OUTER_BULL_MM && r < DOUBLE_OUT_MM && distance < .65;
}

export function releaseDart(x: number, y: number, heldSeconds: number, wireRoll: number): Shot {
  const power = Math.min(1, heldSeconds / CHARGE_SECONDS);
  const early = Math.max(0, RELEASE_MIN - power);
  const late = Math.max(0, power - RELEASE_MAX);
  const impactY = y - early * 155 + late * 112;
  return {
    x,
    y: impactY,
    duration: .34 - .15 * power,
    bounce: wireRoll < .30 && nearWire(x, impactY),
    timing: early ? 'Released early' : late ? 'Held too long' : null,
  };
}

