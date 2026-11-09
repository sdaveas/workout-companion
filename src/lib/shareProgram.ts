import type { Program, ProgramExercise } from '../engine/types';
import { encodeProgram, shareUrl } from './share';
import { buildBackup } from './backup';

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

/**
 * One program travels as the compact link. Several travel as a backup file — the
 * same envelope Settings exports and the Import door reads, so a plan moves phone
 * to phone with no new format. Where files cannot be shared, the json is copied
 * and the paste box reads it just as well.
 */
export async function sharePrograms(programs: Program[]): Promise<string | null> {
  if (programs.length === 1) return shareProgram(programs[0]);

  const backup = buildBackup(programs, [], Date.now());
  const json = JSON.stringify(backup);
  const names = programs.map((p) => p.name).join(', ');
  const file = new File([json], 'workout-companion-programs.json', { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${programs.length} programs`, text: names });
      return null;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
    }
  }
  await navigator.clipboard.writeText(json);
  return `${programs.length} programs copied. Paste them into a chat, or into Import a program on the other phone.`;
}
