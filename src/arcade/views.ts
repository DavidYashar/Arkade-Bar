/**
 * Preset viewpoints around the bar.
 *
 * Blender exports Y-up, so a point (x, y, z) in the script becomes (x, z, -y)
 * here. These already carry that conversion.
 */
import { BRICK_BLITZ_AT, CHESTERFIELD_AT, JUKEBOX_AT, NARROWS_AT, PINBALL_AT } from './colliders';

export type View = {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

export const VIEWS: View[] = [
  { id: 'street', label: 'Street', position: [0, 1.65, 17.6], target: [0, 1.75, 9.2], fov: 34 },
  { id: 'door', label: 'Doorway', position: [0, 1.65, 8.2], target: [0, 1.55, -7.6], fov: 30 },
  { id: 'room', label: 'The room', position: [-4.9, 2.05, 6.9], target: [1.0, 1.35, -2.6], fov: 34 },
  { id: 'table', label: 'The table', position: [1.9, 1.68, 5.2], target: [0, 1.7, 2.0], fov: 50 },
  { id: 'cabinets', label: 'Cabinets', position: [-3.1, 1.65, 3.9],
    target: [PINBALL_AT[0], 1.02, PINBALL_AT[1]], fov: 38 },
  { id: 'pinball', label: 'Neon Pinball', position: [PINBALL_AT[0] + 1.95, 1.68, PINBALL_AT[1] + 1.85],
    target: [PINBALL_AT[0], 1.02, PINBALL_AT[1]], fov: 44 },
  { id: 'bar', label: 'The bar', position: [0, 1.62, 0.0], target: [0, 1.65, -7.6], fov: 42 },
  { id: 'brick-blitz', label: 'Brick Blitz', position: [3.1, 1.68, 3.85],
    target: [BRICK_BLITZ_AT[0], 0.72, BRICK_BLITZ_AT[1]], fov: 43 },
  { id: 'narrows', label: 'Rescue Boat', position: [NARROWS_AT[0] + 2.35, 1.68, NARROWS_AT[1]],
    target: [NARROWS_AT[0], 1.04, NARROWS_AT[1]], fov: 43 },
  { id: 'jukebox', label: 'Jukebox', position: [CHESTERFIELD_AT[0] + 1.22, 1.68, JUKEBOX_AT[1] + 1.07],
    target: [JUKEBOX_AT[0] - .48, 1.05, JUKEBOX_AT[1]], fov: 52 },
];
