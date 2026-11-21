import { describe, expect, it } from 'vitest';
import { dealSuits } from './deck';
import type { Rank } from './strategy';

const seed = 'arkade-test-seed';

describe('dealt faces', () => {
  it('keeps the dealer up card when the player draws', () => {
    const dealer = dealSuits(seed, 2, ['A', '7'], 0);
    const player = dealSuits(seed, 2, ['5', '6'], 7);

    const afterHit = dealSuits(seed, 2, ['5', '6', '9'], 7);
    const dealerLater = dealSuits(seed, 2, ['A', '7'], 0);

    expect(dealerLater).toEqual(dealer);
    expect(afterHit.slice(0, 2)).toEqual(player);
  });

  it('gives a hand no duplicate card', () => {
    const ranks: Rank[] = ['7', '7', '7', '7'];
    const cards = dealSuits(seed, 1, ranks, 0);
    const keys = cards.map((card) => `${card.rank}${card.suit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives different hands different faces', () => {
    const first = dealSuits(seed, 0, ['A', 'K'], 0);
    const second = dealSuits(seed, 1, ['A', 'K'], 0);
    expect(second).not.toEqual(first);
  });

  it('does not deal the same card to both sides', () => {
    const dealer = dealSuits(seed, 3, ['8'], 0);
    const player = dealSuits(seed, 3, ['8'], 7);
    expect(player[0]!.suit).not.toBe(dealer[0]!.suit);
  });
});
