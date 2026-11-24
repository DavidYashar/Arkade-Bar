/** Sandy islands with irregular headlands, bays and tapered sand spits. */
const SHORE_STEPS = 32;

// The route was generated with these length ratios. Keep the sequence separate
// from the scenery catalogue so changes to the art cannot move later islands.
const ROUTE_STRETCH = [
  .9, 2.4, .55, 1.2, 1.5, 1, 1, .95, 1.1, 1, 1, 1.1, 1, .95, 1.05, 1.2, 1.7, .9, 1.2,
] as const;

export function islandRouteStretch(index: number) {
  return ROUTE_STRETCH[index % ROUTE_STRETCH.length]!;
}

type Profile = {
  name: string;
  bend: number;
  bay: number;
  bayAt: number;
  woods: number;
};

export const ISLAND_SHAPES: readonly Profile[] = [
  { name: 'Driftwood Beach', bend: -.22, bay: .34, bayAt: .36, woods: .37 },
  { name: 'Mangrove Cove', bend: .22, bay: -.83, bayAt: .56, woods: .86 },
  { name: 'Twin Shoals', bend: -.08, bay: .49, bayAt: .54, woods: .42 },
  { name: 'Sandhook', bend: .53, bay: .55, bayAt: .26, woods: .52 },
  { name: 'Fern Point', bend: -.44, bay: -.26, bayAt: .63, woods: .68 },
  { name: 'Half Moon', bend: .41, bay: -.68, bayAt: .43, woods: .81 },
  { name: 'Pebble Strand', bend: .04, bay: .25, bayAt: .47, woods: .28 },
  { name: 'Palm Reach', bend: .29, bay: .57, bayAt: .67, woods: .68 },
  { name: 'Long Spit', bend: -.61, bay: -.43, bayAt: .23, woods: .51 },
  { name: 'Hidden Bay', bend: -.24, bay: .77, bayAt: .54, woods: .92 },
  { name: 'Heron Beach', bend: .08, bay: -.31, bayAt: .69, woods: .33 },
  { name: 'Sheltered Point', bend: .25, bay: .62, bayAt: .39, woods: .75 },
  { name: 'Stonecap', bend: -.30, bay: -.24, bayAt: .51, woods: .58 },
  { name: 'Green Shoal', bend: .09, bay: .23, bayAt: .62, woods: .48 },
  { name: 'Split Beach', bend: -.37, bay: -.64, bayAt: .47, woods: .69 },
  { name: 'Crescent Strand', bend: .47, bay: .78, bayAt: .53, woods: .83 },
  { name: 'Willow Reach', bend: -.47, bay: -.45, bayAt: .72, woods: .59 },
  { name: 'Pale Sand', bend: .17, bay: -.52, bayAt: .29, woods: .23 },
  { name: 'Forest Headland', bend: .36, bay: .33, bayAt: .74, woods: .96 },
  { name: 'Tern Point', bend: -.55, bay: .64, bayAt: .38, woods: .45 },
];

type Shore = { left: number; right: number };

export function islandShape(index: number) {
  const variant = index % ISLAND_SHAPES.length;
  const profile = ISLAND_SHAPES[variant]!;
  const phase = variant * 2.39996 + Math.floor(index / ISLAND_SHAPES.length) * .64;
  const shores = Array.from({ length: SHORE_STEPS + 1 }, (_, step): Shore => {
    const t = step / SHORE_STEPS;
    const envelope = (4 * t * (1 - t)) ** (.56 + .10 * Math.sin(phase));
    const width = envelope * (.84 + .12 * Math.sin(t * 8 + phase) + .096 * Math.sin(t * 17 - phase));
    const center = profile.bend * (t * 1.8 - .85) + .13 * Math.sin(t * 5 - phase);
    const inlet = width * Math.abs(profile.bay) * Math.exp(-(((t - profile.bayAt) / .16) ** 2));
    return {
      left: center - width * (1 + .06 * Math.sin(t * 23 + phase)) + (profile.bay < 0 ? inlet : 0),
      right: center + width * (1 + .06 * Math.cos(t * 23 - phase)) - (profile.bay > 0 ? inlet : 0),
    };
  });
  const left = Math.min(...shores.map((shore) => shore.left));
  const right = Math.max(...shores.map((shore) => shore.right));
  const normalize = (x: number) => 2 * (x - left) / (right - left) - 1;

  return {
    name: profile.name,
    woods: profile.woods,
    phase,
    seed: index + 1,
    shores: shores.map((shore) => ({ left: normalize(shore.left), right: normalize(shore.right) })),
  };
}

export function islandShoreAt(shape: ReturnType<typeof islandShape>, t: number): Shore {
  const row = t * SHORE_STEPS;
  const index = Math.min(SHORE_STEPS - 1, Math.floor(row));
  const blend = row - index;
  const a = shape.shores[index]!;
  const b = shape.shores[index + 1]!;
  return { left: a.left + (b.left - a.left) * blend, right: a.right + (b.right - a.right) * blend };
}
