import type { Program, ProgramExercise } from '../engine/types';
import { encodeProgram, encodePrograms, shareUrl } from './share';
import { exerciseCount } from './format';

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

/** Several programs, as the caption above one link. */
export function shareManyMessage(programs: Program[], url: string): string {
  const rows = programs.map((p) => `· ${p.name} — ${exerciseCount(p.exercises.length)}`);
  return [`${programs.length} programs`, ...rows, '', url].join('\n');
}

/**
 * One program travels as the compact link it always did. Several travel as one
 * link in the same wire form, so the receiver still taps once and still gets a
 * picture of what is inside before adding anything.
 */
export async function sharePrograms(programs: Program[]): Promise<string | null> {
  if (programs.length === 1) return shareProgram(programs[0]);

  const url = shareUrl(await encodePrograms(programs));
  const text = shareManyMessage(programs, url);

  if (navigator.share) {
    try {
      await navigator.share({ title: `${programs.length} programs`, text });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(url);
  return `${programs.length} programs copied as one link.`;
}
