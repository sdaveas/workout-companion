import { db, type SessionRow, type SettingRow } from './db';
import type { WorkoutState } from '../engine/types';

let queue: Promise<unknown> = Promise.resolve();

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

export async function getActiveSessionId(): Promise<string | null> {
  const row = await db.settings.get('activeSessionId');
  return row?.value ?? null;
}

export async function clearSetting(key: SettingRow['key']): Promise<void> {
  await db.settings.delete(key);
}
