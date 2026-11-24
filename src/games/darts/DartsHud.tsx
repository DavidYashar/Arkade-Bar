import { useEffect, useRef, useState } from 'react';
import { MuteButton } from '@/arcade/MuteButton';
import { paintChalkStrip, type ChalkRow } from './chalk';
import type { DartsState } from './useDarts';

const ARROWS = [
  { code: 'ArrowUp', label: 'Aim up', col: 2, row: 1, d: 'M8 3 L13 11 L3 11 Z' },
  { code: 'ArrowLeft', label: 'Aim left', col: 1, row: 2, d: 'M3 8 L11 3 L11 13 Z' },
  { code: 'ArrowRight', label: 'Aim right', col: 3, row: 2, d: 'M13 8 L5 13 L5 3 Z' },
  { code: 'ArrowDown', label: 'Aim down', col: 2, row: 3, d: 'M8 13 L3 5 L13 5 Z' },
];

/** A thumb key that presses the arrow the table already listens for. */
function AimKey({ code, label, d }: { code: string; label: string; d: string }) {
  const send = (type: 'keydown' | 'keyup') =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  return (
    <button
      type="button"
      data-darts-ui
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
      className="pointer-events-auto flex h-12 w-12 touch-none select-none items-center justify-center rounded-full border border-[#3a4a40] bg-black/55 text-[#d9cfa9] active:border-[#c9973f] active:bg-black/80"
    >
      <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}

/** The slate, flat, at the top of a phone: same chalk, same writing hand. */
function ChalkStrip({ rows, round, writing }: { rows: ChalkRow[]; round: number; writing: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    paintChalkStrip(ctx, canvas.width / 2, canvas.height / 2, rows, round, writing);
  }, [rows, round, writing]);
  return <canvas ref={ref} width={1520} height={440} className="block h-auto w-full" aria-hidden="true" />;
}

export function DartsHud({
  state,
  onLeave,
  onRestart,
}: {
  state: DartsState;
  onLeave: () => void;
  onRestart: () => void;
}) {
  const [coarse] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches);
  const playing = state.phase === 'aiming' || state.phase === 'settled';
  const [writing, setWriting] = useState(1);

  // The chalk writes itself in when a round settles, as it does on the wall board.
  useEffect(() => {
    if (state.phase !== 'settled') {
      setWriting(1);
      return;
    }
    setWriting(0);
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / 900);
      setWriting(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.round]);

  const rows: ChalkRow[] = state.rounds.map((value, index) => ({ index, value }));

  if (coarse) {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="absolute right-3 top-3 z-10 flex gap-2">
          <MuteButton />
          <button
            type="button"
            data-darts-ui
            onClick={onLeave}
            className="key-pill pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#3a4a40] bg-black/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd]"
          >
            Stand up
          </button>
        </div>

        <div data-darts-ui className="pointer-events-auto absolute inset-x-3 top-16">
          <ChalkStrip rows={rows} round={state.round} writing={writing} />
        </div>

        {state.phase === 'summary' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center">
            <button
              type="button"
              data-darts-ui
              onClick={onRestart}
              className="key key-gold pointer-events-auto w-1/2 px-5 text-[13px]"
              style={{ flex: '0 0 auto' }}
            >
              Throw again
            </button>
          </div>
        )}

        <div className="mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] flex items-end justify-between px-4">
          <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
            {ARROWS.map((arrow) => (
              <div
                key={arrow.code}
                style={{ gridColumn: arrow.col, gridRow: arrow.row }}
                className="flex items-center justify-center"
              >
                <AimKey code={arrow.code} label={arrow.label} d={arrow.d} />
              </div>
            ))}
          </div>

          {/* Hold to draw the arm, release to throw: the board's handlers do the work. */}
          <button
            type="button"
            data-darts-throw
            aria-label="Hold to throw the dart"
            onContextMenu={(event) => event.preventDefault()}
            className="pointer-events-auto flex h-24 w-24 touch-none select-none flex-col items-center justify-center rounded-full border border-[#c9973f]/45 bg-black/55 text-[#f0e6cf] backdrop-blur-[2px] active:border-[#c9973f] active:bg-black/80"
          >
            <span className="font-display text-[12px] uppercase tracking-[0.2em]">Hold</span>
            <span className="mt-0.5 text-[8px] uppercase tracking-[0.18em] text-[#8fa697]">
              release
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <div className="flex items-start justify-end gap-2">
        <MuteButton />
        <button
          type="button"
          data-darts-ui
          onClick={onLeave}
          className="key-pill pointer-events-auto rounded-full border border-[#3a4a40] bg-black/50 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6]"
        >
          Stand up
        </button>
      </div>

      {playing && (
        <div className="absolute inset-x-0 bottom-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-[#8fa697]">
          <span className="flex items-center gap-2">
            <span>Aim</span>
            <span className="flex gap-1">
              {ARROWS.map((arrow) => (
                <span
                  key={arrow.code}
                  className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-[#3a4a40] bg-black/50"
                >
                  <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-[#d9cfa9]" aria-hidden="true">
                    <path d={arrow.d} />
                  </svg>
                  <span className="sr-only">{arrow.label}</span>
                </span>
              ))}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span>Throw</span>
            <span className="tracking-[0.14em] text-[#c8d4ca]">hold left click and release</span>
          </span>
        </div>
      )}

      {state.phase === 'summary' && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onRestart}
            className="key key-gold pointer-events-auto flex-none px-5 text-[13px]"
          >
            Throw again
          </button>
        </div>
      )}
    </div>
  );
}
