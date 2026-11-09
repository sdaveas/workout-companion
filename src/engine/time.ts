import { autoRemainingMs } from './auto';
import { remainingMs } from './rest';
import { setBudgetSeconds } from './tempo';
import type { WorkoutState } from './types';

export function elapsedMs(s: WorkoutState, now: number): number {
  if (s.startedAt == null) return 0;
  const paused = s.totalPausedMs + (s.pausedAt != null ? now - s.pausedAt : 0);
  return Math.max(0, (s.finishedAt ?? now) - s.startedAt - paused);
}

/**
 * Projected time left from prescriptions, not history. Walks the set records so a
 * per-hand exercise counts both rows; the current set uses the live auto clock when
 * one is running, a full budget otherwise. A running break is added on top, because
 * the set it leads into still has to be performed.
 */
export function estimatedRemainingMs(s: WorkoutState, now: number): number {
  if (s.status !== 'exercise_active' && s.status !== 'resting' && s.status !== 'paused' && s.status !== 'exercise_complete')
    return 0;

  const pausedInRest =
    s.status === 'paused' && (s.pausedFrom === 'resting' || s.pausedFrom === 'exercise_complete');
  let total =
    s.status === 'resting' || s.status === 'exercise_complete' || pausedInRest
      ? remainingMs(s, now)
      : 0;

  const useAutoClock =
    s.mode === 'auto' &&
    (s.status === 'exercise_active' ||
      (s.status === 'paused' && s.pausedFrom === 'exercise_active'));

  let first = true;
  s.exerciseRecords.forEach((record, i) => {
    const exercise = s.program.exercises[i];
    record.sets.forEach((set, j) => {
      if (set.completed || set.skipped) return;
      const current = i === s.currentExerciseIndex && j === s.currentSetIndex;
      if (current && first && useAutoClock) {
        total += autoRemainingMs(s, now);
      } else {
        total += setBudgetSeconds(exercise) * 1000;
      }
      first = false;
      const lastOfProgram =
        i === s.program.exercises.length - 1 && j === record.sets.length - 1;
      if (set.side !== 'left' && !lastOfProgram) total += exercise.restSeconds * 1000;
    });
  });

  return total;
}
