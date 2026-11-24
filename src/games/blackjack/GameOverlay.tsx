import { readHand } from './strategy';
import { POINTS, roundTotal } from './score';
import { MuteButton } from '@/arcade/MuteButton';
import type { BlackjackState } from './useBlackjack';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
};

const LABEL: Record<string, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  lose: 'Loss',
  push: 'Draw',
};

const TONE: Record<string, string> = {
  blackjack: 'text-[#e8c877]',
  win: 'text-[#8ee6b0]',
  lose: 'text-[#e08a7a]',
  push: 'text-[#c8d4ca]',
};

const RULES: Array<[string, number]> = [
  ['Blackjack', POINTS.blackjack],
  ['Dealer busts', POINTS.dealerBust],
  ['Win', POINTS.win],
  ['Draw', POINTS.draw],
];

export function GameOverlay({
  state,
  onAnswer,
  onLeave,
  onRestart,
}: {
  state: BlackjackState;
  onAnswer: (action: 'hit' | 'stand' | 'double') => void;
  onLeave: () => void;
  onRestart: () => void;
}) {
  const results = state.results;
  const played = results.filter((r): r is NonNullable<typeof r> => Boolean(r));
  const count = (kind: string) => played.filter((r) => r.outcome === kind).length;
  const wins = count('win');
  const losses = count('lose');
  const draws = count('push');
  const naturals = count('blackjack');
  const total = roundTotal(results);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <div className="flex items-start justify-between">
        <div className="pointer-events-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#c9973f]">Blackjack</p>
          <p className="mt-1 text-sm tracking-[0.08em] text-[#efe6d6]">
            {state.phase === 'summary' ? 'Round complete' : `Hand ${state.index + 1} of ${state.hands}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-sm tabular-nums text-[#efe6d6]">{clock(state.remaining)}</p>
          <p className="text-sm tabular-nums text-[#c9973f]">{total} pts</p>
          <button
            type="button"
            onClick={onLeave}
            className="key-pill pointer-events-auto rounded-full border border-[#3a4a40] bg-black/50 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6]"
          >
            Stand up
          </button>
        </div>
      </div>

      {/* the totals, anchored to the rows */}
      {(state.phase === 'deciding' || state.phase === 'dealer' || state.phase === 'verdict') && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ top: 'var(--label-dealer, 12%)' }}
          >
            <span className="rounded-full border border-[#c9973f]/30 bg-black/60 px-4 py-1 text-[11px] uppercase tracking-[0.22em] text-[#f0e6cf]">
              Dealer {readHand(state.dealer).total}
            </span>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ top: 'var(--label-player, 81%)' }}
          >
            <span className="rounded-full border border-[#8ee6b0]/25 bg-black/60 px-4 py-1 text-[11px] uppercase tracking-[0.22em] text-[#d8f5e2]">
              You {readHand(state.player).total}
            </span>
          </div>
        </>
      )}

      {state.phase === 'deciding' && (
        <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-2">
          <button type="button" onClick={() => onAnswer('hit')} className="key key-cream pointer-events-auto">
            Hit
          </button>
          <button type="button" onClick={() => onAnswer('stand')} className="key key-ink pointer-events-auto">
            Stand
          </button>
          <button type="button" onClick={() => onAnswer('double')} className="key key-gold pointer-events-auto">
            Double
          </button>
          <button
            type="button"
            disabled
            className="key pointer-events-auto border border-[#3a4a40] bg-black/40 text-[#5d6f63]"
          >
            Split
          </button>
        </div>
      )}

      {state.phase === 'dealer' && (
        <p className="text-center text-[11px] uppercase tracking-[0.24em] text-[#9fb5a7]">
          The dealer plays
        </p>
      )}

      {state.phase === 'summary' && (
        <div className="panel-drop pointer-events-auto mx-auto w-full max-w-lg rounded-sm border border-[#c9973f]/20 bg-[#07110c]/78 p-5 shadow-2xl backdrop-blur-[4px] [@media(pointer:coarse)]:backdrop-blur-none">
          <div className="line-rise flex items-end justify-between" style={{ animationDelay: '90ms' }}>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#c9973f]">Round complete</p>
              <p className="mt-1 text-4xl tracking-[0.04em] text-[#efe6d6]">
                {total}
                <span className="ml-1 text-sm text-[#8fa697]">pts</span>
              </p>
            </div>
            <p className="text-right text-[12px] leading-5 text-[#9fb5a7]">
              {naturals} blackjack{naturals === 1 ? '' : 's'}
              <br />
              {wins} won · {losses} lost · {draws} drawn
            </p>
          </div>

          <ul className="mt-4 space-y-1">
            {state.results.map((hand, i) => (
              <li
                key={i}
                className="line-rise flex items-center justify-between text-[12px] text-[#c8d4ca]"
                style={{ animationDelay: `${180 + i * 45}ms` }}
              >
                <span>Hand {i + 1}</span>
                <span className="flex items-center gap-3">
                  <span className={hand ? TONE[hand.outcome] : 'text-[#7f9587]'}>
                    {hand ? LABEL[hand.outcome] : '—'}
                  </span>
                  <span className="w-8 text-right tabular-nums text-[#9fb5a7]">
                    {hand ? `+${hand.points}` : '—'}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p
            className="line-rise mt-4 border-t border-[#1d2a22] pt-3 text-[10px] uppercase tracking-[0.16em] text-[#7f9587]"
            style={{ animationDelay: `${180 + state.results.length * 45 + 60}ms` }}
          >
            {RULES.map(([name, value]) => `${name} ${value}`).join(' · ')}
          </p>

          <div
            className="line-rise mt-4 flex justify-center"
            style={{ animationDelay: `${180 + state.results.length * 45 + 140}ms` }}
          >
            <button
              type="button"
              onClick={onRestart}
              className="key key-gold"
              style={{ flex: '0 0 auto', minWidth: '11rem' }}
            >
              Deal again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
