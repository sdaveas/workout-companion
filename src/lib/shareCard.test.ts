import { describe, expect, it } from 'vitest';
import type { ExerciseRecord, Program, SetRecord, WorkoutState } from '../engine/types';
import { summarize } from '../engine/summary';
import { sessionMessage, sessionShareLines } from './shareCard';

function set(n: number, reps: number, weightKg: number | null): SetRecord {
  return {
    setNumber: n,
    targetReps: { min: reps, max: reps },
    targetWeightKg: weightKg,
    actualReps: reps,
    actualWeightKg: weightKg,
    completed: true,
    skipped: false,
    completedAt: 2,
  };
}

function record(name: string, sets: SetRecord[], skipped = false): ExerciseRecord {
  return {
    exerciseId: name.toLowerCase(),
    name,
    sets,
    skipped,
    skippedAt: null,
    completedAt: skipped ? null : 2,
  };
}

const program: Program = {
  id: 'p',
  name: 'Push Day',
  description: null,
  scheduleDays: [],
  estimatedDurationMinutes: null,
  exercises: [],
  raw: '{}',
};

function state(records: ExerciseRecord[]): WorkoutState {
  return {
    sessionId: 's1',
    programId: 'p',
    program,
    status: 'completed',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    startedAt: 0,
    finishedAt: 52 * 60_000,
    pausedAt: null,
    pausedFrom: null,
    totalPausedMs: 0,
    restStartedAt: null,
    restDurationMs: 0,
    restPausedMs: null,
    restCount: 0,
    exerciseRecords: records,
    undoStack: [],
    draft: null,
    endedEarly: false,
    rpe: null,
    notes: null,
    updatedAt: 52 * 60_000,
  };
}

describe('sharing a session as text', () => {
  it('names every exercise with what was actually lifted', () => {
    const s = state([
      record('Push-up', [set(1, 12, null), { ...set(2, 10, null), completed: false }]),
      record('Dumbbell Row', [set(1, 12, 16)]),
    ]);
    const lines = sessionShareLines(summarize(s, s.finishedAt ?? 0));
    expect(lines.title).toBe('Push Day');
    expect(lines.rows).toEqual([
      { name: 'Push-up', detail: '12  —' },
      { name: 'Dumbbell Row', detail: '12×16' },
    ]);
    expect(lines.stats).toBe('52 min · 2 sets · 192 kg');
  });

  it('marks a skipped exercise rather than inventing numbers', () => {
    const s = state([record('Plank', [], true)]);
    const lines = sessionShareLines(summarize(s, s.finishedAt ?? 0));
    expect(lines.rows[0].detail).toBe('not done');
  });

  it('keeps the link in the message and cuts rows that would blow the caption limit', () => {
    const rows = Array.from({ length: 60 }, (_, i) => record(`Exercise ${i}`, [set(1, 10, 20)]));
    const lines = sessionShareLines(summarize(state(rows), 0));
    const message = sessionMessage(lines, 'https://example.com/#/add/abc');
    expect(message).toContain('https://example.com/#/add/abc');
    expect(message).toMatch(/\+\d+ more/);
    expect(message.length).toBeLessThan(1100);
  });
});
