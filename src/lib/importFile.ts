import { parseBackup } from './backup';
import { mergeBackup } from '../storage/backup';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';

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
  return `Imported ${counts.programs} program${counts.programs === 1 ? '' : 's'} and ${
    counts.sessions
  } session${counts.sessions === 1 ? '' : 's'}.`;
}
