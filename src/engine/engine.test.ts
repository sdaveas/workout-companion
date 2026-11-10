import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSession } from './create';
import { InvalidArgument, InvalidTransition } from './errors';
import { reduce } from './reduce';
import { remainingMs, remainingSeconds } from './rest';
import {
  getCurrentExercise,
  getCurrentRecord,
  getNextExercise,
  getSetBoundaries,
  getWorkoutProgress,
} from './selectors';
import { summarize } from './summary';
import { parseProgram } from '../schemas/program';
import type { Program, WorkoutEvent, WorkoutState } from './types';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

const started = (): WorkoutState => reduce(createSession(program, T0, 'sid'), { type: 'START', now: T0 });

const ev = <T extends WorkoutEvent>(e: T): T => e;

function completeAll(s: WorkoutState, from = T0): WorkoutState {
  let now = from;
  let st = s;
  for (let guard = 0; guard < 200; guard += 1) {
    if (st.status === 'completed') return st;
    if (st.status === 'exercise_active') {
      const ex = getCurrentExercise(st)!;
      st = reduce(st, { type: 'COMPLETE_SET', now, reps: ex.reps.min, weightKg: ex.weightKg });
    } else if (st.status === 'resting') {
      now = (st.restStartedAt ?? now) + st.restDurationMs;
      st = reduce(st, { type: 'REST_DONE', now });
    } else if (st.status === 'exercise_complete') {
      st = reduce(st, { type: 'NEXT_EXERCISE', now });
    } else {
      throw new Error(`stuck in ${st.status}`);
    }
  }
  throw new Error('did not finish');
}

describe('start', () => {
  it('enters exercise_active with a start timestamp', () => {
    const s = started();
    expect(s.status).toBe('exercise_active');
    expect(s.startedAt).toBe(T0);
    expect(getCurrentExercise(s)?.id).toBe('push-ups');
  });

  it('rejects START from anywhere but ready', () => {
    expect(() => reduce(started(), { type: 'START', now: T0 })).toThrow(InvalidTransition);
  });
});

describe('set completion', () => {
  it('records actual reps and weight, then starts the prescribed rest', () => {
    const s = reduce(started(), { type: 'COMPLETE_SET', now: T0 + 60_000, reps: 9, weightKg: null });
    const set = s.exerciseRecords[0].sets[0];
    expect(set).toMatchObject({ actualReps: 9, completed: true, completedAt: T0 + 60_000 });
    expect(s.status).toBe('resting');
    expect(s.currentSetIndex).toBe(1);
    expect(s.restDurationMs).toBe(90_000);
  });

  it('accepts a weight that differs from the prescription', () => {
    const s = reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: 7.5 });
    expect(s.exerciseRecords[0].sets[0].actualWeightKg).toBe(7.5);
  });

  it('accepts zero reps', () => {
    const s = reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 0, weightKg: null });
    expect(s.exerciseRecords[0].sets[0].actualReps).toBe(0);
  });

  it('rejects negative reps', () => {
    expect(() => reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: -1, weightKg: null })).toThrow(
      InvalidArgument,
    );
  });

  it('goes to exercise_complete on the last set and still counts a rest down', () => {
    let s = started();
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    expect(s.status).toBe('exercise_complete');
    expect(s.exerciseRecords[0].completedAt).toBe(T0);
    // the break before the next exercise belongs to the set that just ended
    expect(s.restDurationMs).toBe(s.program.exercises[0].restSeconds * 1000);
    expect(remainingSeconds(s, T0)).toBe(s.program.exercises[0].restSeconds);
    expect(remainingSeconds(s, T0 + 30_000)).toBe(s.program.exercises[0].restSeconds - 30);
  });

  it('lets the next-exercise break be adjusted, then clears it on Continue', () => {
    let s = started();
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    const longer = reduce(s, { type: 'ADJUST_REST', now: T0, seconds: 30 });
    expect(remainingSeconds(longer, T0)).toBe(s.program.exercises[0].restSeconds + 30);
    const next = reduce(longer, { type: 'NEXT_EXERCISE', now: T0 + 1000 });
    expect(next.status).toBe('exercise_active');
    expect(next.restStartedAt).toBeNull();
    expect(next.currentExerciseIndex).toBe(1);
  });

  it('skips rest entirely when rest_seconds is 0', () => {
    const zeroRest: Program = {
      ...program,
      exercises: program.exercises.map((e) => ({ ...e, restSeconds: 0 })),
    };
    let s = reduce(createSession(zeroRest, T0, 'sid'), { type: 'START', now: T0 });
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    expect(s.status).toBe('exercise_active');
    expect(s.currentSetIndex).toBe(1);
  });
});

describe('rest timer', () => {
  const resting = () =>
    reduce(started(), { type: 'COMPLETE_SET', now: T0 + 60_000, reps: 8, weightKg: null });

  it('derives remaining seconds from timestamps', () => {
    const s = resting();
    expect(remainingSeconds(s, T0 + 60_000)).toBe(90);
    expect(remainingSeconds(s, T0 + 90_000)).toBe(60);
    expect(remainingSeconds(s, T0 + 60_000 + 90_000)).toBe(0);
    expect(remainingSeconds(s, T0 + 999_000)).toBe(0);
  });

  it('refuses to advance before expiry', () => {
    expect(() => reduce(resting(), { type: 'REST_DONE', now: T0 + 60_001 })).toThrow(InvalidTransition);
  });

  it('advances on REST_DONE at expiry without moving the set index again', () => {
    const s = resting();
    const done = reduce(s, { type: 'REST_DONE', now: T0 + 60_000 + 90_000 });
    expect(done.status).toBe('exercise_active');
    expect(done.currentSetIndex).toBe(1);
    expect(done.restStartedAt).toBeNull();
  });

  it('SKIP_REST advances immediately', () => {
    const s = reduce(resting(), { type: 'SKIP_REST', now: T0 + 60_500 });
    expect(s.status).toBe('exercise_active');
  });

  it('adds and subtracts 15 seconds', () => {
    const s = resting();
    const plus = reduce(s, { type: 'ADJUST_REST', now: T0 + 60_000, seconds: 15 });
    expect(remainingSeconds(plus, T0 + 60_000)).toBe(105);
    const minus = reduce(plus, { type: 'ADJUST_REST', now: T0 + 60_000, seconds: -15 });
    expect(remainingSeconds(minus, T0 + 60_000)).toBe(90);
  });

  it('clamps subtraction at zero and gives 15s back from an expired rest', () => {
    const s = resting();
    const at = T0 + 60_000 + 200_000;
    const clamped = reduce(s, { type: 'ADJUST_REST', now: at, seconds: -15 });
    expect(remainingMs(clamped, at)).toBe(0);
    const revived = reduce(clamped, { type: 'ADJUST_REST', now: at, seconds: 15 });
    expect(remainingSeconds(revived, at)).toBe(15);
  });

  it('caps a single adjustment at 600 seconds', () => {
    const s = reduce(resting(), { type: 'ADJUST_REST', now: T0 + 60_000, seconds: 600 });
    expect(remainingSeconds(s, T0 + 60_000)).toBe(600);
  });

  it('restarts to the prescription', () => {
    let s = resting();
    s = reduce(s, { type: 'ADJUST_REST', now: T0 + 74_000, seconds: 120 });
    s = reduce(s, { type: 'RESTART_REST', now: T0 + 74_000 });
    expect(remainingSeconds(s, T0 + 74_000)).toBe(90);
    expect(s.restCount).toBe(2);
  });
});

describe('pause and resume', () => {
  it('freezes the rest remainder and resumes it intact', () => {
    const resting = reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    const paused = reduce(resting, { type: 'PAUSE', now: T0 + 30_000 });
    expect(paused.status).toBe('paused');
    expect(remainingMs(paused, T0 + 90_000)).toBe(60_000);
    const resumed = reduce(paused, { type: 'RESUME', now: T0 + 90_000 });
    expect(resumed.status).toBe('resting');
    expect(remainingMs(resumed, T0 + 90_000)).toBe(60_000);
    expect(resumed.totalPausedMs).toBe(60_000);
  });

  it('excludes paused time from elapsed', () => {
    let s = started();
    s = reduce(s, { type: 'PAUSE', now: T0 + 10_000 });
    s = reduce(s, { type: 'RESUME', now: T0 + 70_000 });
    const summary = summarize(s, T0 + 70_000);
    expect(summary.durationMs).toBe(10_000);
  });

  it('cannot be paused twice', () => {
    const s = reduce(started(), { type: 'PAUSE', now: T0 });
    expect(() => reduce(s, { type: 'PAUSE', now: T0 })).toThrow(InvalidTransition);
  });

  it('can be finished or abandoned while paused', () => {
    const paused = reduce(started(), { type: 'PAUSE', now: T0 });
    expect(reduce(paused, { type: 'FINISH', now: T0 }).status).toBe('completed');
    expect(reduce(paused, { type: 'ABANDON', now: T0 }).status).toBe('abandoned');
  });
});

describe('progression', () => {
  // per-hand exercises record one row per hand
  const totalSets = () => program.exercises.reduce((n, e) => n + e.sets * (e.perHand ? 2 : 1), 0);

  it('advances to the next exercise and resets the set index', () => {
    let s = started();
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    expect(s.status).toBe('exercise_active');
    expect(s.currentExerciseIndex).toBe(1);
    expect(s.currentSetIndex).toBe(0);
    expect(getCurrentExercise(s)?.name).toBe('Dumbbell Floor Press');
    expect(s.draft).toEqual({ reps: 10, weightKg: 5.8 });
  });

  it('completes the workout without an early-end flag', () => {
    const s = completeAll(started());
    expect(s.status).toBe('completed');
    expect(s.endedEarly).toBe(false);
    expect(s.finishedAt).not.toBeNull();
    expect(getWorkoutProgress(s)).toMatchObject({ done: totalSets(), total: totalSets(), ratio: 1 });
  });

  it('skips an exercise and records every remaining set as skipped', () => {
    const s = reduce(started(), { type: 'SKIP_EXERCISE', now: T0 });
    expect(s.status).toBe('exercise_complete');
    expect(s.exerciseRecords[0].skipped).toBe(true);
    expect(s.exerciseRecords[0].sets.every((x) => x.skipped)).toBe(true);
    const summary = summarize(s, T0);
    expect(summary.setsSkipped).toBe(3);
    expect(summary.setsCompleted).toBe(0);
  });

  it('skips a single set without resting', () => {
    const s = reduce(started(), { type: 'SKIP_SET', now: T0 });
    expect(s.status).toBe('exercise_active');
    expect(s.currentSetIndex).toBe(1);
    expect(s.exerciseRecords[0].sets[0]).toMatchObject({ skipped: true, completed: false });
    expect(s.restStartedAt).toBeNull();
  });

  it('finishing early skips the rest and flags endedEarly', () => {
    let s = started();
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    s = reduce(s, { type: 'SKIP_REST', now: T0 });
    s = reduce(s, { type: 'FINISH', now: T0 + 1_000 });
    expect(s.status).toBe('completed');
    expect(s.endedEarly).toBe(true);
    expect(s.finishedAt).toBe(T0 + 1_000);
    expect(summarize(s, T0 + 1_000).setsSkipped).toBe(totalSets() - 1);
  });

  it('finishing after the last set is not an early end', () => {
    let s = started();
    let now = T0;
    while (
      !(s.status === 'exercise_complete' && s.currentExerciseIndex === s.program.exercises.length - 1)
    ) {
      if (s.status === 'exercise_active') {
        const ex = getCurrentExercise(s)!;
        s = reduce(s, { type: 'COMPLETE_SET', now, reps: ex.reps.min, weightKg: ex.weightKg });
      } else if (s.status === 'resting') {
        now = (s.restStartedAt ?? now) + s.restDurationMs;
        s = reduce(s, { type: 'REST_DONE', now });
      } else {
        s = reduce(s, { type: 'NEXT_EXERCISE', now });
      }
    }
    const finished = reduce(s, { type: 'FINISH', now });
    expect(finished.status).toBe('completed');
    expect(finished.endedEarly).toBe(false);
    expect(summarize(finished, now).setsCompleted).toBe(totalSets());
  });

  it('abandons and refuses everything afterwards', () => {
    const s = reduce(started(), { type: 'ABANDON', now: T0 });
    expect(s.status).toBe('abandoned');
    expect(() => reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null })).toThrow(
      InvalidTransition,
    );
  });
});

describe('per-hand sets', () => {
  const oneArm: Program = {
    ...program,
    exercises: [
      { ...program.exercises[0], id: 'one-arm', name: 'One-arm Row', sets: 2, restSeconds: 60, perHand: true },
    ],
  };
  const startedOneArm = () => reduce(createSession(oneArm, T0, 'sid'), { type: 'START', now: T0 });

  it('records one row per hand and rests only after the right hand', () => {
    let s = startedOneArm();
    expect(s.exerciseRecords[0].sets.map((x) => x.side)).toEqual(['left', 'right', 'left', 'right']);
    expect(getWorkoutProgress(s).total).toBe(4);

    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    expect(s.status).toBe('exercise_active');
    expect(s.currentSetIndex).toBe(1);
    expect(remainingMs(s, T0)).toBe(0);
    expect(s.exerciseRecords[0].sets[0]).toMatchObject({ side: 'left', completed: true });

    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    expect(s.status).toBe('resting');
    expect(remainingSeconds(s, T0)).toBe(60);
  });

  it('rests after the last hand too', () => {
    let s = startedOneArm();
    for (let i = 0; i < 4; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    expect(s.status).toBe('exercise_complete');
    expect(s.restDurationMs).toBe(60_000);
    expect(summarize(s, T0).setsCompleted).toBe(4);
  });

  it('skips both hands of a one-arm set in one go', () => {
    let s = startedOneArm();
    s = reduce(s, { type: 'SKIP_SET', now: T0 });
    expect(s.currentSetIndex).toBe(2);
    expect(s.exerciseRecords[0].sets.slice(0, 2).every((x) => x.skipped)).toBe(true);
    expect(s.exerciseRecords[0].sets[2].skipped).toBe(false);
    expect(s.status).toBe('exercise_active');
  });
});

describe('undo', () => {
  it('restores the previous set from resting', () => {
    const resting = reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    const undone = reduce(resting, { type: 'UNDO', now: T0 + 1_000 });
    expect(undone.status).toBe('exercise_active');
    expect(undone.currentSetIndex).toBe(0);
    expect(undone.exerciseRecords[0].sets[0].completed).toBe(false);
    expect(undone.restStartedAt).toBeNull();
  });

  it('throws with an empty stack', () => {
    expect(() => reduce(started(), { type: 'UNDO', now: T0 })).toThrow(InvalidTransition);
  });

  it('is rejected from completed', () => {
    const s = completeAll(started());
    expect(() => reduce(s, { type: 'UNDO', now: T0 })).toThrow(InvalidTransition);
  });

  it('caps the stack at ten entries', () => {
    const long: Program = {
      ...program,
      exercises: [{ ...program.exercises[0], sets: 20, restSeconds: 0 }],
    };
    let s = reduce(createSession(long, T0, 'sid'), { type: 'START', now: T0 });
    for (let i = 0; i < 15; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 5, weightKg: null });
    }
    expect(s.undoStack).toHaveLength(10);
  });
});

describe('set result edits', () => {
  it('addresses a set in another exercise while a later one is current', () => {
    let s = started();
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    s = reduce(s, {
      type: 'UPDATE_SET_RESULT',
      now: T0,
      exerciseIndex: 0,
      setNumber: 1,
      reps: 6,
      weightKg: null,
    });
    expect(s.exerciseRecords[0].sets[0].actualReps).toBe(6);
    expect(s.currentExerciseIndex).toBe(1);
  });

  it('refuses a set that was never recorded', () => {
    expect(() =>
      reduce(started(), {
        type: 'UPDATE_SET_RESULT',
        now: T0,
        exerciseIndex: 0,
        setNumber: 3,
        reps: 5,
        weightKg: null,
      }),
    ).toThrow(InvalidArgument);
  });

  it('works after completion (summary correction)', () => {
    const s = completeAll(started());
    const edited = reduce(s, {
      type: 'UPDATE_SET_RESULT',
      now: T0,
      exerciseIndex: 1,
      setNumber: 1,
      reps: 11,
      weightKg: 6,
    });
    expect(edited.exerciseRecords[1].sets[0]).toMatchObject({ actualReps: 11, actualWeightKg: 6 });
  });
});

describe('annotations', () => {
  it('accepts RPE 1-10 on a completed session and clears with null', () => {
    const s = completeAll(started());
    const rated = reduce(s, { type: 'SET_RPE', now: T0, rpe: 7 });
    expect(rated.rpe).toBe(7);
    expect(reduce(rated, { type: 'SET_RPE', now: T0, rpe: null }).rpe).toBeNull();
  });

  it('rejects out-of-range RPE', () => {
    const s = completeAll(started());
    expect(() => reduce(s, { type: 'SET_RPE', now: T0, rpe: 11 })).toThrow(InvalidArgument);
  });

  it('rejects annotations before completion', () => {
    expect(() => reduce(started(), { type: 'SET_RPE', now: T0, rpe: 5 })).toThrow(InvalidTransition);
  });

  it('keeps notes', () => {
    const s = reduce(completeAll(started()), { type: 'SET_NOTES', now: T0, notes: 'felt strong' });
    expect(s.notes).toBe('felt strong');
  });
});

describe('draft', () => {
  it('persists in-progress reps and resets on set advance', () => {
    let s = reduce(started(), { type: 'SET_DRAFT', now: T0, reps: 7, weightKg: null });
    expect(s.draft).toEqual({ reps: 7, weightKg: null });
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 7, weightKg: null });
    expect(s.draft).toEqual({ reps: 6, weightKg: null });
  });
});

describe('summary math', () => {
  it('computes volume without doubling per-hand weight', () => {
    let s = started();
    // exercise 0: push-ups (bodyweight) 3 sets
    for (let i = 0; i < 3; i += 1) {
      s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null });
      if (s.status === 'resting') s = reduce(s, { type: 'SKIP_REST', now: T0 });
    }
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    // exercise 1: floor press, 5.8 kg per hand, 10 reps
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: 5.8 });
    expect(summarize(s, T0).volumeKg).toBe(58);
  });

  it('counts completed vs skipped sets separately', () => {
    let s = started();
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    s = reduce(s, { type: 'SKIP_REST', now: T0 });
    s = reduce(s, { type: 'SKIP_SET', now: T0 });
    const summary = summarize(s, T0);
    expect(summary.setsCompleted).toBe(1);
    expect(summary.setsSkipped).toBe(1);
  });

  it('survives a JSON round-trip', () => {
    const s = completeAll(started());
    const back = JSON.parse(JSON.stringify(s)) as WorkoutState;
    expect(summarize(back, T0)).toEqual(summarize(s, T0));
    expect(getNextExercise(back)?.id).toBe(getNextExercise(s)?.id);
  });
});

describe('guards', () => {
  const whileActive: Array<[string, WorkoutEvent]> = [
    ['REST_DONE while active', { type: 'REST_DONE', now: T0 }],
    ['NEXT_EXERCISE while active', { type: 'NEXT_EXERCISE', now: T0 }],
    ['SKIP_REST while active', { type: 'SKIP_REST', now: T0 }],
    ['ADJUST_REST while active', { type: 'ADJUST_REST', now: T0, seconds: 15 }],
    ['RESUME while active', { type: 'RESUME', now: T0 }],
  ];

  const whileResting: Array<[string, WorkoutEvent]> = [
    ['SET_DRAFT while resting', { type: 'SET_DRAFT', now: T0, reps: 5, weightKg: null }],
    ['SKIP_SET while resting', { type: 'SKIP_SET', now: T0 }],
    ['COMPLETE_SET while resting', { type: 'COMPLETE_SET', now: T0, reps: 5, weightKg: null }],
  ];

  it.each(whileActive)('rejects %s', (_label, event) => {
    expect(() => reduce(started(), ev(event))).toThrow(InvalidTransition);
  });

  it.each(whileResting)('rejects %s', (_label, event) => {
    const resting = reduce(started(), { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null });
    expect(() => reduce(resting, ev(event))).toThrow(InvalidTransition);
  });

  it('rejects every event after abandon', () => {
    const s = reduce(started(), { type: 'ABANDON', now: T0 });
    const events: WorkoutEvent[] = [
      { type: 'COMPLETE_SET', now: T0, reps: 5, weightKg: null },
      { type: 'FINISH', now: T0 },
      { type: 'UNDO', now: T0 },
      { type: 'NEXT_EXERCISE', now: T0 },
    ];
    for (const e of events) expect(() => reduce(s, e)).toThrow(InvalidTransition);
  });
});

describe('progress checkpoints', () => {
  it('splits the exercise bar at every set of the current exercise', () => {
    const s = started();
    const sets = getCurrentRecord(s)!.sets.length;
    const marks = getSetBoundaries(s);

    expect(marks).toHaveLength(sets - 1);
    expect(marks[0]).toBeCloseTo(1 / sets);
    expect(marks.at(-1)).toBeCloseTo((sets - 1) / sets);
  });
});
