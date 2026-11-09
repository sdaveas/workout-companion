import { describe, expect, it } from 'vitest';
import { createSession } from './create';
import { autoRemainingMs, dueAction, skipAction } from './auto';
import { reduce } from './reduce';
import { parseProgram } from '../schemas/program';
import { estimatedRemainingMs } from './time';
import type { Program, WorkoutState } from './types';

const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

function programOf(json: unknown): Program {
  const parsed = parseProgram(JSON.stringify(json));
  if (!parsed.ok) throw new Error('test program must parse');
  return parsed.program;
}

const mini = programOf({
  schema_version: 1,
  id: 'mini',
  name: 'Mini',
  exercises: [
    { id: 'a', name: 'Biceps Curl', sets: 2, reps: { min: 8, max: 10 }, rest_seconds: 60 },
    { id: 'b', name: 'Plank', sets: 1, reps: { min: 30, max: 30 }, rest_seconds: 0 },
  ],
});

const oneLift = programOf({
  schema_version: 1,
  id: 'one',
  name: 'One',
  exercises: [{ id: 'a', name: 'Biceps Curl', sets: 2, reps: { min: 8, max: 10 }, rest_seconds: 0 }],
});

const lastSet = programOf({
  schema_version: 1,
  id: 'last',
  name: 'Last',
  exercises: [{ id: 'a', name: 'Biceps Curl', sets: 1, reps: { min: 8, max: 10 }, rest_seconds: 90 }],
});

const started = (program: Program) =>
  reduce(createSession(program, T0, 'sid'), { type: 'START', now: T0 });

const auto = (program: Program) =>
  reduce(started(program), { type: 'START_AUTO', now: T0 });

const run = (s: WorkoutState, e: Parameters<typeof reduce>[1]) => reduce(s, e);

describe('auto mode', () => {
  it('starts a set clock, and only from a running status', () => {
    const s = auto(mini);
    expect(s.mode).toBe('auto');
    expect(s.stageStartedAt).toBe(T0);
    // 8–10 curls at 2.5 s → the top of the range.
    expect(s.stageDurationMs).toBe(25_000);

    const ready = createSession(mini, T0, 'sid');
    expect(() => reduce(ready, { type: 'START_AUTO', now: T0 })).toThrow();
    expect(() =>
      reduce(
        reduce(started(mini), { type: 'PAUSE', now: T0 }),
        { type: 'START_AUTO', now: T0 + 1 },
      ),
    ).toThrow();
  });

  it('only flips the mode when armed mid-rest', () => {
    let s = started(mini);
    s = run(s, { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null }); // → resting
    s = run(s, { type: 'START_AUTO', now: T0 + 1_000 });
    expect(s.mode).toBe('auto');
    expect(s.restStartedAt).toBe(T0);
    expect(s.stageStartedAt).toBe(null);
  });

  it('completes the set when the clock runs out, recording the target', () => {
    const s = auto(mini);
    expect(dueAction(s, T0 + 24_999)).toBe(null);
    expect(dueAction(s, T0 + 25_000)).toEqual({ type: 'COMPLETE_SET', reps: 10, weightKg: null });

    const after = run(s, { type: 'COMPLETE_SET', now: T0 + 25_000, reps: 10, weightKg: null });
    expect(after.status).toBe('resting');
    expect(dueAction(after, T0 + 84_999)).toBe(null);
    expect(dueAction(after, T0 + 85_000)).toEqual({ type: 'REST_DONE' });
  });

  it('waits for a clock before firing', () => {
    const s = { ...auto(mini), stageStartedAt: null };
    expect(dueAction(s, T0 + 10_000_000)).toBe(null);
    expect(autoRemainingMs(s, T0 + 10_000_000)).toBe(0);
  });

  it('does not wait on the ghost break after the final set', () => {
    let s = auto(lastSet);
    s = run(s, { type: 'COMPLETE_SET', now: T0 + 25_000, reps: 10, weightKg: null });
    expect(s.status).toBe('exercise_complete');
    expect(s.restStartedAt).not.toBe(null); // the engine still records it
    expect(dueAction(s, T0 + 25_001)).toEqual({ type: 'NEXT_EXERCISE' });
    expect(dueAction(s, T0 + 300_000)).toEqual({ type: 'NEXT_EXERCISE' });
  });

  it('skips a zero-second break and starts the next set clock', () => {
    let s = auto(oneLift);
    s = run(s, { type: 'COMPLETE_SET', now: T0 + 25_000, reps: 10, weightKg: null });
    expect(s.status).toBe('exercise_active');
    expect(s.currentSetIndex).toBe(1);
    expect(s.stageStartedAt).toBe(T0 + 25_000);
    expect(dueAction(s, T0 + 25_000)).toBe(null);
  });

  it('extends and shortens the stage', () => {
    let s = auto(mini);
    s = run(s, { type: 'EXTEND_STAGE', now: T0 + 5_000, seconds: 15 });
    expect(autoRemainingMs(s, T0 + 5_000)).toBe(35_000);

    s = run(s, { type: 'EXTEND_STAGE', now: T0 + 6_000, seconds: -15 });
    // The delta moves the deadline; the second that passed still counts.
    expect(autoRemainingMs(s, T0 + 6_000)).toBe(19_000);

    s = run(s, { type: 'EXTEND_STAGE', now: T0 + 7_000, seconds: -999 });
    expect(autoRemainingMs(s, T0 + 7_000)).toBe(0);
    expect(dueAction(s, T0 + 7_000)).toEqual({ type: 'COMPLETE_SET', reps: 10, weightKg: null });

    s = run(auto(mini), { type: 'EXTEND_STAGE', now: T0, seconds: 9_999 });
    expect(s.stageDurationMs).toBe(600_000);
  });

  it('refuses to extend a manual or resting stage', () => {
    expect(() => reduce(started(mini), { type: 'EXTEND_STAGE', now: T0, seconds: 5 })).toThrow();
  });

  it('freezes a set on pause and restarts the same remainder', () => {
    let s = auto(mini);
    s = run(s, { type: 'PAUSE', now: T0 + 10_000 });
    expect(s.status).toBe('paused');
    expect(autoRemainingMs(s, T0 + 10_000)).toBe(15_000);
    expect(autoRemainingMs(s, T0 + 90_000)).toBe(15_000); // frozen

    s = run(s, { type: 'RESUME', now: T0 + 90_000 });
    expect(s.stageStartedAt).toBe(T0 + 90_000);
    expect(autoRemainingMs(s, T0 + 90_000)).toBe(15_000);
    expect(autoRemainingMs(s, T0 + 100_000)).toBe(5_000);
    expect(dueAction(s, T0 + 100_000)).toBe(null);
  });

  it('pauses and resumes the between-exercise break', () => {
    let s = auto(mini);
    s = run(s, { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null });
    s = run(s, { type: 'SKIP_REST', now: T0 + 1_000 });
    s = run(s, { type: 'COMPLETE_SET', now: T0 + 2_000, reps: 10, weightKg: null });
    // second set done → exercise_complete with the 60 s break
    expect(s.status).toBe('exercise_complete');
    s = run(s, { type: 'PAUSE', now: T0 + 12_000 });
    expect(s.pausedFrom).toBe('exercise_complete');
    s = run(s, { type: 'RESUME', now: T0 + 32_000 });
    expect(s.status).toBe('exercise_complete');
    // 60 s break, 10 s spent before the pause, resumed with 50 s left.
    expect(dueAction(s, T0 + 81_999)).toBe(null);
    expect(dueAction(s, T0 + 82_000)).toEqual({ type: 'NEXT_EXERCISE' });
  });

  it('stops on STOP_AUTO and stops advancing', () => {
    let s = auto(mini);
    s = run(s, { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null });
    s = run(s, { type: 'STOP_AUTO', now: T0 + 1_000 });
    expect(s.mode).toBe('manual');
    expect(s.stageStartedAt).toBe(null);
    expect(dueAction(s, T0 + 200_000)).toBe(null);
    expect(s.status).toBe('resting');
  });

  it('turns auto off on undo and does not re-fire', () => {
    let s = auto(oneLift);
    s = run(s, { type: 'COMPLETE_SET', now: T0 + 25_000, reps: 10, weightKg: null });
    expect(s.currentSetIndex).toBe(1);
    s = run(s, { type: 'UNDO', now: T0 + 26_000 });
    expect(s.mode).toBe('manual');
    expect(s.stageStartedAt).toBe(null);
    expect(s.currentSetIndex).toBe(0);
    expect(dueAction(s, T0 + 26_000)).toBe(null);
  });

  it('round-trips through JSON and still works after reload', () => {
    const s = auto(mini);
    const restored = JSON.parse(JSON.stringify(s)) as WorkoutState;
    expect(dueAction(restored, T0 + 25_000)).toEqual({
      type: 'COMPLETE_SET',
      reps: 10,
      weightKg: null,
    });
  });

  it('treats a session with no mode as manual', () => {
    const s = started(mini);
    const old = { ...s, mode: undefined } as WorkoutState;
    expect(dueAction(old, T0 + 10_000_000)).toBe(null);
    expect(autoRemainingMs(old, T0 + 10_000_000)).toBe(0);
  });

  it('maps one skip button per stage', () => {
    expect(skipAction(auto(mini))).toEqual({ type: 'SKIP_SET' });
    const resting = run(auto(mini), { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null });
    expect(skipAction(resting)).toEqual({ type: 'SKIP_REST' });
    const done = run(auto(lastSet), { type: 'COMPLETE_SET', now: T0, reps: 10, weightKg: null });
    expect(skipAction(done)).toEqual({ type: 'NEXT_EXERCISE' });
  });
});

describe('estimated time left', () => {
  it('is zero before the workout and drops as sets land', () => {
    expect(estimatedRemainingMs(createSession(mini, T0, 'sid'), T0)).toBe(0);

    const s = auto(mini);
    const atStart = estimatedRemainingMs(s, T0);
    // 2 sets of curls (25 s each) + a 60 s break after each (the second one is the
    // between-exercise break) + the 30 s plank.
    expect(atStart).toBe(25_000 + 60_000 + 25_000 + 60_000 + 30_000);

    const after = run(s, { type: 'COMPLETE_SET', now: T0 + 25_000, reps: 10, weightKg: null });
    expect(estimatedRemainingMs(after, T0 + 25_000)).toBe(60_000 + 25_000 + 60_000 + 30_000);
  });

  it('counts the live auto remainder for the current set', () => {
    const s = auto(mini);
    expect(estimatedRemainingMs(s, T0 + 10_000)).toBe(
      15_000 + 60_000 + 25_000 + 60_000 + 30_000,
    );
  });

  it('counts both hands of a unilateral exercise but rests once', () => {
    const perHand = programOf({
      schema_version: 1,
      id: 'hands',
      name: 'Hands',
      exercises: [
        { id: 'a', name: 'Biceps Curl', sets: 1, per_hand: true, reps: { min: 10, max: 10 }, rest_seconds: 60 },
        { id: 'b', name: 'Plank', sets: 1, reps: { min: 10, max: 10 }, rest_seconds: 0 },
      ],
    });
    const s = started(perHand); // manual: 25 s per hand
    // left 25 + right 25 + 60 (rest only after the right hand) + plank 10
    expect(estimatedRemainingMs(s, T0)).toBe(25_000 + 25_000 + 60_000 + 10_000);
  });
});
