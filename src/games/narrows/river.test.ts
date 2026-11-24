import { describe, expect, it } from 'vitest';
import { ISLAND_SHAPES } from './islandShapes';
import { BRIDGE_SPACING, CRUISE, FIRST_BRIDGE_Z, MAX_THROTTLE, RIVER_LENGTH, closestLaneX, flightLanesAt, islandBanks, islandsBetween, riverAt } from './river';

describe('Narrows river route', () => {
  it('runs beyond fifteen minutes at full throttle and stays navigable', () => {
    expect(RIVER_LENGTH / (CRUISE * MAX_THROTTLE)).toBeGreaterThan(15 * 60);
    for (let z = 0; z <= RIVER_LENGTH; z += 97) {
      const a = riverAt(z);
      const b = riverAt(z + 1);
      expect(a.half).toBeGreaterThan(95);
      expect(Math.abs(b.center - a.center) + Math.abs(b.half - a.half)).toBeLessThan(4.5);
    }
  });

  it('swings between wide and narrow with gradual changes in bank slope', () => {
    let widest = 0;
    let narrowest = Infinity;
    let steepestBank = 0;
    let sharpestBend = 0;
    for (let z = 1; z < RIVER_LENGTH; z += 7) {
      const a = riverAt(z - 1);
      const b = riverAt(z);
      const c = riverAt(z + 1);
      widest = Math.max(widest, b.half);
      narrowest = Math.min(narrowest, b.half);
      steepestBank = Math.max(steepestBank, Math.abs(c.center - b.center) + Math.abs(c.half - b.half));
      sharpestBend = Math.max(sharpestBend,
        Math.abs(a.center + c.center - 2 * b.center) + Math.abs(a.half + c.half - 2 * b.half));
    }
    expect(widest - narrowest).toBeGreaterThan(70);
    expect(steepestBank).toBeLessThan(1.75);
    expect(sharpestBend).toBeLessThan(.04);
  });

  it('gives each bridge a straight approach and exit', () => {
    for (let z = FIRST_BRIDGE_Z; z + 1_000 <= RIVER_LENGTH; z += BRIDGE_SPACING) {
      expect(riverAt(z - 700)).toEqual(riverAt(z));
      expect(riverAt(z + 1_000)).toEqual(riverAt(z));
    }
  });

  it('places varied islands that split the river without closing either channel', () => {
    const islands = islandsBetween(0, RIVER_LENGTH);
    expect(islands.length).toBeGreaterThan(50);
    expect(islands[0]!.start).toBeLessThan(1_500);
    const lengths = islands.map((island) => island.end - island.start);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(180);
    for (const island of islands) {
      for (let i = 0; i <= 10; i++) {
        const z = island.start + (island.end - island.start) * i / 10;
        const banks = islandBanks(island, z);
        const lanes = flightLanesAt(z);
        expect(lanes).toHaveLength(2);
        expect(lanes.every((lane) => lane.right - lane.left > 20)).toBe(true);
        expect(Math.abs(closestLaneX(z, (banks.left + banks.right) / 2) - (banks.left + banks.right) / 2)).toBeGreaterThanOrEqual(9.99);
      }
    }
    for (let z = FIRST_BRIDGE_Z; z < RIVER_LENGTH; z += BRIDGE_SPACING) {
      expect(islandsBetween(z - 500, z + 500)).toHaveLength(0);
    }
  });

  it('uses every island plan, and no two islands share a plan edge for edge', () => {
    const islands = islandsBetween(0, RIVER_LENGTH);
    expect(ISLAND_SHAPES.length).toBeGreaterThanOrEqual(12);
    const early = islands.slice(0, ISLAND_SHAPES.length).map(({ shape }) => shape.name);
    expect(new Set(early).size).toBe(ISLAND_SHAPES.length);
    const kinds = new Set(islands.map((island) => island.shape.name));
    expect(kinds.size).toBe(ISLAND_SHAPES.length);
  });
});
