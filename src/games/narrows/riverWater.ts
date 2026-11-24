import { drawCanvasWakes, type BoatWake } from './boatWake';
import { drawThreeRiver } from './riverSurface';
import { islandBanks, islandsBetween, riverAt } from './river';
import type { RiverRow } from './riverbankView';

type Point = [number, number];
type Project = (x: number, depth: number) => Point;

function scatter(n: number, salt: number) {
  const hash = Math.imul(n ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 2 ** 32;
}

function ribbon(ctx: CanvasRenderingContext2D, a: Point[], b: Point[]) {
  ctx.beginPath();
  ctx.moveTo(...a[0]!);
  for (const point of a.slice(1)) ctx.lineTo(...point);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(...b[i]!);
  ctx.closePath();
}

export function drawRiverWater(ctx: CanvasRenderingContext2D, distance: number, range: number,
  time: number, project: Project, rows: RiverRow[], wakes: readonly BoatWake[] = [],
  boardWidth?: number, boardHeight?: number) {
  if (drawThreeRiver(ctx, distance, range, time, project, rows, wakes, boardWidth, boardHeight)) return;
  const point = (x: number, z: number) => project(x, (z - distance) / range);
  const left = rows.map(({ river, depth }) => project(river.center - river.half, depth));
  const right = rows.map(({ river, depth }) => project(river.center + river.half, depth));
  const bottom = left[left.length - 1]![1];
  const top = left[0]![1];
  const water = ctx.createLinearGradient(0, top, 0, bottom);
  water.addColorStop(0, '#527f80');
  water.addColorStop(.36, '#317478');
  water.addColorStop(1, '#155859');

  ctx.save();
  ribbon(ctx, left, right);
  ctx.clip();
  ctx.fillStyle = water;
  ctx.fillRect(-20, top - 1, ctx.canvas.width + 40, bottom - top + 2);

  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? left : right;
    // Increasingly warm color near the sandy bottom, with widths that vary around bends.
    for (let band = 12; band > 0; band--) {
      const fraction = band / 12;
      const inside = rows.map(({ river, depth, z }) => {
        const width = Math.min(river.half * .53, 36 + 13 * Math.sin(z / 87 + side) + 9 * Math.sin(z / 51));
        return project(river.center + side * (river.half - width * fraction), depth);
      });
      ribbon(ctx, edge, inside);
      ctx.fillStyle = 'rgba(141,183,140,.052)';
      ctx.fill();
    }
  }

  const islands = islandsBetween(distance - range * .27, distance + range * 1.14);
  for (const island of islands) {
    for (const margin of [17, 10, 5]) {
      const a: Point[] = [];
      const b: Point[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const z = island.start + (island.end - island.start) * t;
        const banks = islandBanks(island, z);
        const extension = Math.cos(t * Math.PI) * margin;
        if (z - extension < distance - range * .29) continue;
        a.push(point(banks.left - margin * Math.sin(t * Math.PI), z - extension));
        b.push(point(banks.right + margin * Math.sin(t * Math.PI), z - extension));
      }
      if (a.length < 2) continue;
      ribbon(ctx, a, b);
      ctx.fillStyle = 'rgba(156,197,152,.13)';
      ctx.fill();
    }
  }

  const streamX = (z: number, across: number) => {
    const river = riverAt(z);
    const x = river.center + river.half * across;
    const island = islands.find(({ start, end }) => z >= start - 38 && z <= end + 78);
    if (!island) return x;
    const banks = islandBanks(island, z);
    const mid = (banks.left + banks.right) / 2;
    const fade = Math.min(1, (z - island.start + 38) / 38, (island.end + 78 - z) / 78);
    const edge = x < mid ? banks.left - 5 : banks.right + 5;
    const influence = Math.max(0, 1 - Math.abs(x - mid) / ((banks.right - banks.left) / 2 + 52));
    return x + (edge - x) * influence * fade;
  };

  // Soft patches of reflected sky drift beneath the sharper surface highlights.
  const reflectionDrift = time * 43;
  const firstReflection = Math.floor((distance - range * .23 + reflectionDrift) / 113);
  for (let cell = firstReflection; cell * 113 < distance + range * 1.12 + reflectionDrift; cell++) {
    for (const salt of [142, 177]) {
      const z = (cell + scatter(cell, salt)) * 113 - reflectionDrift;
      const across = (scatter(cell, salt + 1) - .5) * 1.75;
      const x = streamX(z, across);
      const [px, py] = point(x, z);
      const radiusX = point(x + 36 + 49 * scatter(cell, salt + 2), z)[0] - px;
      const radiusY = py - point(x, z + 25 + 50 * scatter(cell, salt + 3))[1];
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(radiusX, radiusY);
      const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      reflection.addColorStop(0, salt === 142 ? 'rgba(156,219,202,.22)' : 'rgba(9,49,60,.26)');
      reflection.addColorStop(1, 'rgba(93,157,149,0)');
      ctx.fillStyle = reflection;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  ctx.lineCap = 'round';
  // Short cross-current crests and longer, irregular threads travel downstream at different speeds.
  for (let lane = 0; lane < 14; lane++) {
    const across = (lane + .5) / 7 - 1;
    const speed = 17 + 53 * (1 - Math.abs(across) ** 2);
    const drift = time * speed;
    const spacing = 33;
    const first = Math.floor((distance - range * .20 + drift) / spacing);
    const last = Math.ceil((distance + range * 1.06 + drift) / spacing);
    for (let cell = first; cell < last; cell++) {
      const seed = cell * 17 + lane;
      const z = cell * spacing + scatter(seed, 17) * spacing - drift;
      const depth = (z - distance) / range;
      const variation = scatter(seed, 63);
      const band = across + (scatter(seed, 104) - .5) * .15 + .016 * Math.sin(z / 72 + lane);
      const x = streamX(z, band);
      const width = 3 + 19 * scatter(seed, 43) ** 2;
      const length = (scatter(seed, 81) - .38) * (variation > .86 ? 58 : 22);
      const [ax, ay] = point(x - width, z - length / 2);
      const [bx, by] = point(x + width, z + length / 2);
      const bend = 2.5 * Math.sin(time * 1.7 + variation * 17);
      const shimmer = .65 + .35 * Math.sin(time * 2.2 + variation * 29);
      const narrow = riverAt(z).half < 153;
      const foam = narrow && variation > .94;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2 - width * .13, (ay + by) / 2 + bend, bx, by);
      ctx.lineWidth = (foam ? 2.2 : .65 + variation) / (1 + .8 * Math.max(0, depth));
      const alpha = (foam ? .52 : .10 + variation * .33) * shimmer;
      ctx.strokeStyle = variation < .40 ? `rgba(8,49,54,${alpha})` : `rgba(189,231,211,${alpha})`;
      ctx.stroke();
    }
  }

  // A small loop of divided current at the downstream tip of each island.
  for (const island of islands) {
    if (island.start < distance - range * .11 || island.start > distance + range) continue;
    const banks = islandBanks(island, island.start);
    const x = (banks.left + banks.right) / 2;
    for (const side of [-1, 1] as const) {
      const pulse = (time * .74 + (side > 0 ? .40 : 0)) % 1;
      const z = island.start - 7 - pulse * 58;
      const spread = 6 + pulse * 14;
      ctx.beginPath();
      ctx.moveTo(...point(x + side * spread, z + 9));
      ctx.quadraticCurveTo(...point(x + side * (spread + 8), z - 16), ...point(x + side * 2, z - 19));
      ctx.strokeStyle = `rgba(211,239,221,${.46 * Math.sin(pulse * Math.PI)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
  drawCanvasWakes(ctx, wakes);
  ctx.restore();
}
