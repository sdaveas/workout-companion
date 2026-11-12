import { parseBackup } from './backup';
import { mergeBackup } from '../storage/backup';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { scheduleSync } from './drive/sync';

/**
 * Merge a file the user picked — a whole backup or a single program — and say what
 * landed. Throws a message that is fit to show as-is.
 */
export async function importBackupFile(file: File): Promise<string> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) throw new Error(parsed.error);
  const counts = await mergeBackup(parsed.programs, parsed.sessions);
  await usePrograms.getState().load();
  await useSession.getState().loadHistory();
  scheduleSync();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // A single program file carries no sessions; "and 0 sessions" only reads as a loss.
  return counts.sessions === 0
    ? `Imported ${plural(counts.programs, 'program')}.`
    : `Imported ${plural(counts.programs, 'program')} and ${plural(counts.sessions, 'session')}.`;
}
