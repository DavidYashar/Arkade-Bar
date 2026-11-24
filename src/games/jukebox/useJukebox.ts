import { useCallback, useEffect, useRef, useState } from 'react';
import { DOOR_AT, JUKEBOX_AT } from '@/arcade/colliders';
import { JUKEBOX_TRACKS } from './tracks';

type AudioRig = {
  context: AudioContext;
  media: HTMLAudioElement;
  direct: GainNode;
  outside: GainNode;
  filter: BiquadFilterNode;
  /** What the room's projection reads: the live spectrum of whatever is playing. */
  analyser: AnalyserNode;
};

function makePanner(context: AudioContext, x: number, y: number, z: number) {
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  // Wide reference distance and a lazy rolloff: the far corner of the room still
  // hears the track, it only sits further back.
  panner.refDistance = 2.4;
  panner.rolloffFactor = .3;
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;
  return panner;
}

function makeAudioRig() {
  const context = new AudioContext();
  const media = new Audio();
  const source = context.createMediaElementSource(media);
  const direct = context.createGain();
  direct.gain.value = 0;
  const inside = makePanner(context, JUKEBOX_AT[0] - .58, .83, JUKEBOX_AT[1]);
  const outside = context.createGain();
  outside.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = .15;
  const door = makePanner(context, DOOR_AT[0], 1.25, DOOR_AT[1]);

  // One tap, two paths: the analyser passes audio through untouched and hands the
  // spectrum to the projection on the wall.
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = .55;
  source.connect(analyser);
  analyser.connect(direct).connect(inside).connect(context.destination);
  analyser.connect(filter).connect(outside).connect(door).connect(context.destination);
  return { context, media, direct, outside, filter, analyser };
}

export function useJukebox() {
  const rig = useRef<AudioRig | null>(null);
  const request = useRef(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [lastPlayed, setLastPlayed] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => () => {
    request.current++;
    const audio = rig.current;
    if (!audio) return;
    rig.current = null;
    audio.media.onended = null;
    audio.media.onerror = null;
    audio.media.pause();
    audio.media.removeAttribute('src');
    audio.media.load();
    void audio.context.close();
  }, []);

  /** The shuffle the bar plays through, and where in it we are. */
  const order = useRef<number[]>([]);
  const cursor = useRef(0);
  const playingRef = useRef<number | null>(null);
  /** Removes the first-gesture retry, once music is actually playing. */
  const retryOff = useRef<(() => void) | null>(null);
  const selectedRef = useRef<number | null>(null);
  playingRef.current = playing;
  selectedRef.current = selected;

  if (order.current.length === 0) {
    const slots = JUKEBOX_TRACKS.map((track, slot) => (track ? slot : -1)).filter((slot) => slot >= 0);
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
    order.current = slots;
    cursor.current = 0;
  }

  const playSlot = useCallback(async (slot: number, quiet = false) => {
    const track = JUKEBOX_TRACKS[slot];
    if (!track) return;
    const id = ++request.current;
    setSelected(slot);
    setPlaying(null);
    setError(false);
    const fail = () => {
      if (id !== request.current) return;
      setSelected(null);
      setPlaying(null);
      // A refused autoplay is not an error the player should see: the first click retries.
      if (!quiet) setError(true);
    };
    try {
      const { context, media } = rig.current ??= makeAudioRig();
      media.pause();
      media.onended = () => {
        if (id !== request.current) return;
        // One at a time, straight through the shuffle.
        const list = order.current;
        cursor.current = (cursor.current + 1) % Math.max(1, list.length);
        const next = list[cursor.current];
        if (next !== undefined) void playSlot(next);
        else {
          setSelected(null);
          setPlaying(null);
        }
      };
      media.onerror = fail;
      media.onplaying = () => {
        if (id !== request.current) return;
        setLastPlayed(slot);
        setPlaying(slot);
        retryOff.current?.();
        retryOff.current = null;
      };
      media.src = track.url;
      // The element may run before the context is allowed to: resume in the background
      // and let the play promise decide whether a track is actually on.
      if (context.state !== 'running') void context.resume().catch(() => {});
      await media.play();
    } catch {
      fail();
    }
  }, []);

  /** A button plays its track, and the same button again stops the music. */
  const select = useCallback((slot: number) => {
    if (selectedRef.current === slot) {
      request.current++;
      const audio = rig.current;
      if (audio) {
        audio.media.pause();
        audio.media.currentTime = 0;
      }
      setSelected(null);
      setPlaying(null);
      return;
    }
    const at = order.current.indexOf(slot);
    if (at >= 0) cursor.current = at;
    void playSlot(slot);
  }, [playSlot]);

  // The bar opens with music already playing, starting at a random point in the
  // shuffle. Browsers refuse that until the first gesture, so the refusal is silent
  // and the first click or key press picks it back up.
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current || order.current.length === 0) return;
    armed.current = true;
    const first = order.current[cursor.current]!;
    const off = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    function onGesture() {
      off();
      retryOff.current = null;
      // A click that stops or changes the music must not also restart it.
      if (playingRef.current === null && selectedRef.current === null) void playSlot(first);
    }
    retryOff.current = off;
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    void playSlot(first, true);
    return off;
  }, [playSlot]);

  useEffect(() => {
    const resume = () => {
      const audio = rig.current;
      if (audio && audio.context.state !== 'running') void audio.context.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  const updateListener = useCallback((x: number, y: number, z: number, fx: number, fy: number, fz: number, doorOpen: boolean) => {
    if (!rig.current) return;
    const { context, direct, outside, filter } = rig.current;
    const listener = context.listener;
    listener.positionX.value = x;
    listener.positionY.value = y;
    listener.positionZ.value = z;
    listener.forwardX.value = fx;
    listener.forwardY.value = fy;
    listener.forwardZ.value = fz;
    // Crossfade wider than the doorway, so the change is a walk rather than a switch.
    const edge = Math.max(0, Math.min(1, (z - DOOR_AT[1] + 1.15) / 2.3));
    const exterior = edge * edge * (3 - 2 * edge);
    const now = context.currentTime;
    direct.gain.setTargetAtTime(.95 * (1 - exterior), now, .12);
    // Outside is quieter, not gone: the bar leaks into the street.
    outside.gain.setTargetAtTime((doorOpen ? .34 : .16) * exterior, now, .2);
    filter.frequency.setTargetAtTime(doorOpen ? 2200 : 420, now, .18);
  }, []);

  /** Null until something has played: there is no spectrum before a track starts. */
  const getAnalyser = useCallback(() => rig.current?.analyser ?? null, []);

  return { selected, playing, lastPlayed, error, select, updateListener, getAnalyser };
}
