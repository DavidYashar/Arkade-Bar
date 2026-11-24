import { useEffect, useState } from 'react';
import { isGameMuted, setGameMuted } from '@/lib/gameSound';

/**
 * The speaker beside Stand up. It sits next to the way out on every cabinet, in the
 * same pill, so muting is never more than a thumb away.
 */
export function MuteButton({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useState(isGameMuted);
  useEffect(() => {
    const sync = () => setMuted(isGameMuted());
    window.addEventListener('imarket:sound', sync);
    return () => window.removeEventListener('imarket:sound', sync);
  }, []);

  return (
    <button
      type="button"
      data-darts-ui
      aria-label={muted ? 'Unmute game sound' : 'Mute game sound'}
      aria-pressed={muted}
      onClick={() => {
        const next = !isGameMuted();
        setGameMuted(next);
        setMuted(next);
        window.dispatchEvent(new Event('imarket:sound'));
      }}
      className={`key-pill pointer-events-auto flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#3a4a40] bg-black/60 px-3 py-2 text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6] ${className}`}
    >
      {muted ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path
            d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z"
            fill="currentColor"
          />
          <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z" fill="currentColor" />
          <path d="M15.5 8.6a4.8 4.8 0 010 6.8M18 6a8.2 8.2 0 010 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
