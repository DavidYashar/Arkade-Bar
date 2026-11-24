import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BOARD, BOAT_SPRITE_SIZE, Narrows, type Controls, type Phase } from './narrows';
import { BoatView } from './boatView';
import { NarrowsAudio } from './audio';
import { NarrowsCabinetDisplay } from './NarrowsCabinet';
import { MuteButton } from '@/arcade/MuteButton';
import { onGameMute } from '@/lib/gameSound';

/** A thumb key that presses the same keyboard code the game already listens for. */
function PadKey({ code, label, children }: { code: string; label: string; children: React.ReactNode }) {
  const send = (type: 'keydown' | 'keyup') =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        send('keydown');
      }}
      onPointerUp={() => send('keyup')}
      onPointerCancel={() => send('keyup')}
      onLostPointerCapture={() => send('keyup')}
      onContextMenu={(event) => event.preventDefault()}
      className="pointer-events-auto flex h-16 w-16 touch-none select-none items-center justify-center rounded-full border border-[#c9973f]/45 bg-black/55 text-[#f0e6cf] backdrop-blur-[2px] active:border-[#c9973f] active:bg-black/75"
    >
      {children}
    </button>
  );
}

/**
 * The Narrows on a board. Keys steer and fire; the gauges are painted into the
 * board itself, so this component only owns the input and the way out.
 */
export function NarrowsGame({ onExit, onReady, loading = false }: {
  onExit: () => void;
  onReady?: () => void;
  loading?: boolean;
}) {
  const [board] = useState(() => {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD.w;
    canvas.height = BOARD.h;
    return canvas;
  });
  const game = useRef<Narrows>(null);
  /** Phones get the plain board, full page: no cabinet, no wood. */
  const [coarse] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches);
  const screenRef = useRef<HTMLCanvasElement>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const [cabinetReady, setCabinetReady] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const markCabinetReady = useCallback(() => setCabinetReady(true), []);
  const [phase, setPhase] = useState<Phase>('ready');
  const [result, setResult] = useState<{ score: number; bridges: number } | null>(null);

  useEffect(() => {
    if (boardReady && (coarse || cabinetReady)) onReady?.();
  }, [boardReady, coarse, cabinetReady, onReady]);

  const start = () => {
    const machine = game.current;
    if (!machine) return;
    machine.reset();
    if (import.meta.env.DEV) {
      (window as unknown as { __narrows?: Narrows }).__narrows = machine;
    }
    setPhase('flying');
    setResult(null);
  };

  useEffect(() => {
    const machine = new Narrows();
    game.current = machine;
    machine.reset();
    if (import.meta.env.DEV) {
      (window as unknown as { __narrows?: Narrows }).__narrows = machine;
    }
    setPhase('flying');

    const view = new BoatView();
    const audio = new NarrowsAudio();
    const unmute = onGameMute((mutedNow) => audio.setMuted(mutedNow));
    if (import.meta.env.DEV) {
      (window as unknown as { __narrowsAudio?: unknown }).__narrowsAudio = audio;
    }
    void audio.init();
    if (import.meta.env.DEV) {
      (window as unknown as { __narrowsSprites?: unknown }).__narrowsSprites = view;
    }
    const keys: Controls = { left: false, right: false, fast: false, slow: false, fire: false };
    const held = new Set<string>();

    const apply = () => {
      keys.left = held.has('ArrowLeft') || held.has('KeyA');
      keys.right = held.has('ArrowRight') || held.has('KeyD');
      keys.fast = held.has('ArrowUp') || held.has('KeyW');
      keys.slow = held.has('ArrowDown') || held.has('KeyS');
      keys.fire = held.has('Space') || held.has('KeyJ');
    };

    const down = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      held.add(event.code);
      apply();
      audio.resume();
    };
    const up = (event: KeyboardEvent) => {
      held.delete(event.code);
      apply();
    };
    const blur = () => {
      held.clear();
      apply();
    };

    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    const ctx = board.getContext('2d');
    let frame = 0;
    let last = performance.now();
    let seen: Phase = 'flying';
    let cardShown = false;
    let silenced = false;
    let hasDrawnBoat = false;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!loadingRef.current) machine.update(dt, keys);
      if (machine.phase === 'over') {
        if (!silenced) {
          silenced = true;
          audio.silence();
        }
      } else if (!loadingRef.current) {
        audio.sync(machine.entities, machine.x, machine.z, machine.speed);
        for (const shot of machine.shotEvents.splice(0)) {
          audio.shot(shot.who, shot.x - machine.x, shot.z - machine.z);
        }
        for (const kill of machine.killEvents.splice(0)) {
          if (kill.kind === 'bridge') audio.bridgeBoom(kill.x - machine.x, kill.z - machine.z);
          else audio.craftBoom(kill.x - machine.x, kill.z - machine.z);
        }
      }
      if (ctx) {
        machine.draw(ctx, view.enemies, now / 1000);
        const spot = machine.playerScreen();
        const size = BOAT_SPRITE_SIZE;
        const left = spot.x - size / 2;
        const top = spot.y - size / 2;
        const muzzle = view.render(now / 1000, machine.bank, machine.speed);
        if (machine.phase !== 'over') ctx.drawImage(view.canvas, left, top, size, size);
        if (!hasDrawnBoat && view.ready) {
          hasDrawnBoat = true;
          setBoardReady(true);
        }

        // muzzle flash at the bow while the gun is cycling
        if (muzzle && machine.phase !== 'over' && keys.fire && machine.fireCooldown > .085) {
          const flash = .55 + .45 * Math.sin(now / 22);
          const x = left + muzzle.x * size;
          const y = top + muzzle.y * size;
          const radius = 9;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
          glow.addColorStop(0, `rgba(255, 236, 170, ${.9 * flash})`);
          glow.addColorStop(1, 'rgba(255, 140, 60, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      if (coarse && screenRef.current) {
        const surface = screenRef.current;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const cw = surface.clientWidth;
        const ch = surface.clientHeight;
        const pw = Math.max(1, Math.round(cw * ratio));
        const ph = Math.max(1, Math.round(ch * ratio));
        if (surface.width !== pw || surface.height !== ph) {
          surface.width = pw;
          surface.height = ph;
        }
        const screen = surface.getContext('2d');
        if (screen) {
          screen.setTransform(ratio, 0, 0, ratio, 0, 0);
          // Stretched to the page: the board reaches the top and bottom edges, and
          // the controls float over it.
          screen.drawImage(board, 0, 0, cw, ch);
        }
      }
      if (machine.phase === 'over' && !cardShown && machine.explosion.age >= 1.15) {
        cardShown = true;
        setResult({ score: Math.round(machine.score), bridges: machine.bridges });
      }
      if (machine.phase !== seen) {
        seen = machine.phase;
        setPhase(seen);
        // the card waits until the boat has finished coming apart
        if (seen === 'over') audio.explode();

      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      view.dispose();
      unmute();
      audio.dispose();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [board]);

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-[#24180f]" aria-label="The Narrows arcade game">
      {coarse ? (
        <>
          <canvas ref={screenRef} className="absolute inset-0 h-full w-full" aria-label="The Narrows play area" />
          <div className="absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] flex -translate-x-1/2 gap-2">
            <MuteButton />
            <button
              type="button"
              onClick={onExit}
              className="key-pill pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#3a4a40] bg-black/60 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd] active:border-[#c9973f] active:text-[#efe6d6]"
            >
              Stand up
            </button>
          </div>
          <div className="absolute inset-x-4 bottom-28 flex items-end justify-between">
            <PadKey code="ArrowLeft" label="Steer left">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                <path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </PadKey>
            <PadKey code="ArrowRight" label="Steer right">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                <path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </PadKey>
          </div>
          <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center">
            <PadKey code="Space" label="Fire">
              <span className="font-display text-[12px] uppercase tracking-[0.2em]">Fire</span>
            </PadKey>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <NarrowsCabinetDisplay board={board} onReady={markCabinetReady} />
            </Suspense>
          </div>
          <div className="absolute right-4 top-4 flex gap-2">
            <MuteButton />
            <button
              type="button"
              onClick={onExit}
              className="key-pill pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#3a4a40] bg-black/60 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6]"
            >
              Stand up
            </button>
          </div>
        </>
      )}

      {phase === 'over' && result && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="pointer-events-auto flex flex-col items-center gap-4 border border-white/15 bg-black/35 px-10 py-7 text-center backdrop-blur-[3px]"
          style={{ transform: 'perspective(1100px) rotateX(30deg)', transformOrigin: '50% 100%' }}
        >
          <p
            className="text-3xl font-black uppercase leading-none tracking-[0.22em] text-[#ec3a2c]"
            style={{
              textShadow:
                '0 1px 0 #b31f14, 0 2px 0 #a51b11, 0 3px 0 #96170e, 0 4px 0 #86130b, 0 5px 0 #750f08, 0 8px 14px rgba(0,0,0,.65)',
            }}
          >
            Game Over
          </p>
          <p className="text-5xl tabular-nums tracking-[0.04em] text-[#f4efe4]">
            {result.score}
            <span className="ml-2 text-sm uppercase tracking-[0.2em] text-[#a8b6ab]">points</span>
          </p>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#a8b6ab]">
            {result.bridges} bridges destroyed
          </p>
          <button
            type="button"
            onClick={start}
            aria-label="Launch again"
            className="mt-1 flex h-16 w-16 items-center justify-center rounded-full bg-[#c8362b] text-[#fff3ee] shadow-[0_6px_0_#7e1f18,0_12px_24px_rgba(0,0,0,.45)] transition-transform duration-100 ease-out hover:bg-[#d13f33] active:translate-y-[3px] active:scale-[.94] active:shadow-[0_2px_0_#7e1f18,0_4px_10px_rgba(0,0,0,.4)]"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
