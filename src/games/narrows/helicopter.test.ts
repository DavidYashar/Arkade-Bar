import { describe, expect, it } from 'vitest';
import { Narrows, type Controls, type Entity } from './narrows';

const controls: Controls = { left: false, right: false, slow: false, fast: false, fire: false };

function helicopter(x: number, z: number, vx: number): Entity {
  return { kind: 'heli', x, z, vx, vz: 0, hp: 1, alive: true, wobble: 0, fire: 0 };
}

describe('Narrows helicopter', () => {
  it('crosses horizontally and fires a three-shot burst toward the boat', () => {
    const game = new Narrows();
    game.reset();
    const heli = helicopter(game.x - 140, game.z + 750, 140);
    game.entities = [heli];
    for (let i = 0; i < 24; i++) game.update(.02, controls);
    expect(heli.x).toBeGreaterThan(game.x - 140);
    expect(heli.z).toBe(750);
    const shots = game.bullets.filter((shot) => shot.vz === -610);
    expect(shots).toHaveLength(3);
    expect(shots.every((shot) => shot.vx > 0)).toBe(true);
  });

  it('goes down and awards points after a player hit', () => {
    const game = new Narrows();
    game.reset();
    const heli = helicopter(game.x - 15, game.z + 160, 160);
    game.entities = [heli];
    for (let i = 0; i < 12 && heli.alive; i++) game.update(.02, { ...controls, fire: true });
    expect(game.entities).not.toContain(heli);
    expect(game.score).toBeGreaterThan(100);
    expect(game.bursts).toHaveLength(1);
  });
});
