import { buildBackup, mergeNewest, parseBackup, parseRemote, type Backup } from '../backup';
import { now } from '../../engine/ids';
import { listPrograms } from '../../storage/programs';
import { loadAllSessions } from '../../storage/sessions';
import { mergeBackup } from '../../storage/backup';
import { readState, requestToken, writeState } from './auth';
import { Conflict, createFile, download, locate, updateFile } from './files';

/**
 * Drive is a replica of IndexedDB, never the store. A sync pulls, merges by id,
 * writes the merged result locally, then pushes the merged whole.
 */

export type SyncResult =
  | { status: 'not-connected' | 'offline' | 'ok'; pulled: boolean }
  | { status: 'failed'; pulled: false; error: string };

/** `exportedAt` is stamped on every build, so comparing raw text would never match. */
function sameIgnoringStamp(a: Backup, b: Backup): boolean {
  return JSON.stringify({ ...a, exportedAt: 0 }) === JSON.stringify({ ...b, exportedAt: 0 });
}

async function persist(merged: Backup): Promise<void> {
  // Round trip through the same validator the importer uses: a merge that cannot
  // be read back must never reach IndexedDB.
  const parsed = parseBackup(JSON.stringify(merged));
  if (!parsed.ok) throw new Error(parsed.error);

  // The stamp lives on the envelope, so it is re-attached on the way in.
  const rows = parsed.programs.map((program) => ({
    ...program,
    updatedAt: merged.programUpdatedAt?.[program.id],
  }));
  await mergeBackup(rows, parsed.sessions);

  const [{ usePrograms }, { useSession }] = await Promise.all([
    import('../../store/programsStore'),
    import('../../store/sessionStore'),
  ]);
  await Promise.all([usePrograms.getState().load(), useSession.getState().loadHistory()]);
}

async function pass(): Promise<{ pulled: boolean }> {
  const token = await requestToken({ silent: true });
  const { folderId, fileId, revisionId } = await locate(token);

  let remote: Backup | null = null;
  if (fileId) {
    const parsed = parseRemote(await download(token, fileId));
    // A file this app cannot read is never overwritten: that is how data is lost.
    if (!parsed.ok) throw new Error(`Left the Drive copy alone: ${parsed.error}`);
    remote = parsed.backup;
  }

  const local = buildBackup(await listPrograms(), await loadAllSessions(), now());
  const merged = remote ? mergeNewest(local, remote) : local;

  if (!remote || !sameIgnoringStamp(merged, remote)) {
    const body = JSON.stringify(merged);
    if (fileId) await updateFile(token, fileId, revisionId ?? '', body);
    else await createFile(token, folderId, body);
  }

  const pulled = !sameIgnoringStamp(merged, local);
  if (pulled) await persist(merged);
  return { pulled };
}

async function runOnce(): Promise<SyncResult> {
  if (!readState().connected) return { status: 'not-connected', pulled: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', pulled: false };
  }

  try {
    let pulled: boolean;
    try {
      pulled = (await pass()).pulled;
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
      // The file moved under us. A blind re-upload would drop the other device's
      // rows, so the answer is a whole second pass.
      pulled = (await pass()).pulled;
    }
    writeState({ ...readState(), lastSyncedAt: now(), lastError: null });
    return { status: 'ok', pulled };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    writeState({ ...readState(), lastError: error });
    return { status: 'failed', pulled: false, error };
  }
}

let inFlight: Promise<SyncResult> | null = null;
let again = false;

/** One sync at a time; a trigger that arrives mid-sync schedules exactly one more pass. */
export function sync(): Promise<SyncResult> {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      let result: SyncResult = { status: 'ok', pulled: false };
      let rounds = 0;
      do {
        again = false;
        result = await runOnce();
        rounds += 1;
      } while (again && rounds < 3);
      return result;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced trigger for after a session write: many writes, one sync. */
export function scheduleSync(delayMs = 2000): void {
  if (!readState().connected) return;
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sync();
  }, delayMs);
}
