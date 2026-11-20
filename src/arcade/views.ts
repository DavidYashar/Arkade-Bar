/**
 * The six frames the grey box is meant to be looked at from.
 *
 * Blender exports Y-up, so a point (x, y, z) in the script becomes (x, z, -y)
 * here. These already carry that conversion.
 */
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
  { id: 'table', label: 'The table', position: [2.9, 1.85, 4.2], target: [0, 0.8, 2.0], fov: 40 },
  { id: 'cabinets', label: 'Cabinets', position: [-3.4, 1.65, 4.6], target: [-5.9, 1.25, 1.2], fov: 38 },
  { id: 'bar', label: 'The bar', position: [0, 1.62, -0.6], target: [0, 1.45, -7.6], fov: 36 },
];
