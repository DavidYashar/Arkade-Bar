export type BoatWake = {
  x: number;
  y: number;
  aftX: number;
  aftY: number;
  width: number;
  length: number;
  bowLead: number;
  frame: number;
  opacity: number;
};

export const WAKE_ATLAS_PATH = '/textures/narrows-boat-foam.png';
export const WAKE_FRAMES = 12;
export const WAKE_COLUMNS = 4;

export function boatWake(x: number, y: number, scale: number, direction: number,
  speed: number, time: number, turn = 0): BoatWake {
  const rate = .62 + speed * .30;
  return {
    x, y, aftX: -Math.sin(turn) * direction, aftY: Math.cos(turn) * direction,
    width: (111 + speed * 42) * scale,
    length: (116 + speed * 44) * scale,
    bowLead: 20 * scale,
    frame: (time * rate % 1) * WAKE_FRAMES,
    opacity: Math.min(.97, .73 + speed * .22),
  };
}

let foamAtlas: HTMLImageElement | undefined;

export function drawCanvasWakes(ctx: CanvasRenderingContext2D, wakes: readonly BoatWake[]) {
  if (!wakes.length) return;
  if (!foamAtlas) {
    foamAtlas = new Image();
    foamAtlas.src = WAKE_ATLAS_PATH;
  }
  if (!foamAtlas.complete || !foamAtlas.naturalWidth) return;
  const tile = foamAtlas.naturalWidth / WAKE_COLUMNS;
  for (const wake of wakes) {
    const frame = Math.floor(wake.frame);
    ctx.save();
    ctx.transform(wake.aftY, -wake.aftX, wake.aftX, wake.aftY, wake.x, wake.y);
    ctx.globalAlpha *= wake.opacity;
    ctx.drawImage(foamAtlas, (frame % WAKE_COLUMNS) * tile, Math.floor(frame / WAKE_COLUMNS) * tile,
      tile, tile, -wake.width / 2, -wake.bowLead, wake.width, wake.length);
    ctx.restore();
  }
}
