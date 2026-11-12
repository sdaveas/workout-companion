import { buildBackup } from './backup';
import { downloadJson } from './exportHistory';
import { importBackupFile } from './importFile';
import { getToken } from './drive/auth';
import { loadBackup, saveBackup } from './drive/files';
import { loadAllSessions } from '../storage/sessions';
import { usePrograms } from '../store/programsStore';

export interface Parts {
  programs: boolean;
  history: boolean;
}

export type Target = 'drive' | 'file';

/**
 * One name per subset, so saving programs never overwrites the file that holds
 * history. The subset the user picks is also the file that is read back.
 */
export function fileName(parts: Parts): string {
  if (parts.programs && parts.history) return 'workout-companion-backup.json';
  return parts.programs ? 'workout-programs.json' : 'workout-companion-history.json';
}

function counted(programs: number, sessions: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const bits = [
    programs > 0 ? plural(programs, 'program') : '',
    sessions > 0 ? plural(sessions, 'session') : '',
  ].filter(Boolean);
  return bits.length === 0 ? 'nothing' : bits.join(' and ');
}

/** Everything the user ticked, as one backup, to Drive or to a download. */
export async function exportParts(parts: Parts, target: Target, now: number): Promise<string> {
  const programs = parts.programs ? usePrograms.getState().programs : [];
  const sessions = parts.history ? await loadAllSessions() : [];
  const backup = buildBackup(programs, sessions, now);
  const name = fileName(parts);

  if (target === 'file') {
    downloadJson(name, backup);
    return `Exported ${counted(programs.length, sessions.length)} to ${name}.`;
  }

  await saveBackup(await getToken(), name, JSON.stringify(backup));
  return `Saved ${counted(programs.length, sessions.length)} to Google Drive.`;
}

/** A file the user picked, filtered to what they ticked. */
export function importParts(parts: Parts, file: File): Promise<string> {
  return importBackupFile(file, parts);
}

/** Null when Drive has no copy for this subset yet. */
export async function importFromDrive(parts: Parts): Promise<string | null> {
  const name = fileName(parts);
  const text = await loadBackup(await getToken(), name);
  if (text === null) return null;
  return importBackupFile(new File([text], name, { type: 'application/json' }), parts);
}
