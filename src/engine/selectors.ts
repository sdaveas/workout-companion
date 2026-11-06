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

/** The set the user is waiting to do — meaningful while resting. */
export function getNextSet(
  s: WorkoutState,
): { exerciseName: string; setNumber: number; totalSets: number } | null {
  const record = getCurrentRecord(s);
  const exercise = getCurrentExercise(s);
  if (!record || !exercise) return null;
  const set = record.sets[s.currentSetIndex];
  if (!set) return null;
  return { exerciseName: exercise.name, setNumber: set.setNumber, totalSets: record.sets.length };
}

export function getExerciseProgress(s: WorkoutState): { done: number; total: number } {
  const record = getCurrentRecord(s);
  if (!record) return { done: 0, total: 0 };
  return { done: record.sets.filter((x) => x.completed).length, total: record.sets.length };
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

export function getRemainingRestSeconds(s: WorkoutState, now: number): number {
  return remainingSeconds(s, now);
}

export function getSessionSummary(s: WorkoutState, now: number): SessionSummary {
  return summarize(s, now);
}
