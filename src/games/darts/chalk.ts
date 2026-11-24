/**
 * The chalk, written on a slate. Two shapes of the same board: the tall one that
 * hangs beside the dartboard in the bar, and a strip for a phone held in the hand.
 */

export type ChalkRow = { index: number; value: number | null };

const CHALK = '#e9f2e9';
const CHALK_DIM = 'rgba(233,242,233,0.62)';
const CHALK_LINE = 'rgba(233,242,233,0.28)';
const GOLD = '#ffe08a';
const FACE = '#171a18';
const FONT = '"Segoe Print", "Comic Sans MS", cursive';

function slate(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = FACE;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  const rows = Math.ceil(height / 60);
  for (let i = 0; i < rows; i += 1) {
    ctx.beginPath();
    ctx.moveTo(8, 60 * i + 40);
    ctx.lineTo(width - 8, 60 * i + 44 + Math.sin(i) * 4);
    ctx.stroke();
  }
}

/** The wall board: rounds listed down the slate, with a total at the foot. */
export function paintChalkTall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rows: ChalkRow[],
  round: number,
  writing: number,
) {
  slate(ctx, width, height);

  ctx.fillStyle = CHALK;
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText('ROUNDS', 30, 64);
  ctx.font = `22px ${FONT}`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText('of three darts', 30, 96);
  ctx.strokeStyle = CHALK_LINE;
  ctx.beginPath();
  ctx.moveTo(28, 116);
  ctx.lineTo(width - 28, 116);
  ctx.stroke();

  let total = 0;
  rows.forEach((row, i) => {
    const y = 178 + i * 78;
    const active = row.index === round;
    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = active ? GOLD : CHALK_DIM;
    ctx.fillText(`ROUND ${row.index + 1}`, 30, y);
    if (row.value !== null) {
      total += row.value;
      const progress = active ? writing : 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(210, y - 42, 220 * progress, 56);
      ctx.clip();
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillStyle = '#f4f8ef';
      ctx.fillText(String(row.value), 226 + Math.sin(i * 3) * 2, y + 4);
      ctx.restore();
    }
  });

  if (rows.every((row) => row.value !== null)) {
    ctx.strokeStyle = CHALK_LINE;
    ctx.beginPath();
    ctx.moveTo(28, height - 94);
    ctx.lineTo(width - 28, height - 94);
    ctx.stroke();
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText('TOTAL', 30, height - 40);
    ctx.fillText(String(total), width * 0.65, height - 40);
  }
}

/**
 * The phone strip: rounds side by side, the round in play ringed in chalk and its
 * score written in as the darts land.
 */
export function paintChalkStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rows: ChalkRow[],
  round: number,
  writing: number,
) {
  slate(ctx, width, height);

  ctx.fillStyle = CHALK;
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText('ROUNDS', 22, 52);

  // The running total lives under the title, with its number under it.
  ctx.font = `19px ${FONT}`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText('TOTAL', 22, 92);
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(String(rows.reduce((sum, row) => sum + (row.value ?? 0), 0)), 22, 146);

  ctx.strokeStyle = CHALK_LINE;
  ctx.beginPath();
  ctx.moveTo(186, 24);
  ctx.lineTo(186, height - 24);
  ctx.stroke();

  const left = 206;
  const cell = (width - left - 16) / rows.length;
  rows.forEach((row, i) => {
    const x = left + i * cell;
    const active = row.index === round;
    if (active) {
      ctx.strokeStyle = 'rgba(255,224,138,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + 4, 26, cell - 16, height - 52, 6);
      ctx.stroke();
    }
    ctx.fillStyle = active ? GOLD : CHALK_DIM;
    ctx.font = `19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`R${row.index + 1}`, x + cell / 2 - 4, 62);

    if (row.value !== null) {
      const progress = active ? writing : 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, 78, (cell - 12) * progress, height - 86);
      ctx.clip();
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillStyle = '#f4f8ef';
      ctx.fillText(String(row.value), x + cell / 2 - 4, height - 40);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  });
}
