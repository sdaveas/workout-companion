import type { SessionRow } from './db';
import { getActiveSessionId, loadSession, readSnapshot, saveSession } from './sessions';
import type { WorkoutState, WorkoutStatus } from '../engine/types';

const ACTIVE: WorkoutStatus[] = ['ready', 'exercise_active', 'resting', 'paused', 'exercise_complete'];

export type Recovery =
  | { kind: 'none' }
  | { kind: 'restored'; row: SessionRow }
  | { kind: 'stale'; row: SessionRow }
  | { kind: 'corrupt'; rowId: string; reason: string };

const rowOf = (state: WorkoutState): SessionRow => ({
  id: state.sessionId,
  stateVersion: 1,
  programId: state.programId,
  programName: state.program?.name ?? 'Workout',
  status: state.status,
  startedAt: state.startedAt ?? state.updatedAt,
  finishedAt: state.finishedAt,
  state,
});

/**
 * Checks the shape the UI actually reads. A row that fails here is reported, never
 * deleted: keeping unreadable data beats losing a workout to a bad write.
 */
function problem(state: WorkoutState | null | undefined): string | null {
  if (!state) return 'the saved state is empty';
  const s = state;
  if (!s.program || !Array.isArray(s.program.exercises) || s.program.exercises.length === 0) {
    return 'program is missing';
  }
  if (!Array.isArray(s.exerciseRecords) || s.exerciseRecords.length !== s.program.exercises.length) {
    return 'exercise records do not match the program';
  }
  if (!ACTIVE.includes(s.status)) return `status ${s.status} is not resumable`;
  if (!s.exerciseRecords[s.currentExerciseIndex]) return 'current exercise is out of range';
  return null;
}

export async function recoverSession(): Promise<Recovery> {
  const [pointerId, snapshot] = [await getActiveSessionId(), readSnapshot()];
  const row = pointerId ? await loadSession(pointerId) : undefined;

  // The localStorage mirror is written synchronously on every transition, so it can be
  // ahead of the queued IndexedDB write. Newer wins; the session id must still match.
  const snapshotAhead =
    snapshot != null && ACTIVE.includes(snapshot.status) && snapshot.updatedAt > (row?.state.updatedAt ?? 0);

  if (snapshotAhead) {
    const reason = problem(snapshot);
    if (reason) return { kind: 'corrupt', rowId: snapshot.sessionId, reason };
    await saveSession(snapshot);
    return { kind: 'restored', row: rowOf(snapshot) };
  }

  if (!row) return { kind: 'none' };
  if (row.stateVersion !== 1) {
    return { kind: 'corrupt', rowId: row.id, reason: `unknown state version ${row.stateVersion}` };
  }
  if (row.state?.sessionId !== row.id) {
    return { kind: 'corrupt', rowId: row.id, reason: 'session id does not match the row' };
  }
  if (row.status === 'completed' || row.status === 'abandoned') return { kind: 'stale', row };

  const reason = problem(row.state);
  return reason ? { kind: 'corrupt', rowId: row.id, reason } : { kind: 'restored', row };
}
