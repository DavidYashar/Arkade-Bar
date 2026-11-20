/**
 * Solid things in the bar, as axis-aligned boxes in three.js space.
 *
 * Blender coordinates convert as (x, y, z) -> (x, z, -y). The room is 14 wide,
 * 18 deep, with the street at z = +9 and the bar at z = -9.
 */
export type Box = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const WALLS: Box[] = [
  // back wall, and the two side walls
  { minX: -7, maxX: 7, minZ: -9.2, maxZ: -8.9 },
  { minX: -7.2, maxX: -6.9, minZ: -9.2, maxZ: 9.2 },
  { minX: 6.9, maxX: 7.2, minZ: -9.2, maxZ: 9.2 },
  // the front wall, split by the doorway
  { minX: -7.2, maxX: -2.2, minZ: 8.9, maxZ: 9.2 },
  { minX: 2.2, maxX: 7.2, minZ: 8.9, maxZ: 9.2 },
  // the street keeps the player on the block
  { minX: -9, maxX: 9, minZ: 17.4, maxZ: 17.7 },
  { minX: -9.1, maxX: -8.9, minZ: 9, maxZ: 17.6 },
  { minX: 8.9, maxX: 9.1, minZ: 9, maxZ: 17.6 },
];

export const FURNITURE: Box[] = [
  // the bar counter and the back bar
  { minX: -3.6, maxX: 3.6, minZ: -7.7, maxZ: -7.05 },
  { minX: -3.5, maxX: 3.5, minZ: -8.9, maxZ: -8.55 },
  // the card table
  { minX: -1.15, maxX: 1.15, minZ: 1.4, maxZ: 2.6 },
  // two game tables
  { minX: -4.2, maxX: -2.7, minZ: 5.1, maxZ: 6.1 },
  { minX: 2.7, maxX: 4.2, minZ: 5.1, maxZ: 6.1 },
  { minX: -4.0, maxX: -2.5, minZ: -3.1, maxZ: -2.1 },
  { minX: 2.5, maxX: 4.0, minZ: -3.1, maxZ: -2.1 },
  // the lounge
  { minX: -5.4, maxX: -3.2, minZ: 6.2, maxZ: 7.2 },
  { minX: -5.0, maxX: -3.6, minZ: 4.5, maxZ: 5.3 },
  // the five cabinets, seen as their footprint
  { minX: -7.0, maxX: -5.4, minZ: 3.0, maxZ: 3.9 },
  { minX: -7.0, maxX: -5.4, minZ: 1.2, maxZ: 2.1 },
  { minX: -7.0, maxX: -5.4, minZ: -0.6, maxZ: 0.3 },
  { minX: 5.4, maxX: 7.0, minZ: 2.0, maxZ: 2.9 },
  { minX: 5.4, maxX: 7.0, minZ: 0.2, maxZ: 1.1 },
  // the planters on the pavement
  { minX: -3.7, maxX: -2.7, minZ: 9.6, maxZ: 10.4 },
  { minX: 2.7, maxX: 3.7, minZ: 9.6, maxZ: 10.4 },
];

/** The closed leaves. They step aside while the door is open. */
export const DOORWAY: Box = { minX: -2.2, maxX: 2.2, minZ: 8.85, maxZ: 9.15 };

export const DOOR_AT: [number, number] = [0, 9.0];

export function blocked(x: number, z: number, radius: number, doorOpen: boolean): boolean {
  const boxes = doorOpen ? WALLS : [...WALLS, DOORWAY];
  for (const b of boxes) {
    if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) {
      return true;
    }
  }
  for (const b of FURNITURE) {
    if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) {
      return true;
    }
  }
  return false;
}

/** The player can stand here: inside the street or inside the room, never between them. */
export function insideBounds(x: number, z: number): boolean {
  const street = z >= 8.9 && z <= 17.6 && x >= -8.9 && x <= 8.9;
  const room = z >= -9 && z <= 9.2 && x >= -6.9 && x <= 6.9;
  const doorway = z > 8.6 && z < 9.4 && Math.abs(x) <= 2.1;
  return street || room || doorway;
}
