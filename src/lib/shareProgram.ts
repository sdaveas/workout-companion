import type { Program } from '../engine/types';
import { encodeProgram, shareUrl } from './share';

/**
 * Hands a program link to the share sheet, or copies it when the phone has none
 * (every desktop browser). Returns the line to show the user when it went to the
 * clipboard; the share sheet is its own feedback, so that case returns null.
 */
export async function shareProgram(program: Program): Promise<string | null> {
  const url = shareUrl(await encodeProgram(program));
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
