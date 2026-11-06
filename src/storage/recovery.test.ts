import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Program, WorkoutState } from '../engine/types';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import { remainingMs } from '../engine/rest';
import { db, type SessionRow } from './db';
import { recoverSession } from './recovery';
import { saveSession } from './sessions';

const program: Program = {
  id: 'p',
  name: 'P',
  description: null,
  scheduleDay: null,
  estimatedDurationMinutes: null,
  raw: '{}',
  exercises: [
    {
      id: 'e1',
      name: 'Squat',
      sets: 2,
      reps: { min: 5, max: 5 },
      weightKg: 20,
      perHand: false,
      restSeconds: 90,
      instructions: [],
      commonMistakes: [],
      equipment: [],
      muscleGroups: [],
      imageUrl: null,
    },
  ],
};

const started = (now: number): WorkoutState =>
  reduce(createSession(program, now, 's1'), { type: 'START', now });

const setDone = (s: WorkoutState, now: number): WorkoutState =>
  reduce(s, { type: 'COMPLETE_SET', now, reps: 5, weightKg: 20 });

const rowOf = (state: WorkoutState): SessionRow => ({
  id: state.sessionId,
  stateVersion: 1,
  programId: state.programId,
  programName: state.program.name,
  status: state.status,
  startedAt: state.startedAt ?? 0,
  finishedAt: state.finishedAt,
  state,
});

describe('session recovery', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    await db.settings.clear();
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    } as Storage;
  });

  it('restores a session interrupted mid-rest, with the clock still running', async () => {
    await saveSession(setDone(started(1_000), 2_000));

    const found = await recoverSession();
    expect(found.kind).toBe('restored');
    if (found.kind !== 'restored') return;

    expect(found.row.state.status).toBe('resting');
    expect(remainingMs(found.row.state, 2_000)).toBe(90_000);
    expect(remainingMs(found.row.state, 32_000)).toBe(60_000);
    expect(remainingMs(found.row.state, 200_000)).toBe(0);
  });

  it('reports a corrupt row and keeps it in storage', async () => {
    const state = started(1_000);
    await saveSession(state);
    const broken = { ...rowOf(state), state: { ...state, program: null } } as unknown as SessionRow;
    await db.sessions.put(broken);

    const found = await recoverSession();
    expect(found).toMatchObject({ kind: 'corrupt', rowId: 's1', reason: 'program is missing' });
    expect(await db.sessions.get('s1')).toBeDefined();
  });

  it('treats a stale pointer to a finished session as nothing to resume', async () => {
    const finished = reduce(setDone(started(1_000), 2_000), { type: 'FINISH', now: 4_000 });
    await saveSession(finished);
    await db.settings.put({ key: 'activeSessionId', value: 's1' });

    const found = await recoverSession();
    expect(found.kind).toBe('stale');
    expect((await db.sessions.get('s1'))?.status).toBe('completed');
  });

  it('returns none without a pointer', async () => {
    expect((await recoverSession()).kind).toBe('none');
  });

  it('prefers the newer local mirror when the IndexedDB write lagged', async () => {
    const resting = setDone(started(1_000), 2_000);
    await saveSession(resting);
    const newer = reduce(resting, { type: 'SKIP_REST', now: 3_000 });
    localStorage.setItem('wc:activeSnapshot', JSON.stringify(newer));

    const found = await recoverSession();
    expect(found.kind).toBe('restored');
    if (found.kind !== 'restored') return;

    expect(found.row.state.status).toBe('exercise_active');
    expect(found.row.state.currentSetIndex).toBe(1);
    expect((await db.sessions.get('s1'))?.state).toMatchObject({ status: 'exercise_active' });
  });

  it('ignores a mirror that is older than the row', async () => {
    const newer = reduce(setDone(started(1_000), 2_000), { type: 'SKIP_REST', now: 3_000 });
    await saveSession(newer);
    localStorage.setItem('wc:activeSnapshot', JSON.stringify(started(1_000)));

    const found = await recoverSession();
    expect(found.kind).toBe('restored');
    if (found.kind !== 'restored') return;
    expect(found.row.state.currentSetIndex).toBe(1);
  });
});
