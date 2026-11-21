import type { Outcome } from './round';

/**
 * The round's points.
 *
 * A hand is worth what happened on it, and rarer results are worth more:
 *
 *   blackjack      5   the natural, the hand the game is named after
 *   dealer busted  4   you stood, and the house broke itself
 *   win            3   your total beat the dealer's
 *   draw           1   the stake comes back, and the hand was read right
 *   loss           0
 *
 * A split hand is scored per hand, so winning both is worth two wins, and a
 * split that ends one win and one loss is worth a single win.
 */
export const POINTS = {
  blackjack: 5,
  dealerBust: 4,
  win: 3,
  draw: 1,
  loss: 0,
} as const;

export type HandScore = {
  outcome: Outcome;
  points: number;
};

export function pointsFor(outcome: Outcome, dealerBust: boolean): number {
  switch (outcome) {
    case 'blackjack':
      return POINTS.blackjack;
    case 'win':
      return dealerBust ? POINTS.dealerBust : POINTS.win;
    case 'push':
      return POINTS.draw;
    case 'lose':
      return POINTS.loss;
    default:
      return 0;
  }
}

export function roundTotal(hands: readonly (HandScore | null)[]): number {
  return hands.reduce((sum, hand) => sum + (hand?.points ?? 0), 0);
}
