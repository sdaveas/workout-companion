import type { Program, WorkoutState } from '../engine/types';
import { summarize } from '../engine/summary';
import { encodeProgram, encodePrograms, encodeSession, shareUrl } from './share';
import { sessionCard, sessionMessage, sessionShareLines } from './shareCard';

/**
 * A program shares as the bare link: a caption beside it looks right in a chat, but
 * "Copy" on the sheet then hands over the caption — the one thing that is not the link.
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
 * A link card in a chat is drawn by the chat app from the page's static meta tags — the
 * payload lives in the fragment, which no server ever sees. So the numbers ride in two
 * places the app controls: the share text, and a picture of the session drawn here.
 */
export async function shareSession(state: WorkoutState): Promise<string | null> {
  const summary = summarize(state, state.finishedAt ?? state.updatedAt);
  const lines = sessionShareLines(summary);
  const url = shareUrl(await encodeSession(state));
  const card = await sessionCard(lines);
  // The picture carries the numbers; the text would only repeat them. The link rides
  // along as the caption, because some apps drop a separate URL field beside a file.
  return card
    ? send(state.program.name, url, url, card)
    : send(state.program.name, url, sessionMessage(lines, url));
}

/** Share sheet when the phone has one; the clipboard when it does not (every desktop). */
async function send(
  title: string,
  url: string,
  text?: string,
  file?: File | null,
): Promise<string | null> {
  if (navigator.share) {
    const withFile =
      file != null &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });
    // `text` always carries the link too, so it rides alone: a URL field beside it
    // would post the link twice.
    const data: ShareData =
      text == null
        ? { title, url }
        : withFile && file
          ? { title, text, files: [file] }
          : { title, text };
    try {
      await navigator.share(data);
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(text ?? url);
  return `Link copied: ${title}.`;
}
