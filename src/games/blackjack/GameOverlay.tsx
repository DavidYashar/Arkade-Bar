import { readHand } from './strategy';
import type { BlackjackState } from './useBlackjack';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
};

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
  const playing = state.phase === 'deciding' || state.phase === 'verdict';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <div className="flex items-start justify-between">
        <div className="pointer-events-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#c9973f]">Blackjack</p>
          <p className="mt-1 text-sm tracking-[0.08em] text-[#efe6d6]">
            Hand {state.phase === 'summary' ? state.hands : state.index + 1} of {state.hands}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-sm tabular-nums text-[#efe6d6]">{clock(state.remaining)}</p>
          <button
            type="button"
            onClick={onLeave}
            className="pointer-events-auto rounded-full border border-[#3a4a40] bg-black/50 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#b9c8bd] hover:border-[#c9973f]/60 hover:text-[#efe6d6]"
          >
            Stand up
          </button>
        </div>
      </div>

      {(state.phase === 'deciding' || state.phase === 'verdict') && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center">
            <span className="rounded-full border border-[#c9973f]/30 bg-black/60 px-4 py-1 text-[11px] uppercase tracking-[0.22em] text-[#f0e6cf]">
              Dealer {state.holeHidden ? readHand(state.dealer).total : readHand(state.dealer).total}
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-[59%] flex justify-center">
            <span className="rounded-full border border-[#8ee6b0]/25 bg-black/60 px-4 py-1 text-[11px] uppercase tracking-[0.22em] text-[#d8f5e2]">
              You {readHand(state.player).total}
            </span>
          </div>
        </>
      )}

      {state.phase === 'verdict' && (
        <div className="pointer-events-none mx-auto rounded-2xl border border-[#c9973f]/30 bg-black/70 px-6 py-3 text-center">
          <p className="text-lg tracking-[0.06em] text-[#efe6d6]">
            {state.verdict === null
              ? 'No call'
              : state.verdict
                ? 'Right call'
                : 'Wrong call'}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#9fb5a7]">
            {state.outcome ?? ''}
          </p>
        </div>
      )}

      {playing && (
        <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-2">
          {state.phase === 'deciding' ? (
            <>
              <button type="button" onClick={() => onAnswer('hit')} className="key key-cream pointer-events-auto">
                Hit
              </button>
              <button type="button" onClick={() => onAnswer('stand')} className="key key-ink pointer-events-auto">
                Stand
              </button>
              <button
                type="button"
                onClick={() => onAnswer('double')}
                className="key key-gold pointer-events-auto"
              >
                Double
              </button>
              <button
                type="button"
                disabled
                className="key pointer-events-auto border border-[#3a4a40] bg-black/40 text-[#5d6f63]"
              >
                Split
              </button>
            </>
          ) : (
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#9fb5a7]">
              Next hand in {Math.ceil(2.6)}s
            </p>
          )}
        </div>
      )}

      {state.phase === 'summary' && state.result && (
        <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-[#c9973f]/25 bg-[#07110c]/95 p-5 shadow-2xl">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#c9973f]">Round complete</p>
          <p className="mt-2 text-3xl tracking-[0.04em] text-[#efe6d6]">
            {state.result.score}
            <span className="ml-1 text-sm text-[#8fa697]">/ {state.hands * 20}</span>
          </p>
          <p className="mt-1 text-[12px] text-[#9fb5a7]">
            {state.result.correct} right · {state.result.wrong} wrong · {state.result.unanswered} unanswered ·{' '}
            {Math.round(state.result.accuracy * 100)}% accuracy
          </p>
          <ul className="mt-4 space-y-1">
            {state.result.hands.map((hand) => (
              <li key={hand.index} className="flex items-center justify-between text-[12px] text-[#c8d4ca]">
                <span>
                  Hand {hand.index + 1} · {hand.cards.join(' ')} vs {hand.dealerUp}
                </span>
                <span className={hand.verdict ? 'text-[#8ee6b0]' : hand.verdict === false ? 'text-[#e08a7a]' : 'text-[#7f9587]'}>
                  {hand.verdict === null ? '—' : hand.verdict ? `+${hand.points}` : '0'}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={onRestart} className="key key-gold flex-1">
              Deal again
            </button>
            <button type="button" onClick={onLeave} className="key key-ghost flex-1">
              Stand up
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
