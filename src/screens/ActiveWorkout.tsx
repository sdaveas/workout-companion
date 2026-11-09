import { useEffect, useRef, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useAutoAdvance } from '../hooks/useAutoAdvance';
import { useNow } from '../hooks/useNow';
import { useWakeLock } from '../hooks/useWakeLock';
import { useSession } from '../store/sessionStore';
import {
  getCurrentExercise,
  getCurrentRecord,
  getNextExercise,
  getWorkoutProgress,
} from '../engine/selectors';
import { autoRemainingMs, skipAction } from '../engine/auto';
import { remainingMs } from '../engine/rest';
import { elapsedMs, estimatedRemainingMs } from '../engine/time';
import { formatClock, formatDuration, formatSet, formatWeight } from '../lib/format';
import { figureSlug } from '../data/exerciseFigures';
import type { WorkoutState } from '../engine/types';
import { ExerciseDetails } from '../components/exercise/ExerciseDetails';
import { ExerciseImage } from '../components/exercise/ExerciseImage';
import { ExerciseMotion } from '../components/exercise/ExerciseMotion';
import { SetEntry } from '../components/workout/SetEntry';
import { ProgressBar } from '../components/workout/ProgressBar';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { ScreenHeader } from '../components/ui/ScreenHeader';

const RUNNING: WorkoutState['status'][] = ['exercise_active', 'resting', 'exercise_complete'];

/** A double-tap on the preview's Start must not land on the set's primary button. */
const STAGE_GUARD_MS = 700;

export function ActiveWorkout() {
  const state = useSession((s) => s.state);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const dispatch = useSession((s) => s.dispatch);
  const reset = useSession((s) => s.reset);
  const startWorkout = useSession((s) => s.startWorkout);
  const [ending, setEnding] = useState(false);
  const [howTo, setHowTo] = useState(false);

  const status = state?.status;
  const auto = state?.mode === 'auto';
  const pausedInRest =
    status === 'paused' &&
    (state?.pausedFrom === 'resting' || state?.pausedFrom === 'exercise_complete');

  const now = useNow(1000, !!state);
  // Sets, breaks and auto mode all need a finer tick; a plain manual set does not.
  const tickNow = useNow(
    250,
    !!state && (status === 'resting' || status === 'exercise_complete' || pausedInRest || auto),
  );
  useAutoAdvance(state, tickNow);

  useEffect(() => {
    if (!state) navigate('#/');
  }, [state]);

  useEffect(() => {
    if (status === 'completed') navigate(`#/summary/${state?.sessionId}`);
    if (status === 'abandoned') navigate('#/');
  }, [status, state?.sessionId]);

  useWakeLock(!!state && (RUNNING.includes(state.status) || state.status === 'paused'));

  // One haptic when a break runs out, one when a set lands. Keyed so a restored
  // session does not buzz on mount.
  const restAlert = useRef<number | null>(null);
  const doneAlert = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    const done = getWorkoutProgress(state).done;
    if (doneAlert.current == null) {
      doneAlert.current = done;
    } else if (done !== doneAlert.current) {
      doneAlert.current = done;
      navigator.vibrate?.(120);
    }
    if (state.status !== 'resting' && state.status !== 'exercise_complete') return;
    if (remainingMs(state, tickNow) > 0) return;
    if (restAlert.current === state.restCount) return;
    restAlert.current = state.restCount;
    navigator.vibrate?.([200, 100, 200]);
  }, [state, tickNow]);

  if (!state) return null;

  const exercise = getCurrentExercise(state);
  const record = getCurrentRecord(state);
  const nextExercise = getNextExercise(state);
  const progress = getWorkoutProgress(state);
  const isReady = state.status === 'ready';
  const currentSet = record?.sets[state.currentSetIndex];
  const side = currentSet?.side ?? null;
  const restLeft = remainingMs(state, tickNow);
  const setLeft = autoRemainingMs(state, tickNow);
  const stageElapsed =
    state.stageStartedAt != null ? tickNow - state.stageStartedAt : Number.POSITIVE_INFINITY;
  const justStarted = state.startedAt != null && now - state.startedAt < STAGE_GUARD_MS;
  const primaryDisabled = auto ? stageElapsed < STAGE_GUARD_MS : justStarted;

  const handRows =
    side && record
      ? record.sets.slice(
          state.currentSetIndex - (state.currentSetIndex % 2),
          state.currentSetIndex - (state.currentSetIndex % 2) + 2,
        )
      : null;

  const slug = exercise ? figureSlug(exercise.name) : null;
  const hasDetails =
    !!exercise &&
    (exercise.instructions.length > 0 ||
      exercise.commonMistakes.length > 0 ||
      exercise.equipment.length > 0 ||
      exercise.muscleGroups.length > 0);

  const kicker = (() => {
    if (state.status === 'exercise_active')
      return `${auto ? 'Auto' : 'Work'}${side ? ` · ${side} hand` : ''}`;
    if (state.status === 'resting') return restLeft > 0 ? 'Rest remaining' : 'Rest complete';
    if (state.status === 'exercise_complete')
      return nextExercise && state.restStartedAt != null
        ? 'Rest before the next exercise'
        : 'Exercise complete';
    if (state.status === 'paused')
      return pausedInRest ? 'Paused · break' : 'Paused · set';
    return 'Ready';
  })();

  const bigSlot = (() => {
    if (state.status === 'exercise_active') {
      if (auto) return formatClock(setLeft);
      if (!exercise) return null;
      return `${exercise.reps.min}–${exercise.reps.max}`;
    }
    if (state.status === 'resting') return restLeft > 0 ? formatClock(restLeft) : 'Start when ready';
    if (state.status === 'exercise_complete') {
      if (nextExercise && state.restStartedAt != null)
        return restLeft > 0 ? formatClock(restLeft) : 'Continue when ready';
      return 'Continue when ready';
    }
    if (state.status === 'paused') {
      if (pausedInRest) return formatClock(restLeft);
      if (auto) return formatClock(state.stagePausedMs ?? 0);
      if (!exercise) return null;
      return `${exercise.reps.min}–${exercise.reps.max}`;
    }
    return null;
  })();

  const bigClass =
    state.status === 'resting' || pausedInRest
      ? 'text-6xl'
      : state.status === 'exercise_complete'
        ? 'text-3xl'
        : 'text-6xl';

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <ScreenHeader
        back={{
          to: '#/',
          label: 'Home',
          compact: true,
          onSelect: isReady
            ? () => {
                reset();
                navigate('#/');
              }
            : undefined,
        }}
        title={
          <>
            <p className="truncate text-xs uppercase tracking-[0.2em] text-muted">
              {state.program.name}
            </p>
            {!isReady && (
              <p className="text-xl font-semibold tabular-nums" aria-label="elapsed time">
                {formatClock(elapsedMs(state, now))}
              </p>
            )}
          </>
        }
        actions={
          !isReady && (
            <>
              {RUNNING.includes(state.status) && (
                <button
                  type="button"
                  aria-pressed={auto}
                  onClick={() => dispatch({ type: auto ? 'STOP_AUTO' : 'START_AUTO' })}
                  className={`h-11 rounded-xl border px-3 text-sm ${
                    auto ? 'border-accent text-accent' : 'border-line text-muted'
                  }`}
                >
                  {auto ? 'Auto on' : 'Auto'}
                </button>
              )}
              {state.undoStack.length > 0 && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'UNDO' })}
                  className="h-11 rounded-xl border border-line px-3 text-sm text-muted"
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => setEnding((v) => !v)}
                aria-expanded={ending}
                className="h-11 rounded-xl border border-line px-3 text-sm text-muted"
              >
                End
              </button>
            </>
          )
        }
      >
        {!isReady && (
          <>
            <div className="mt-2">
              <ProgressBar
                value={progress.ratio}
                label={`${progress.done} of ${progress.total} sets${
                  progress.skipped > 0 ? `, ${progress.skipped} skipped` : ''
                }`}
              />
            </div>
            <p className="mt-2 truncate text-xs tabular-nums text-muted">
              Set {formatSet(side, state.currentSetIndex + 1, record?.sets.length ?? 0)} · Exercise{' '}
              {state.currentExerciseIndex + 1} / {state.program.exercises.length} ·{' '}
              {formatDuration(estimatedRemainingMs(state, now))} left
            </p>
          </>
        )}
      </ScreenHeader>

      {error && (
        <div className="absolute inset-x-5 bottom-44 z-30">
          <Banner message={error} onDismiss={clearError} />
        </div>
      )}

      <section
        data-testid="stage"
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-3 pt-4"
      >
        <p className="shrink-0 text-xs uppercase tracking-[0.2em] text-muted">{kicker}</p>

        {bigSlot && (
          <p className={`mt-2 shrink-0 font-semibold tabular-nums ${bigClass}`} role="status">
            {bigSlot}
          </p>
        )}
        {state.status === 'exercise_active' && !auto && (
          <p className="shrink-0 text-xs text-muted">reps</p>
        )}

        <div className="mt-2 flex shrink-0 items-center gap-2">
          {state.status === 'exercise_active' && auto && (
            <>
              <Button
                className="h-10 px-3"
                onClick={() => dispatch({ type: 'EXTEND_STAGE', seconds: -15 })}
              >
                −15s
              </Button>
              <Button
                className="h-10 px-3"
                onClick={() => dispatch({ type: 'EXTEND_STAGE', seconds: 15 })}
              >
                +15s
              </Button>
            </>
          )}
          {(state.status === 'resting' ||
            (state.status === 'exercise_complete' && state.restStartedAt != null)) &&
            restLeft > 0 && (
              <>
                <Button
                  className="h-10 px-3"
                  onClick={() => dispatch({ type: 'ADJUST_REST', seconds: -15 })}
                >
                  −15s
                </Button>
                <Button
                  className="h-10 px-3"
                  onClick={() => dispatch({ type: 'ADJUST_REST', seconds: 15 })}
                >
                  +15s
                </Button>
              </>
            )}
        </div>

        {exercise && (
          <h1 className="mt-2 shrink-0 truncate text-2xl font-semibold leading-tight" title={exercise.name}>
            {exercise.name}
          </h1>
        )}
        {exercise && (
          <p className="shrink-0 truncate text-sm text-muted">
            {exercise.sets} × {exercise.reps.min}–{exercise.reps.max} ·{' '}
            {formatWeight(exercise.weightKg, exercise.perHand)}
          </p>
        )}

        {handRows && state.status === 'exercise_active' && (
          <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
            {handRows.map((hand) => (
              <div
                key={hand.setNumber}
                className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs ${
                  hand.completed ? 'border-accent text-accent' : 'border-line text-muted'
                }`}
              >
                <span>{hand.side === 'left' ? 'Left hand' : 'Right hand'}</span>
                <span>{hand.completed ? '✓' : '·'}</span>
              </div>
            ))}
          </div>
        )}

        {exercise && (
          <>
            {slug ? (
              <div className="mt-3 hidden shrink-0 [@media(min-height:700px)]:block">
                <ExerciseMotion slug={slug} className="h-20 w-full" />
              </div>
            ) : (
              <div className="mt-3 hidden shrink-0 [@media(min-height:700px)]:block">
                <ExerciseImage src={exercise.imageUrl} alt={exercise.name} className="h-20 w-full" />
              </div>
            )}
          </>
        )}

        {exercise && state.draft && state.status === 'exercise_active' && (
          <div data-testid="stepper" className="mt-3 shrink-0 rounded-2xl border border-line bg-surface px-3 py-1">
            <SetEntry
              compact
              exercise={exercise}
              draft={state.draft}
              onChange={(draft) => dispatch({ type: 'SET_DRAFT', ...draft })}
            />
          </div>
        )}

        {hasDetails && exercise && (
          <button
            type="button"
            onClick={() => setHowTo(true)}
            className="mt-3 shrink-0 self-start text-xs uppercase tracking-widest text-muted underline underline-offset-4"
          >
            How to do it
          </button>
        )}
      </section>

      <footer
        data-testid="footer"
        className="shrink-0 border-t border-line bg-ink px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
      >
        {isReady && (
          <Button variant="primary" className="h-14 w-full text-base" onClick={startWorkout}>
            Start
          </Button>
        )}

        {state.status === 'exercise_active' && exercise && (
          <div className="space-y-2">
            <Button
              variant="primary"
              className="h-14 w-full text-base"
              disabled={primaryDisabled}
              onClick={() =>
                dispatch({
                  type: 'COMPLETE_SET',
                  reps: state.draft?.reps ?? exercise.reps.min,
                  weightKg: state.draft?.weightKg ?? exercise.weightKg ?? null,
                })
              }
            >
              {auto ? 'Done now' : side ? `Complete ${side} hand` : 'Complete set'}
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  const action = skipAction(state);
                  if (action) dispatch(action);
                }}
              >
                {auto ? 'Skip stage' : 'Skip set'}
              </Button>
              <Button variant="ghost" onClick={() => dispatch({ type: 'SKIP_EXERCISE' })}>
                Skip exercise
              </Button>
              <Button variant="ghost" onClick={() => dispatch({ type: 'PAUSE' })}>
                Pause
              </Button>
            </div>
          </div>
        )}

        {state.status === 'resting' && (
          <div className="space-y-2">
            {restLeft === 0 ? (
              <Button
                variant="primary"
                className="h-14 w-full text-base"
                onClick={() => dispatch({ type: 'REST_DONE' })}
              >
                Start set
              </Button>
            ) : (
              <Button className="h-14 w-full text-base" onClick={() => dispatch({ type: 'SKIP_REST' })}>
                Skip rest
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => dispatch({ type: 'RESTART_REST' })}>
                Restart rest
              </Button>
              <Button variant="ghost" onClick={() => dispatch({ type: 'PAUSE' })}>
                Pause
              </Button>
            </div>
          </div>
        )}

        {state.status === 'paused' && (
          <Button
            variant="primary"
            className="h-14 w-full text-base"
            onClick={() => dispatch({ type: 'RESUME' })}
          >
            Resume
          </Button>
        )}

        {state.status === 'exercise_complete' && (
          <div className="space-y-2">
            <Button
              variant="primary"
              className="h-14 w-full text-base"
              onClick={() => dispatch({ type: 'NEXT_EXERCISE' })}
            >
              {nextExercise ? 'Continue' : 'Finish workout'}
            </Button>
            <div className={`grid gap-2 ${state.restStartedAt != null ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {state.restStartedAt != null && (
                <Button variant="ghost" onClick={() => dispatch({ type: 'RESTART_REST' })}>
                  Restart rest
                </Button>
              )}
              <Button variant="ghost" onClick={() => dispatch({ type: 'PAUSE' })}>
                Pause
              </Button>
            </div>
          </div>
        )}
      </footer>

      {ending && (
        <div className="absolute inset-x-5 bottom-24 z-30 rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs text-muted">End this session?</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => dispatch({ type: 'FINISH' })}>
              Finish &amp; save
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirm('Abandon this session? It will not appear in history.')) {
                  dispatch({ type: 'ABANDON' });
                }
              }}
            >
              Abandon
            </Button>
          </div>
        </div>
      )}

      {howTo && exercise && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-ink px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{exercise.name}</h2>
            <Button className="h-11" onClick={() => setHowTo(false)}>
              Close
            </Button>
          </div>
          <ExerciseDetails exercise={exercise} open />
        </div>
      )}
    </main>
  );
}
