import { summarize, type SessionSummary } from './summary';
import { remainingSeconds } from './rest';
import { elapsedMs } from './time';
import type { ExerciseRecord, ProgramExercise, SetRecord, WorkoutState } from './types';

export { elapsedMs };

export function getCurrentExercise(s: WorkoutState): ProgramExercise | null {
  return s.program.exercises[s.currentExerciseIndex] ?? null;
}

export function getCurrentSet(s: WorkoutState): SetRecord | null {
  return s.exerciseRecords[s.currentExerciseIndex]?.sets[s.currentSetIndex] ?? null;
}

export function getCurrentRecord(s: WorkoutState): ExerciseRecord | null {
  return s.exerciseRecords[s.currentExerciseIndex] ?? null;
}

export function getNextExercise(s: WorkoutState): ProgramExercise | null {
  return s.program.exercises[s.currentExerciseIndex + 1] ?? null;
}

export function getWorkoutProgress(s: WorkoutState): {
  done: number;
  skipped: number;
  total: number;
  ratio: number;
} {
  const all = s.exerciseRecords.flatMap((r) => r.sets);
  const done = all.filter((x) => x.completed).length;
  const skipped = all.filter((x) => x.skipped).length;
  return {
    done,
    skipped,
    total: all.length,
    ratio: all.length === 0 ? 0 : done / all.length,
  };
}

/** Fractions of the current exercise where one set ends and the next begins. */
export function getSetBoundaries(s: WorkoutState): number[] {
  const sets = getCurrentRecord(s)?.sets.length ?? 0;
  return Array.from({ length: Math.max(0, sets - 1) }, (_, i) => (i + 1) / sets);
}

export function getRemainingRestSeconds(s: WorkoutState, now: number): number {
  return remainingSeconds(s, now);
}

export function getSessionSummary(s: WorkoutState, now: number): SessionSummary {
  return summarize(s, now);
}
