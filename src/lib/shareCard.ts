import type { Program, ProgramExercise } from '../engine/types';
import { formatClock } from './format';

/**
 * A workout drawn as an image, so the share sheet can hand the receiver a card
 * that matches the program being sent.
 *
 * The site's own `og.jpg` cannot do this: chat clients fetch it from a URL, never
 * run the app, and the program only exists after the `#`. So the card is rendered
 * here, at share time, from the program itself.
 */

const W = 1200;
const H = 630;
const INK = '#0b0b0d';
const SURFACE = '#15161a';
const LINE = '#26282e';
const MUTED = '#8b8f98';
const ACCENT = '#d7ff3f';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Rows the card lists before it folds the rest into "and N more". */
export const MAX_ROWS = 8;

export function dose(exercise: ProgramExercise): string {
  const { min, max } = exercise.reps;
  const reps = min === max ? `${min}` : `${min}–${max}`;
  return `${exercise.sets} × ${reps}${exercise.perHand ? ' / hand' : ''}`;
}

/** The lines the card prints, in program order. */
export function cardRows(program: Program): { name: string; dose: string; rest: string }[] {
  return program.exercises.slice(0, MAX_ROWS).map((e) => ({
    name: e.name,
    dose: dose(e),
    rest: formatClock(e.restSeconds * 1000).replace(/^0/, ''),
  }));
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  // ponytail: roundRect is Safari 16+; the fallback corners are square, not broken.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

export function drawCard(ctx: CanvasRenderingContext2D, program: Program) {
  const rows = cardRows(program);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // soft accent glow, same as the static card
  const glow = ctx.createRadialGradient(W - 120, 60, 0, W - 120, 60, 420);
  glow.addColorStop(0, 'rgba(215,255,63,0.10)');
  glow.addColorStop(1, 'rgba(215,255,63,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(W / 2, 0, W / 2, H);

  // left: the name
  ctx.fillStyle = ACCENT;
  ctx.font = `600 20px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillText('WORKOUT', 72, 150);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 68px ${FONT}`;
  const lines = wrap(ctx, program.name, 430, 2);
  lines.forEach((line, i) => ctx.fillText(line, 72, 232 + i * 76));

  ctx.fillStyle = MUTED;
  ctx.font = `400 25px ${FONT}`;
  const count = `${program.exercises.length} exercise${program.exercises.length === 1 ? '' : 's'}`;
  const minutes = program.estimatedDurationMinutes ? ` · ${program.estimatedDurationMinutes} min` : '';
  ctx.fillText(`${count}${minutes}`, 72, 232 + lines.length * 76 + 18);

  // right: the exercise list
  const cardW = 520;
  const cardX = W - cardW - 72;
  const pad = 30;
  const rowH = 52;
  const cardH = pad * 2 + 56 + rows.length * rowH + (program.exercises.length > rows.length ? 34 : 0);
  const cardY = (H - cardH) / 2;

  ctx.fillStyle = SURFACE;
  rounded(ctx, cardX, cardY, cardW, cardH, 26);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = ACCENT;
  ctx.font = `600 15px ${FONT}`;
  ctx.letterSpacing = '3.5px';
  ctx.fillText('SET BY SET', cardX + pad, cardY + pad + 12);
  ctx.letterSpacing = '0px';

  rows.forEach((row, i) => {
    const y = cardY + pad + 56 + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(cardX + pad, y - 14);
      ctx.lineTo(cardX + cardW - pad, y - 14);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `400 21px ${FONT}`;
    const name = wrap(ctx, row.name, cardW - pad * 2 - 210, 1)[0] ?? row.name;
    ctx.fillText(name, cardX + pad, y + 6);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8e9ec';
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText(row.dose, cardX + cardW - pad - 78, y + 6);
    ctx.fillStyle = MUTED;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText(row.rest, cardX + cardW - pad, y + 6);
    ctx.textAlign = 'left';
  });

  if (program.exercises.length > rows.length) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 17px ${FONT}`;
    ctx.fillText(`and ${program.exercises.length - rows.length} more`, cardX + pad, cardY + cardH - pad + 4);
  }
}

/**
 * The card as a PNG. Null when the browser cannot draw it — the caller then falls
 * back to sending the bare link.
 */
export async function shareCard(program: Program): Promise<File | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawCard(ctx, program);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const safe = program.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'workout';
  return new File([blob], `${safe}.png`, { type: 'image/png' });
}
