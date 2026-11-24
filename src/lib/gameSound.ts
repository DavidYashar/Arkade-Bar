/**
 * One decision about game sound, shared by every cabinet.
 *
 * The games each own their audio context, so the mute lives here and every engine
 * listens to it: flip the switch once and the table is silent, without leaving it.
 */

type MuteHandler = (muted: boolean) => void;

const KEY = 'imarket:game-muted';
const handlers = new Set<MuteHandler>();

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let muted = read();

export function isGameMuted(): boolean {
  return muted;
}

export function setGameMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // a private window can refuse storage; the switch still works for this visit
  }
  handlers.forEach((handler) => handler(next));
}

/** Registers an engine. It is told the current state immediately. */
export function onGameMute(handler: MuteHandler): () => void {
  handlers.add(handler);
  handler(muted);
  return () => {
    handlers.delete(handler);
  };
}
