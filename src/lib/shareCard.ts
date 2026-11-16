import type { SessionSummary } from '../engine/summary';
import { formatDate, formatDuration } from './format';

/**
 * A finished workout as a picture. Chat apps draw the link card from static meta tags
 * (the payload is in the fragment, which no server sees), so the only way to show the
 * real exercises is to send the picture itself.
 */
export interface ShareLines {
  title: string;
  dateLabel: string;
  stats: string;
  rows: { name: string; detail: string }[];
}

const INK = '#0b0b0d';
const ACCENT = '#d7ff3f';
const MUTED = '#8b8f98';
const TEXT = '#f2f3f5';
const LINE = '#26282e';
const W = 1200;
const M = 72;
const FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ROW_H = 58;

/** The same numbers the Summary screen shows, in the order the workout was done. */
export function sessionShareLines(summary: SessionSummary): ShareLines {
  const rows = summary.exercises.map((ex) => ({
    name: ex.name,
    detail: ex.skipped
      ? 'not done'
      : ex.sets
          .map((s) =>
            s.completed
              ? `${s.actualReps ?? 0}${s.actualWeightKg ? `×${s.actualWeightKg}` : ''}`
              : s.skipped
                ? 'skip'
                : '—',
          )
          .join('  '),
  }));

  const stats = [
    formatDuration(summary.durationMs),
    `${summary.setsCompleted} sets`,
    summary.volumeKg > 0 ? `${Math.round(summary.volumeKg).toLocaleString()} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title: summary.programName,
    dateLabel: formatDate(summary.finishedAt),
    stats,
    rows,
  };
}

/** The message body: the numbers, then the link. Telegram caps a photo caption at 1024. */
export function sessionMessage(lines: ShareLines, url: string): string {
  const head = `${lines.title} · ${lines.dateLabel} · ${lines.stats}`;
  const body: string[] = [];
  for (const row of lines.rows) {
    const next = `${row.name}  ${row.detail}`;
    if ([head, ...body, next, url].join('\n').length > 950) {
      body.push(`+${lines.rows.length - body.length} more`);
      break;
    }
    body.push(next);
  }
  return [head, ...body, url].join('\n');
}

/** The card, or `null` where there is no canvas (the share sheet then gets text only). */
export async function sessionCard(lines: ShareLines): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;

  measure.font = `700 58px ${FAMILY}`;
  const titleLines = wrap(measure, lines.title, W - M * 2, 2);
  const header = 196 + titleLines.length * 66 + 46;
  const height = Math.max(630, header + 44 + lines.rows.length * ROW_H + 24);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  draw(g, lines, titleLines, header, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new File([blob], 'workout.png', { type: 'image/png' }) : null;
}

function draw(
  g: CanvasRenderingContext2D,
  lines: ShareLines,
  titleLines: string[],
  header: number,
  height: number,
) {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, height);
  const glow = g.createRadialGradient(W, 0, 0, W, 0, 640);
  glow.addColorStop(0, 'rgba(215,255,63,0.10)');
  glow.addColorStop(1, 'rgba(215,255,63,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, height);

  g.fillStyle = ACCENT;
  g.font = `600 20px ${FAMILY}`;
  g.fillText(`WORKOUT · ${lines.dateLabel.toUpperCase()}`, M, 92);

  g.fillStyle = TEXT;
  g.font = `700 58px ${FAMILY}`;
  let y = 172;
  for (const line of titleLines) {
    g.fillText(line, M, y);
    y += 66;
  }

  g.fillStyle = MUTED;
  g.font = `400 27px ${FAMILY}`;
  g.fillText(lines.stats, M, y + 6);

  g.strokeStyle = LINE;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(M, header - 4);
  g.lineTo(W - M, header - 4);
  g.stroke();

  let rowY = header + 40;
  for (const row of lines.rows) {
    g.fillStyle = TEXT;
    g.font = `500 27px ${FAMILY}`;
    g.fillText(clip(g, row.name, (W - M * 2) * 0.44), M, rowY);

    g.fillStyle = MUTED;
    g.font = `400 25px ${FAMILY}`;
    const detail = clip(g, row.detail, (W - M * 2) * 0.54);
    g.fillText(detail, W - M - g.measureText(detail).width, rowY);

    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(M, rowY + 20);
    g.lineTo(W - M, rowY + 20);
    g.stroke();
    rowY += ROW_H;
  }
}

function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Too long for the card: keep the last allowed line and cut it with an ellipsis.
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clip(g, `${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth);
  return kept;
}

function clip(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (g.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && g.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
