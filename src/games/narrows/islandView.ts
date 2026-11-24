import { islandBanks, islandsBetween, type Island } from './river';
import { drawTerrainSprite } from './riverbankView';

type Point = [number, number];
type Project = (x: number, depth: number, height?: number) => Point;
type Section = { left: number; right: number; z: number; t: number };
type Detail = { section: Section; across: number; size: number; tile: number; tone: number };
type Terrain = { sections: Section[]; details: Detail[]; rise: number };

const scenery = new WeakMap<Island, Terrain>();

function random(index: number, seed: number) {
  let hash = Math.imul(index ^ Math.imul(seed, 0x9e3779b9), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
}

function sectionAt(island: Island, t: number): Section {
  const z = island.start + (island.end - island.start) * t;
  return { t, z, ...islandBanks(island, z) };
}

function terrainFor(island: Island) {
  const existing = scenery.get(island);
  if (existing) return existing;

  const { shores, seed, woods } = island.shape;
  const length = island.end - island.start;
  const sections = shores.map((_, i) => sectionAt(island, i / (shores.length - 1)));
  const details: Detail[] = [];
  const scale = Math.min(island.breadth, length);
  const count = Math.round(65 + Math.sqrt(island.breadth * length) * .55);
  for (let i = 0; i < count; i++) {
    const value = (channel: number) => random(i * 7 + channel, seed);
    const section = sectionAt(island, .025 + .95 * value(0));
    const across = .025 + .95 * value(1);
    const edge = .5 - Math.abs(across - .5);
    const inland = edge > .24 && section.t > .18 && section.t < .91;
    const roll = value(2);
    let tile = -1;
    let size = .5 + value(3) * 2.4;
    if (inland && roll < .09 + woods * .25) {
      tile = Math.floor(value(4) * (woods > .65 ? 7 : 4));
      size = Math.min(67, scale * .49) * (.63 + value(3) * .42);
    } else if (edge > .15 && roll < .43) {
      tile = 7 + Math.floor(value(4) * 6);
      size = Math.min(25, scale * .21) * (.56 + value(3) * .65);
    } else if (roll > .945 && (section.t > .63 || island.shape.seed % 3 === 0)) {
      tile = 13 + Math.floor(value(4) * 3);
      size = Math.min(26, scale * .24) * (.72 + value(3) * .46);
    }
    details.push({ section, across, tile, size, tone: value(5) });
  }
  details.sort((a, b) => b.section.z - a.section.z);
  const terrain = { sections, details, rise: Math.min(island.height * .38, length * .13, island.breadth * .23) };
  scenery.set(island, terrain);
  return terrain;
}

function groundHeight(section: Section, across: number, rise: number) {
  const slope = Math.max(0, Math.min(across, 1 - across) * 2);
  return rise * slope ** 1.55 * Math.sin(Math.PI * section.t) ** 1.4;
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.moveTo(...points[0]!);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]!);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawIslands(ctx: CanvasRenderingContext2D, distance: number, range: number, project: Project) {
  const visible = islandsBetween(distance - range * .14, distance + range);
  for (let i = visible.length - 1; i >= 0; i--) {
    const island = visible[i]!;
    const { sections, rise, details } = terrainFor(island);
    const { phase, woods } = island.shape;
    const depthAt = (z: number) => (z - distance) / range;
    const land = (section: Section, across: number) =>
      project(section.left + (section.right - section.left) * across, depthAt(section.z), groundHeight(section, across, rise));
    const outline = (left: (s: Section) => Point, right: (s: Section) => Point) =>
      [...sections.map(left), ...sections.map(right).reverse()];
    const lip = (s: Section, side: -1 | 1) => {
      const width = 4 + 6 * Math.sin(Math.PI * s.t) ** 2;
      return project(side < 0 ? s.left - width : s.right + width, depthAt(s.z - width * Math.cos(Math.PI * s.t)));
    };
    polygon(ctx, outline((s) => lip(s, -1), (s) => lip(s, 1)), 'rgba(104,177,157,.33)');

    const beach = outline((s) => land(s, 0), (s) => land(s, 1));
    const dry = outline((s) => land(s, .06), (s) => land(s, .94));
    const sand = ctx.createLinearGradient(0, beach[0]![1], 0, beach[Math.floor(sections.length / 2)]![1]);
    sand.addColorStop(0, '#cebb8b');
    sand.addColorStop(1, '#ecdcaa');
    polygon(ctx, beach, '#a69570');
    polygon(ctx, dry, sand);
    const verge = (s: Section, side: -1 | 1) => {
      const width = .22 + .057 * Math.cos(s.t * 13 + side * 2 + phase) + .14 * (2 * s.t - 1) ** 4;
      return land(s, side < 0 ? width : 1 - width);
    };
    const green = ctx.createLinearGradient(0, beach[0]![1], 0, beach[Math.floor(sections.length / 2)]![1]);
    green.addColorStop(0, woods > .65 ? '#526437' : '#819054');
    green.addColorStop(.6, woods > .65 ? '#617243' : '#a3a562');
    green.addColorStop(1, '#77854b');
    polygon(ctx, outline((s) => verge(s, -1), (s) => verge(s, 1)), green);

    ctx.save();
    ctx.lineWidth = .75;
    ctx.strokeStyle = 'rgba(225,244,216,.47)';
    for (let j = 0; j < sections.length - 2; j += 5) {
      const side = j % 2;
      const [x, y] = land(sections[j]!, side);
      const [endX, endY] = land(sections[j + 2]!, side);
      const shift = side ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x + shift, y + .55);
      ctx.lineTo(endX + shift, endY + .55);
      ctx.stroke();
    }
    ctx.restore();

    for (const detail of details) {
      if (detail.tile >= 0) continue;
      const [x, y] = land(detail.section, detail.across);
      const scale = project(1, depthAt(detail.section.z))[0] - project(0, depthAt(detail.section.z))[0];
      ctx.fillStyle = detail.tone > .54 ? 'rgba(252,230,168,.29)' : 'rgba(58,56,25,.23)';
      ctx.beginPath();
      ctx.ellipse(x, y, detail.size * scale, (.35 + detail.tone * .58) * scale, -.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const detail of details) {
      if (detail.tile < 0) continue;
      const [x, y] = land(detail.section, detail.across);
      const scale = project(1, depthAt(detail.section.z))[0] - project(0, depthAt(detail.section.z))[0];
      drawTerrainSprite(ctx, detail.tile, x, y, detail.size * scale, detail.tone > .5);
    }
  }
}
