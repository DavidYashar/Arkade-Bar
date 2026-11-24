import { describe, expect, it } from 'vitest';
import { CHARGE_SECONDS, releaseDart } from './board';

describe('darts release', () => {
  it('uses the visible aim for a well-timed throw', () => {
    expect(releaseDart(4, 103, .66 * CHARGE_SECONDS, .8)).toMatchObject({
      x: 4, y: 103, timing: null, bounce: false,
    });
  });

  it('drops early throws and sends late throws high', () => {
    const early = releaseDart(4, 103, .4, .8);
    const late = releaseDart(4, 103, 1.4, .8);
    expect(early.y).toBeLessThan(103);
    expect(early.timing).toBe('Released early');
    expect(late.y).toBeGreaterThan(103);
    expect(late.timing).toBe('Held too long');
    expect(late.duration).toBeLessThan(early.duration);
  });

  it('only bounces occasionally and near a wire', () => {
    const onTime = .66 * CHARGE_SECONDS;
    expect(releaseDart(0, 103, onTime, 0).bounce).toBe(false);
    expect(releaseDart(0, 107, onTime, 0).bounce).toBe(true);
    expect(releaseDart(0, 107, onTime, .9).bounce).toBe(false);
  });
});

