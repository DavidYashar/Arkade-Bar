import { describe, expect, it } from 'vitest';
import { Narrows, type Controls, type Entity } from './narrows';

const controls: Controls = { left: false, right: false, slow: false, fast: false, fire: false };

describe('Narrows riverbank cannons', () => {
  it.each([-1, 1])('launches the shell along the visible barrel on bank %i', (side) => {
    const game = new Narrows();
    game.reset();
    const cannon: Entity = {
      kind: 'cannon', x: game.x + side * 250, z: 480, hp: 2,
      vx: 0, vz: 0, wobble: 0, alive: true, fire: 0, side,
    };
    game.entities = [cannon];
    game.update(.025, controls);

    const gun = game.cannonGun(cannon);
    const shell = game.bullets.find((bullet) => bullet.from === 'enemy')!;
    expect(shell).toMatchObject({ x: gun.x, z: gun.z, height: gun.height, age: 0 });
    const barrelLength = Math.hypot(gun.x - cannon.x, gun.z - cannon.z);
    const speed = Math.hypot(shell.vx, shell.vz);
    expect(speed).toBeCloseTo(360);
    expect(shell.vx / speed).toBeCloseTo((gun.x - cannon.x) / barrelLength);
    expect(shell.vz / speed).toBeCloseTo((gun.z - cannon.z) / barrelLength);
    expect(Math.sign(shell.vx)).toBe(-side);

    game.update(.025, { ...controls, right: true });
    expect(game.cannonGun(cannon)).toEqual(gun);
    expect(shell.x).toBeCloseTo(gun.x + shell.vx * .025);
    expect(shell.z).toBeCloseTo(gun.z + shell.vz * .025);
  });
});
