import { Suspense, useEffect, useRef, useState } from 'react';
import { BarScene, type Look } from './arcade/BarScene';
import { VIEWS, type View } from './arcade/views';
import { useBlackjack } from './games/blackjack/useBlackjack';
import { GameOverlay } from './games/blackjack/GameOverlay';
import { unlockSfx } from './lib/sfx';

function lookAt(view: View): Look {
  const [px, py, pz] = view.position;
  const [tx, ty, tz] = view.target;
  const dx = tx - px;
  const dy = ty - py;
  const dz = tz - pz;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { yaw: Math.atan2(-dx / length, -dz / length), pitch: Math.asin(dy / length) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function App() {
  const [view, setView] = useState<View>({ ...VIEWS[0]!, position: [0, 1.68, 14.4] });
  const [look, setLook] = useState<Look>(() => lookAt(VIEWS[0]!));
  const [hint, setHint] = useState(true);
  const [seated, setSeated] = useState(false);
  const [nearTable, setNearTable] = useState(false);
  const blackjack = useBlackjack();
  const move = useRef({ x: 0, z: 0 });
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key);
      if (index >= 1 && index <= VIEWS.length) {
        const next = VIEWS[index - 1]!;
        setView(next);
        setLook(lookAt(next));
      }
      if (event.code === 'Escape') setHint(true);
      if (seated && blackjack.state.phase === 'deciding') {
        if (event.code === 'KeyH') blackjack.answer('hit');
        if (event.code === 'KeyS') blackjack.answer('stand');
        if (event.code === 'KeyD') blackjack.answer('double');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#070d0a]">
      <div
        ref={surface}
        className="absolute inset-0 cursor-pointer touch-none"
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (event.button === 2) {
            event.preventDefault();
            return;
          }
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          setLook((current) => ({
            yaw: current.yaw - dx * 0.006,
            pitch: clamp(current.pitch - dy * 0.005, -1.1, 1.1),
          }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <Suspense fallback={<Loading />}>
          <BarScene
            view={view}
            look={look}
            move={move}
            seat={seated}
            blackjack={blackjack.state}
            onPosition={(x, z) => {
              const near = Math.hypot(x - 0, z - 2.0) < 3.9;
              setNearTable((current) => (current === near ? current : near));
            }}
          />
        </Suspense>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 via-black/35 to-transparent"
      />

      {!seated && (
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-7">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-[#c9973f]">Funtico</p>
          <h1 className="mt-1 text-xl tracking-[0.14em] text-[#efe6d6] sm:text-2xl">ARKADE BAR</h1>
        </div>
        <p className="text-right text-[10px] uppercase tracking-[0.24em] text-[#7f9587]">
          Grey box<br />
          walk inside
        </p>
      </header>
      )}

      <p
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/40 bg-black/55 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#f0e6cf] transition-opacity duration-500 ${
          hint ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {'Drag to look · arrows to walk'}
      </p>

      <Joystick stick={stick} move={move} />

      {seated && (
        <GameOverlay
          state={blackjack.state}
          onAnswer={(action) => {
            unlockSfx();
            blackjack.answer(action);
          }}
          onLeave={() => {
            blackjack.leave();
            setSeated(false);
          }}
          onRestart={() => blackjack.start()}
        />
      )}

      {!seated && nearTable && (
        <button
          type="button"
          onClick={() => {
            unlockSfx();
            setSeated(true);
            blackjack.start();
          }}
          className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
        >
          Sit at the card table
        </button>
      )}

      <nav
        aria-label="Views"
        className={`absolute inset-x-0 bottom-0 p-3 sm:p-6 ${seated ? 'hidden' : ''}`}
      >
        <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
          {VIEWS.map((item, index) => {
            const active = item.id === view.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setView(item);
                    setLook(lookAt(item));
                  }}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition sm:px-4 sm:text-xs ${
                    active
                      ? 'border-[#c9973f] bg-[#c9973f] text-[#12100b]'
                      : 'border-[#2a3a30] bg-black/40 text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6]'
                  }`}
                >
                  <span className="text-[9px] opacity-70">{index + 1}</span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}

function Joystick({
  stick,
  move,
}: {
  stick: React.RefObject<{ id: number; x: number; y: number } | null>;
  move: React.RefObject<{ x: number; z: number }>;
}) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const release = () => {
    stick.current = null;
    setKnob({ x: 0, y: 0 });
    move.current.x = 0;
    move.current.z = 0;
  };

  return (
    <div
      ref={base}
      className="absolute bottom-20 left-4 size-32 touch-none select-none rounded-full border border-[#2a3a30] bg-black/35 sm:bottom-24 sm:left-6 sm:size-36"
      onPointerDown={(event) => {
        event.stopPropagation();
        stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const origin = stick.current;
        if (!origin || origin.id !== event.pointerId) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        const length = Math.hypot(dx, dy) || 1;
        const limit = 46;
        const kx = (dx / length) * Math.min(limit, length);
        const ky = (dy / length) * Math.min(limit, length);
        setKnob({ x: kx, y: ky });
        move.current.x = kx / limit;
        move.current.z = ky / limit;
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Walk"
      role="presentation"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-[#c9973f]/25"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[9px] uppercase tracking-[0.2em] text-[#7f9587]">
        Walk
      </span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#7f9587]">Building the bar</p>
    </div>
  );
}
