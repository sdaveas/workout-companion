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
import { formatClock, formatDuration, formatSet, formatSetNumber, formatWeight } from '../lib/format';
import { figureSlug } from '../data/exerciseFigures';
import type { ProgramExercise, WorkoutAction, WorkoutState } from '../engine/types';
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

/** How long the closing hand stays ticked before the rest screen takes over. */
const HAND_TICK_MS = 600;

const TRANSPORT_BTN =
  'flex h-12 flex-1 items-center justify-center rounded-xl border font-gym text-sm disabled:opacity-40';

/** The primary action keeps the same size and type in every stage of the session. */
const PRIMARY_BTN = 'h-14 flex-[3] font-gym text-base';

const AUTO_ON = 'border-accent bg-accent/10 text-accent';
const AUTO_OFF = 'border-line text-muted';

/** "6–10", or just "6" when the prescription is a single number. */
const repsText = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

/** The mode toggle sits beside the primary action, where the set is won or lost. */
function AutoToggle({
  auto,
  dispatch,
}: {
  auto: boolean;
  dispatch: (action: WorkoutAction) => void;
}) {
  return (
    <button
      type="button"
      aria-label={auto ? 'Stop auto' : 'Start auto'}
      aria-pressed={auto}
      onClick={() => dispatch({ type: auto ? 'STOP_AUTO' : 'START_AUTO' })}
      className={`flex h-14 flex-1 items-center justify-center rounded-xl border font-gym text-sm ${
        auto ? AUTO_ON : AUTO_OFF
      }`}
    >
      auto
    </button>
  );
}

/** One row per remaining exercise; the one about to start is lit up. */
function ExerciseOverview({
  exercises,
  firstNumber,
  activeId,
  className,
}: {
  exercises: ProgramExercise[];
  firstNumber: number;
  activeId?: string | null;
  className?: string;
}) {
  return (
    <div data-testid="overview" className={className}>
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Up next</p>
      <ul className="mt-1 divide-y divide-line">
        {exercises.map((next, i) => {
          const active = next.id === activeId;
          return (
            <li key={next.id} className="flex items-center gap-3 py-1.5">
              <span
                className={`w-5 shrink-0 text-right text-xs tabular-nums ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {firstNumber + i}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  active ? 'font-semibold text-white' : 'font-medium'
                }`}
              >
                {next.name}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {next.sets} × {repsText(next.reps)} · {formatWeight(next.weightKg, next.perHand)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The session transport: previous set, then skip the set or restart the break. */
function TransportRow({
  state,
  dispatch,
}: {
  state: WorkoutState;
  dispatch: (action: WorkoutAction) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        aria-label="Previous set"
        disabled={state.undoStack.length === 0}
        onClick={() => dispatch({ type: 'UNDO' })}
        className={`${TRANSPORT_BTN} border-line text-muted`}
      >
        previous
      </button>
      {state.status === 'exercise_active' ? (
        <button
          type="button"
          aria-label="Skip set"
          onClick={() => {
            const action = skipAction(state);
            if (action) dispatch(action);
          }}
          className={`${TRANSPORT_BTN} border-line text-muted`}
        >
          next
        </button>
      ) : (
        state.restStartedAt != null ? (
          <button
            type="button"
            aria-label="Restart rest"
            onClick={() => dispatch({ type: 'RESTART_REST' })}
            className={`${TRANSPORT_BTN} border-line text-muted`}
          >
            restart
          </button>
        ) : (
          // No break to restart (the last set): hold the slot so previous stays put.
          <div aria-hidden className="flex-1" />
        )
      )}
    </div>
  );
}

export function ActiveWorkout() {
  const state = useSession((s) => s.state);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const dispatch = useSession((s) => s.dispatch);
  const reset = useSession((s) => s.reset);
  const startWorkout = useSession((s) => s.startWorkout);
  const [ending, setEnding] = useState(false);
  // The right hand ends a two-hand set: hold the screen briefly so the tick is seen.
  const [flashDone, setFlashDone] = useState(false);
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
  /** The drawing belongs to a set. On a break it only competes with the clock. */
  const inSet = state.status === 'exercise_active' || (state.status === 'paused' && !pausedInRest);
  const isReady = state.status === 'ready';
  /** The preview has no stepper, so its figure can take the stage a live set caps. */
  const artClass = isReady ? 'h-full w-full' : 'h-full max-h-72 w-full';
  /** A break shows the rest cue instead of the lift's own drawing. */
  const currentSet = record?.sets[state.currentSetIndex];
  const side = currentSet?.side ?? null;
  // Both clocks read the same tick, so the elapsed timer and the stage timer tick
  // together instead of drifting apart.
  const restLeft = remainingMs(state, now);
  const setLeft = autoRemainingMs(state, now);
  const metaLine = `Set ${formatSetNumber(exercise?.perHand ?? false, state.currentSetIndex + 1, record?.sets.length ?? 0)} · Ex ${
    state.currentExerciseIndex + 1
  } / ${state.program.exercises.length}`;
  const breakSource = state.status === 'paused' ? state.pausedFrom : state.status;
  const inStandingRest = breakSource === 'resting';
  const inExerciseBreak = breakSource === 'exercise_complete';
  const restIsTimed = state.restStartedAt != null && restLeft > 0;
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
  const nextSlug = nextExercise ? figureSlug(nextExercise.name) : null;
  const hasDetails =
    !!exercise &&
    (exercise.instructions.length > 0 ||
      exercise.commonMistakes.length > 0 ||
      exercise.equipment.length > 0 ||
      exercise.muscleGroups.length > 0);
  /** The (i) opens the form sheet, which now carries the animation too. */
  const canExplain = hasDetails || !!slug || !!exercise?.imageUrl;

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
      return repsText(exercise.reps);
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
      return repsText(exercise.reps);
    }
    return null;
  })();

  // Six XL digits cost 60 px of stage height; on a phone the drawing needs those.
  const bigNumber = 'text-5xl [@media(min-height:760px)]:text-6xl';
  const bigClass =
    state.status === 'resting' || pausedInRest
      ? bigNumber
      : state.status === 'exercise_complete'
        ? 'text-3xl'
        : bigNumber;

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden">
      <ScreenHeader
        dense
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
          <div>
            <p className="truncate text-xs uppercase tracking-[0.2em] text-muted">
              {state.program.name}
            </p>
            {!isReady && <p className="truncate text-xs tabular-nums text-muted">{metaLine}</p>}
          </div>
        }
        actions={
          !isReady ? (
            <button
              type="button"
              onClick={() => setEnding((v) => !v)}
              aria-expanded={ending}
              className="h-11 shrink-0 rounded-xl border border-line px-3 font-gym text-sm text-muted"
            >
              End
            </button>
          ) : undefined
        }
      >
        {!isReady && (
          <>
            {/* One tick drives both clocks, so they change together. */}
            <div className="mt-1 flex min-h-11 items-center gap-2">
              <p className="text-xl font-semibold tabular-nums" aria-label="elapsed time">
                {formatClock(elapsedMs(state, now))}
              </p>
              <p className="text-xs text-muted">{`${formatDuration(estimatedRemainingMs(state, now))} left`}</p>
            </div>
            <div className="mt-1">
              <ProgressBar
                value={progress.ratio}
                parts={state.exerciseRecords.map((r) => ({
                  value: r.sets.length === 0 ? 0 : r.sets.filter((set) => set.completed).length / r.sets.length,
                  weight: r.sets.length,
                  ticks:
                    r.sets.length > 1
                      ? Array.from({ length: r.sets.length - 1 }, (_, i) => (i + 1) / r.sets.length)
                      : [],
                }))}
                label={`${progress.done} of ${progress.total} sets${
                  progress.skipped > 0 ? `, ${progress.skipped} skipped` : ''
                }`}
              />
            </div>
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
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-2 pt-3"
      >
        <p className="shrink-0 text-xs uppercase tracking-[0.2em] text-muted">{kicker}</p>

        {/* The −15s/+15s pair hugs the clock it moves, so a short screen keeps its rows. */}
        <div className="mt-1 flex shrink-0 items-center gap-2">
          {bigSlot && (
            <p data-testid="stage-big" className={`font-semibold tabular-nums ${bigClass}`} role="status">
              {bigSlot}
            </p>
          )}
          {state.status === 'exercise_active' && auto && (
            <>
              <Button
                className="ml-auto h-10 px-2.5 font-gym"
                onClick={() => dispatch({ type: 'EXTEND_STAGE', seconds: -15 })}
              >
                −15s
              </Button>
              <Button
                className="h-10 px-2.5 font-gym"
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
                  className="ml-auto h-10 px-2.5 font-gym"
                  onClick={() => dispatch({ type: 'ADJUST_REST', seconds: -15 })}
                >
                  −15s
                </Button>
                <Button
                  className="h-10 px-2.5 font-gym"
                  onClick={() => dispatch({ type: 'ADJUST_REST', seconds: 15 })}
                >
                  +15s
                </Button>
              </>
            )}
        </div>

        {(inSet || isReady) && exercise && (
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <h1
              className="min-w-0 flex-1 truncate text-2xl font-semibold leading-tight"
              title={exercise.name}
            >
              {exercise.name}
            </h1>
            {exercise.sets > 1 && (
              <span className="shrink-0 text-sm tabular-nums text-muted">
                [{formatSetNumber(exercise.perHand, state.currentSetIndex + 1, record?.sets.length ?? 0)}]
              </span>
            )}
            {canExplain && (
              <button
                type="button"
                aria-label="How to do it"
                onClick={() => setHowTo(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line font-serif text-base italic text-muted"
              >
                i
              </button>
            )}
          </div>
        )}
        {(inSet || isReady) && exercise && (
          <p className="shrink-0 truncate text-sm text-muted">
            {repsText(exercise.reps)} · {formatWeight(exercise.weightKg, exercise.perHand)}
          </p>
        )}

        {handRows && state.status === 'exercise_active' && (
          <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
            {handRows.map((hand) => (
              <div
                key={hand.setNumber}
                className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs ${
                  hand.completed || (flashDone && hand.side === side)
                    ? 'border-accent text-accent'
                    : 'border-line text-muted'
                }`}
              >
                <span>{hand.side === 'left' ? 'Left hand' : 'Right hand'}</span>
                <span>{hand.completed || (flashDone && hand.side === side) ? '✓' : '·'}</span>
              </div>
            ))}
          </div>
        )}

        {exercise && (inSet || isReady) && (
          <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
            {slug ? (
              <ExerciseMotion slug={slug} className={artClass} />
            ) : (
              <ExerciseImage src={exercise.imageUrl} alt={exercise.name} className={artClass} />
            )}
          </div>
        )}

        {/* The preview is otherwise a title and a list with a void under it. */}
        {isReady && state.program.exercises.length > 1 && (
          <ExerciseOverview
            className="mt-3 flex flex-col"
            exercises={state.program.exercises.slice(1)}
            firstNumber={2}
          />
        )}

        {exercise && state.draft && state.status === 'exercise_active' && (
          <div data-testid="stepper" className="mt-2 shrink-0 rounded-2xl border border-line bg-surface px-3 py-1">
            <SetEntry
              compact
              exercise={exercise}
              draft={state.draft}
              onChange={(draft) => dispatch({ type: 'SET_DRAFT', ...draft })}
            />
          </div>
        )}

        {inStandingRest && (
          <div
            data-testid="rest-cue"
            className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center"
          >
            {restIsTimed && (
              <p className="text-4xl font-semibold uppercase tracking-[0.3em] text-muted">Rest</p>
            )}
            {exercise && (
              <div className="min-w-0 space-y-1">
                <p className="text-base font-semibold">
                  {`Next · set ${formatSet(side, state.currentSetIndex + 1, record?.sets.length ?? 0)}`}
                </p>
                <p className="truncate text-sm text-muted">
                  {exercise.name} · {repsText(exercise.reps)} reps
                </p>
              </div>
            )}
          </div>
        )}

        {/* The exercise break previews the next lift: its drawing, plus the same
            plan the ready screen shows, with the next exercise lit up. */}
        {inExerciseBreak && nextExercise && (
          <div data-testid="rest-cue" className="mt-2 flex min-h-0 flex-1 flex-col">
            {restIsTimed && (
              <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-muted">Rest</p>
            )}
            <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
              {nextSlug ? (
                <ExerciseMotion slug={nextSlug} className="h-full max-h-32 w-full" />
              ) : (
                <ExerciseImage
                  src={nextExercise.imageUrl}
                  alt={nextExercise.name}
                  className="h-full max-h-32 w-full"
                />
              )}
            </div>
            <ExerciseOverview
              className="mt-2"
              exercises={state.program.exercises.slice(state.currentExerciseIndex + 1)}
              firstNumber={state.currentExerciseIndex + 2}
              activeId={nextExercise.id}
            />
          </div>
        )}

        {inExerciseBreak && !nextExercise && (
          <div
            data-testid="rest-cue"
            className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center"
          >
            {restIsTimed && (
              <p className="text-4xl font-semibold uppercase tracking-[0.3em] text-muted">Rest</p>
            )}
            <p className="text-base font-semibold">Last exercise done</p>
          </div>
        )}
      </section>

      <footer
        data-testid="footer"
        className="shrink-0 border-t border-line bg-ink px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      >
        {isReady && (
          <div className="flex gap-2">
            <Button variant="primary" className={PRIMARY_BTN} onClick={startWorkout}>
              Start
            </Button>
            {/* Keeps Start in the same slot as the set's primary button. */}
            <div aria-hidden className="flex-1" />
          </div>
        )}

        {state.status === 'exercise_active' && exercise && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="primary"
                className={PRIMARY_BTN}
                disabled={primaryDisabled || flashDone}
                onClick={() => {
                  const action = {
                    type: 'COMPLETE_SET',
                    reps: state.draft?.reps ?? exercise.reps.min,
                    weightKg: state.draft?.weightKg ?? exercise.weightKg ?? null,
                  } as const;
                  if (side !== 'right') return dispatch(action);
                  setFlashDone(true);
                  window.setTimeout(() => {
                    setFlashDone(false);
                    dispatch(action);
                  }, HAND_TICK_MS);
                }}
              >
                {auto ? 'Done now' : side ? `Complete ${side} hand` : 'Complete set'}
              </Button>
              <AutoToggle auto={auto} dispatch={dispatch} />
            </div>
            <TransportRow state={state} dispatch={dispatch} />
          </div>
        )}

        {state.status === 'resting' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {restLeft === 0 ? (
                <Button
                  variant="primary"
                  className={PRIMARY_BTN}
                  onClick={() => dispatch({ type: 'REST_DONE' })}
                >
                  Start set
                </Button>
              ) : (
                <Button className={PRIMARY_BTN} onClick={() => dispatch({ type: 'SKIP_REST' })}>
                  Skip rest
                </Button>
              )}
              <AutoToggle auto={auto} dispatch={dispatch} />
            </div>
            <TransportRow state={state} dispatch={dispatch} />
          </div>
        )}

        {state.status === 'paused' && (
          <Button
            variant="primary"
            className="h-14 w-full font-gym text-base"
            onClick={() => dispatch({ type: 'RESUME' })}
          >
            Resume
          </Button>
        )}

        {state.status === 'exercise_complete' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="primary"
                className={PRIMARY_BTN}
                onClick={() => dispatch({ type: 'NEXT_EXERCISE' })}
              >
                {nextExercise ? 'Continue' : 'Finish workout'}
              </Button>
              <AutoToggle auto={auto} dispatch={dispatch} />
            </div>
            <TransportRow state={state} dispatch={dispatch} />
          </div>
        )}
      </footer>

      {ending && (
        <div className="absolute inset-x-5 bottom-44 z-30 rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs text-muted">End this session?</p>
          <div className="flex gap-2">
            <Button className="flex-1 font-gym" onClick={() => dispatch({ type: 'FINISH' })}>
              Finish &amp; save
            </Button>
            <Button
              variant="danger"
              className="flex-1 font-gym"
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
            <Button className="h-11 font-gym" onClick={() => setHowTo(false)}>
              Close
            </Button>
          </div>
          {slug ? (
            <div className="mt-4">
              <ExerciseMotion slug={slug} className="h-40 w-full" />
            </div>
          ) : exercise.imageUrl ? (
            <div className="mt-4">
              <ExerciseImage src={exercise.imageUrl} alt={exercise.name} className="h-40 w-full" />
            </div>
          ) : null}
          <ExerciseDetails exercise={exercise} open />
        </div>
      )}
    </main>
  );
}
