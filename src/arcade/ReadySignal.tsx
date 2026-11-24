import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/** Give the mounted scene two draws before revealing it on the third tick. */
export function ReadySignal({ enabled = true, onReady }: { enabled?: boolean; onReady?: () => void }) {
  const frames = useRef(0);

  useFrame(() => {
    if (!enabled || !onReady || frames.current >= 3) return;
    if (++frames.current === 3) onReady();
  });

  return null;
}
