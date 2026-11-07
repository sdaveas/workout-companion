import type { Program } from '../engine/types';
import { encodeProgram, shareUrl } from './share';
import { shareCard } from './shareCard';

/**
 * Hands a program link to the share sheet, or copies it when the phone has none
 * (every desktop browser). Returns the line to show the user when it went to the
 * clipboard; the share sheet is its own feedback, so that case returns null.
 *
 * The link is what the receiver imports, so it always goes along; where the
 * platform allows it, the same call carries an image of the real workout.
 */
export async function shareProgram(program: Program): Promise<string | null> {
  const url = shareUrl(await encodeProgram(program));
  const card = await shareCard(program);

  if (card && navigator.canShare?.({ files: [card] })) {
    try {
      await navigator.share({ files: [card], text: url, title: program.name });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: program.name, url });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(url);
  return `Link for “${program.name}” copied.`;
}
