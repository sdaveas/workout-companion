import type { Program, WorkoutState } from '../engine/types';
import { summarize } from '../engine/summary';
import { formatDuration } from './format';
import { encodeProgram, encodePrograms, encodeSession, shareUrl } from './share';

/**
 * The share sheet and the clipboard get the link and nothing else. A caption beside
 * it looks right in a chat, but "Copy" on the sheet then hands over the caption —
 * the one thing that is not the link.
 */
export async function shareProgram(program: Program): Promise<string | null> {
  return send(program.name, shareUrl(await encodeProgram(program)));
}

/**
 * One program travels as the compact link it always did. Several travel as one
 * link in the same wire form, so the receiver still taps once and still gets a
 * picture of what is inside before adding anything.
 */
export async function sharePrograms(programs: Program[]): Promise<string | null> {
  if (programs.length === 1) return shareProgram(programs[0]);
  return send(`${programs.length} programs`, shareUrl(await encodePrograms(programs)));
}

/**
 * A finished workout: the same link, plus the numbers that were actually logged. The
 * receiver still imports the plan; the numbers are a report they can read and copy.
 *
 * The numbers also ride in the share sheet's text, because the link card in a chat is
 * drawn by the chat app from the page's static meta tags — the payload lives in the
 * fragment, which no server ever sees. Clipboard still gets the bare link.
 */
export async function shareSession(state: WorkoutState): Promise<string | null> {
  const summary = summarize(state, state.finishedAt ?? state.updatedAt);
  const line = [
    state.program.name,
    formatDuration(summary.durationMs),
    `${summary.setsCompleted} sets`,
    summary.volumeKg > 0 ? `${Math.round(summary.volumeKg)} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return send(state.program.name, shareUrl(await encodeSession(state)), line);
}

/** Share sheet when the phone has one; the clipboard when it does not (every desktop). */
async function send(title: string, url: string, text?: string): Promise<string | null> {
  if (navigator.share) {
    try {
      await navigator.share(text ? { title, text, url } : { title, url });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(url);
  return `Link copied: ${title}.`;
}
