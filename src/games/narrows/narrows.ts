/**
 * The Narrows: a canyon run. The plane holds a line between two rock walls, the
 * fuel gauge never stops falling, and every bridge ahead has to be shot open
 * before you reach it.
 *
 * Everything lives in world units along the canyon. z is distance flown, x is
 * across the river, and the picture is a tilted perspective projection of that
 * world onto a 720 x 1080 board.
 */

import { BRIDGE_SPACING, CRUISE, FIRST_BRIDGE_Z, MAX_THROTTLE, RUN_SECONDS, closestLaneX, flightLanesAt, riverAt } from './river';
import { boatWake, type BoatWake } from './boatWake';
import { drawRiverWater } from './riverWater';
import { drawIslands } from './islandView';
import type { CannonSprites, EnemySprites, VehicleSprite } from './boatView';
import { drawRiverbanks, type RiverRow } from './riverbankView';

export { riverAt };

export type Phase = 'ready' | 'flying' | 'crashed' | 'over';

export type Controls = {
  left: boolean;
  right: boolean;
  fast: boolean;
  slow: boolean;
  fire: boolean;
};

export type Entity = {
  kind: 'tank' | 'bridge' | 'heli' | 'boat' | 'cannon';
  x: number;
  z: number;
  hp: number;
  vx: number;
  vz: number;
  wobble: number;
  alive: boolean;
  fire?: number;
  burstLeft?: number;
  flash?: number;
  cannonHeading?: { x: number; z: number };
  smoke?: number;
  side?: number;
};

export type Bullet = { x: number; z: number; vx: number; vz: number; from: 'player' | 'enemy'; height?: number; age?: number };

export type Burst = { x: number; z: number; age: number; size: number };

const W = 720;
const H = 1080;
const PLAYER_Y = H * 0.84;
const DEPTH = 1500;
const HORIZON = H * 0.1;

export const BOARD = { w: W, h: H };
export const BOAT_SPRITE_SIZE = 80;
const HELICOPTER_DISPLAY_SCALE = 1.4;
const PATROL_SHOT_SPEED = 520;
const HELICOPTER_SHOT_SPEED = 610;
const CANNON_SHOT_SPEED = 360;
const CANNON_BARREL_REACH = 92;
const CANNON_BARREL_HEIGHT = 29;

const depthOf = (z: number, playerZ: number) => (z - playerZ) / DEPTH;
const scaleAt = (depth: number) => 1 / (1 + .95 * depth);
const screenY = (depth: number, height = 0) =>
  PLAYER_Y - ((PLAYER_Y - HORIZON) * 1.95 * depth + height) * scaleAt(depth);
const screenX = (x: number, centerAtPlayer: number, depth: number) =>
  W / 2 + (x - centerAtPlayer) * scaleAt(depth);

type Point = [number, number];

function drawRiver(ctx: CanvasRenderingContext2D, distance: number, center: number, time: number,
  wakes: readonly BoatWake[]) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 70);
  sky.addColorStop(0, '#748e90');
  sky.addColorStop(1, '#bdc9a5');
  ctx.fillStyle = sky;
  ctx.fillRect(-12, -12, W + 24, H + 24);

  const rows: RiverRow[] = Array.from({ length: 107 }, (_, i) => {
    const depth = 1 - i * .011;
    const z = distance + depth * DEPTH;
    return { z, depth, river: riverAt(z) };
  });
  const project = (x: number, depth: number, height?: number): Point => [screenX(x, center, depth), screenY(depth, height)];
  drawRiverWater(ctx, distance, DEPTH, time, project, rows, wakes);
  drawRiverbanks(ctx, distance, DEPTH, W, project, rows, time);
  drawIslands(ctx, distance, DEPTH, project);
}

export class Narrows {
  phase: Phase = 'ready';
  lives = 3;
  fuel = 100;
  score = 0;
  bridges = 0;
  z = 0;
  x = 360;
  speed = 1;
  bank = 0;
  runTime = 0;
  best = 0;
  fireCooldown = 0;
  private spawnZ = 900;
  private patrolZ = 1_250 + Math.random() * 700;
  private bridgeZ = FIRST_BRIDGE_Z;
  private cannonZ = 4_200;
  private heliTimer = 6;
  private invuln = 0;
  private crashTimer = 0;
  explosion = { age: -1, x: 0, z: 0 };
  private shake = 0;
  entities: Entity[] = [];
  bullets: Bullet[] = [];
  shotEvents: Array<{ who: 'player' | 'cannon' | 'heli' | 'patrol'; x: number; z: number }> = [];
  killEvents: Array<{ kind: 'bridge' | 'craft'; x: number; z: number }> = [];
  bursts: Burst[] = [];
  booms: Array<{ x: number; z: number; age: number; size: number }> = [];

  reset() {
    this.phase = 'flying';
    this.lives = 3;
    this.fuel = 100;
    this.score = 0;
    this.bridges = 0;
    this.z = 0;
    this.x = 360;
    this.speed = 1;
    this.bank = 0;
    this.runTime = 0;
    this.fireCooldown = 0;
    this.spawnZ = 900;
    this.patrolZ = 1_250 + Math.random() * 700;
    this.bridgeZ = FIRST_BRIDGE_Z;
    this.cannonZ = 4_200;
    this.heliTimer = 6;
    this.invuln = 1.2;
    this.crashTimer = 0;
    this.explosion = { age: -1, x: 0, z: 0 };
    this.shake = 0;
    this.entities = [];
    this.bullets = [];
    this.shotEvents = [];
    this.killEvents = [];
    this.bursts = [];
    this.booms = [];
  }

  private spawn(kind: Entity['kind'], ahead: number) {
    const z = this.z + ahead;
    const { center, half } = riverAt(z);
    if (kind === 'tank') {
      this.entities.push({
        kind, z, x: this.waterSpawnX(z, .9), hp: 1, vx: 0, vz: 0, wobble: Math.random() * 6, alive: true,
      });
      return;
    }
    if (kind === 'bridge') {
      this.entities.push({ kind, z, x: center, hp: 3, vx: 0, vz: 0, wobble: 0, alive: true });
      return;
    }
    if (kind === 'cannon') {
      const side = Math.random() > .5 ? 1 : -1;
      this.entities.push({
        kind, z, x: center + side * (half + 58), hp: 2, vx: 0, vz: 0,
        wobble: 0, alive: true, fire: 1 + Math.random(), flash: 0, smoke: 0, side,
      });
      return;
    }
    if (kind === 'heli') {
      const fromLeft = Math.random() > 0.5;
      this.entities.push({
        kind,
        z,
        x: fromLeft ? center - half + 8 : center + half - 8,
        hp: 1,
        vx: (fromLeft ? 1 : -1) * (120 + Math.random() * 80),
        vz: 0,
        wobble: Math.random() * 6,
        alive: true,
        fire: .55 + Math.random() * .65,
      });
      return;
    }
    this.entities.push({
      kind: 'boat', z, x: this.waterSpawnX(z, .88), hp: 1, vx: 0, vz: -(45 + Math.random() * 45),
      wobble: Math.random() * 6, alive: true, fire: .50 + Math.random() * .65, flash: 0,
    });
  }

  private waterSpawnX(z: number, spread: number) {
    const lanes = flightLanesAt(z, 14);
    if (lanes.length === 1) {
      const { center, half } = riverAt(z);
      return center + (Math.random() - .5) * half * spread;
    }
    const lane = lanes[Math.floor(Math.random() * lanes.length)]!;
    return (lane.left + lane.right) / 2 + (Math.random() - .5) * (lane.right - lane.left) * spread;
  }

  private updatePatrol(boat: Entity, dt: number) {
    boat.z += boat.vz * dt;
    boat.x = closestLaneX(boat.z, boat.x + Math.sin(boat.wobble * .9) * 26 * dt);
    boat.flash = Math.max(0, (boat.flash ?? 0) - dt);
    const ahead = boat.z - this.z;
    if (ahead < 100 || ahead > 1_250) return;
    boat.fire = (boat.fire ?? 1) - dt;
    if (boat.fire > 0) return;

    boat.fire = 1.15 + Math.random() * .9;
    boat.flash = .13;
    this.fireAtPlayer(boat.x, boat.z - 24, PATROL_SHOT_SPEED, 'patrol');
  }

  private updateHelicopter(heli: Entity, dt: number) {
    heli.x += heli.vx * dt;
    heli.flash = Math.max(0, (heli.flash ?? 0) - dt);
    const ahead = heli.z - this.z;
    const river = riverAt(heli.z);
    if (ahead < 115 || ahead > 1_200 || Math.abs(heli.x - river.center) > river.half + 28) return;
    heli.fire = (heli.fire ?? .6) - dt;
    if (heli.fire > 0) return;

    const remaining = (heli.burstLeft ?? 3) - 1;
    heli.burstLeft = remaining > 0 ? remaining : 3;
    heli.fire = remaining > 0 ? .15 : 1.55;
    heli.flash = .08;
    this.fireAtPlayer(heli.x + Math.sign(heli.vx) * 22, heli.z - 10, HELICOPTER_SHOT_SPEED, 'heli');
  }

  private fireAtPlayer(x: number, z: number, speed: number, who: 'heli' | 'patrol') {
    const crossingTime = (z - this.z) / (speed + CRUISE * this.speed);
    this.bullets.push({ x, z, vx: (this.x - x) / crossingTime, vz: -speed, from: 'enemy' });
    this.shotEvents.push({ who, x, z });
  }

  /** Points earned, awarded the moment a run ends. */
  finish() {
    this.phase = 'over';
    this.best = Math.max(this.best, Math.round(this.score));
  }

  private crash(reason: 'bank' | 'hit' | 'fuel') {
    if (this.invuln > 0 || this.phase !== 'flying') return;
    this.lives -= 1;
    this.shake = 1;
    this.bursts.push({ x: this.x, z: this.z, age: 0, size: reason === 'fuel' ? 66 : 52 });
    this.phase = 'crashed';
    this.crashTimer = 1.1;
    if (this.lives <= 0) {
      this.explosion = { age: 0, x: this.x, z: this.z };
      this.finish();
    }
  }

  update(dt: number, keys: Controls) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.explosion.age >= 0 && this.explosion.age < 1.6) this.explosion.age += dt;
    for (const burst of this.bursts) burst.age += dt;
    for (const boom of this.booms) boom.age += dt;
    this.booms = this.booms.filter((boom) => boom.age < 1.6);

    if (this.phase === 'crashed') {
      this.crashTimer -= dt;
      if (this.crashTimer <= 0 && this.lives > 0) {
        this.phase = 'flying';
        this.speed = 1;
        this.fuel = Math.max(this.fuel, 42);
        this.invuln = 1.6;
        const { center } = riverAt(this.z);
        this.x = closestLaneX(this.z, center);
      }
      return;
    }
    if (this.phase !== 'flying') return;

    this.runTime += dt;
    if (this.runTime >= RUN_SECONDS) this.finish();

    // throttle and stick
    if (keys.fast) this.speed = Math.min(MAX_THROTTLE, this.speed + dt * 0.9);
    else if (keys.slow) this.speed = Math.max(0.55, this.speed - dt * 0.9);
    else this.speed += (1 - this.speed) * dt * 1.4;

    const dz = CRUISE * this.speed * dt;
    this.z += dz;

    const steer = 300 * (0.55 + this.speed * 0.45) * dt;
    if (keys.left) this.x -= steer;
    if (keys.right) this.x += steer;
    const wantBank = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    this.bank += (wantBank - this.bank) * Math.min(1, dt * 7);

    const legalX = closestLaneX(this.z, this.x);
    if (this.x !== legalX) {
      this.x = legalX;
      if (this.invuln <= 0) this.crash('bank');
    }

    // fuel: it falls with time, faster the harder you push
    this.fuel -= 2 * (1.05 + this.speed * 0.55) * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.crash('fuel');
    }
    this.invuln = Math.max(0, this.invuln - dt);

    // firing
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (keys.fire && this.fireCooldown <= 0) {
      this.fireCooldown = 0.13;
      this.bullets.push({ x: this.x, z: this.z + 30, vx: 0, vz: 1200, from: 'player' });
      this.shotEvents.push({ who: 'player', x: this.x, z: this.z });
    }

    for (const bullet of this.bullets) {
      bullet.z += bullet.vz * dt;
      bullet.x += bullet.vx * dt;
      if (bullet.age !== undefined) bullet.age += dt;
    }
    this.bullets = this.bullets.filter((b) => Math.abs(b.z - this.z) < 1900);

    // spawning: tanks to feed you, enemies to spend the fuel on
    if (this.z + DEPTH > this.spawnZ) {
      const roll = Math.random();
      if (roll < .55) this.spawn('tank', this.spawnZ - this.z);
      else if (roll < .775) this.spawn('heli', this.spawnZ - this.z);
      this.spawnZ += 780 + Math.random() * 520;
    }
    if (this.z + DEPTH > this.patrolZ) {
      this.spawn('boat', DEPTH);
      this.patrolZ = this.z + DEPTH + 1_550 + Math.random() * 1_850;
    }
    if (this.z + DEPTH > this.bridgeZ) {
      this.spawn('bridge', this.bridgeZ - this.z);
      this.bridgeZ += BRIDGE_SPACING;
    }
    if (this.z + DEPTH > this.cannonZ) {
      this.spawn('cannon', this.cannonZ - this.z);
      this.cannonZ += 1_000 + Math.random() * 900;
    }
    this.heliTimer -= dt;
    if (this.heliTimer <= 0) {
      this.heliTimer = 5.5 + Math.random() * 5;
      this.spawn('heli', 1400);
    }

    // entity behaviour
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.wobble += dt;
      if (e.kind === 'heli') this.updateHelicopter(e, dt);
      if (e.kind === 'boat') this.updatePatrol(e, dt);

      if (e.kind === 'cannon') {
        e.flash = Math.max(0, (e.flash ?? 0) - dt);
        e.smoke = Math.max(0, (e.smoke ?? 0) - dt);
        if (e.smoke === 0) e.cannonHeading = undefined;
        const ahead = e.z - this.z;
        if (ahead < 1_500 && ahead > -60) {
          e.fire = (e.fire ?? 2) - dt;
          if (e.fire <= 0) {
            e.fire = 2;
            const gun = this.cannonGun(e);
            e.cannonHeading = gun.heading;
            e.flash = .22;
            e.smoke = .75;
            this.bullets.push({
              x: gun.x, z: gun.z, height: gun.height, age: 0,
              vx: gun.heading.x * CANNON_SHOT_SPEED, vz: gun.heading.z * CANNON_SHOT_SPEED,
              from: 'enemy',
            });
            this.shotEvents.push({ who: 'cannon', x: gun.x, z: gun.z });
          }
        }
      }

      if (Math.abs(e.z - this.z) < 34 && Math.abs(e.x - this.x) < 30 && this.invuln <= 0) {
        if (e.kind === 'tank') {
          e.alive = false;
          this.fuel = Math.min(100, this.fuel + 30);
          this.score += 25;
          this.bursts.push({ x: e.x, z: e.z, age: 0, size: 26 });
        } else if (e.kind === 'bridge') {
          this.crash('hit');
        } else {
          e.alive = false;
          this.bursts.push({ x: e.x, z: e.z, age: 0, size: 44 });
          this.crash('hit');
        }
      }
    }

    for (const bullet of this.bullets) {
      if (bullet.from !== 'player') continue;
      for (const e of this.entities) {
        if (!e.alive || e.kind === 'tank') continue;
        if (Math.abs(e.z - bullet.z) < 40 && Math.abs(e.x - bullet.x) < 34) {
          bullet.z = -99999;
          e.hp -= 1;
          if (e.hp <= 0) {
            e.alive = false;
            this.bursts.push({ x: e.x, z: e.z, age: 0, size: e.kind === 'bridge' ? 80 : 40 });
            if (e.kind === 'bridge') {
              this.bridges += 1;
              this.score += 250;
              this.killEvents.push({ kind: 'bridge', x: e.x, z: e.z });
              this.booms.push({ x: e.x, z: e.z, age: 0, size: 1.9 });
            } else {
              if (e.kind === 'cannon') this.score += 150;
              else this.score += 100;
              this.killEvents.push({ kind: 'craft', x: e.x, z: e.z });
              this.booms.push({ x: e.x, z: e.z, age: 0, size: 1 });
            }
          }
        }
      }
    }

    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      if (Math.abs(bullet.z - this.z) < 30 && Math.abs(bullet.x - this.x) < 28 && this.invuln <= 0) {
        bullet.z = -99999;
        this.bursts.push({ x: this.x, z: this.z, age: 0, size: 40 });
        this.crash('hit');
      }
    }

    this.entities = this.entities.filter((e) => e.alive && e.z > this.z - 300);
    this.bullets = this.bullets.filter((b) => b.z > -1000 && b.z < this.z + 2200);

    this.score += dz * 0.012;
  }

  /** Shared by the barrel sprite, muzzle effects, and spawned shell. */
  cannonGun(e: Entity) {
    const dx = this.x - e.x;
    const flight = Math.max(.4, (e.z - this.z) / CANNON_SHOT_SPEED);
    const dz = this.z + CRUISE * this.speed * flight - e.z;
    const length = Math.hypot(dx, dz);
    const heading = e.cannonHeading ?? (length > 0 ? { x: dx / length, z: dz / length } : { x: -(e.side ?? 1), z: 0 });
    return {
      x: e.x + heading.x * CANNON_BARREL_REACH,
      z: e.z + heading.z * CANNON_BARREL_REACH,
      height: CANNON_BARREL_HEIGHT,
      heading,
    };
  }

  /** Screen position of the boat, for the 3d model drawn over the canyon. */
  playerScreen() {
    const here = riverAt(this.z);
    return { x: screenX(this.x, here.center, 0), y: PLAYER_Y };
  }

  /** Draws the whole machine: canyon, river, boat wash, gauges. */
  draw(ctx: CanvasRenderingContext2D, enemies?: EnemySprites, time = this.runTime) {
    const here = riverAt(this.z);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate(Math.sin(this.shake * 61) * 6 * this.shake, Math.cos(this.shake * 47) * 5 * this.shake);
    }

    const wakes: BoatWake[] = [];
    if (this.phase === 'flying') {
      wakes.push(boatWake(screenX(this.x, here.center, 0), PLAYER_Y, 1, 1, this.speed, time, this.bank * .18));
    }
    for (const enemy of this.entities) {
      if (enemy.kind !== 'boat' || !enemy.alive || enemy.vz === 0) continue;
      const depth = depthOf(enemy.z, this.z);
      if (depth < -.06 || depth > 1.02) continue;
      wakes.push(boatWake(screenX(enemy.x, here.center, depth), screenY(depth), scaleAt(depth),
        Math.sign(enemy.vz), Math.abs(enemy.vz) / 80, time + enemy.wobble * .23));
    }
    drawRiver(ctx, this.z, here.center, time, wakes);

    // entities, far ones first
    const sorted = [...this.entities].sort((a, b) => b.z - a.z);
    for (const e of sorted) {
      const d = depthOf(e.z, this.z);
      if (d < -0.06 || d > 1.02) continue;
      const y = screenY(d);
      const x = screenX(e.x, here.center, d);
      const s = scaleAt(d);
      if (e.kind === 'tank') this.drawTank(ctx, x, y, s);
      else if (e.kind === 'heli') {
        const facing = e.vx < 0 ? 0 : 1;
        const shadow = enemies?.helicopterShadow?.[facing];
        const scale = s * HELICOPTER_DISPLAY_SCALE;
        if (shadow) {
          const size = 128 * scale;
          ctx.save();
          ctx.globalAlpha = .34;
          ctx.drawImage(shadow.canvas, x + 26 * scale - size / 2, y + 40 * scale - size / 2, size, size);
          ctx.restore();
        }
        const frames = enemies?.helicopter?.[facing];
        const sprite = frames && frames[Math.floor(e.wobble * 25) % frames.length];
        if (sprite) this.drawVehicle(ctx, sprite, e, x, y, scale);
        else this.drawHeli(ctx, x, y, scale, e.wobble);
      }
      else if (e.kind === 'cannon') this.drawCannon(ctx, e, enemies?.cannon, here.center, x, d, enemies?.cannonShadow);
      else if (e.kind === 'bridge') this.drawBridge(ctx, e, x, y, s, d, enemies?.bridge ?? null);
      else if (enemies?.patrol) this.drawVehicle(ctx, enemies.patrol, e, x, y, s);
      else this.drawBoat(ctx, x, y, s);
    }

    for (const bullet of this.bullets) {
      const d = depthOf(bullet.z, this.z);
      if (d < -0.04 || d > 1.02) continue;
      const y = screenY(d, bullet.height);
      const x = screenX(bullet.x, here.center, d);
      if (bullet.from === 'player') {
        ctx.fillStyle = '#ffe9a3';
        ctx.fillRect(x - 1.5, y - 8, 3, 12);
      } else {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 150, 80, .45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (bullet.age === undefined) {
          ctx.lineTo(x - bullet.vx * .03, y - bullet.vz * .03);
        } else {
          const trailTime = Math.min(.03, bullet.age);
          const trailDepth = depthOf(bullet.z - bullet.vz * trailTime, this.z);
          ctx.lineTo(screenX(bullet.x - bullet.vx * trailTime, here.center, trailDepth), screenY(trailDepth, bullet.height));
        }
        ctx.stroke();
        ctx.shadowColor = '#ff8a3d';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffd9a8';
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff4d8';
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    this.drawProtectionRing(ctx, here);
    this.drawBursts(ctx, here);
    this.drawBooms(ctx, here);
    this.drawExplosion(ctx, here);
    if (this.explosion.age >= 0 && this.explosion.age < .16) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 244, 214, ${.35 * (1 - this.explosion.age / .16)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // gauges
    this.drawGauges(ctx);
    ctx.restore();
  }

  /** Fireballs where a bridge, chopper, patrol or cannon came apart. */
  private drawBooms(ctx: CanvasRenderingContext2D, here: { center: number }) {
    for (const boom of this.booms) {
      const depth = depthOf(boom.z, this.z);
      if (depth < -0.05 || depth > 1.02) continue;
      const t = Math.min(1, boom.age / 1.4);
      const ease = 1 - (1 - t) ** 3;
      const scale = scaleAt(depth) * boom.size;
      const x = screenX(boom.x, here.center, depth);
      const y = screenY(depth);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const radius = (24 + ease * 120) * scale;
      const heat = Math.max(0, 1 - t * .9);
      const fire = ctx.createRadialGradient(x, y, 0, x, y, radius);
      fire.addColorStop(0, `rgba(255, 255, 240, ${heat})`);
      fire.addColorStop(.4, `rgba(255, 176, 66, ${.9 * heat})`);
      fire.addColorStop(.75, `rgba(255, 86, 28, ${.55 * heat})`);
      fire.addColorStop(1, 'rgba(110, 30, 10, 0)');
      ctx.fillStyle = fire;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 224, 170, ${.5 * (1 - t)})`;
      ctx.lineWidth = 1 + 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(x, y, (18 + ease * 170) * scale, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 12; i += 1) {
        const angle = i * 2.399 + boom.x * .01;
        const reach = (20 + ease * (110 + 70 * Math.abs(Math.sin(i * 5.1)))) * scale;
        ctx.fillStyle = `rgba(255, ${170 + Math.round(50 * Math.sin(i))}, 96, ${.85 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * .8, 2 * (1 - t) + .8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      for (let i = 0; i < 7; i += 1) {
        ctx.fillStyle = `rgba(44, 42, 38, ${.3 * (1 - t) * (1 - i / 11)})`;
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(i * 1.7 + t * 2) * 20 * scale, y - ease * (30 + i * 8) * scale,
          12 * scale + ease * 22 * scale, 9 * scale + ease * 16 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, here: { center: number }) {
    const life = this.explosion.age;
    if (life < 0 || life > 1.6) return;
    const t = Math.min(1, life / 1.6);
    const ease = 1 - (1 - t) ** 3;
    const x = screenX(this.explosion.x, here.center, 0);
    const y = PLAYER_Y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // the fireball, hottest in the first quarter second
    const radius = 58 + ease * 240;
    const heat = Math.max(0, 1 - t * .85);
    const fire = ctx.createRadialGradient(x, y, 0, x, y, radius);
    fire.addColorStop(0, `rgba(255, 255, 236, ${.95 * heat})`);
    fire.addColorStop(.35, `rgba(255, 196, 92, ${.8 * heat})`);
    fire.addColorStop(.72, `rgba(255, 96, 34, ${.42 * heat})`);
    fire.addColorStop(1, 'rgba(120, 32, 12, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // the white core, gone in a blink
    const core = Math.max(0, 1 - t * 2.4);
    if (core > 0) {
      ctx.fillStyle = `rgba(255, 255, 246, ${.95 * core})`;
      ctx.beginPath();
      ctx.arc(x, y, 26 + ease * 70, 0, Math.PI * 2);
      ctx.fill();
    }

    // shock ring running out over the water
    ctx.strokeStyle = `rgba(255, 226, 176, ${.55 * (1 - t)})`;
    ctx.lineWidth = 1 + 4 * (1 - t);
    ctx.beginPath();
    ctx.arc(x, y, 40 + ease * 250, 0, Math.PI * 2);
    ctx.stroke();

    // debris thrown out on straight lines
    for (let i = 0; i < 18; i += 1) {
      const angle = i * 2.399 + Math.sin(i * 12.98) * .4;
      const reach = (26 + ease * (120 + 90 * Math.abs(Math.sin(i * 7.7)))) * (1 - t * .25);
      const px = x + Math.cos(angle) * reach;
      const py = y + Math.sin(angle) * reach * .78 - ease * 26;
      ctx.fillStyle = `rgba(255, ${160 + Math.round(60 * Math.sin(i))}, 90, ${.9 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.6 * (1 - t) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // smoke hanging over the water after the flash
    ctx.save();
    for (let i = 0; i < 9; i += 1) {
      const rise = ease * (40 + i * 7);
      const drift = Math.sin(i * 2.1 + t * 3) * (18 + i * 4);
      const puff = 16 + ease * (34 + i * 5);
      ctx.fillStyle = `rgba(46, 44, 40, ${.34 * (1 - t) * (1 - i / 14)})`;
      ctx.beginPath();
      ctx.ellipse(x + drift, y - rise - i * 5, puff, puff * .72, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProtectionRing(ctx: CanvasRenderingContext2D, here: { center: number }) {
    if (this.invuln <= 0) return;
    const x = screenX(this.x, here.center, 0);
    ctx.save();
    ctx.strokeStyle = `rgba(120, 226, 255, ${.25 + .25 * Math.sin(this.invuln * 18)})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, PLAYER_Y + 3.9, 29.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 12;
    ctx.fillRect(-11, -13, 22, 26);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8a5a12';
    ctx.fillRect(-8, -9, 16, 18);
    ctx.fillStyle = '#ffe9a3';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F', 0, 4);
    ctx.restore();
  }

  private drawBridge(ctx: CanvasRenderingContext2D, e: Entity, x: number, y: number, s: number, d: number,
    sprite: { canvas: HTMLCanvasElement; aspect: number } | null) {
    const row = riverAt(e.z);
    const half = row.half * scaleAt(d);
    ctx.save();
    ctx.translate(x, y);

    // the deck spans a little wider than the water, so the ends sit on the banks
    const width = half * 2 * 1.32;
    const height = width * .34;

    if (sprite) {
      ctx.drawImage(sprite.canvas, -width / 2, -height * .72, width, height);
      // a soft shadow under the span
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = .28;
      ctx.drawImage(sprite.canvas, -width / 2, -height * .72 + height * .12, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // damage shows as scorch on the deck
      if (e.hp < 3) {
        ctx.fillStyle = `rgba(24, 18, 14, ${e.hp === 2 ? .18 : .34})`;
        ctx.fillRect(-width / 2, -height * .55, width, height * .5);
      }
    } else {
      ctx.fillStyle = e.hp > 1 ? '#b9c2cc' : '#7d6a52';
      ctx.fillRect(-half, -7 * s, half * 2, 8 * s);
      ctx.fillStyle = '#3c4753';
      ctx.fillRect(-half, 1 * s, half * 2, 4 * s);
    }

    ctx.restore();
  }

  private drawHeli(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, wobble: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#c74a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1d7d0';
    ctx.fillRect(-2, -12, 4, 24);
    ctx.save();
    ctx.rotate(wobble * 12);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-20, -1.5, 40, 3);
    ctx.restore();
    ctx.restore();
  }

  private drawCannon(ctx: CanvasRenderingContext2D, e: Entity, sprites: CannonSprites | null | undefined,
    center: number, x: number, depth: number, shadow?: VehicleSprite | null) {
    const gun = this.cannonGun(e);
    const y = screenY(depth, gun.height);
    const muzzleDepth = depthOf(gun.z, this.z);
    const mx = screenX(gun.x, center, muzzleDepth);
    const my = screenY(muzzleDepth, gun.height);
    const angle = Math.atan2(my - y, mx - x);
    const reach = Math.hypot(mx - x, my - y);
    const scale = scaleAt(depth);

    ctx.save();
    if (shadow) {
      const size = 168 * scale;
      ctx.save();
      ctx.globalAlpha = .42;
      ctx.translate(x + 8 * scale, screenY(depth) + 8 * scale);
      ctx.rotate(angle);
      ctx.scale(-(e.side ?? 1), 1);
      ctx.drawImage(shadow.canvas, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(8, 14, 16, .45)';
      ctx.beginPath();
      ctx.ellipse(x, screenY(depth) + 4 * scale, 43 * scale, 11 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sprites) {
      const { carriage, barrel } = sprites;
      const baseSize = 171 * scale;
      ctx.translate(x, y);
      ctx.scale(-(e.side ?? 1), 1);
      ctx.drawImage(carriage.canvas, -carriage.pivotX * baseSize, -carriage.pivotY * baseSize, baseSize, baseSize);
      ctx.restore();

      const barrelWidth = reach / (barrel.muzzleX - barrel.pivotX);
      const barrelHeight = 142 * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(1, mx < x ? -1 : 1);
      ctx.drawImage(barrel.canvas, -barrel.pivotX * barrelWidth, -barrel.pivotY * barrelHeight, barrelWidth, barrelHeight);
    } else {
      ctx.fillStyle = '#545a36';
      ctx.beginPath();
      ctx.roundRect(x - 26 * scale, y, 52 * scale, 21 * scale, 5 * scale);
      ctx.fill();
      ctx.strokeStyle = '#555956';
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(mx, my);
      ctx.stroke();
    }
    ctx.restore();

    const smoke = e.smoke ?? 0;
    if (smoke > 0) {
      ctx.save();
      ctx.globalAlpha = smoke * .5;
      for (let i = 0; i < 4; i += 1) {
        const t = (1 - smoke) * 1.6 + i * .18;
        ctx.fillStyle = '#9aa3a6';
        ctx.beginPath();
        ctx.arc(mx + Math.cos(angle) * t * 26, my + Math.sin(angle) * t * 26 - t * 18, 4 + t * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const flash = e.flash ?? 0;
    if (flash > 0) {
      const heat = Math.min(1, flash * 6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 34);
      glow.addColorStop(0, `rgba(255, 246, 214, ${.95 * heat})`);
      glow.addColorStop(.45, `rgba(255, 170, 70, ${.55 * heat})`);
      glow.addColorStop(1, 'rgba(255, 90, 30, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(mx, my, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 238, 190, ${.85 * Math.min(1, flash * 8)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(angle) * 26, my + Math.sin(angle) * 26);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawVehicle(ctx: CanvasRenderingContext2D, sprite: VehicleSprite, enemy: Entity, x: number, y: number, scale: number) {
    const size = BOAT_SPRITE_SIZE * scale;
    const left = x - size / 2;
    const top = y - size / 2;
    ctx.drawImage(sprite.canvas, left, top, size, size);
    if (!enemy.flash) return;
    const muzzleX = left + sprite.muzzleX * size;
    const muzzleY = top + sprite.muzzleY * size;
    const radius = 8 * scale;
    const glow = ctx.createRadialGradient(muzzleX, muzzleY, 0, muzzleX, muzzleY, radius);
    glow.addColorStop(0, '#fff2bd');
    glow.addColorStop(1, 'rgba(255, 100, 50, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(muzzleX - radius, muzzleY - radius, radius * 2, radius * 2);
  }

  private drawBoat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#8fb0a3';
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(14, -8);
    ctx.lineTo(9, 10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2c3b39';
    ctx.fillRect(-5, -12, 10, 6);
    ctx.restore();
  }

  private drawBursts(ctx: CanvasRenderingContext2D, here: { center: number }) {
    for (const burst of this.bursts) {
      if (burst.age > 0.9) continue;
      const d = depthOf(burst.z, this.z);
      const x = screenX(burst.x, here.center, Math.max(0, d));
      const y = screenY(Math.max(-.16, d));
      const r = burst.size * (0.3 + burst.age * 1.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - burst.age / 0.9);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawGauges(ctx: CanvasRenderingContext2D) {
    // score
    ctx.save();
    ctx.font = 'bold 30px ui-monospace, monospace';
    ctx.fillStyle = '#eef6f4';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.round(this.score)).padStart(5, '0'), 62, 186);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fd8c9';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillText(`${this.bridges} BRIDGES`, W - 62, 184);

    // lives
    for (let i = 0; i < this.lives; i += 1) {
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath();
      ctx.moveTo(68 + i * 26, 206);
      ctx.lineTo(78 + i * 26, 218);
      ctx.lineTo(58 + i * 26, 218);
      ctx.closePath();
      ctx.fill();
    }

    // fuel gauge along the bottom
    const top = H - 34;
    ctx.fillStyle = 'rgba(6,12,14,0.75)';
    ctx.fillRect(28, top, W - 56, 16);
    const fuelWidth = (W - 60) * (this.fuel / 100);
    const danger = this.fuel < 25;
    ctx.fillStyle = danger ? '#ff6a4d' : '#7fe0a0';
    ctx.fillRect(30, top + 2, fuelWidth, 12);
    ctx.strokeStyle = 'rgba(210,240,230,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28.5, top + 0.5, W - 57, 15);
    ctx.fillStyle = 'rgba(210,240,230,0.8)';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', 28, top - 8);
    ctx.restore();
  }
}
