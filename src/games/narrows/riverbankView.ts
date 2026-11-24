import { riverAt } from './river';

type Point = [number, number];
type Project = (x: number, depth: number, height?: number) => Point;
type BankSide = -1 | 1;
type Bank = { shore: number; width: number; rise: number; forest: number; stone: number; water: number };
export type RiverRow = { depth: number; z: number; river: ReturnType<typeof riverAt> };

const SIDES = [-1, 1] as const;
const TILE = 256;
const BANK_TILE = 512;
const BANK_ROCK_START = 13;
let atlas: HTMLImageElement | undefined;
let treeAtlas: HTMLImageElement | undefined;
let rockAtlas: HTMLImageElement | undefined;
// Atlas order: dense grove, coconut palm, palm pair, broadleaf, mixed grove, fan palm.
const BANK_TREE_SPRITES = [
  { cell: 3, rootX: .49, rootY: .925, scale: 1 },
  { cell: 0, rootX: .48, rootY: .956, scale: 1 },
  { cell: 4, rootX: .50, rootY: .930, scale: .93 },
  { cell: 3, rootX: .49, rootY: .925, scale: .88 },
  { cell: 1, rootX: .50, rootY: .961, scale: 1 },
  { cell: 2, rootX: .47, rootY: .952, scale: 1 },
  { cell: 5, rootX: .50, rootY: .925, scale: .72 },
] as const;
// Contact anchors for the six rock shapes in atlas order.
const BANK_ROCK_SPRITES = [
  { rootX: .51, rootY: .84 },
  { rootX: .50, rootY: .84 },
  { rootX: .49, rootY: .85 },
  { rootX: .51, rootY: .87 },
  { rootX: .49, rootY: .87 },
  { rootX: .48, rootY: .87 },
] as const;
type Texture = { path: string; crop?: [number, number, number, number]; image?: HTMLImageElement; tile?: HTMLCanvasElement };
type TerrainPattern = { pattern: CanvasPattern; pixelsWide: number; pixelsLong: number };
type Strip = { z: number; originX: number; scaleX: number; top: number; bottom: number };
type Hill = { z: number; inland: number; along: number; across: number; rise: number };
type BankSection = { z: number; depth: number; bank: Bank; grass: Point; grassStart: Point; blendWidth: number;
  waterline: Point; shallows: Point };
let beachLayer: CanvasRenderingContext2D | undefined;

const sandTexture: Texture = { path: '/textures/narrows-sand.png' };
const grassTextures: Texture[] = [
  { path: '/textures/narrows-grass-ridges.png', crop: [.03, .40, .94, .58] },
  { path: '/textures/narrows-grass-meadow.png', crop: [.02, .45, .96, .53] },
  { path: '/textures/narrows-grass-valley.png', crop: [.02, .49, .95, .49] },
  { path: '/textures/narrows-grass-tufts.jpg', crop: [.02, .43, .96, .55] },
];

// Use world coordinates for the shoreline and planting so scenery stays put
// while the camera scrolls. Each bank has its own sequence of clearings.
function random(index: number, salt: number) {
  let n = Math.imul(index ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 2 ** 32;
}

function noise(z: number, span: number, salt: number) {
  const cell = Math.floor(z / span);
  const t = z / span - cell;
  const a = random(cell, salt);
  return a + (random(cell + 1, salt) - a) * t * t * (3 - 2 * t);
}

function bankAt(z: number, side: BankSide, shore: number): Bank {
  const salt = side === -1 ? 17 : 43;
  const forest = noise(z, 860, salt);
  const stone = noise(z, 415, salt + 1);
  const silt = noise(z, 620, salt + 2);
  const erosion = noise(z, 87, salt + 3);
  const scallop = noise(z, 39, salt + 5);
  const water = 2 + 14 * erosion + 4 * scallop;
  const width = water + 12 + 32 * silt * (1 - forest) + 9 * scallop;
  return {
    shore,
    forest,
    stone,
    water,
    width,
    rise: 9 + 28 * (1 - silt) * noise(z, 235, salt + 4) + 7 * erosion,
  };
}

function bankHeight(bank: Bank, offset: number) {
  const slope = Math.min(1, Math.max(0, (offset - bank.water) / (bank.width - bank.water)));
  return bank.rise * slope ** 1.45;
}

function polygonPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(...points[0]!);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string) {
  polygonPath(ctx, points);
  ctx.fillStyle = fill;
  ctx.fill();
}

function hillsAlong(distance: number, range: number, side: BankSide): Hill[] {
  const spacing = 174;
  const first = Math.floor((distance - range * .31) / spacing);
  const last = Math.ceil((distance + range * 1.14) / spacing);
  const salt = side === -1 ? 127 : 263;
  return Array.from({ length: last - first }, (_, index) => {
    const cell = first + index;
    return {
      z: (cell + .14 + random(cell, salt) * .72) * spacing,
      inland: 34 + random(cell, salt + 1) * 149,
      along: 66 + random(cell, salt + 2) * 108,
      across: 44 + random(cell, salt + 3) * 85,
      rise: 11 + random(cell, salt + 4) * 22,
    };
  });
}

function hillRise(hills: Hill[], z: number, inland: number) {
  let height = 0;
  for (const hill of hills) {
    const radius = ((z - hill.z) / hill.along) ** 2 + ((inland - hill.inland) / hill.across) ** 2;
    height += hill.rise * Math.max(0, 1 - radius) ** 2;
  }
  return height * Math.min(1, Math.max(0, inland) / 44);
}

export function drawRiverbanks(ctx: CanvasRenderingContext2D, distance: number, range: number,
  width: number, project: Project, rows: RiverRow[], time = 0) {
  const sand = terrainPattern(ctx, sandTexture);
  const grass = grassTextures.map((texture) => terrainPattern(ctx, texture)).filter((texture) => texture !== null);
  const strips = terrainStrips(distance, range, project);
  const hills = SIDES.map((side) => hillsAlong(distance, range, side));
  for (const [index, side] of SIDES.entries()) {
    const mounds = hills[index]!;
    const sections = rows.map(({ depth, z, river }): BankSection => {
      const bank = bankAt(z, side, river.center + side * river.half);
      const { shore, width: beach, rise } = bank;
      const salt = side < 0 ? 391 : 619;
      const blendWidth = Math.min((beach - bank.water) * .8,
        6 + 13 * noise(z, 109, salt) + 9 * noise(z, 34, salt + 1));
      const grassStart = beach - blendWidth;
      const grass = project(shore + side * beach, depth, rise);
      return {
        z, depth, bank, grass, blendWidth,
        grassStart: project(shore + side * grassStart, depth, bankHeight(bank, grassStart)),
        waterline: project(shore, depth),
        shallows: project(shore + side * bank.water, depth),
      };
    });

    const rim = (section: (typeof sections)[number]): Point[] => {
      const { bank, depth, z } = section;
      const edge = side < 0 ? -20 : width + 20;
      const worldScale = project(1, depth)[0] - project(0, depth)[0];
      const reach = Math.max(0, side * (edge - section.grass[0]) / worldScale);
      const count = Math.max(1, Math.ceil(reach / 36));
      const points = Array.from({ length: count }, (_, i) => {
        const inland = (i + 1) / count * reach;
        return project(bank.shore + side * (bank.width + inland), depth, bank.rise + hillRise(mounds, z, inland));
      });
      const outer = points[points.length - 1]!;
      // Keep the outer edge beyond the canvas even when a meander goes offscreen.
      outer[0] = side < 0 ? Math.min(edge, outer[0]) : Math.max(edge, outer[0]);
      return points;
    };
    const farRim = rim(sections[0]!);
    const nearRim = rim(sections[sections.length - 1]!);
    // Back the shared grass and beach edge so their antialiasing does not expose the sky.
    polygon(ctx, [farRim[farRim.length - 1]!, ...sections.map((row) => row.waterline), nearRim[nearRim.length - 1]!], '#59683b');
    const grassland = [...farRim.reverse(), ...sections.map((row) => row.grassStart), ...nearRim];
    polygon(ctx, grassland, '#59683b');
    ctx.save();
    ctx.clip();
    if (grass.length) drawGrass(ctx, grass, strips, width, side);
    drawHillLight(ctx, mounds, side, distance, range, project);
    ctx.restore();

    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1]!;
      const b = sections[i]!;
      const flecks = noise(b.z, 49, side + 10) * 14;
      const shade = b.bank.forest * 24;
      const deep = Math.max(0, b.depth);
      const shallowTone = b.bank.stone * 12 + flecks * .5;
      polygon(ctx, [a.shallows, a.waterline, b.waterline, b.shallows],
        `rgb(${21 + Math.round(shallowTone)}, ${Math.round(80 - deep * 24 - shade * .35)}, ${Math.round(85 - deep * 22 - shade * .65)})`);
    }
    drawBeach(ctx, sections, sand, strips, width, side, project);
    drawShoreWash(ctx, distance, range, side, project, time);
  }
  drawVegetation(ctx, distance, range, width, project, hills);
}

function drawBeach(ctx: CanvasRenderingContext2D, sections: BankSection[], sand: TerrainPattern | null,
  strips: Strip[], width: number, side: BankSide, project: Project) {
  beachLayer ??= document.createElement('canvas').getContext('2d') ?? undefined;
  const surface = beachLayer ?? ctx;
  const { canvas } = surface;
  if (beachLayer) {
    if (canvas.width !== ctx.canvas.width) canvas.width = ctx.canvas.width;
    if (canvas.height !== ctx.canvas.height) canvas.height = ctx.canvas.height;
    surface.clearRect(0, 0, canvas.width, canvas.height);
  }

  const beach = [...sections.map(({ shallows }) => shallows), ...sections.map(({ grass }) => grass).reverse()];
  polygon(surface, beach, '#e2cda4');
  if (sand) {
    surface.save();
    surface.clip();
    for (const strip of strips) fillTerrainStrip(surface, sand, strip, width, 136, 192, 0, 0);
    surface.restore();
  }
  if (!beachLayer) return;

  // Feather only the inland edge of the sand layer. Every contour follows the beach slope.
  const contours = 14;
  const inlandEdge = sections.map(({ grass }): Point => [grass[0] + side * 20, grass[1]]).reverse();
  const inlandNear = inlandEdge[0]!;
  const inlandFar = inlandEdge[inlandEdge.length - 1]!;
  let previous = 0;
  surface.save();
  surface.globalCompositeOperation = 'destination-out';
  for (let step = 1; step <= contours; step++) {
    const t = (step - .5) / contours;
    const opacity = (step / contours) ** 2 * (3 - 2 * step / contours);
    const line = sections.map(({ bank, blendWidth, depth }) => {
      const offset = bank.width - blendWidth * (1 - t);
      return project(bank.shore + side * offset, depth, bankHeight(bank, offset));
    });
    const first = line[0]!;
    const last = line[line.length - 1]!;
    const top = Math.min(-24, first[1] - 24);
    const bottom = Math.max(canvas.height + 24, last[1] + 24);
    surface.globalAlpha = (opacity - previous) / (1 - previous);
    polygon(surface, [[first[0], top], ...line, [last[0], bottom],
      [inlandNear[0], bottom], ...inlandEdge, [inlandFar[0], top]], '#000');
    previous = opacity;
  }
  surface.restore();
  ctx.drawImage(canvas, 0, 0);
}

function terrainPattern(ctx: CanvasRenderingContext2D, texture: Texture): TerrainPattern | null {
  if (!texture.image) {
    texture.image = new Image();
    texture.image.src = texture.path;
  }
  const image = texture.image;
  if (!image.complete || !image.naturalWidth) return null;

  if (!texture.tile) {
    const tile = document.createElement('canvas');
    const [u, v, span, length] = texture.crop ?? [0, 0, 1, 1];
    const w = Math.round(image.naturalWidth * span);
    const h = Math.round(image.naturalHeight * length);
    tile.width = 2 * w;
    tile.height = 2 * h;
    const surface = tile.getContext('2d');
    if (!surface) return null;
    // Sample only the ground and mirror its edges for a seamless surface.
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 2; column++) {
        surface.setTransform(column ? -1 : 1, 0, 0, row ? -1 : 1, column * 2 * w, row * 2 * h);
        surface.drawImage(image, image.naturalWidth * u, image.naturalHeight * v, w, h, 0, 0, w, h);
      }
    }
    texture.tile = tile;
  }
  const pattern = ctx.createPattern(texture.tile, 'repeat');
  return pattern && { pattern, pixelsWide: texture.tile.width, pixelsLong: texture.tile.height };
}

const STRIP_STEP = 33;

function terrainStrips(distance: number, range: number, project: Project): Strip[] {
  const first = Math.floor((distance - range * .21) / STRIP_STEP);
  const last = Math.ceil((distance + range * 1.12) / STRIP_STEP);
  return Array.from({ length: last - first }, (_, index) => {
    const z = (first + index) * STRIP_STEP;
    const near = (z - distance) / range;
    const far = near + STRIP_STEP / range;
    const middle = (near + far) / 2;
    const [originX] = project(0, middle);
    const [edgeX] = project(1, middle);
    return { z, originX, scaleX: edgeX - originX, top: project(0, far)[1], bottom: project(0, near)[1] };
  });
}

function fillTerrainStrip(ctx: CanvasRenderingContext2D, texture: TerrainPattern, strip: Strip,
  width: number, tileWidth: number, tileLength: number, xPhase: number, zPhase: number) {
  const height = strip.bottom - strip.top;
  const phase = ((strip.z + zPhase) % tileLength + tileLength) % tileLength;
  texture.pattern.setTransform({
    a: strip.scaleX * tileWidth / texture.pixelsWide,
    d: height * tileLength / (STRIP_STEP * texture.pixelsLong),
    e: strip.originX + strip.scaleX * xPhase,
    f: strip.bottom + phase / STRIP_STEP * height,
  });
  ctx.fillStyle = texture.pattern;
  ctx.fillRect(-20, strip.top, width + 40, height + 1);
}

function drawGrass(ctx: CanvasRenderingContext2D, textures: TerrainPattern[], strips: Strip[],
  width: number, side: BankSide) {
  const patchLength = 360;
  const salt = side < 0 ? 53 : 739;
  for (const strip of strips) {
    const position = (strip.z + STRIP_STEP / 2) / patchLength;
    const patch = Math.floor(position);
    const t = position - patch;
    // Blend neighboring sections, with a different source, scale and origin on either bank.
    for (let i = 0; i < 2; i++) {
      const cell = patch + i;
      const texture = textures[Math.floor(random(cell, salt) * textures.length)]!;
      ctx.globalAlpha = i === 0 ? 1 : t * t * (3 - 2 * t);
      fillTerrainStrip(ctx, texture, strip, width,
        270 + 245 * random(cell, salt + 1), 290 + 260 * random(cell, salt + 2),
        375 * random(cell, salt + 3), 390 * random(cell, salt + 4));
    }
  }
  ctx.globalAlpha = 1;
}

function drawHillLight(ctx: CanvasRenderingContext2D, hills: Hill[], side: BankSide,
  distance: number, range: number, project: Project) {
  for (const hill of hills) {
    const depth = (hill.z - distance) / range;
    const river = riverAt(hill.z);
    const bank = bankAt(hill.z, side, river.center + side * river.half);
    const x = bank.shore + side * (bank.width + hill.inland);
    const [px, py] = project(x, depth, bank.rise + hill.rise * .65);
    const across = project(x + hill.across, depth)[0] - px;
    const along = py - project(x, depth + hill.along / range, bank.rise + hill.rise * .65)[1];
    const strength = .16 + hill.rise / 125;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(across, along);
    const shadow = ctx.createRadialGradient(.28, .27, 0, .28, .27, 1);
    shadow.addColorStop(0, `rgba(22,35,12,${strength})`);
    shadow.addColorStop(1, 'rgba(22,35,12,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2.3, 2.3);
    const sun = ctx.createRadialGradient(-.26, -.27, 0, -.26, -.27, .81);
    sun.addColorStop(0, `rgba(226,227,149,${strength * .87})`);
    sun.addColorStop(1, 'rgba(226,227,149,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(-1.1, -1.1, 2, 2);
    ctx.restore();
  }
}

function drawShoreWash(ctx: CanvasRenderingContext2D, distance: number, range: number,
  side: BankSide, project: Project, time: number) {
  const spacing = 67;
  const salt = side < 0 ? 2359 : 1619;
  const first = Math.floor((distance - range * .18) / spacing) - 1;
  const last = Math.ceil((distance + range) / spacing) + 1;
  const ease = (t: number) => t * t * (3 - 2 * t);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let cell = last; cell >= first; cell--) {
    const clock = time / (2.35 + 2.35 * random(cell, salt)) + 2.2 * random(cell, salt + 1);
    const phase = clock - Math.floor(clock);
    const event = cell * 137 + Math.floor(clock);
    const breaking = .33 + .15 * random(event, salt + 2);
    const returnTime = Math.max(0, (phase - breaking) / (1 - breaking));
    const push = phase < breaking ? -1 + 2 * ease(phase / breaking) : 1 - 2 * ease(returnTime);
    const strength = .57 + .43 * random(event, salt + 3);
    const life = Math.sin(Math.PI * phase) ** .75 * strength;
    const midpoint = (cell + .12 + .76 * random(event, salt + 4)) * spacing - phase * 13;
    const length = (46 + 50 * random(event, salt + 5)) * Math.min(1.2, riverAt(midpoint).half / 156);
    const crest: Point[] = [];
    const foot: Point[] = [];
    const wet: Point[] = [];
    const segments = Math.max(6, Math.ceil(length / 5));

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const z = midpoint + (u - .5) * length;
      const depth = (z - distance) / range;
      const river = riverAt(z);
      const bank = bankAt(z, side, river.center + side * river.half);
      const sand = bank.width - bank.water;
      const spread = Math.min(sand * .47, river.half * .069, 14.5) * strength;
      const taper = Math.sin(Math.PI * u) ** .78;
      const lobes = .65 + .28 * noise(z - phase * 14, 15, salt + 6) + .17 * noise(z, 7, salt + 7);
      const travel = push < 0 ? push * Math.min(bank.water + 3, spread) : push * spread;
      const front = bank.water + travel * taper * lobes;
      const ribbon = (1.1 + 3.3 * ease(1 - returnTime)) * taper * lobes;
      const trailing = front - ribbon - taper * (2 + returnTime * 3);
      const peak = bank.water + spread * taper * lobes;
      const place = (offset: number) => project(bank.shore + side * offset, depth, bankHeight(bank, offset));
      crest.push(place(front));
      foot.push(place(trailing));
      wet.push(place(peak));
    }

    if (returnTime > 0) {
      polygon(ctx, [...crest, ...wet.reverse()], `rgba(67,91,77,${.21 * life * Math.sqrt(returnTime)})`);
    }
    polygon(ctx, [...crest, ...foot.slice().reverse()], `rgba(140,181,168,${.30 * life})`);
    const midDepth = (midpoint - distance) / range;
    const scale = project(1, midDepth)[0] - project(0, midDepth)[0];
    // Break the foam into scalloped crests and fading filaments in the returning water.
    for (let i = 1; i < segments - 1; i++) {
      const fleck = random(event * 19 + i, salt + 9);
      if (fleck < .29 + returnTime * .21) continue;
      const a = crest[i]!;
      const b = crest[i + 1]!;
      const tail = foot[i]!;
      const fade = Math.sin(Math.PI * i / segments) * life;
      ctx.lineWidth = (.7 + 1.15 * fleck) * scale;
      ctx.strokeStyle = `rgba(235,248,235,${fade * (.72 - .39 * returnTime)})`;
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + side * scale, (a[1] + b[1]) / 2, ...b);
      ctx.stroke();
      ctx.lineWidth = .7 * scale;
      ctx.strokeStyle = `rgba(219,243,231,${.50 * fade})`;
      ctx.beginPath();
      ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      ctx.quadraticCurveTo(tail[0] + side * scale, a[1] + 2 * scale, ...tail);
      ctx.stroke();
    }
  }
  ctx.restore();
}

type Plant = { x: number; z: number; height: number; tile: number; size: number; flip: boolean };

function treeCover(z: number, salt: number) {
  const cover = .78 * noise(z, 580, salt + 31) + .22 * noise(z, 175, salt + 32);
  const t = Math.min(1, Math.max(0, (cover - .30) / .43));
  return t * t * (3 - 2 * t);
}

function treeTile(z: number, salt: number, neighborRoll: number, speciesRoll: number) {
  const reach = z / 640;
  const stand = Math.floor(reach);
  const blend = reach - stand;
  // Gradually exchange the dominant species as neighboring stands meet.
  const localStand = stand + Number(neighborRoll < blend * blend * (3 - 2 * blend));
  const dominance = .18 + .74 * random(localStand, salt + 33);
  const count = BANK_TREE_SPRITES.length;
  if (speciesRoll < dominance) return Math.floor(random(localStand, salt + 34) * count);
  return Math.floor((speciesRoll - dominance) / (1 - dominance) * count);
}

function drawVegetation(ctx: CanvasRenderingContext2D, distance: number, range: number, width: number,
  project: Project, hills: Hill[][]) {
  if (!treeAtlas) {
    treeAtlas = new Image();
    treeAtlas.src = '/textures/narrows-riverbank-trees.webp';
  }
  if (!rockAtlas) {
    rockAtlas = new Image();
    rockAtlas.src = '/textures/narrows-riverbank-rocks.webp';
  }
  const trees = treeAtlas.complete && treeAtlas.naturalWidth ? treeAtlas : undefined;
  const rocks = rockAtlas.complete && rockAtlas.naturalWidth ? rockAtlas : undefined;
  const groundPlants = terrainAtlas();
  if (!trees && !rocks && !groundPlants) return;

  const plants: Plant[] = [];
  for (const [index, side] of SIDES.entries()) {
    const mounds = hills[index]!;
    const salt = side === -1 ? 60 : 96;
    const spacing = 41;
    for (let cell = Math.floor((distance - range * .16) / spacing); cell <= (distance + range) / spacing; cell++) {
      const value = (channel: number) => random(cell, salt + channel);
      const z = (cell + value(0)) * spacing;
      const depth = (z - distance) / range;
      if (depth > 1 || depth < -.16) continue;
      const river = riverAt(z);
      const bank = bankAt(z, side, river.center + side * river.half);
      const cover = treeCover(z, salt);
      const grassLine = bank.shore + side * bank.width;
      const add = (tile: number, offset: number, size: number, height = bank.rise) =>
        plants.push({
          tile, size, x: grassLine + side * offset, z,
          height: height + hillRise(mounds, z, offset), flip: value(tile + 18) > .5,
        });

      if (value(1) < cover * .96) {
        add(treeTile(z, salt, value(3), value(4)), 26 + value(5) * 98, 114 + value(6) * 102);
      }
      if (value(7) < cover * (.67 + bank.forest * .29)) {
        add(treeTile(z, salt, value(20), value(8)), 116 + value(9) * 190, 155 + value(10) * 125, bank.rise + 5);
      }
      if (value(11) < .83) {
        const grass = value(12) > .30 + bank.forest * .57;
        const offset = -bank.forest * 13 + value(14) * 42;
        add((grass ? 10 : 7) + Math.floor(value(13) * 3), offset, 38 + value(15) * 56,
          bankHeight(bank, bank.width + offset));
      }
      if (value(16) < Math.max(0, bank.stone - .32) * .83) {
        const position = bank.water + (bank.width - bank.water) * (.17 + value(17) * .56);
        const rock = Math.floor(value(18) * BANK_ROCK_SPRITES.length);
        add(BANK_ROCK_START + rock, position - bank.width, 25 + value(19) * 52, bankHeight(bank, position));
      }
    }
  }

  for (const plant of plants.sort((a, b) => b.z - a.z)) {
    const depth = (plant.z - distance) / range;
    const [x, y] = project(plant.x, depth, plant.height);
    const scale = project(plant.x + 1, depth)[0] - x;
    const size = plant.size * scale;
    if (x + size / 2 < -16 || x - size / 2 > width + 16) continue;
    const sprite = BANK_TREE_SPRITES[plant.tile];
    const rockCell = plant.tile - BANK_ROCK_START;
    const rock = BANK_ROCK_SPRITES[rockCell];
    if (sprite && trees) {
      drawPlantSprite(ctx, trees, (sprite.cell % 3) * BANK_TILE, Math.floor(sprite.cell / 3) * BANK_TILE,
        BANK_TILE, x, y, size * sprite.scale, plant.flip, true, sprite.rootX, sprite.rootY);
    } else if (rock && rocks) {
      drawPlantSprite(ctx, rocks, (rockCell % 3) * BANK_TILE, Math.floor(rockCell / 3) * BANK_TILE,
        BANK_TILE, x, y, size, plant.flip, false, rock.rootX, rock.rootY);
    } else {
      const fallbackTile = rock ? BANK_ROCK_START + rockCell % 3 : plant.tile;
      drawTerrainSprite(ctx, fallbackTile, x, y, size, plant.flip);
    }
  }
}

function terrainAtlas() {
  if (!atlas) {
    atlas = new Image();
    atlas.src = '/textures/narrows-rainforest.png';
  }
  return atlas.complete && atlas.naturalWidth ? atlas : undefined;
}

export function drawTerrainSprite(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number,
  size: number, flip: boolean) {
  const image = terrainAtlas();
  if (!image) return;

  drawPlantSprite(ctx, image, (tile % 4) * TILE, Math.floor(tile / 4) * TILE,
    TILE, x, y, size, flip, tile < 7, .5, .82);
}

function drawPlantSprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement, sourceX: number, sourceY: number,
  tileSize: number, x: number, y: number, size: number, flip: boolean, tree: boolean, rootX: number, rootY: number) {
  const shade = tree ? .28 : .17;
  ctx.save();
  ctx.fillStyle = `rgba(15, 28, 17, ${shade})`;
  ctx.beginPath();
  ctx.ellipse(x + size * .06, y + size * .012, size * (tree ? .20 : .23), size * .063, -.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, sourceX, sourceY, tileSize, tileSize, -size * rootX, -size * rootY, size, size);
  ctx.restore();
}
