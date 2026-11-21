/**
 * Sound effects, ported from the Bankroll blackjack.
 *
 * One AudioContext for the app, created on the first real gesture because browsers
 * refuse to start audio without one. Samples are fetched early and decoded once, then
 * replayed from memory.
 */

const STORAGE_KEY = 'arkade-bar:muted';

let context: AudioContext | null = null;
let master: GainNode | null = null;

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const files = new Map<string, Promise<ArrayBuffer | null>>();

const SAMPLES: Record<string, string> = {
  deal: '/sound/deal.mp3',
  place: '/sound/place.mp3',
  tap: '/sound/tap.mp3',
};

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (master && context) master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.01);
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(context.destination);
  }
  return context;
}

function prefetch(name: string): Promise<ArrayBuffer | null> {
  const cached = files.get(name);
  if (cached) return cached;
  const url = SAMPLES[name] ?? '';
  const promise = fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  files.set(name, promise);
  return promise;
}

function load(name: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  const inFlight = loading.get(name);
  if (inFlight) return inFlight;

  const ctx = ensureContext();
  if (!ctx) return Promise.resolve(null);

  const promise = prefetch(name)
    .then((data) => (data ? ctx.decodeAudioData(data) : null))
    .then((buffer) => {
      if (buffer) buffers.set(name, buffer);
      loading.delete(name);
      return buffer;
    })
    .catch(() => {
      loading.delete(name);
      return null;
    });

  loading.set(name, promise);
  return promise;
}

/** Call from a real click or tap. Safe to call repeatedly. */
export function unlockSfx(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  for (const name of Object.keys(SAMPLES)) void load(name);
}

export function play(name: 'deal' | 'place' | 'tap', gain = 1): void {
  if (isMuted()) return;
  const ctx = ensureContext();
  if (!ctx || !master) return;

  const start = () => {
    void load(name).then((buffer) => {
      if (!buffer || !ctx || !master) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const level = ctx.createGain();
      level.gain.value = gain;
      source.connect(level);
      level.connect(master);
      source.start();
    });
  };

  if (ctx.state === 'running') start();
  else void ctx.resume().then(start).catch(() => {});
}

if (typeof window !== 'undefined') {
  for (const name of Object.keys(SAMPLES)) prefetch(name);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const ctx = context;
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  });
}

export const playDeal = (gain = 0.7) => play('deal', gain);
export const playPlace = (gain = 0.6) => play('place', gain);
export const playTap = (gain = 0.5) => play('tap', gain);
