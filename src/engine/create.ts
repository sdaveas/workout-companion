import { draftFor } from './ids';
import type { Program, WorkoutState } from './types';

export function createSession(program: Program, now: number, sessionId: string): WorkoutState {
  return {
    sessionId,
    programId: program.id,
    program,
    status: 'ready',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    startedAt: null,
    finishedAt: null,
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
      skipped: false,
      skippedAt: null,
      completedAt: null,
      // A per-hand exercise is performed twice per set: left, then right.
      sets: Array.from({ length: e.sets * (e.perHand ? 2 : 1) }, (_, i) => ({
        setNumber: i + 1,
        side: e.perHand ? ((i % 2 === 0 ? 'left' : 'right') as 'left' | 'right') : null,
        targetReps: { ...e.reps },
        targetWeightKg: e.weightKg,
        actualReps: null,
        actualWeightKg: null,
        completed: false,
        skipped: false,
        completedAt: null,
      })),
    })),
    undoStack: [],
    draft: draftFor(program.exercises[0]),
    endedEarly: false,
    rpe: null,
    notes: null,
    updatedAt: now,
  };
}
