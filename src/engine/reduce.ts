import { draftFor } from './ids';
import { InvalidArgument, InvalidTransition } from './errors';
import { autoRemainingMs, clearedStage, rebaseStage, stageClock } from './auto';
import { rebaseRest, remainingMs, restartRest } from './rest';
import type {
  SetRecord,
  UndoEntry,
  WorkoutEvent,
  WorkoutState,
  WorkoutStatus,
} from './types';

const UNDO_LIMIT = 10;

function strip(s: WorkoutState): UndoEntry {
  const { program: _program, undoStack: _undoStack, ...rest } = s;
  return rest;
}

function withUndo(s: WorkoutState): UndoEntry[] {
  return [...s.undoStack, strip(s)].slice(-UNDO_LIMIT);
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

function checkReps(reps: unknown): number {
  if (!isInt(reps) || reps < 0) throw new InvalidArgument('Reps must be a non-negative integer.');
  return reps;
}

function checkWeight(w: unknown): number | null {
  if (w == null) return null;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < 0)
    throw new InvalidArgument('Weight must be a non-negative number.');
  return w;
}

function currentSets(s: WorkoutState): SetRecord[] {
  return s.exerciseRecords[s.currentExerciseIndex].sets;
}

function currentExercise(s: WorkoutState) {
  return s.program.exercises[s.currentExerciseIndex];
}

function clearedRest(): Pick<
  WorkoutState,
  'restStartedAt' | 'restDurationMs' | 'restPausedMs'
> {
  return { restStartedAt: null, restDurationMs: 0, restPausedMs: null };
}

function inStatus(s: WorkoutState, allowed: WorkoutStatus[]): boolean {
  return allowed.includes(s.status);
}

export function reduce(state: WorkoutState, e: WorkoutEvent): WorkoutState {
  const next = handle(state, e);
  if (!next) throw new InvalidTransition(state.status, e.type);
  return { ...next, updatedAt: e.now };
}

function handle(s: WorkoutState, e: WorkoutEvent): WorkoutState | null {
  switch (e.type) {
    case 'START':
      return s.status === 'ready' ? start(s, e) : null;

    case 'COMPLETE_SET':
      return inStatus(s, ['exercise_active']) ? completeSet(s, e) : null;

    case 'SKIP_SET':
      return inStatus(s, ['exercise_active']) ? skipSet(s, e) : null;

    case 'UPDATE_SET_RESULT':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete', 'completed'])
        ? updateSetResult(s, e)
        : null;

    case 'SET_DRAFT':
      return inStatus(s, ['exercise_active']) ? setDraft(s, e) : null;

    case 'PAUSE':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete']) ? pause(s, e) : null;

    case 'RESUME':
      return s.status === 'paused' ? resume(s, e) : null;

    case 'ADJUST_REST':
      return inStatus(s, ['resting', 'exercise_complete']) ? adjustRest(s, e) : null;

    case 'RESTART_REST':
      return inStatus(s, ['resting', 'exercise_complete']) ? restart(s, e) : null;

    case 'START_AUTO':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete'])
        ? startAuto(s, e.now)
        : null;

    case 'STOP_AUTO':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete'])
        ? { ...s, mode: 'manual', ...clearedStage() }
        : null;

    case 'EXTEND_STAGE':
      return s.status === 'exercise_active' && s.mode === 'auto' && s.stageStartedAt != null
        ? { ...s, ...rebaseStage(s, e.now, e.seconds) }
        : null;

    case 'REST_DONE':
      return s.status === 'resting' && remainingMs(s, e.now) === 0 ? beginSet(s, e.now) : null;

    case 'SKIP_REST':
      return inStatus(s, ['resting']) ? beginSet(s, e.now) : null;

    case 'NEXT_EXERCISE':
      return inStatus(s, ['exercise_complete']) ? nextExercise(s, e) : null;

    case 'SKIP_EXERCISE':
      return inStatus(s, ['exercise_active', 'resting']) ? skipExercise(s, e) : null;

    case 'FINISH':
      return inStatus(s, ['exercise_active', 'resting', 'paused', 'exercise_complete'])
        ? finish(s, e)
        : null;

    case 'UNDO':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete'])
        ? undo(s, e.now)
        : null;

    case 'SET_RPE':
      return s.status === 'completed' ? setRpe(s, e) : null;

    case 'SET_NOTES':
      return s.status === 'completed' ? { ...s, notes: e.notes.slice(0, 2000) } : null;

    case 'ABANDON':
      return inStatus(s, ['exercise_active', 'resting', 'paused', 'exercise_complete'])
        ? abandon(s, e)
        : null;
  }
}

function start(s: WorkoutState, e: { now: number }): WorkoutState {
  return { ...s, status: 'exercise_active', startedAt: e.now };
}

function startAuto(s: WorkoutState, now: number): WorkoutState {
  return {
    ...s,
    mode: 'auto',
    // A rest that is already running keeps its clock and starts advancing on its own.
    ...(s.status === 'exercise_active'
      ? stageClock('auto', currentExercise(s), now)
      : clearedStage()),
  };
}

function completeSet(
  s: WorkoutState,
  e: Extract<WorkoutEvent, { type: 'COMPLETE_SET' }>,
): WorkoutState {
  const reps = checkReps(e.reps);
  const weightKg = checkWeight(e.weightKg);
  const exercise = currentExercise(s);
  const index = s.currentSetIndex;
  const sets = currentSets(s);

  const updatedSets = sets.map((set, i) =>
    i === index
      ? { ...set, actualReps: reps, actualWeightKg: weightKg, completed: true, completedAt: e.now }
      : set,
  );
  const records = s.exerciseRecords.map((r, i) => (i === s.currentExerciseIndex ? { ...r, sets: updatedSets } : r));
  const moreSets = index + 1 < sets.length;

  // Left hand done → the right hand follows immediately; the break comes after both.
  const betweenHands = sets[index].side === 'left';
  const rest =
    exercise.restSeconds > 0 && !betweenHands
      ? { restStartedAt: e.now, restDurationMs: exercise.restSeconds * 1000, restPausedMs: null, restCount: s.restCount + 1 }
      : clearedRest();

  if (!moreSets) {
    // The break after the last set of an exercise is the break before the next one.
    return {
      ...s,
      exerciseRecords: records.map((r, i) =>
        i === s.currentExerciseIndex ? { ...r, completedAt: e.now } : r,
      ),
      undoStack: withUndo(s),
      status: 'exercise_complete',
      draft: null,
      ...rest,
      ...clearedStage(),
    };
  }

  const stage = rest.restStartedAt != null ? clearedStage() : stageClock(s.mode, exercise, e.now);

  return {
    ...s,
    exerciseRecords: records,
    undoStack: withUndo(s),
    currentSetIndex: index + 1,
    draft: draftFor(exercise),
    status: rest.restStartedAt != null ? 'resting' : 'exercise_active',
    ...rest,
    ...stage,
  };
}

function skipSet(s: WorkoutState, e: { now: number }): WorkoutState {
  const index = s.currentSetIndex;
  const sets = currentSets(s);
  const exercise = currentExercise(s);
  // A "set" of a one-hand movement is both hands, so one skip clears both rows.
  const last = exercise.perHand && sets[index].side === 'left' ? index + 1 : index;
  const updatedSets = sets.map((set, i) =>
    i >= index && i <= last ? { ...set, skipped: true, completedAt: e.now } : set,
  );
  const records = s.exerciseRecords.map((r, i) =>
    i === s.currentExerciseIndex ? { ...r, sets: updatedSets } : r,
  );
  const moreSets = last + 1 < sets.length;

  if (!moreSets) {
    return {
      ...s,
      exerciseRecords: records.map((r, i) =>
        i === s.currentExerciseIndex ? { ...r, skipped: true, skippedAt: e.now } : r,
      ),
      undoStack: withUndo(s),
      status: 'exercise_complete',
      draft: null,
      ...clearedRest(),
      ...clearedStage(),
    };
  }

  return {
    ...s,
    exerciseRecords: records,
    undoStack: withUndo(s),
    currentSetIndex: last + 1,
    draft: draftFor(exercise),
    status: 'exercise_active',
    ...clearedRest(),
    ...stageClock(s.mode, exercise, e.now),
  };
}

function updateSetResult(
  s: WorkoutState,
  e: Extract<WorkoutEvent, { type: 'UPDATE_SET_RESULT' }>,
): WorkoutState {
  const record = s.exerciseRecords[e.exerciseIndex];
  if (!record) throw new InvalidArgument(`No exercise at index ${e.exerciseIndex}.`);
  const set = record.sets[e.setNumber - 1];
  if (!set) throw new InvalidArgument(`No set ${e.setNumber} in that exercise.`);
  if (!set.completed && !set.skipped)
    throw new InvalidArgument(`Set ${e.setNumber} has not been recorded yet.`);

  const reps = checkReps(e.reps);
  const weightKg = checkWeight(e.weightKg);

  return {
    ...s,
    exerciseRecords: s.exerciseRecords.map((r, i) =>
      i === e.exerciseIndex
        ? {
            ...r,
            sets: r.sets.map((x, j) =>
              j === e.setNumber - 1 ? { ...x, actualReps: reps, actualWeightKg: weightKg } : x,
            ),
          }
        : r,
    ),
  };
}

function setDraft(
  s: WorkoutState,
  e: Extract<WorkoutEvent, { type: 'SET_DRAFT' }>,
): WorkoutState {
  return { ...s, draft: { reps: checkReps(e.reps), weightKg: checkWeight(e.weightKg) } };
}

function pause(s: WorkoutState, e: { now: number }): WorkoutState {
  if (s.status === 'resting' || s.status === 'exercise_complete') {
    return {
      ...s,
      status: 'paused',
      pausedFrom: s.status,
      pausedAt: e.now,
      // No rest clock at all (a 0-second break, a skipped exercise) → nothing to freeze.
      restPausedMs: s.restStartedAt == null ? null : remainingMs(s, e.now),
      restStartedAt: null,
    };
  }
  return {
    ...s,
    status: 'paused',
    pausedFrom: 'exercise_active',
    pausedAt: e.now,
    stagePausedMs: s.mode === 'auto' ? autoRemainingMs(s, e.now) : null,
    stageStartedAt: null,
    stageDurationMs: 0,
  };
}

function resume(s: WorkoutState, e: { now: number }): WorkoutState {
  const pausedMs = s.pausedAt == null ? 0 : e.now - s.pausedAt;
  const base = {
    ...s,
    pausedAt: null,
    totalPausedMs: s.totalPausedMs + pausedMs,
  };
  if (s.pausedFrom === 'resting' || s.pausedFrom === 'exercise_complete') {
    const hadRest = s.restPausedMs != null;
    return {
      ...base,
      status: s.pausedFrom,
      pausedFrom: null,
      restStartedAt: hadRest ? e.now : null,
      restDurationMs: s.restPausedMs ?? 0,
      restPausedMs: null,
    };
  }
  const stage =
    s.mode === 'auto' && s.stagePausedMs != null
      ? { stageStartedAt: e.now, stageDurationMs: s.stagePausedMs, stagePausedMs: null }
      : clearedStage();
  return { ...base, status: 'exercise_active', pausedFrom: null, ...stage };
}

/**
 * Remember the rest the user actually took, so the summary can offer to keep it.
 * Only sane values: a rest rebased to nothing is not a preference.
 */
function rememberRest(s: WorkoutState, restDurationMs: number): WorkoutState {
  if (!Number.isFinite(restDurationMs) || restDurationMs <= 0) return s;
  const restUsed = [...(s.restUsed ?? s.program.exercises.map((e) => e.restSeconds))];
  const seconds = Math.round(restDurationMs / 1000);
  if (restUsed[s.currentExerciseIndex] === seconds) return s;
  restUsed[s.currentExerciseIndex] = seconds;
  return { ...s, restUsed };
}

function adjustRest(
  s: WorkoutState,
  e: Extract<WorkoutEvent, { type: 'ADJUST_REST' }>,
): WorkoutState {
  const rest = rebaseRest(s, e.now, e.seconds);
  return rememberRest({ ...s, ...rest }, rest.restDurationMs);
}

function restart(s: WorkoutState, e: { now: number }): WorkoutState {
  const rest = restartRest(s, e.now, currentExercise(s).restSeconds);
  return rememberRest({ ...s, ...rest }, rest.restDurationMs);
}

function beginSet(s: WorkoutState, now: number): WorkoutState {
  return {
    ...s,
    status: 'exercise_active',
    ...clearedRest(),
    ...stageClock(s.mode, currentExercise(s), now),
  };
}

function nextExercise(s: WorkoutState, e: { now: number }): WorkoutState {
  const last = s.currentExerciseIndex === s.program.exercises.length - 1;
  if (last) {
    return {
      ...s,
      status: 'completed',
      finishedAt: e.now,
      endedEarly: false,
      undoStack: withUndo(s),
      ...clearedRest(),
      ...clearedStage(),
    };
  }
  const nextIndex = s.currentExerciseIndex + 1;
  return {
    ...s,
    status: 'exercise_active',
    currentExerciseIndex: nextIndex,
    currentSetIndex: 0,
    draft: draftFor(s.program.exercises[nextIndex]),
    undoStack: withUndo(s),
    ...clearedRest(),
    ...stageClock(s.mode, s.program.exercises[nextIndex], e.now),
  };
}

function skipExercise(s: WorkoutState, e: { now: number }): WorkoutState {
  const records = s.exerciseRecords.map((r, i) =>
    i === s.currentExerciseIndex
      ? {
          ...r,
          skipped: true,
          skippedAt: e.now,
          sets: r.sets.map((set) =>
            set.completed ? set : { ...set, skipped: true, completedAt: e.now },
          ),
        }
      : r,
  );
  return {
    ...s,
    exerciseRecords: records,
    undoStack: withUndo(s),
    status: 'exercise_complete',
    draft: null,
    ...clearedRest(),
    ...clearedStage(),
  };
}

function finish(s: WorkoutState, e: { now: number }): WorkoutState {
  const records = s.exerciseRecords.map((r, i) => {
    if (i < s.currentExerciseIndex) return r;
    const from = i === s.currentExerciseIndex ? s.currentSetIndex : 0;
    const sets = r.sets.map((set, j) =>
      j >= from && !set.completed ? { ...set, skipped: true, completedAt: e.now } : set,
    );
    const anySkipped = sets.some((set) => set.skipped);
    return { ...r, sets, skipped: r.skipped || anySkipped };
  });

  return {
    ...s,
    exerciseRecords: records,
    status: 'completed',
    finishedAt: e.now,
    pausedAt: null,
    pausedFrom: null,
    endedEarly: records.some((r) => r.sets.some((set) => !set.completed)),
    draft: null,
    undoStack: withUndo(s),
    ...clearedRest(),
    ...clearedStage(),
  };
}

/**
 * Undo is a manual correction: the restored stage may have no clock, a spent clock
 * or an expired rest, any of which would make the driver fire 250 ms later. So auto
 * turns off; one tap of the Auto chip re-arms it.
 */
function undo(s: WorkoutState, now: number): WorkoutState | null {
  const entry = s.undoStack.at(-1);
  if (!entry) return null;
  const restored = {
    ...entry,
    program: s.program,
    undoStack: s.undoStack.slice(0, -1),
    mode: 'manual' as const,
    ...clearedStage(),
  };
  // A restored break gets a fresh clock so it is not a ghost that has already expired.
  if (restored.restStartedAt != null) restored.restStartedAt = now;
  return restored;
}

function setRpe(
  s: WorkoutState,
  e: Extract<WorkoutEvent, { type: 'SET_RPE' }>,
): WorkoutState {
  if (e.rpe === null) return { ...s, rpe: null };
  if (!isInt(e.rpe) || e.rpe < 1 || e.rpe > 10)
    throw new InvalidArgument('RPE must be an integer from 1 to 10.');
  return { ...s, rpe: e.rpe };
}

function abandon(s: WorkoutState, e: { now: number }): WorkoutState {
  return {
    ...s,
    status: 'abandoned',
    finishedAt: e.now,
    pausedAt: null,
    pausedFrom: null,
    ...clearedRest(),
    ...clearedStage(),
  };
}
