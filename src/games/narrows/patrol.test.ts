import { describe, expect, it, vi } from 'vitest';
import { Narrows, type Controls, type Entity } from './narrows';
import { flightLanesAt } from './river';

const controls: Controls = { left: false, right: false, slow: false, fast: false, fire: false };

function patrol(x: number, z: number): Entity {
  return { kind: 'boat', x, z, hp: 1, vx: 0, vz: -65, wobble: 0, alive: true, fire: 0 };
}

describe('Narrows patrol boats', () => {
  it('enters at the upper edge in a valid river lane', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(.25);
    try {
      const game = new Narrows();
      game.reset();
      game.update(.016, controls);
      const boat = game.entities.find((entity) => entity.kind === 'boat')!;
      expect(boat.z - game.z).toBeGreaterThan(1_495);
      expect(flightLanesAt(boat.z).some((lane) => boat.x >= lane.left && boat.x <= lane.right)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it('fires toward the player and can damage the player boat', () => {
    const game = new Narrows();
    game.reset();
    for (let i = 0; i < 25; i++) game.update(.05, controls);
    const boat = patrol(game.x + 35, game.z + 400);
    game.entities = [boat];
    game.update(.025, controls);
    expect(game.bullets).toContainEqual(expect.objectContaining({ from: 'enemy', vx: expect.any(Number), vz: -520 }));
    expect(game.bullets.find((bullet) => bullet.from === 'enemy')!.vx).toBeLessThan(0);
    for (let i = 0; i < 24 && game.lives === 3; i++) game.update(.025, controls);
    expect(game.lives).toBe(2);
    expect(boat.alive).toBe(true);
  });

  it('destroys the patrol and awards points when a player bullet hits', () => {
    const game = new Narrows();
    game.reset();
    const boat = patrol(game.x, game.z + 170);
    game.entities = [boat];
    for (let i = 0; i < 12 && boat.alive; i++) game.update(.025, { ...controls, fire: true });
    expect(boat.alive).toBe(false);
    expect(game.entities).not.toContain(boat);
    expect(game.score).toBeGreaterThan(100);
    expect(game.bursts).toHaveLength(1);
  });
});
