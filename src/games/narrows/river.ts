/** Continuous river corridor shared by rendering, collision, and spawning. */
import { islandRouteStretch, islandShape, islandShoreAt } from './islandShapes';

export const CRUISE = 330;
export const MAX_THROTTLE = 1.9;
export const RUN_SECONDS = 30 * 60;
export const FIRST_BRIDGE_Z = 5_200;
export const BRIDGE_SPACING = 7_600;
export const RIVER_LENGTH = CRUISE * MAX_THROTTLE * RUN_SECONDS + 1_500;

type Section = { start: number; end: number; left: number; right: number; nextLeft: number; nextRight: number };

function buildRoute() {
  // Share each change in width and direction across most of its reach.
  const route: Section[] = [];
  let z = 0;
  let left = 150;
  let right = 570;
  let seed = 0x2f19b;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  function push(length: number, nextLeft = left, nextRight = right) {
    if (length <= 0) return;
    route.push({ start: z, end: z + length, left, right, nextLeft, nextRight });
    z += length;
    left = nextLeft;
    right = nextRight;
  }

  // a straight opening, then a lined up run into the first bridge
  push(1_900);
  push(1_550, 170, 550);
  push(FIRST_BRIDGE_Z - z);

  for (let bridge = FIRST_BRIDGE_Z; z < RIVER_LENGTH; bridge += BRIDGE_SPACING) {
    // straight banks over the bridge itself
    push(bridge + 1_250 - z);
    const end = bridge + BRIDGE_SPACING - 850;
    let narrow = random() > 0.5;

    while (end - z > 260) {
      const remaining = end - z;
      const centre = (left + right) / 2;
      const half = narrow ? 118 + random() * 42 : 215 + random() * 80;
      const targetCentre = Math.min(680 - half - 40, Math.max(half + 40,
        centre + (random() * 2 - 1) * (narrow ? 80 : 140)));
      const nextLeft = targetCentre - half;
      const nextRight = targetCentre + half;

      const bend = Math.min(70 + random() * 60, remaining * .4);
      const reach = Math.min(150 + random() * 190, remaining - bend);
      const transition = bend + reach * .86;
      push(transition, nextLeft, nextRight);
      push(bend + reach - transition);
      narrow = !narrow;
    }

    push(end - z);
  }
  return route;
}

const ROUTE = buildRoute();

export function riverAt(z: number) {
  let low = 0;
  let high = ROUTE.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (ROUTE[mid]!.end < z) low = mid + 1;
    else high = mid;
  }
  const section = ROUTE[low]!;
  const t = Math.min(1, Math.max(0, (z - section.start) / (section.end - section.start)));
  const ease = t * t * (3 - 2 * t);
  const left = section.left + (section.nextLeft - section.left) * ease;
  const right = section.right + (section.nextRight - section.right) * ease;
  return { center: (left + right) / 2, half: (right - left) / 2 };
}

export type Island = {
  start: number;
  end: number;
  breadth: number;
  offset: number;
  height: number;
  shape: ReturnType<typeof islandShape>;
};

function buildIslands(): Island[] {
  let seed = 0x45d91;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  function island(start: number, want: number, shapeIndex: number): Island {
    const shape = islandShape(shapeIndex);
    const stretch = islandRouteStretch(shapeIndex);
    // size against the tightest the river gets along the island, so no lane ever closes
    const probe = riverAt(start).half;
    const reach = (want * stretch);
    const narrowest = Math.min(
      riverAt(start).half,
      riverAt(start + reach * .35).half,
      riverAt(start + reach * .7).half,
      riverAt(start + reach).half,
    );
    const breadth = Math.max(60, Math.min(want, narrowest * .9 - 60));
    const half = Math.min(probe, narrowest);
    const span = breadth * stretch;
    // keep a lane of at least 45 units on both sides after the clearance
    const room = Math.max(0, half - breadth / 2 - 45);
    const offset = ((random() * 2 - 1) * room) / half;
    return { start, end: start + span, breadth, offset, height: 34 + random() * 40, shape };
  }

  // Keep the original placement sequence along the river.
  let next = 0;
  const islands = [island(1_050, 210, next++)];
  for (let bridge = FIRST_BRIDGE_Z; bridge < RIVER_LENGTH; bridge += BRIDGE_SPACING) {
    if (random() < .08) continue;
    const count = random() < .3 ? 2 : 1;
    let cursor = bridge + 1_200 + random() * 1_000;
    for (let k = 0; k < count; k += 1) {
      const breadth = 110 + random() * 130;
      const span = breadth * islandRouteStretch(next);
      if (cursor + span > bridge + BRIDGE_SPACING - 400) break;
      islands.push(island(cursor, breadth, next++));
      cursor += span + 200 + random() * 260;
    }
  }
  islands.sort((a, b) => a.start - b.start);
  return islands;
}

const ISLANDS = buildIslands();

export function islandsBetween(start: number, end: number) {
  let low = 0;
  let high = ISLANDS.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (ISLANDS[mid]!.end < start) low = mid + 1;
    else high = mid;
  }
  const visible: Island[] = [];
  for (let i = low; i < ISLANDS.length && ISLANDS[i]!.start <= end; i++) visible.push(ISLANDS[i]!);
  return visible;
}

/** Where the island meets the water at one distance along it. */
export function islandBanks(island: Island, z: number) {
  const t = Math.min(1, Math.max(0, (z - island.start) / (island.end - island.start)));
  const { center, half } = riverAt(z);
  const middle = center + half * island.offset;
  const span = island.breadth / 2;

  const shore = islandShoreAt(island.shape, t);
  return { left: middle + shore.left * span, right: middle + shore.right * span };
}

export function flightLanesAt(z: number, clearance = 10) {
  const { center, half } = riverAt(z);
  const left = center - half + clearance;
  const right = center + half - clearance;
  const [island] = islandsBetween(z, z);
  if (!island) return [{ left, right }];
  const banks = islandBanks(island, z);
  return [{ left, right: banks.left - clearance }, { left: banks.right + clearance, right }];
}

export function closestLaneX(z: number, x: number) {
  const [first, second] = flightLanesAt(z);
  const a = Math.min(first!.right, Math.max(first!.left, x));
  if (!second) return a;
  const b = Math.min(second.right, Math.max(second.left, x));
  return Math.abs(x - a) <= Math.abs(x - b) ? a : b;
}
