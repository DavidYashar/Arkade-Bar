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

export const PINBALL_AT = [-5.55, 2.2] as const;
export const BRICK_BLITZ_AT = [5.50, 2.15] as const;
// The jukebox uses its flat back as the origin, just inside the wall lining.
export const JUKEBOX_AT = [6.856, -3.15] as const;
export const CHESTERFIELD_AT = [3.55, JUKEBOX_AT[1]] as const;
export const ENTRANCE_COUCH_AT = [-4.30, 6.80] as const;
export const ENTRANCE_TABLE_AT = [ENTRANCE_COUCH_AT[0], 4.95] as const;
// the cocktail table stands against the left wall past the pinball, head to the wall
export const NARROWS_AT = [-5.76, -1.28] as const;
export const NARROWS_YAW = Math.PI / 2;
// built at 1.67 by 0.99, scaled to sit beside the pinball at the same size
export const NARROWS_SCALE = 1.3;
export const NARROWS_REACH = 2.7;
export const ENTRANCE_PLANTERS = [[-3.2, 10], [3.2, 10]] as const;
export const INTERIOR_PLANTERS = [[-6.0, 7.95], [6.0, 7.95], [-6.0, -7.95], [6.0, -7.95]] as const;

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
  { minX: -4.09, maxX: 4.09, minZ: -7.54, maxZ: -6.56 },
  { minX: -3.67, maxX: 3.67, minZ: -8.9, maxZ: -8.32 },
  // the card table
  { minX: -1.15, maxX: 1.15, minZ: 1.4, maxZ: 2.6 },
  // the lounge
  { minX: ENTRANCE_COUCH_AT[0] - 1.30, maxX: ENTRANCE_COUCH_AT[0] + 1.30,
    minZ: ENTRANCE_COUCH_AT[1] - .54, maxZ: ENTRANCE_COUCH_AT[1] + .50 },
  { minX: ENTRANCE_TABLE_AT[0] - .70, maxX: ENTRANCE_TABLE_AT[0] + .70,
    minZ: ENTRANCE_TABLE_AT[1] - .33, maxZ: ENTRANCE_TABLE_AT[1] + .33 },
  // the pinball machine on the left wall
  { minX: PINBALL_AT[0] - 1.18, maxX: PINBALL_AT[0] + 1.01,
    minZ: PINBALL_AT[1] - 0.54, maxZ: PINBALL_AT[1] + 0.54 },
  { minX: BRICK_BLITZ_AT[0] - 1.34, maxX: BRICK_BLITZ_AT[0] + 1.23,
    minZ: BRICK_BLITZ_AT[1] - 0.90, maxZ: BRICK_BLITZ_AT[1] + 0.90 },
  { minX: JUKEBOX_AT[0] - .70, maxX: JUKEBOX_AT[0],
    minZ: JUKEBOX_AT[1] - .57, maxZ: JUKEBOX_AT[1] + .57 },
  { minX: CHESTERFIELD_AT[0] - .50, maxX: CHESTERFIELD_AT[0] + .54,
    minZ: CHESTERFIELD_AT[1] - 1.30, maxZ: CHESTERFIELD_AT[1] + 1.30 },
  // turned with its head to the wall, so it is deep in x and narrow in z
  { minX: NARROWS_AT[0] - .82 * NARROWS_SCALE, maxX: NARROWS_AT[0] + .82 * NARROWS_SCALE,
    minZ: NARROWS_AT[1] - .50 * NARROWS_SCALE, maxZ: NARROWS_AT[1] + .50 * NARROWS_SCALE },
  // the planters on the pavement
  ...ENTRANCE_PLANTERS.map(([x, z]) => ({
    minX: x - 0.30, maxX: x + 0.30, minZ: z - 0.30, maxZ: z + 0.30,
  })),
  ...INTERIOR_PLANTERS.map(([x, z]) => ({
    minX: x - 0.34, maxX: x + 0.34, minZ: z - 0.34, maxZ: z + 0.34,
  })),
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
