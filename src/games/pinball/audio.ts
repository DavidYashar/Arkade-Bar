/**
 * Pinball audio.
 *
 * Everything is synthesised with the Web Audio API: no files to load, nothing to
 * licence, and the character can be tuned in code. The intent is physical rather than
 * chiptune — noise transients for impacts, struck resonators for the bells.
 *
 * Browsers refuse to start audio until the player interacts, so nothing is created
 * until unlock() is called from a key press.
 */

/** A minor pentatonic, so any order the bells are hit in stays musical. */
const BELL_SCALE = [220.0, 261.63, 293.66, 329.63, 392.0];

import { isGameMuted, onGameMute } from '@/lib/gameSound';

export class PinballAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = isGameMuted();
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollSource: AudioBufferSourceNode | null = null;
  private rollLevel = 0;
  private lastImpactAt = 0;
  private ambient: HTMLAudioElement | null = null;
  private launchBuffer: AudioBuffer | null = null;
  private launchLoading = false;
  private ambientLevel = 0.32;

  /** Diagnostic: how the arcade bed is doing. */
  get ambienceStatus(): { paused: boolean; volume: number; time: number } | null {
    if (!this.ambient) return null;
    return {
      paused: this.ambient.paused,
      volume: Number(this.ambient.volume.toFixed(2)),
      time: Number(this.ambient.currentTime.toFixed(1)),
    };
  }

  /** Diagnostic: "none" until unlocked, then the AudioContext state. */
  get state(): string {
    return this.ctx ? this.ctx.state : "none";
  }

  /** Called from the first key press. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.85;

      // A compressor keeps punch without clipping when several hits land together.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;

      master.connect(comp);
      comp.connect(ctx.destination);

      this.ctx = ctx;
      this.master = master;
      this.startRolling();
    }

    if (this.ctx.state === "suspended") await this.ctx.resume();
    void this.loadLaunch();
    this.startAmbience();
  }

  /**
   * The arcade bed. Streamed through an <audio> element rather than decoded into Web
   * Audio, so a multi-megabyte track does not sit in memory as raw PCM.
   */
  startAmbience(url = "/audio/pinball-ambience.mp3"): void {
    if (this.ambient) {
      // coming back to the table: restart the bed and fade it up again
      void this.ambient
        .play()
        .then(() => this.fadeAmbience(this.muted ? 0 : this.ambientLevel, 800))
        .catch(() => {});
      return;
    }
    const el = new Audio(url);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0; // faded in once playing, so it does not pop
    this.ambient = el;

    void el
      .play()
      .then(() => this.fadeAmbience(this.ambientLevel, 1800))
      .catch(() => {
        // Blocked until a gesture; unlock() will try again.
      });
  }

  private fadeAmbience(to: number, ms: number): void {
    const el = this.ambient;
    if (!el) return;
    if (this.muted) {
      el.volume = 0;
      return;
    }
    const from = el.volume;
    const started = performance.now();
    const step = () => {
      // A fade already in flight must not undo the switch.
      if (this.muted) {
        el.volume = 0;
        return;
      }
      const t = Math.min(1, (performance.now() - started) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 0 mutes the bed, 1 is full. */
  setAmbience(level: number): void {
    this.ambientLevel = Math.max(0, Math.min(1, level));
    if (this.ambient) this.ambient.volume = this.muted ? 0 : this.ambientLevel;
  }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: rolling ball is low and granular, not hissy.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /**
   * Stops everything the table is making: the arcade bed, the rolling bed and any
   * note still ringing. Called when the player stands up, and on unmount.
   */
  silence(): void {
    if (this.ambient) {
      this.ambient.pause();
      this.ambient.currentTime = 0;
      this.ambient.volume = 0;
    }
    if (this.rollGain) this.rollGain.gain.value = 0;
    if (this.rollSource) {
      try {
        this.rollSource.stop();
      } catch {
        // already stopped
      }
      this.rollSource.disconnect();
      this.rollSource = null;
      this.rollFilter = null;
      this.rollGain = null;
    }
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  /** The speaker by Stand up: the whole table, not one bumper. */
  setMuted(next: boolean) {
    this.muted = next;
    const master = this.master;
    if (master) master.gain.setTargetAtTime(next ? 0 : 0.85, master.context.currentTime, .04);
    // The arcade bed is an <audio> element, outside the graph, so it needs the switch too.
    if (this.ambient) this.ambient.volume = next ? 0 : this.ambientLevel;
  }

  dispose(): void {
    this.silence();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }

  /** A permanent low channel for the ball rolling on the slate. */
  private startRolling(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(2);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();

    this.rollSource = source;
    this.rollFilter = filter;
    this.rollGain = gain;
  }

  /** Continuous rolling sound, driven by the ball's speed in m/s. */
  roll(speed: number): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const target = Math.min(1, speed / 4) * 0.16;
    // Smooth so it does not chatter frame to frame.
    this.rollLevel += (target - this.rollLevel) * 0.2;
    this.rollGain.gain.value = this.rollLevel;
    this.rollFilter.frequency.value = 260 + Math.min(1, speed / 4) * 900;
  }

  private burst(at: number, duration: number, frequency: number, gain: number, q = 1.2): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(0.3);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master!);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private tone(
    at: number,
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
    endFrequency?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(envelope);
    envelope.connect(this.master!);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** A bell: struck metal — a bright transient over two detuned partials. */
  bell(index: number): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const f = BELL_SCALE[index % BELL_SCALE.length]!;

    this.burst(at, 0.05, 3200, 0.22, 1.8);
    this.tone(at, f, 0.75, 0.3, "sine");
    this.tone(at, f * 2.01, 0.5, 0.14, "sine");
    this.tone(at, f * 3.02, 0.32, 0.07, "sine");
    this.tone(at, f * 0.5, 0.9, 0.1, "triangle");
  }

  /** Ball hitting a solid object; strength 0..1. */
  impact(strength = 0.5): void {
    if (!this.ctx) return;
    const now = performance.now();
    // Impacts bunch up when the ball rattles; eight per 100 ms is plenty.
    if (now - this.lastImpactAt < 28) return;
    this.lastImpactAt = now;

    const s = Math.max(0.15, Math.min(1, strength));
    const at = this.ctx.currentTime;
    this.burst(at, 0.035 + s * 0.03, 1500 + s * 1800, 0.12 + s * 0.22, 1.4);
    this.tone(at, 160 + s * 120, 0.06, 0.08 * s, "sine", 90);
  }

  /** The chevrons: a short directional whoosh. */
  chevron(side: number): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    this.burst(at, 0.18, 900, 0.16, 0.8);
    this.tone(at, side > 0 ? 330 : 247, 0.16, 0.1, "triangle", side > 0 ? 520 : 180);
  }

  /** Flipper solenoid: a hard click and a body thud. */
  flipper(): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    this.burst(at, 0.025, 2600, 0.28, 2.2);
    this.tone(at, 120, 0.09, 0.22, "sine", 70);
  }

  /** Decode the launch sample once, so the first pull is not silent. */
  private async loadLaunch(): Promise<void> {
    if (this.launchBuffer || this.launchLoading || !this.ctx) return;
    this.launchLoading = true;
    try {
      const response = await fetch("/audio/pinball-launch.mp3");
      const bytes = await response.arrayBuffer();
      this.launchBuffer = await this.ctx.decodeAudioData(bytes);
    } catch {
      // no sample is not a failure: the synth plunge still fires
    } finally {
      this.launchLoading = false;
    }
  }

  /** The shot heard when the spring releases: the drain sample, first two seconds. */
  launch(power: number): void {
    if (!this.ctx || !this.master) return;
    if (!this.launchBuffer) {
      void this.loadLaunch();
      return;
    }
    const level = 0.45 + 0.4 * Math.max(0, Math.min(1, power));
    const source = this.ctx.createBufferSource();
    source.buffer = this.launchBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(this.master);
    // the sample runs 3 s, the shot only needs the first 2
    source.start(this.ctx.currentTime, 0, 2);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  /** Plunger: the spring compressing, then the launch. */
  plunge(charge: number): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const c = Math.max(0.15, Math.min(1, charge));
    this.burst(at, 0.05, 800 + c * 700, 0.18 * c, 1.1);
    this.tone(at, 90, 0.12, 0.3 * c, "sine", 55);
    this.tone(at + 0.01, 300 + c * 260, 0.2, 0.1, "triangle", 120);
  }

  /** Drain: descending, deliberately flat. */
  drain(): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    this.tone(at, 220, 0.45, 0.2, "triangle", 70);
    this.burst(at + 0.05, 0.25, 400, 0.08, 0.7);
  }

  /** Chain step: a short blip that climbs with the multiplier. */
  chain(level: number): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const f = 440 * Math.pow(2, Math.min(6, level) / 12);
    this.tone(at, f, 0.14, 0.12, "triangle");
  }
}

export const audio = new PinballAudio();
onGameMute((mutedNow) => audio.setMuted(mutedNow));
