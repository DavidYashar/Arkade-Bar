import { Suspense, useEffect, useState } from 'react';
import { BarScene } from './arcade/BarScene';
import { VIEWS, type View } from './arcade/views';

export function App() {
  const [view, setView] = useState<View>(VIEWS[2]!);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key);
      if (index >= 1 && index <= VIEWS.length) {
        setView(VIEWS[index - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#070d0a]">
      <Suspense fallback={<Loading />}>
        <BarScene view={view} />
      </Suspense>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-7">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-[#c9973f]">Funtico</p>
          <h1 className="mt-1 text-xl tracking-[0.14em] text-[#efe6d6] sm:text-2xl">ARKADE BAR</h1>
        </div>
        <p className="text-right text-[10px] uppercase tracking-[0.24em] text-[#7f9587]">
          Grey box<br />
          design pass
        </p>
      </header>

      <nav aria-label="Views" className="absolute inset-x-0 bottom-0 p-3 sm:p-6">
        <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
          {VIEWS.map((item, index) => {
            const active = item.id === view.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setView(item)}
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
        <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-[#6f8377]">
          Press 1 to 6 to move
        </p>
      </nav>
    </main>
  );
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#7f9587]">Building the bar</p>
    </div>
  );
}
