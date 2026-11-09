import { describe, expect, it } from 'vitest';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import { parseProgram } from '../schemas/program';
import type { Program, WorkoutState } from '../engine/types';
import { autoStep } from './autoPlay';

const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

const program: Program = (() => {
  const parsed = parseProgram(
    JSON.stringify({
      schema_version: 1,
      id: 'auto',
      name: 'Auto',
      exercises: [
        { id: 'a', name: 'A', sets: 2, reps: { min: 5, max: 5 }, rest_seconds: 60 },
        { id: 'b', name: 'B', sets: 1, reps: { min: 5, max: 5 }, rest_seconds: 60 },
      ],
    }),
  );
  if (!parsed.ok) throw new Error('the test program must parse');
  return parsed.program;
})();

const started = (): WorkoutState => reduce(createSession(program, T0, 'sid'), { type: 'START', now: T0 });

/** Start, log the first set, and sit on its 60s rest. */
const resting = (): WorkoutState =>
  reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 5, weightKg: null });

const afterExercise = (): WorkoutState =>
  reduce(
    reduce(resting(), { type: 'REST_DONE', now: T0 + 60_000 }),
    { type: 'COMPLETE_SET', now: T0 + 61_000, reps: 5, weightKg: null },
  );

describe('autoStep', () => {
  it('leaves everything to the user while the rest runs', () => {
    expect(autoStep(resting(), T0 + 59_000, true)).toBeNull();
  });

  it('starts the next set the moment the rest is over', () => {
    expect(autoStep(resting(), T0 + 60_000, true)).toBe('REST_DONE');
  });

  it('does nothing while auto-play is off', () => {
    expect(autoStep(resting(), T0 + 60_000, false)).toBeNull();
    expect(autoStep(afterExercise(), T0 + 61_000 + 60_000, false)).toBeNull();
  });

  it('waits on the break before the next exercise, then continues', () => {
    const s = afterExercise();
    expect(s.status).toBe('exercise_complete');
    expect(autoStep(s, T0 + 61_000 + 59_000, true)).toBeNull();
    expect(autoStep(s, T0 + 61_000 + 60_000, true)).toBe('NEXT_EXERCISE');
  });

  it('never finishes the workout on its own', () => {
    const next = reduce(afterExercise(), { type: 'NEXT_EXERCISE', now: T0 + 121_000 });
    const last = reduce(next, { type: 'COMPLETE_SET', now: T0 + 122_000, reps: 5, weightKg: null });
    expect(last.status).toBe('exercise_complete');
    expect(autoStep(last, T0 + 122_000 + 600_000, true)).toBeNull();
  });

  it('stays put while paused, even at zero', () => {
    const paused = reduce(resting(), { type: 'PAUSE', now: T0 + 30_000 });
    expect(paused.status).toBe('paused');
    expect(autoStep(paused, T0 + 600_000, true)).toBeNull();
  });

  it('does nothing before the workout starts', () => {
    const ready = createSession(program, T0, 'sid');
    expect(autoStep(ready, T0 + 600_000, true)).toBeNull();
    expect(autoStep(null, T0, true)).toBeNull();
  });
});
