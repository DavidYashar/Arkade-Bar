const segmentShapes = [
  [9, 2, 51, 2, 57, 8, 51, 14, 9, 14, 3, 8],
  [52, 17, 58, 11, 58, 53, 52, 59, 46, 53, 46, 23],
  [52, 65, 58, 71, 58, 113, 52, 107, 46, 101, 46, 71],
  [9, 110, 51, 110, 57, 116, 51, 122, 9, 122, 3, 116],
  [8, 65, 14, 71, 14, 101, 8, 107, 2, 113, 2, 71],
  [8, 17, 14, 23, 14, 53, 8, 59, 2, 53, 2, 11],
  [13, 56, 47, 56, 53, 62, 47, 68, 13, 68, 7, 62],
];
const digitMasks = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
export const lcdInk = "#2b240c";

export function drawLcdDigits(
  ctx: CanvasRenderingContext2D, value: number, y: number, slots: number, height: number,
  right = 884, activeInk = lcdInk,
) {
  const text = BigInt(Math.trunc(value)).toString();
  const count = Math.max(slots, text.length);
  const scale = Math.min(height / 124, 522 / (count * 72 - 12));
  const width = (count * 72 - 12) * scale;
  const left = right - width;
  ctx.save();
  ctx.translate(left, y + (height - 124 * scale) / 2);
  ctx.scale(scale, scale);
  for (const digit of text.padStart(count, " ")) {
    const mask = digit === " " ? 0 : digitMasks[Number(digit)]!;
    segmentShapes.forEach((points, index) => {
      ctx.fillStyle = mask & (1 << index) ? activeInk : "rgba(54, 41, 13, 0.12)";
      ctx.beginPath();
      ctx.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
      ctx.closePath();
      ctx.fill();
    });
    ctx.translate(72, 0);
  }
  ctx.restore();
  return left;
}

export function drawLcdBacklight(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const backlight = ctx.createLinearGradient(0, 0, width, height);
  backlight.addColorStop(0, "#977130");
  backlight.addColorStop(.27, "#d7ad57");
  backlight.addColorStop(.72, "#c49a4d");
  backlight.addColorStop(1, "#95713a");
  ctx.fillStyle = backlight;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(47, 32, 10, 0.065)";
  for (let y = 1; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  ctx.strokeStyle = "rgba(43, 31, 11, 0.48)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, width - 48, height - 48);
}
