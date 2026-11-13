import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Program, SetRecord, WorkoutState } from '../engine/types';
import { parseProgram } from '../schemas/program';
import {
  decodeProgram,
  decodePrograms,
  encodeProgram,
  encodePrograms,
  encodeSession,
  shareUrl,
} from './share';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

/** A finished session over the fixture: every set done, at the top of the rep range. */
function session(overrides: Partial<WorkoutState> = {}): WorkoutState {
  const set = (n: number, e: Program['exercises'][number], extra: Partial<SetRecord> = {}): SetRecord => ({
    setNumber: n,
    targetReps: e.reps,
    targetWeightKg: e.weightKg,
    actualReps: e.reps.max,
    actualWeightKg: e.weightKg,
    completed: true,
    skipped: false,
    completedAt: 2,
    ...extra,
  });
  return {
    sessionId: 's1',
    programId: program.id,
    program,
    status: 'completed',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    startedAt: 1,
    finishedAt: 2,
    pausedAt: null,
    pausedFrom: null,
    totalPausedMs: 0,
    restStartedAt: null,
    restDurationMs: 0,
    restPausedMs: null,
    restCount: 0,
    exerciseRecords: program.exercises.map((e) => ({
      exerciseId: e.id,
      name: e.name,
      sets: Array.from({ length: e.sets }, (_, i) => set(i + 1, e)),
      skipped: false,
      skippedAt: null,
      completedAt: 2,
    })),
    undoStack: [],
    draft: null,
    endedEarly: false,
    rpe: null,
    notes: null,
    updatedAt: 2,
    ...overrides,
  };
}

describe('share link', () => {
  it('round-trips a program through the link payload', async () => {
    const payload = await encodeProgram(program);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeProgram(payload);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.program.name).toBe(program.name);
    const plan = (p: Program) =>
      p.exercises.map((e) => [e.name, e.sets, e.reps, e.weightKg, e.perHand, e.restSeconds]);
    expect(plan(back.program)).toEqual(plan(program));
    expect(back.program.scheduleDays).toEqual([]); // the receiver picks the week
  });

  it('carries a preview version so a changed card is re-fetched', async () => {
    const url = shareUrl(await encodeProgram(program), 'https://example.com/app/');
    expect(url.startsWith('https://example.com/app/?v=4#/add/')).toBe(true);
  });

  it('keeps a realistic program link short', async () => {
    const url = shareUrl(await encodeProgram(program), 'https://example.com/app/');
    // 6 exercises used to cost ~1000 characters of payload; the compact wire form is ~200.
    expect(url.length).toBeLessThan(300);
  });

  it('carries several programs in one link, in one tap for the receiver', async () => {
    const second: Program = { ...program, id: 'workout-b', name: 'Workout B' };
    const url = shareUrl(await encodePrograms([program, second]), 'https://example.com/app/');
    expect(url.length).toBeLessThan(500);
    const back = await decodePrograms(url.split('#/add/')[1]);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.programs.map((p) => p.name)).toEqual([program.name, 'Workout B']);
    expect(back.programs[1].exercises.length).toBe(program.exercises.length);
  });

  it('keeps reading a single-program link written before bundles existed', async () => {
    const back = await decodePrograms(await encodeProgram(program));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.programs).toHaveLength(1);
  });

  it('rejects a link that is not a program', async () => {
    expect((await decodeProgram('not-a-payload!!')).ok).toBe(false);
    expect((await decodeProgram('aGVsbG8')).ok).toBe(false); // "hello"
  });

  it('carries a workout: the same plan plus what was logged', async () => {
    const state = session();
    const back = await decodePrograms(await encodeSession(state));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.programs[0].name).toBe(program.name);
    expect(back.performed).toHaveLength(program.exercises.length);
    const first = back.performed?.[0];
    expect(first?.[0]).toEqual({
      reps: program.exercises[0].reps.max,
      weightKg: program.exercises[0].weightKg,
    });
    // Same length as a program link, roughly: the numbers are a few hundred characters.
    const url = shareUrl(await encodeSession(state), 'https://example.com/app/');
    expect(url.length).toBeLessThan(900);
  });

  it('sends no numbers for a program link, so the receiver says "program"', async () => {
    const back = await decodePrograms(await encodeProgram(program));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.performed).toBeUndefined();
  });

  it('keeps a skipped set in its place and a skipped exercise empty', async () => {
    const state = session();
    state.exerciseRecords[0].sets[1] = {
      ...state.exerciseRecords[0].sets[1],
      completed: false,
      actualReps: null,
      actualWeightKg: null,
    };
    state.exerciseRecords[1] = {
      ...state.exerciseRecords[1],
      skipped: true,
      sets: state.exerciseRecords[1].sets.map((s) => ({ ...s, completed: false })),
    };
    const back = await decodePrograms(await encodeSession(state));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.performed?.[0]?.[1]).toBeNull();
    expect(back.performed?.[0]?.[0]).not.toBeNull();
    expect(back.performed?.[1]).toBeNull();
  });

  it('keeps both hands on a unilateral set', async () => {
    const state = session();
    const record = state.exerciseRecords[0];
    record.sets = [
      { ...record.sets[0], side: 'left', actualReps: 8 },
      { ...record.sets[0], side: 'right', actualReps: 11 },
    ];
    const back = await decodePrograms(await encodeSession(state));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.performed?.[0]?.[0]).toMatchObject({ reps: 8, repsRight: 11 });
  });

  it('sends the plan alone for an auto session and for one with nothing done', async () => {
    const auto = await decodePrograms(await encodeSession(session({ mode: 'auto' })));
    expect(auto.ok && auto.performed).toBeUndefined();

    const empty = session();
    empty.exerciseRecords = empty.exerciseRecords.map((r) => ({
      ...r,
      sets: r.sets.map((s) => ({ ...s, completed: false })),
    }));
    const none = await decodePrograms(await encodeSession(empty));
    expect(none.ok && none.performed).toBeUndefined();
  });
});
