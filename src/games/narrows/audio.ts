/**
 * Sound for Rescue Boat.
 *
 * Engines are loops pinned to where the craft is on the river, so a chopper
 * crossing from the left ends up on the left of the head and sweeps right as it
 * goes. Gunfire and cannon shots are one shots at the point they came from.
 * Everything runs through a PannerNode with the HRTF model, with the listener
 * sitting at the boat, facing upstream.
 */

const UNITS_PER_METRE = 40;
const ENGINE_GAIN = .5;
const PLAYER_ENGINE_GAIN = .28;

type EngineKind = 'chopper' | 'hostile';

type Engine = {
  kind: EngineKind;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode;
};

const FILES = {
  cannon: '/audio/cannon.mp3',
  chopper: '/audio/chopper.mp3',
  playerEngine: '/audio/player-engine.mp3',
  hostileEngine: '/audio/hostile-engine.mp3',
  enemyGun: '/audio/enemy-gun.mp3',
  playerGun: '/audio/player-gun.mp3',
  explosion: '/audio/explosion.mp3',
  craftExplosion: '/audio/craft-explosion.mp3',
  bridgeExplosion: '/audio/bridge-explosion.mp3',
} as const;

type Sound = keyof typeof FILES;

import { isGameMuted, onGameMute } from '@/lib/gameSound';

export class NarrowsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = isGameMuted();
  private buffers = new Map<Sound, AudioBuffer>();
  private engines = new Map<object, Engine>();
  private playerEngine: Engine | null = null;
  private loading: Promise<void> | null = null;
  private lastPlayerGun = 0;
  private lastEnemyGun = 0;

  init() {
    if (this.loading) return this.loading;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return Promise.resolve();
    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : .85;
    master.connect(ctx.destination);
    this.master = master;

    // the player is the listener, facing upstream
    ctx.listener.setPosition(0, 0, 0);
    ctx.listener.setOrientation(0, 0, -1, 0, 1, 0);

    this.loading = Promise.all(
      (Object.keys(FILES) as Sound[]).map((name) =>
        fetch(FILES[name])
          .then((response) => (response.ok ? response.arrayBuffer() : null))
          .then((data) => (data ? ctx.decodeAudioData(data) : null))
          .then((buffer) => {
            if (buffer) this.buffers.set(name, buffer);
          })
          .catch(() => undefined),
      ),
    ).then(() => undefined);
    return this.loading;
  }

  resume() {
    void this.ctx?.resume();
  }

  private panner(x: number, z: number) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.maxDistance = 90;
    panner.rolloffFactor = .75;
    panner.positionX.value = x / UNITS_PER_METRE;
    panner.positionY.value = 0;
    panner.positionZ.value = z / UNITS_PER_METRE;
    return panner;
  }

  private oneShot(name: Sound, dx: number, dz: number, gainValue: number, rate = 1) {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.buffers.get(name);
    if (!ctx || !master || !buffer) return;
    const panner = this.panner(dx, dz);
    if (!panner) return;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }

  /** the boat going up, right under the listener */
  explode() {
    if (!this.ctx) return;
    this.oneShot('explosion', 0, -1, 1.15, 1);
  }

  /** a chopper, patrol boat or cannon going up where it stood */
  craftBoom(dx: number, dz: number) {
    if (!this.ctx) return;
    this.oneShot('craftExplosion', dx, dz, .95, .95 + Math.random() * .1);
  }

  /** a bridge coming down */
  bridgeBoom(dx: number, dz: number) {
    if (!this.ctx) return;
    this.oneShot('bridgeExplosion', dx, dz, 1.1, 1);
  }

  /** who fired, in player relative units */
  shot(who: 'player' | 'cannon' | 'heli' | 'patrol', dx: number, dz: number) {
    if (!this.ctx) return;
    if (who === 'player') {
      const now = this.ctx.currentTime;
      if (now - this.lastPlayerGun < .07) return;
      this.lastPlayerGun = now;
      this.oneShot('playerGun', 0, -1, .5, .95 + Math.random() * .1);
      return;
    }
    if (who === 'cannon') {
      this.oneShot('cannon', dx, dz, .5, 1);
      return;
    }
    const now = this.ctx.currentTime;
    if (now - this.lastEnemyGun < .05) return;
    this.lastEnemyGun = now;
    this.oneShot('enemyGun', dx, dz, .85, .9 + Math.random() * .15);
  }

  private startEngine(name: Sound, kind: EngineKind, dx: number, dz: number, gainValue: number): Engine | null {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.buffers.get(name);
    if (!ctx || !master || !buffer) return null;
    const panner = this.panner(dx, dz);
    if (!panner) return null;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    source.start();
    return { kind, source, gain, panner };
  }

  private moveEngine(engine: Engine, dx: number, dz: number) {
    engine.panner.positionX.value = dx / UNITS_PER_METRE;
    engine.panner.positionZ.value = dz / UNITS_PER_METRE;
  }

  /**
   * Called every frame. Keeps one engine voice per craft, moves it with the
   * craft, and drops it when the craft is gone.
   */
  sync(
    entities: Array<{ kind: string; x: number; z: number; alive: boolean }>,
    playerX: number,
    playerZ: number,
    speed: number,
  ) {
    if (!this.ctx) return;
    this.resume();

    if (!this.playerEngine) {
      this.playerEngine = this.startEngine('playerEngine', 'hostile', 0, -1, PLAYER_ENGINE_GAIN);
    }
    if (this.playerEngine) {
      this.playerEngine.source.playbackRate.value = .85 + speed * .22;
      this.playerEngine.gain.gain.value = PLAYER_ENGINE_GAIN * (.55 + Math.min(1.4, speed) * .35);
    }

    const seen = new Set<object>();
    for (const entity of entities) {
      if (!entity.alive) continue;
      const kind: EngineKind | null = entity.kind === 'heli' ? 'chopper' : entity.kind === 'boat' ? 'hostile' : null;
      if (!kind) continue;
      seen.add(entity);
      const dx = entity.x - playerX;
      const dz = entity.z - playerZ;
      let engine = this.engines.get(entity);
      if (!engine) {
        const name: Sound = kind === 'chopper' ? 'chopper' : 'hostileEngine';
        engine = this.startEngine(name, kind, dx, dz, ENGINE_GAIN) ?? undefined;
        if (!engine) continue;
        this.engines.set(entity, engine);
      }
      this.moveEngine(engine, dx, dz);
      // the chopper is louder in the air, the patrol boat sits low on the water
      const base = kind === 'chopper' ? 1.25 : 1.05;
      const distance = Math.hypot(dx, dz);
      const near = Math.max(0, 1 - distance / 2_200);
      engine.gain.gain.value = base * (.35 + near * .65);
    }

    for (const [entity, engine] of this.engines) {
      if (seen.has(entity)) continue;
      this.stopEngine(engine);
      this.engines.delete(entity);
    }
  }

  private stopEngine(engine: Engine) {
    try {
      engine.source.stop();
    } catch {
      // already stopped
    }
    engine.source.disconnect();
    engine.gain.disconnect();
    engine.panner.disconnect();
  }

  silence() {
    for (const engine of this.engines.values()) this.stopEngine(engine);
    this.engines.clear();
    if (this.playerEngine) {
      this.stopEngine(this.playerEngine);
      this.playerEngine = null;
    }
  }

  /** The speaker by Stand up: the whole boat, not one gun. */
  setMuted(next: boolean) {
    this.muted = next;
    const master = this.master;
    if (master) master.gain.setTargetAtTime(next ? 0 : .85, master.context.currentTime, .04);
  }

  dispose() {
    this.silence();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
  }
}
