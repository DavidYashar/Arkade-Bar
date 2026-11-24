import { useEffect, useRef, useState } from 'react';

const CHAR_MS = 22;
const HOLD_MS = 600;
const GAP_MS = 140;
const READ_MS = 180;
const FADE_MS = 240;
const SLOW_MS = 15000;

export function ArcadeLoader({ text, ready, onDone }: {
  text: string;
  ready: boolean;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState(0);
  const [fading, setFading] = useState(false);
  const [slow, setSlow] = useState(false);
  const isReady = useRef(ready);
  isReady.current = ready;

  useEffect(() => {
    const start = performance.now();
    const typingMs = text.length * CHAR_MS;
    const cycleMs = typingMs + HOLD_MS + GAP_MS;
    let frame: number;
    let shown = 0;
    let completedAt: number | null = null;

    const tick = (now: number) => {
      const phase = Math.max(0, now - start) % cycleMs;
      const next = phase >= typingMs + HOLD_MS ? 0 : Math.min(text.length, Math.floor(phase / CHAR_MS));
      // When the scene is ready, finish this line and hold it before fading.
      const count = isReady.current ? Math.max(shown, next) : next;
      if (shown !== count) {
        shown = count;
        setTyped(count);
        completedAt = count === text.length ? now : null;
      }
      if (isReady.current && completedAt !== null && now - completedAt >= READ_MS) {
        setFading(true);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(onDone, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fading, onDone]);

  return (
    <div
      data-arcade-loader
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#070d0a] transition-opacity ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <span className="sr-only" role="status">{text}{slow && !ready ? '. Still loading.' : ''}</span>
      <p aria-hidden="true" className="px-6 text-center font-display text-[11px] uppercase tracking-[0.3em] text-[#d9c9a3] sm:text-[12px]">
        {text.slice(0, typed)}
        <span className="ml-1 inline-block animate-pulse text-[#c9973f]">|</span>
      </p>
      {slow && !ready && (
        <button className="key-pill rounded-full border border-[#c9973f]/50 px-4 py-2 text-xs text-[#f0e6cf]"
          type="button" onClick={() => window.location.reload()}>
          Reload Arkade Bar
        </button>
      )}
    </div>
  );
}
