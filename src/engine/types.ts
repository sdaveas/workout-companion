export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface ProgramExercise {
  id: string;
  name: string;
  sets: number;
  reps: { min: number; max: number };
  weightKg: number | null;
  perHand: boolean;
  restSeconds: number;
  instructions: string[];
  commonMistakes: string[];
  equipment: string[];
  muscleGroups: string[];
  imageUrl: string | null;
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  /** Empty means "no fixed day": a one-off routine. */
  scheduleDays: Weekday[];
  estimatedDurationMinutes: number | null;
  exercises: ProgramExercise[];
  raw: string;
}

export type WorkoutStatus =
  | 'ready'
  | 'exercise_active'
  | 'resting'
  | 'paused'
  | 'exercise_complete'
  | 'completed'
  | 'abandoned';

export interface SetRecord {
  setNumber: number;
  /** A unilateral movement records one row per hand; `null` for a normal set. */
  side?: 'left' | 'right' | null;
  targetReps: { min: number; max: number };
  targetWeightKg: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
}

export interface ExerciseRecord {
  exerciseId: string;
  name: string;
  sets: SetRecord[];
  skipped: boolean;
  skippedAt: number | null;
  completedAt: number | null;
}

export interface WorkoutState {
  sessionId: string;
  programId: string;
  program: Program;
  status: WorkoutStatus;
  currentExerciseIndex: number;
  currentSetIndex: number;
  startedAt: number | null;
  finishedAt: number | null;
  pausedAt: number | null;
  pausedFrom: 'exercise_active' | 'resting' | null;
  totalPausedMs: number;
  restStartedAt: number | null;
  restDurationMs: number;
  restPausedMs: number | null;
  restCount: number;
  /** Seconds of rest the user last chose per exercise, when it differs from the program's. */
  restUsed?: number[];
  exerciseRecords: ExerciseRecord[];
  undoStack: UndoEntry[];
  draft: { reps: number; weightKg: number | null } | null;
  endedEarly: boolean;
  rpe: number | null;
  notes: string | null;
  updatedAt: number;
}

export type UndoEntry = Omit<WorkoutState, 'program' | 'undoStack'>;

export type WorkoutEvent =
  | { type: 'START'; now: number }
  | { type: 'COMPLETE_SET'; now: number; reps: number; weightKg: number | null }
  | { type: 'SKIP_SET'; now: number }
  | {
      type: 'UPDATE_SET_RESULT';
      now: number;
      exerciseIndex: number;
      setNumber: number;
      reps: number;
      weightKg: number | null;
    }
  | { type: 'SET_DRAFT'; now: number; reps: number; weightKg: number | null }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ADJUST_REST'; now: number; seconds: number }
  | { type: 'RESTART_REST'; now: number }
  | { type: 'REST_DONE'; now: number }
  | { type: 'SKIP_REST'; now: number }
  | { type: 'NEXT_EXERCISE'; now: number }
  | { type: 'SKIP_EXERCISE'; now: number }
  | { type: 'FINISH'; now: number }
  | { type: 'UNDO'; now: number }
  | { type: 'SET_RPE'; now: number; rpe: number | null }
  | { type: 'SET_NOTES'; now: number; notes: string }
  | { type: 'ABANDON'; now: number };

export type WorkoutAction = WorkoutEvent extends infer E
  ? E extends { now: number }
    ? Omit<E, 'now'>
    : never
  : never;
