import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BarScene, type Look } from './arcade/BarScene';
import { BRICK_BLITZ_AT, JUKEBOX_AT, NARROWS_AT, NARROWS_REACH, PINBALL_AT } from './arcade/colliders';
import { VIEWS, type View } from './arcade/views';
import { ArcadeLoader } from './arcade/ArcadeLoader';
import { useBlackjack } from './games/blackjack/useBlackjack';
import { useDarts } from './games/darts/useDarts';
import { DartsHud } from './games/darts/DartsHud';
import { DARTS } from './games/darts/DartsBoard';
import { GameOverlay } from './games/blackjack/GameOverlay';
import { PinballTable } from './games/pinball/PinballGame';
import { NarrowsGame } from './games/narrows/NarrowsGame';
import { useJukebox } from './games/jukebox/useJukebox';
import { JUKEBOX_TRACKS } from './games/jukebox/tracks';
import { prepareSfx, setMuted as setBarMuted, unlockSfx } from './lib/sfx';
import { onGameMute } from './lib/gameSound';

const BrickBlitz = lazy(() =>
  import('./games/brickblitz/BrickBlitz').then(({ BrickBlitz }) => ({ default: BrickBlitz })),
);

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

/** Half a second between the table appearing and the first card moving. */
const DEAL_BEAT_MS = 900;
/** The loading line's own fade, so the beat starts from a clear screen. */
const LOADER_FADE_MS = 380;

export function App() {
  const [view, setView] = useState<View>({ ...VIEWS[0]!, position: [0, 1.68, 14.4] });
  const [look, setLook] = useState<Look>(() => lookAt(VIEWS[0]!));
  const [hint, setHint] = useState(true);
  const [seated, setSeated] = useState(false);
  const [nearTable, setNearTable] = useState(false);
  const [arcadeGame, setArcadeGame] = useState<'pinball' | 'brick-blitz' | 'narrows' | null>(null);
  const [dartsOn, setDartsOn] = useState(false);
  const [nearDarts, setNearDarts] = useState(false);
  const [nearJukebox, setNearJukebox] = useState(false);
  const [jukeboxOn, setJukeboxOn] = useState(false);
  const jukebox = useJukebox();
  const selectTrack = jukebox.select;

  // dev handles: open the cabinet and start a track without walking there
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as {
      __jukebox?: (on: boolean) => void;
      __playTrack?: (slot: number) => void;
    };
    w.__jukebox = setJukeboxOn;
    w.__playTrack = (slot: number) => void selectTrack(slot);
  }, [selectTrack]);
  const pinball = arcadeGame === 'pinball';
  const playingArcade = arcadeGame !== null;
  const [pinballOpened, setPinballOpened] = useState(false);

  const [nearNarrows, setNearNarrows] = useState(false);
  const [coarse] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches);
  const walkPosition = useRef<{ x: number; z: number } | null>(null);
  const [nearPinball, setNearPinball] = useState(false);
  const [nearBrickBlitz, setNearBrickBlitz] = useState(false);
  const darts = useDarts();
  const dartsRef = useRef(darts);
  dartsRef.current = darts;
  const move = useRef({ x: 0, z: 0 });
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);

  const transition = useRef(0);
  const [loader, setLoader] = useState<{ id: number; text: string; ready: boolean; warmBar?: boolean } | null>({
    id: 0,
    text: 'Welcome to the Arkade Bar',
    ready: false,
  });
  const loaderId = loader?.id;
  const loading = loader !== null;
  const blackjack = useBlackjack(loading);
  const [sceneStarted, setSceneStarted] = useState(false);

  /** A deal waiting for the seated table, and then for the loading screen to lift. */
  const dealAfterLoad = useRef(false);
  const startDeal = useRef(blackjack.start);
  startDeal.current = blackjack.start;
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const dealBeat = useRef<number | null>(null);
  const [seatedVisibleKey, setSeatedVisibleKey] = useState(0);

  useEffect(() => {
    // Paint the loading screen before mounting the canvases on startup.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => setSceneStarted(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);


  const beginLoading = useCallback((text: string, warmBar = false) => {
    const id = ++transition.current;
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
    setLoader({ id, text, ready: false, warmBar });
  }, []);
  const finishLoading = useCallback(
    () => setLoader((current) => (current && current.id === loaderId && !current.ready
      ? { ...current, ready: true }
      : current)),
    [loaderId],
  );
  const clearLoader = useCallback(() => {
    setLoader((current) => (current?.id === loaderId ? null : current));
    // the screen is now the table: let the canvas draw it, then beat, then deal
    if (!dealAfterLoad.current) return;
    setSeatedVisibleKey((n) => n + 1);
  }, [loaderId]);

  /**
   * Sitting down loads the table behind the loading line. The deal itself waits for
   * two things: the cards on screen, and a sound that can play. Only then does the
   * first card leave the shoe, so picture and sound start together.
   */
  const sitDown = useCallback(() => {
    beginLoading('Entering Blackjack');
    unlockSfx();
    void prepareSfx();
    dealAfterLoad.current = true;
    setSeated(true);
  }, [beginLoading]);

  /** The seated table is on screen: the loading line can go. */
  const seatReady = useCallback(() => finishLoading(), [finishLoading]);

  /**
   * Called from inside the canvas once it has drawn the seated table a few frames
   * after the loading screen left. Only now is "we can see the table" actually true.
   */
  const seatedVisible = useCallback(() => {
    if (!dealAfterLoad.current) return;
    dealAfterLoad.current = false;
    if (dealBeat.current) window.clearTimeout(dealBeat.current);
    dealBeat.current = window.setTimeout(() => {
      dealBeat.current = null;
      if (!seatedRef.current) return;
      void prepareSfx().then(() => startDeal.current());
    }, DEAL_BEAT_MS);
  }, []);

  // A backstop: if the seated scene never signals, the line still lifts, so a
  // missed frame can never leave a player looking at a loading screen forever.
  const seatedBackstop = useRef<number | null>(null);
  useEffect(() => {
    if (!loading || !seated) return;
    if (seatedBackstop.current) window.clearTimeout(seatedBackstop.current);
    seatedBackstop.current = window.setTimeout(() => finishLoading(), 4000);
    return () => {
      if (seatedBackstop.current) window.clearTimeout(seatedBackstop.current);
    };
  }, [loading, seated, finishLoading]);

  // dev markers: what the loading line says, and where the card game is
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    document.body.dataset.loading = loader?.text ?? '';
    document.body.dataset.bj = blackjack.state.phase;
  }, [loader, blackjack.state.phase]);

  // The game sound switch also silences the darts, which plays through the bar's
  // own samples rather than an engine of its own. The music is never touched.
  useEffect(() => onGameMute((mutedNow) => setBarMuted(mutedNow)), []);

  // dev handles so a seat or the dartboard can be taken without walking there
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __sit?: () => void }).__sit = sitDown;
    const w = window as unknown as { __darts?: () => void; __dartsState?: () => unknown };
    const readDarts = () => dartsRef.current.state;
    w.__darts = () => {
      beginLoading('Entering Darts');
      unlockSfx();
      setDartsOn(true);
      darts.start();
    };
    w.__dartsState = readDarts;
  }, [sitDown, beginLoading, darts]);

  const pinballView = VIEWS.find((entry) => entry.id === 'pinball')!;

  /** Standing up puts you on the floor in front of the machine, not wherever the camera drifted. */
  const exitPinball = useCallback(() => {
    beginLoading('Standing up from Neon Pinball', true);
    setArcadeGame(null);
    setView(pinballView);
    setLook(lookAt(pinballView));
    walkPosition.current = { x: pinballView.position[0], z: pinballView.position[2] };
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
  }, [beginLoading, pinballView]);

  /** Standing up from the card table puts you beside it, not back at the door. */
  const exitBlackjack = useCallback(() => {
    beginLoading('Standing up from Blackjack', true);
    dealAfterLoad.current = false;
    if (dealBeat.current) {
      window.clearTimeout(dealBeat.current);
      dealBeat.current = null;
    }
    blackjack.leave();
    setSeated(false);
    const table = { ...VIEWS.find((entry) => entry.id === 'table')! };
    const beside = { ...table, position: [2.35, 1.68, 3.55] as [number, number, number], target: [0, 0.95, 2.0] as [number, number, number], fov: 44 };
    setView(beside);
    setLook(lookAt(beside));
    walkPosition.current = { x: beside.position[0], z: beside.position[2] };
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
  }, [beginLoading, blackjack]);

  const exitDarts = useCallback(() => {
    beginLoading('Standing up from Darts', true);
    darts.leave();
    setDartsOn(false);
  }, [beginLoading, darts]);

  const brickView = VIEWS.find((entry) => entry.id === 'brick-blitz')!;

  /** Standing up from Brick Blitz leaves you beside that table. */
  const exitBrickBlitz = useCallback(() => {
    beginLoading('Standing up from Brick Blitz', true);
    setArcadeGame(null);
    setView(brickView);
    setLook(lookAt(brickView));
    walkPosition.current = { x: brickView.position[0], z: brickView.position[2] };
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
  }, [beginLoading, brickView]);

  const narrowsView = VIEWS.find((entry) => entry.id === 'narrows')!;

  const exitNarrows = useCallback(() => {
    beginLoading('Standing up from Rescue Boat', true);
    setArcadeGame(null);
    setView(narrowsView);
    setLook(lookAt(narrowsView));
    walkPosition.current = { x: narrowsView.position[0], z: narrowsView.position[2] };
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
  }, [beginLoading, narrowsView]);

  const playNarrows = useCallback(() => {
    beginLoading('Entering Rescue Boat');
    const position = walkPosition.current;
    if (position) setView((current) => ({ ...current, position: [position.x, current.position[1], position.z] }));
    drag.current = null;
    stick.current = null;
    move.current = { x: 0, z: 0 };
    unlockSfx();
    setArcadeGame('narrows');
  }, [beginLoading]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHint(false), 9000);
    // ?game=narrows opens the canyon straight away, for testing on its own
    const wanted = new URLSearchParams(window.location.search).get('game');
    if (wanted === 'narrows' || window.location.hash === '#narrows') {
      beginLoading('Entering Rescue Boat');
      setArcadeGame('narrows');
    }
    if (wanted === 'brick') {
      beginLoading('Entering Brick Blitz');
      setArcadeGame('brick-blitz');
    }
    if (wanted === 'pinball') {
      beginLoading('Entering Neon Pinball');
      setPinballOpened(true);
      setArcadeGame('pinball');
    }
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const blockGameKeys = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || (event.target instanceof HTMLElement && event.target.closest('[data-arcade-loader]'))) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockGameKeys, true);
    return () => window.removeEventListener('keydown', blockGameKeys, true);
  }, [loading]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (loading) return;
      if (jukeboxOn) {
        if (event.code === 'Escape') setJukeboxOn(false);
        const slot = event.key === '0' ? 9 : Number(event.key) - 1;
        if (/^[0-9]$/.test(event.key) && !event.repeat) void selectTrack(slot);
        return;
      }
      if (dartsOn) {
        if (event.code === 'Escape') exitDarts();
        return;
      }
      if (playingArcade) {
        if (event.code === 'Escape') {
          if (arcadeGame === 'pinball') exitPinball();
          else if (arcadeGame === 'brick-blitz') exitBrickBlitz();
          else exitNarrows();
        }
        return;
      }
      if (event.code === 'KeyN' && !seated) playNarrows();
      if (event.code === 'Escape') setHint(true);
      if (seated && blackjack.state.phase === 'deciding') {
        if (event.code === 'KeyH') blackjack.answer('hit');
        if (event.code === 'KeyS') blackjack.answer('stand');
        if (event.code === 'KeyD') blackjack.answer('double');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, jukeboxOn, selectTrack, playingArcade, arcadeGame, seated, blackjack, dartsOn, exitDarts, playNarrows, exitPinball, exitBrickBlitz, exitNarrows]);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#070d0a]">
      {sceneStarted && (
        <div className="absolute inset-0" inert={loading}>
          <div
            ref={surface}
            className="absolute inset-0 cursor-pointer touch-none"
            onContextMenu={(event) => {
              event.preventDefault();
            }}
            onPointerDown={(event) => {
              if (jukeboxOn) return;
              if (event.button === 2) {
                event.preventDefault();
                return;
              }
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              if (dartsOn || jukeboxOn || !drag.current) return;
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
            <Suspense fallback={null}>
              {playingArcade ? null : (
                <BarScene
                  view={view}
                  look={look}
                  move={move}
                  seat={seated}
                  blackjack={blackjack.state}
                  darts={darts.state}
                  dartsOn={dartsOn}
                  onNarrowsPlay={playNarrows}
                  jukebox={{ ...jukebox, focused: jukeboxOn }}
                  onReady={loader && !loader.ready ? finishLoading : undefined}
                  warmRoom={loader?.warmBar === true && !loader.ready}
                  onTableReady={seatReady}
                  onSeatedVisible={seatedVisible}
                  seatedVisibleKey={seatedVisibleKey}
                  loadingId={loaderId}
                  onDartThrow={darts.throwAt}
                  onPosition={(x, z) => {
                    walkPosition.current = { x, z };
                    setNearJukebox(Math.hypot(x - JUKEBOX_AT[0], z - JUKEBOX_AT[1]) < 2.7);
                    const nearNarrows = Math.hypot(x - NARROWS_AT[0], z - NARROWS_AT[1]) <= NARROWS_REACH;
                    setNearNarrows((current) => (current === nearNarrows ? current : nearNarrows));
                    const nearTable = Math.hypot(x - 0, z - 2.0) < 3.2;
                    setNearTable((c) => (c === nearTable ? c : nearTable));
                    const nearPinball = Math.hypot(x - PINBALL_AT[0], z - PINBALL_AT[1]) < 3.2;
                    setNearPinball((c) => (c === nearPinball ? c : nearPinball));
                    const nearBrick = Math.hypot(x - BRICK_BLITZ_AT[0], z - BRICK_BLITZ_AT[1]) < 3.0;
                    setNearBrickBlitz((c) => (c === nearBrick ? c : nearBrick));
                    // the oche is a standing spot, not a cabinet: a smaller circle of its own
                    const nearOche = Math.hypot(x - DARTS.oche[0], z - DARTS.oche[2]) < 2.2;
                    setNearDarts((c) => (c === nearOche ? c : nearOche));
                  }}
                />
              )}
            </Suspense>
            {pinballOpened && (
              <div className={pinball ? 'absolute inset-0 z-20' : 'hidden'}>
                <PinballTable active={pinball} onExit={exitPinball}
                  loadingId={pinball ? loaderId : undefined} onReady={pinball && loading ? finishLoading : undefined} />
              </div>
            )}
            {arcadeGame === 'brick-blitz' && (
              <div className="absolute inset-0 z-20">
                <Suspense fallback={null}>
                  <BrickBlitz loading={loading} onExit={exitBrickBlitz} onReady={loading ? finishLoading : undefined} />
                </Suspense>
              </div>
            )}
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 via-black/35 to-transparent"
          />


          {!jukeboxOn && !playingArcade && !dartsOn && (
            <p
              className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/40 bg-black/55 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#f0e6cf] transition-opacity duration-500 ${
                hint ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {'Drag to look · arrows to walk'}
            </p>
          )}


          {seated && (
            <GameOverlay
              state={blackjack.state}
              onAnswer={(action) => {
                unlockSfx();
                blackjack.answer(action);
              }}
              onLeave={exitBlackjack}
              onRestart={() => blackjack.start()}
            />
          )}

          {!jukeboxOn && !seated && !playingArcade && !dartsOn && nearPinball && (
            <button
              type="button"
              onClick={() => {
                beginLoading('Entering Neon Pinball');
                unlockSfx();
                setPinballOpened(true);
                setArcadeGame('pinball');
              }}
              className="key-pill pointer-events-auto absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
            >
              Play Neon Pinball
            </button>
          )}

          {!jukeboxOn && !seated && !playingArcade && !dartsOn && nearDarts && (
            <button
              type="button"
              onClick={() => {
                beginLoading('Entering Darts');
                unlockSfx();
                setDartsOn(true);
                darts.start();
              }}
              className="key-pill pointer-events-auto absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
            >
              Play darts
            </button>
          )}

          {dartsOn && (
            <DartsHud
              state={darts.state}
              onLeave={exitDarts}
              onRestart={darts.start}
            />
          )}

          {!jukeboxOn && !seated && !playingArcade && !dartsOn && nearBrickBlitz && (
            <button
              type="button"
              onClick={() => {
                beginLoading('Entering Brick Blitz');
                unlockSfx();
                setArcadeGame('brick-blitz');
              }}
              className="key-pill pointer-events-auto absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
            >
              Play Brick Blitz
            </button>
          )}

          {!jukeboxOn && !seated && !playingArcade && !dartsOn && nearNarrows && (
            <button
              type="button"
              onClick={playNarrows}
              className="key-pill pointer-events-auto absolute left-1/2 top-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
            >
              Play Rescue Boat
            </button>
          )}

          {!jukeboxOn && !seated && !playingArcade && nearTable && (
            <button
              type="button"
              onClick={sitDown}
              className="key-pill pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
            >
              Sit at the card table
            </button>
          )}

          {!jukeboxOn && !seated && !playingArcade && !dartsOn && nearJukebox && (
            <button type="button"
              className="key-pill absolute left-1/2 top-[74%] -translate-x-1/2 rounded-full border border-[#c9973f]/50 bg-black/70 px-6 py-3 text-[11px] uppercase tracking-[0.24em] text-[#f0e6cf] hover:border-[#c9973f]"
              onClick={() => {
                drag.current = null;
                stick.current = null;
                move.current = { x: 0, z: 0 };
                setJukeboxOn(true);
              }}>
              Use jukebox
            </button>
          )}

          {jukeboxOn && (
            <>
              <button type="button" onClick={() => setJukeboxOn(false)}
                className="key-pill absolute right-4 top-4 rounded-full border border-[#3a4a40] bg-black/70 px-3 py-2 font-display text-[10px] uppercase tracking-[0.18em] text-[#f0e6cf]">
                Stand up
              </button>
              {JUKEBOX_TRACKS.map((track, slot) => track && (
                <button key={slot} type="button" onClick={() => void selectTrack(slot)}
                  aria-pressed={jukebox.selected === slot}
                  className="sr-only focus:not-sr-only focus:absolute focus:bottom-6 focus:left-6 focus:rounded focus:bg-black focus:p-3 focus:text-white">
                  {slot + 1}. {track.name}
                </button>
              ))}
              {jukebox.error && <p role="status" className="absolute inset-x-0 bottom-6 text-center text-sm text-[#f0e6cf]">Couldn’t play that track. Try again.</p>}
            </>
          )}

          {coarse && !playingArcade && !dartsOn && !seated && !jukeboxOn && <WalkPad move={move} />}

          {arcadeGame === 'narrows' && <NarrowsGame loading={loading} onExit={exitNarrows} onReady={loading ? finishLoading : undefined} />}
        </div>
      )}

      {loader && (
        <ArcadeLoader key={loader.id} text={loader.text} ready={loader.ready} onDone={clearLoader} />
      )}
    </main>
  );
}

const WALK_KEYS = [
  { label: 'Walk forward', dx: 0, dz: -1, col: 2, row: 1, d: 'M8 3 L13 11 L3 11 Z' },
  { label: 'Walk left', dx: -1, dz: 0, col: 1, row: 2, d: 'M3 8 L11 3 L11 13 Z' },
  { label: 'Walk right', dx: 1, dz: 0, col: 3, row: 2, d: 'M13 8 L5 13 L5 3 Z' },
  { label: 'Walk back', dx: 0, dz: 1, col: 2, row: 3, d: 'M8 13 L3 5 L13 5 Z' },
];

/**
 * Four arrows for walking. Looking is the finger drag on the room itself, so the
 * pad stays out of the way in the bottom left corner.
 */
function WalkPad({ move }: { move: React.RefObject<{ x: number; z: number }> }) {
  const held = useRef(new Set<number>());

  const apply = () => {
    let x = 0;
    let z = 0;
    for (const index of held.current) {
      const key = WALK_KEYS[index];
      if (!key) continue;
      x += key.dx;
      z += key.dz;
    }
    const length = Math.hypot(x, z);
    if (length === 0) {
      move.current.x = 0;
      move.current.z = 0;
      return;
    }
    // A diagonal is not faster than a straight line.
    move.current.x = x / Math.max(1, length);
    move.current.z = z / Math.max(1, length);
  };

  return (
    <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 grid touch-none grid-cols-3 grid-rows-3 gap-1.5 select-none">
      {WALK_KEYS.map((key, index) => (
        <button
          key={key.label}
          type="button"
          aria-label={key.label}
          style={{ gridColumn: key.col, gridRow: key.row }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            held.current.add(index);
            apply();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            held.current.delete(index);
            apply();
          }}
          onPointerCancel={() => {
            held.current.delete(index);
            apply();
          }}
          onLostPointerCapture={() => {
            held.current.delete(index);
            apply();
          }}
          onContextMenu={(event) => event.preventDefault()}
          className="pointer-events-auto flex h-12 w-12 touch-none items-center justify-center rounded-full border border-[#3a4a40] bg-black/55 text-[#d9cfa9] active:border-[#c9973f] active:bg-black/80"
        >
          <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d={key.d} />
          </svg>
        </button>
      ))}
    </div>
  );
}

