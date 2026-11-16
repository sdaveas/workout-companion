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

    case 'REPEAT_SET':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete'])
        ? repeatSet(s, e)
        : null;

    case 'UPDATE_SET_RESULT':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete', 'completed'])
        ? updateSetResult(s, e)
        : null;

    case 'SET_DRAFT':
      // Allowed during the break too: the next set's reps are decided while resting.
      return inStatus(s, ['exercise_active', 'resting']) ? setDraft(s, e) : null;

    case 'SET_EXERCISE_RESULT':
      return inStatus(s, ['exercise_active', 'resting', 'exercise_complete'])
        ? setExerciseResult(s, e)
        : null;

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
    // The next set starts from what was just lifted, not the prescription: a weight
    // bumped on set 1 should not need bumping again on every set after it.
    draft: { reps, weightKg },
    status: rest.restStartedAt != null ? 'resting' : 'exercise_active',
    ...rest,
    ...stage,
  };
}

/**
 * One more set of the current exercise, as a fresh row after the last one recorded.
 *
 * Same action for two wishes: the set was logged as one when it should have been two
 * hands, or the session simply wants another set. The new rows start uncompleted, and
 * the program stays untouched — the session records what was actually done.
 */
function repeatSet(s: WorkoutState, e: { now: number }): WorkoutState {
  const exercise = currentExercise(s);
  const record = s.exerciseRecords[s.currentExerciseIndex];
  const sets = record.sets;
  if (sets.length === 0) throw new InvalidTransition(s.status, 'REPEAT_SET');

  // On exercise_complete the index already sits on the last set, which is the one to repeat.
  const template = sets[Math.min(s.currentSetIndex, sets.length - 1)];
  const nextNumber = Math.max(...sets.map((x) => x.setNumber)) + 1;
  // A one-hand exercise records one row per hand, so a repeat adds a left and a right.
  const sides = exercise.perHand ? (['left', 'right'] as const) : ([null] as const);
  const rows = sides.map((side, i) => ({
    setNumber: nextNumber + i,
    side,
    targetReps: template.targetReps,
    targetWeightKg: template.targetWeightKg,
    actualReps: null,
    actualWeightKg: null,
    completed: false,
    skipped: false,
    completedAt: null,
  }));

  return {
    ...s,
    exerciseRecords: s.exerciseRecords.map((r, i) =>
      i === s.currentExerciseIndex
        ? {
            ...r,
            sets: [...sets, ...rows],
            completedAt: null,
            skipped: false,
            skippedAt: null,
          }
        : r,
    ),
    currentSetIndex: sets.length,
    draft: draftFor(exercise),
    undoStack: withUndo(s),
    status: 'exercise_active',
    ...clearedRest(),
    ...stageClock(s.mode, exercise, e.now),
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

function adjustRest(s: WorkoutState, e: Extract<WorkoutEvent, { type: 'ADJUST_REST' }>): WorkoutState {
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
          sets: r.sets.map((set) => (set.completed ? set : { ...set, skipped: true, completedAt: e.now })),
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
    const sets = r.sets.map((set, j) => (j >= from && !set.completed ? { ...set, skipped: true, completedAt: e.now } : set));
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
 * or an expired rest, any of which would make the driver fire 250 ms later.
 *
 * Auto is the user's preference, not a property of the set, so undo keeps it on and
 * re-arms a fresh clock instead of dropping to manual. A restored break gets a fresh
 * clock for the same reason, so neither is a ghost that has already expired.
 */
function undo(s: WorkoutState, now: number): WorkoutState | null {
  const entry = s.undoStack.at(-1);
  if (!entry) return null;
  const restored = {
    ...entry,
    program: s.program,
    undoStack: s.undoStack.slice(0, -1),
    ...clearedStage(),
  };
  if (restored.restStartedAt != null) restored.restStartedAt = now;
  if (restored.status === 'exercise_active' && restored.mode === 'auto') {
    Object.assign(restored, stageClock('auto', currentExercise(restored), now));
  }
  return restored;
}

/**
 * "That last exercise was 4 sets of 12, not 3 of 10" — fixed up during its break.
 *
 * Only a finished exercise can be corrected, and only its own rows: logged sets take
 * the new number, extra sets are logged as done at that count, dropped ones go.
 * Nothing here touches the program or the next exercise. No undo entry: one tap of a
 * stepper is not a step, and ten of them would bury the step that logged the set.
 */
function setExerciseResult(s: WorkoutState, e: Extract<WorkoutEvent, { type: 'SET_EXERCISE_RESULT' }>): WorkoutState {
  const record = s.exerciseRecords[e.exerciseIndex];
  const exercise = s.program.exercises[e.exerciseIndex];
  if (!record || !exercise) throw new InvalidArgument('No such exercise.');
  if (record.completedAt == null) throw new InvalidArgument('That exercise is not finished.');

  const reps = checkReps(e.reps);
  if (reps > 100) throw new InvalidArgument('Reps must be 0 to 100.');
  if (!isInt(e.sets) || e.sets < 1 || e.sets > 20) {
    throw new InvalidArgument('Sets must be 1 to 20.');
  }

  // A per-hand exercise logs one row per hand, so its set count is a row pair.
  const factor = exercise.perHand ? 2 : 1;
  const rows: SetRecord[] = Array.from({ length: e.sets * factor }, (_, n) => {
    const old = record.sets[n];
    // A skipped set is not a set that was done: it keeps its own row.
    if (old) return old.skipped ? old : { ...old, actualReps: reps };
    return {
      setNumber: n + 1,
      side: exercise.perHand ? ((n % 2 === 0 ? 'left' : 'right') as 'left' | 'right') : null,
      targetReps: { min: reps, max: reps },
      targetWeightKg: exercise.weightKg,
      actualReps: reps,
      actualWeightKg: exercise.weightKg,
      completed: true,
      skipped: false,
      completedAt: e.now,
    };
  });

  return {
    ...s,
    exerciseRecords: s.exerciseRecords.map((r, i) => (i === e.exerciseIndex ? { ...r, sets: rows } : r)),
  };
}

function setRpe(s: WorkoutState, e: Extract<WorkoutEvent, { type: 'SET_RPE' }>): WorkoutState {
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
