import { drawLcdBacklight, drawLcdDigits, lcdInk } from "@/arcade/lcd";

export const LCD_WIDTH = 960;
export const LCD_HEIGHT = 416;

export function drawPinballLcd(ctx: CanvasRenderingContext2D, score: number, chain: number, balls: number) {
  drawLcdBacklight(ctx, LCD_WIDTH, LCD_HEIGHT);
  ctx.fillStyle = "rgba(43, 31, 11, 0.43)";
  ctx.fillRect(58, 224, 844, 2);
  ctx.fillRect(485, 247, 2, 117);

  ctx.fillStyle = lcdInk;
  ctx.font = "bold 54px monospace";
  ctx.fillText("SCORE", 66, 153);
  ctx.font = "bold 43px monospace";
  ctx.fillText("CHAIN", 66, 328);
  ctx.fillText("BALLS", 533, 328);

  drawLcdDigits(ctx, score, 62, 8, 126);
  const chainLeft = drawLcdDigits(ctx, chain, 252, 1, 110, 433);
  drawLcdDigits(ctx, balls, 252, 1, 110, 884, balls <= 1 ? "#661f16" : lcdInk);
  const centerX = chainLeft - 31;
  const centerY = 307;
  ctx.strokeStyle = lcdInk;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(centerX - 13, centerY - 13);
  ctx.lineTo(centerX + 13, centerY + 13);
  ctx.moveTo(centerX - 13, centerY + 13);
  ctx.lineTo(centerX + 13, centerY - 13);
  ctx.stroke();
}
