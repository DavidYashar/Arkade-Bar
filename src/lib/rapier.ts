import RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<void> | null = null;

/**
 * Rapier's wasm may only be initialised once. Two tables initialise it, and in
 * development React runs each mount twice, so the work is shared and memoised here.
 */
export function prepareRapier(): Promise<void> {
  ready ??= RAPIER.init().then(() => undefined);
  return ready;
}
