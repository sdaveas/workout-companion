import type { Program, ProgramExercise } from '../engine/types';
import { encodeProgram, shareUrl } from './share';

/** Rows the message lists before it folds the rest into "and N more". */
export const MAX_ROWS = 8;

export function dose(exercise: ProgramExercise): string {
  const { min, max } = exercise.reps;
  return `${exercise.sets}×${min === max ? min : `${min}–${max}`}`;
}

/**
 * The workout, as the caption the receiver reads before tapping the link.
 *
 * Chat clients drop the URL whenever an image or file rides along, and leave the
 * receiver with a picture and nothing to import. So the link is the only payload,
 * and the summary travels as text beside it.
 */
export function shareMessage(program: Program, url: string): string {
  const rows = program.exercises.slice(0, MAX_ROWS).map((e) => `· ${e.name} ${dose(e)}`);
  const rest = program.exercises.length - rows.length;
  if (rest > 0) rows.push(`· and ${rest} more`);
  const count = `${program.exercises.length} exercise${program.exercises.length === 1 ? '' : 's'}`;
  return [`${program.name} — ${count}`, ...rows, '', url].join('\n');
}

/**
 * Hands a program link to the share sheet, or copies it when the phone has none
 * (every desktop browser). Returns the line to show the user when it went to the
 * clipboard; the share sheet is its own feedback, so that case returns null.
 */
export async function shareProgram(program: Program): Promise<string | null> {
  const url = shareUrl(await encodeProgram(program));
  const text = shareMessage(program, url);

  if (navigator.share) {
    try {
      await navigator.share({ title: program.name, text });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(url);
  return `Link for “${program.name}” copied.`;
}
