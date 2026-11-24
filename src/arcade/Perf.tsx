import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** Latest reading, written from inside the canvas and read by the overlay outside. */
const sample = { fps: 0, ms: 0, calls: 0, tris: 0, dpr: 0 };

/**
 * Drives a canvas that renders on demand at a fixed rate. A walking scene at 30
 * looks the same as 60 on a phone and costs half the GPU.
 */
export function FrameCap({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / fps) return;
      last = now;
      invalidate();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, invalidate]);
  return null;
}

/** Collects frame cost from the renderer. Mounted only when ?perf is present. */
export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const since = useRef(performance.now());

  useFrame((_, delta) => {
    frames.current += 1;
    const now = performance.now();
    if (now - since.current < 500) return;
    sample.fps = Math.round((frames.current * 1000) / (now - since.current));
    sample.ms = Math.round(delta * 1000);
    sample.calls = gl.info.render.calls;
    sample.tris = gl.info.render.triangles;
    sample.dpr = Math.round(gl.getPixelRatio() * 100) / 100;
    frames.current = 0;
    since.current = now;
  });

  return null;
}

/** The readout itself: frames, cost, draw calls and triangles. */
export function PerfOverlay({ enabled }: { enabled: boolean }) {
  const [text, setText] = useState('measuring');

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setText(
        `${sample.fps} fps · ${sample.ms} ms · ${sample.calls} calls · ${Math.round(sample.tris / 1000)}k tris · ${sample.dpr}x`,
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-50 rounded-sm bg-black/75 px-2 py-1 font-mono text-[10px] text-[#9fe0b0]">
      {text}
    </div>
  );
}
