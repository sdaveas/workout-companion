import { db, type SessionRow, type SettingRow } from './db';
import type { WorkoutState } from '../engine/types';

let queue: Promise<unknown> = Promise.resolve();

const SNAPSHOT = 'wc:activeSnapshot';

/**
 * Synchronous mirror of the live state. IndexedDB writes are async, so a tap
 * followed by an immediate reload/kill can outrun the queued write; this closes
 * that gap. Dexie stays the durable copy.
 */
export function writeSnapshot(state: WorkoutState): void {
  try {
    if (state.status === 'ready' || state.status === 'completed' || state.status === 'abandoned') {
      localStorage.removeItem(SNAPSHOT);
      return;
    }
    localStorage.setItem(SNAPSHOT, JSON.stringify(state));
  } catch {
    // Private mode or quota: the async write still runs.
  }
}

export function readSnapshot(): WorkoutState | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT);
    return raw ? (JSON.parse(raw) as WorkoutState) : null;
  } catch {
    return null;
  }
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * One transaction per write: the row and the active-session pointer can never
 * disagree. `ready` states are never persisted — START is the first write.
 */
export function saveSession(state: WorkoutState): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();

  return enqueue(async () => {
    const row: SessionRow = {
      id: state.sessionId,
      stateVersion: 1,
      programId: state.programId,
      programName: state.program.name,
      status: state.status,
      startedAt: state.startedAt ?? state.updatedAt,
      finishedAt: state.finishedAt,
      state,
    };

    await db.transaction('rw', db.sessions, db.settings, async () => {
      await db.sessions.put(row);
      if (state.status === 'completed' || state.status === 'abandoned') {
        await db.settings.delete('activeSessionId');
        writeSnapshot(state);
        if (state.status === 'completed') {
          await db.settings.put({ key: 'lastSessionId', value: row.id });
        }
      } else {
        await db.settings.put({ key: 'activeSessionId', value: row.id });
      }
    });
  });
}

export function loadSession(id: string): Promise<SessionRow | undefined> {
  return db.sessions.get(id);
}

/** Completed sessions, newest first. Abandoned rows are kept but never listed. */
export async function loadHistory(): Promise<SessionRow[]> {
  const rows = await db.sessions.where('status').equals('completed').toArray();
  return rows.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

/** Every stored session, including abandoned ones. Used by the backup export. */
export function loadAllSessions(): Promise<SessionRow[]> {
  return db.sessions.toArray();
}

export function countSessions(): Promise<number> {
  return db.sessions.count();
}

/**
 * Removes one stored session. Used from History when a row was a mistake (or a test run).
 * Pointers that named it are cleared too, so the app cannot resume a session that is gone.
 */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.settings, async () => {
    await db.sessions.delete(id);
    for (const key of ['activeSessionId', 'lastSessionId'] as const) {
      const row = await db.settings.get(key);
      if (row?.value === id) await db.settings.delete(key);
    }
  });
  if (readSnapshot()?.sessionId === id) {
    try {
      localStorage.removeItem(SNAPSHOT);
    } catch {
      // Private mode: nothing mirrored.
    }
  }
}

export async function getActiveSessionId(): Promise<string | null> {
  const row = await db.settings.get('activeSessionId');
  return row?.value ?? null;
}

export async function clearSetting(key: SettingRow['key']): Promise<void> {
  await db.settings.delete(key);
}
