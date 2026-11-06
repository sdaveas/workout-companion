import { elapsedMs } from './time';
import type { WorkoutState } from './types';

export interface SummarySet {
  setNumber: number;
  targetReps: { min: number; max: number };
  targetWeightKg: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  completed: boolean;
  skipped: boolean;
}

export interface SummaryExercise {
  exerciseId: string;
  name: string;
  sets: SummarySet[];
  skipped: boolean;
  completedAt: number | null;
}

export interface SessionSummary {
  sessionId: string;
  programId: string;
  programName: string;
  status: WorkoutState['status'];
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number;
  exercisesCompleted: number;
  exercisesSkipped: number;
  setsCompleted: number;
  setsSkipped: number;
  totalReps: number;
  volumeKg: number;
  completionRate: number;
  endedEarly: boolean;
  rpe: number | null;
  notes: string | null;
  exercises: SummaryExercise[];
}

/**
 * Volume is `weight × reps` over completed sets. Never doubled for `perHand` or
 * unilateral movements: the stored weight is already the per-hand number.
 */
export function summarize(s: WorkoutState, now: number): SessionSummary {
  const sets = s.exerciseRecords.flatMap((r) => r.sets);
  const completed = sets.filter((x) => x.completed);
  const totalPrescribed = sets.length;

  return {
    sessionId: s.sessionId,
    programId: s.programId,
    programName: s.program.name,
    status: s.status,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    durationMs: elapsedMs(s, now),
    exercisesCompleted: s.exerciseRecords.filter((r) => r.completedAt != null && !r.skipped).length,
    exercisesSkipped: s.exerciseRecords.filter((r) => r.skipped).length,
    setsCompleted: completed.length,
    setsSkipped: sets.filter((x) => x.skipped && !x.completed).length,
    totalReps: completed.reduce((n, x) => n + (x.actualReps ?? 0), 0),
    volumeKg: completed.reduce((n, x) => n + (x.actualWeightKg ?? 0) * (x.actualReps ?? 0), 0),
    completionRate: totalPrescribed === 0 ? 0 : completed.length / totalPrescribed,
    endedEarly: s.endedEarly,
    rpe: s.rpe,
    notes: s.notes,
    exercises: s.exerciseRecords.map((r) => ({
      exerciseId: r.exerciseId,
      name: r.name,
      skipped: r.skipped,
      completedAt: r.completedAt,
      sets: r.sets.map((x) => ({
        setNumber: x.setNumber,
        targetReps: x.targetReps,
        targetWeightKg: x.targetWeightKg,
        actualReps: x.actualReps,
        actualWeightKg: x.actualWeightKg,
        completed: x.completed,
        skipped: x.skipped,
      })),
    })),
  };
}

export function compareSummaries(previous: SessionSummary | null, current: SessionSummary) {
  if (!previous) return null;
  return {
    repsDelta: current.totalReps - previous.totalReps,
    volumeDelta: Math.round((current.volumeKg - previous.volumeKg) * 10) / 10,
    durationDeltaMs: current.durationMs - previous.durationMs,
    setsDelta: current.setsCompleted - previous.setsCompleted,
  };
}
