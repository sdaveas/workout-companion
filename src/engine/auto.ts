import { remainingMs } from './rest';
import { setBudgetSeconds } from './tempo';
import type { ProgramExercise, WorkoutAction, WorkoutState } from './types';

/** Stage clock fields, all cleared. Mirrors `clearedRest()`. */
export function clearedStage(): Pick<
  WorkoutState,
  'stageStartedAt' | 'stageDurationMs' | 'stagePausedMs'
> {
  return { stageStartedAt: null, stageDurationMs: 0, stagePausedMs: null };
}

/** Start the superset clock for `exercise` when the session is in auto mode. */
export function stageClock(
  mode: WorkoutState['mode'],
  exercise: ProgramExercise | undefined,
  now: number,
): Pick<WorkoutState, 'stageStartedAt' | 'stageDurationMs' | 'stagePausedMs'> {
  if (mode !== 'auto' || !exercise) return clearedStage();
  return {
    stageStartedAt: now,
    stageDurationMs: setBudgetSeconds(exercise) * 1000,
    stagePausedMs: null,
  };
}

/**
 * Time left in the current auto set. Derived from timestamps, clamped to the stage's
 * own duration so a display tick behind the dispatch can't read 00:31 for 30 s.
 */
export function autoRemainingMs(s: WorkoutState, now: number): number {
  if (s.mode !== 'auto') return 0;
  if (s.status === 'paused' && s.pausedFrom === 'exercise_active') return s.stagePausedMs ?? 0;
  if (s.status !== 'exercise_active' || s.stageStartedAt == null) return 0;
  const duration = s.stageDurationMs ?? 0;
  return Math.max(0, Math.min(s.stageStartedAt + duration - now, duration));
}

/** Rebase the stage onto `now` with a delta, mirroring `rebaseRest`. */
export function rebaseStage(
  s: WorkoutState,
  now: number,
  deltaSeconds: number,
): Pick<WorkoutState, 'stageStartedAt' | 'stageDurationMs' | 'stagePausedMs'> {
  const endsAt = Math.max(now, (s.stageStartedAt ?? now) + (s.stageDurationMs ?? 0));
  const target = Math.min(Math.max(endsAt + deltaSeconds * 1000, now), now + 600_000);
  return { stageStartedAt: now, stageDurationMs: target - now, stagePausedMs: null };
}

/**
 * What auto mode should do right now. Pure: the hook only dispatches the result.
 * Every branch changes status or restarts a clock, so a second call on the new
 * state returns null.
 */
export function dueAction(s: WorkoutState, now: number): WorkoutAction | null {
  if (s.mode !== 'auto') return null;

  if (s.status === 'exercise_active') {
    // No clock yet (e.g. freshly restored) → wait for the user to re-arm.
    if (s.stageStartedAt == null) return null;
    if (autoRemainingMs(s, now) > 0) return null;
    const exercise = s.program.exercises[s.currentExerciseIndex];
    if (!exercise) return null;
    return {
      type: 'COMPLETE_SET',
      reps: exercise.reps.max,
      weightKg: s.draft?.weightKg ?? exercise.weightKg,
    };
  }

  if (s.status === 'resting') {
    return remainingMs(s, now) === 0 ? { type: 'REST_DONE' } : null;
  }

  if (s.status === 'exercise_complete') {
    // The engine records a break after the final set too; with nowhere to go, don't wait.
    const last = s.currentExerciseIndex >= s.program.exercises.length - 1;
    if (last || s.restStartedAt == null || remainingMs(s, now) === 0) {
      return { type: 'NEXT_EXERCISE' };
    }
  }

  return null;
}

/** One button for "I'm done with this stage". */
export function skipAction(s: WorkoutState): WorkoutAction | null {
  if (s.status === 'exercise_active') return { type: 'SKIP_SET' };
  if (s.status === 'resting') return { type: 'SKIP_REST' };
  if (s.status === 'exercise_complete') return { type: 'NEXT_EXERCISE' };
  return null;
}
