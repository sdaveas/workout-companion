import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useAutoAdvance } from '../hooks/useAutoAdvance';
import { useNow } from '../hooks/useNow';
import { useWakeLock, type WakeState } from '../hooks/useWakeLock';
import { canKeepAwake, useKeepAwake } from '../hooks/useKeepAwake';
import { useCues } from '../hooks/useCues';
import { canVibrate, cue } from '../lib/cues';
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
import type { ProgramExercise, SetRecord, WorkoutAction, WorkoutState } from '../engine/types';
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

/** How many upcoming exercises the break between exercises lists. */
const BREAK_LIST_MAX = 3;

/** How long the closing hand stays ticked before the rest screen takes over. */
const HAND_TICK_MS = 600;

const TRANSPORT_BTN =
  'flex h-12 flex-1 items-center justify-center rounded-xl border font-gym text-sm disabled:opacity-40';

/** The primary action keeps the same size and type in every stage of the session. */
const PRIMARY_BTN = 'h-14 w-full font-gym text-base';

/** "6–10", or just "6" when the prescription is a single number. */
const repsText = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

/**
 * The header carries one button; everything that is flipped once, plus the way out,
 * lives in this sheet. Auto is a mode, End is a decision — neither belongs in the
 * row of things tapped twenty times a session.
 */
function SessionMenu({
  menuRef,
  auto,
  autoAvailable,
  started,
  keepAwake,
  wake,
  onKeepAwake,
  onAuto,
  onEnd,
  onRestart,
  sound,
  vibrate,
  onSound,
  onVibrate,
}: {
  menuRef: RefObject<HTMLDialogElement | null>;
  auto: boolean;
  autoAvailable: boolean;
  /** Nothing to restart or end before the first set. */
  started: boolean;
  keepAwake: boolean;
  /** What the platform actually did with the lock. */
  wake: WakeState;
  onKeepAwake: () => void;
  onAuto: () => void;
  onEnd: () => void;
  onRestart: () => void;
  sound: boolean;
  vibrate: boolean;
  onSound: () => void;
  onVibrate: () => void;
}) {
  return (
    <dialog
      ref={menuRef}
      aria-label="Session options"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] mt-auto w-[calc(100%-2.5rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-white"
    >
      <div className="p-2">
        {(canKeepAwake() || autoAvailable) && (
          <MenuGroup label="Modes">
            {canKeepAwake() && (
              <MenuRow
                label="Keep screen on"
                on={keepAwake}
                // Say what the phone did: a refused lock is not a broken switch.
                note={keepAwake && wake === 'blocked' ? 'blocked' : undefined}
                onClick={onKeepAwake}
              />
            )}
            {autoAvailable && <MenuRow label="Auto" on={auto} onClick={onAuto} />}
            {/* Nested under Auto: they only matter while it is running the clock. */}
            {auto && (
              <>
                {canVibrate() && (
                  <MenuRow label="Vibrate" on={vibrate} onClick={onVibrate} sub />
                )}
                <MenuRow label="Sound" on={sound} onClick={onSound} sub />
              </>
            )}
          </MenuGroup>
        )}

        {/* Nothing to restart or end before the first set, so no empty heading. */}
        {started && (
          <MenuGroup label="Session">
            <button
              type="button"
              onClick={onRestart}
              className="flex h-12 w-full items-center rounded-xl px-3 text-left text-sm text-danger"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="flex h-12 w-full items-center rounded-xl px-3 text-left text-sm text-danger"
            >
              End session
            </button>
          </MenuGroup>
        )}
      </div>
    </dialog>
  );
}

/** A group of rows with one small heading, the way the Settings screen does it. */
function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-1 first:mt-0">
      <p className="px-3 pb-1 pt-2 text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
      {children}
    </div>
  );
}

/** One switch: the label says what it does, the right hand says whether it is on. */
function MenuRow({
  label,
  on,
  onClick,
  sub = false,
  note,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  /** Indented under the switch it belongs to. */
  sub?: boolean;
  /** Replaces the on/off word when the platform said no. */
  note?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-between rounded-xl pr-3 text-left text-sm ${
        sub ? 'pl-7 text-muted' : 'pl-3'
      }`}
    >
      <span>{label}</span>
      <span
        className={`font-gym text-xs ${
          note ? 'text-danger' : on ? 'text-accent' : 'text-muted'
        }`}
      >
        {note ?? (on ? 'on' : 'off')}
      </span>
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

/**
 * "SETS" plus one pip per set, in the progress bar's colours: done is accent, the current
 * set is white, a skipped one is dimmed. The word is what makes the pips read as sets on
 * a first visit; the pips carry the count. A one-hand movement gets one pip per pair of
 * hands. Screen readers get the count in words.
 */
function SetPips({ sets, current, perHand }: { sets: SetRecord[]; current: number; perHand: boolean }) {
  const step = perHand ? 2 : 1;
  const pips: string[] = [];
  for (let i = 0; i < sets.length; i += step) {
    const pair = sets.slice(i, i + step);
    pips.push(
      pair.every((x) => x.completed)
        ? 'bg-accent'
        : pair.every((x) => x.completed || x.skipped)
          ? 'bg-muted/40'
          : current >= i && current < i + step
            ? 'bg-white'
            : 'bg-line',
    );
  }
  const position = formatSetNumber(perHand, current + 1, sets.length);
  return (
    <div role="img" aria-label={`Set ${position}`} className="flex shrink-0 items-center gap-2">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">Sets</span>
      <span className="flex gap-1">
        {pips.map((color, i) => (
          <span key={i} className={`h-1.5 w-4 rounded-full ${color}`} />
        ))}
      </span>
    </div>
  );
}

/** The set's target as a headline: poster digits, a lime dash, a quiet unit. */
function RepsTarget({ reps }: { reps: { min: number; max: number } }) {
  return (
    <>
      {reps.min}
      {reps.min !== reps.max && (
        <>
          <span className="text-accent">–</span>
          {reps.max}
        </>
      )}
      <span className="ml-2 text-xl text-muted">reps</span>
    </>
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
          skip
        </button>
      ) : (
        state.restStartedAt != null ? (
          <button
            type="button"
            aria-label="Reset rest timer"
            onClick={() => dispatch({ type: 'RESTART_REST' })}
            className={`${TRANSPORT_BTN} border-line text-muted`}
          >
            reset timer
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
  const restart = useSession((s) => s.restart);
  const startWorkout = useSession((s) => s.startWorkout);
  const endDialog = useRef<HTMLDialogElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  // The right hand ends a two-hand set: hold the screen briefly so the tick is seen.
  const [flashDone, setFlashDone] = useState(false);
  // A second tap during the hold must not queue a second completion.
  const holdRef = useRef(false);
  const [howTo, setHowTo] = useState(false);
  const [keepAwake, toggleKeepAwake] = useKeepAwake();
  const { sound, vibrate, toggleSound, toggleVibrate } = useCues();

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

  const wake = useWakeLock(
    keepAwake && !!state && (RUNNING.includes(state.status) || state.status === 'paused'),
  );

  // One cue when a set lands, and a countdown on whichever clock is running. Keyed by
  // the clock instance so a restored session does not fire the marks it already passed.
  const doneAlert = useRef<number | null>(null);
  const countdown = useRef<{ key: string; marks: Set<number> }>({ key: '', marks: new Set() });

  useEffect(() => {
    if (!state) return;
    const done = getWorkoutProgress(state).done;
    if (doneAlert.current == null) {
      doneAlert.current = done;
    } else if (done !== doneAlert.current) {
      doneAlert.current = done;
      cue('set');
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const clock = (() => {
      if (state.status === 'resting' || state.status === 'exercise_complete') {
        return { key: `rest:${state.restCount}`, left: remainingMs(state, tickNow) };
      }
      if (state.mode === 'auto' && state.status === 'exercise_active' && state.stageStartedAt != null) {
        return { key: `stage:${state.stageStartedAt}`, left: autoRemainingMs(state, tickNow) };
      }
      return null;
    })();
    if (!clock) return;
    if (countdown.current.key !== clock.key) {
      countdown.current = { key: clock.key, marks: new Set() };
    }
    const marks = countdown.current.marks;
    const fire = (at: number, kind: 'ten' | 'tick' | 'end') => {
      if (marks.has(at)) return;
      marks.add(at);
      cue(kind);
    };

    if (clock.left <= 0) {
      fire(0, 'end');
      return;
    }
    // Ceil, so "3" means the last whole second before 2, not the moment 3.0 starts.
    const secs = Math.ceil(clock.left / 1000);
    if (secs === 10) fire(10, 'ten');
    else if (secs <= 3) fire(secs, 'tick');
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
  // The set count lives in the pips beside the exercise name.
  const metaLine = `Exercise ${state.currentExerciseIndex + 1} of ${state.program.exercises.length}`;
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

  const laterCount = Math.max(
    0,
    state.program.exercises.length - (state.currentExerciseIndex + 1) - BREAK_LIST_MAX,
  );

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
        className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))]"
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
          // Nothing worth opening before the first set on a device with no switches
          // of its own (a desktop: no wake lock, no vibration).
          canKeepAwake() || !isReady ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => menuDialog.current?.showModal()}
              className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-muted"
            >
              Settings
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
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{kicker}</p>
          {(inSet || isReady) && exercise && exercise.sets > 1 && record && (
            <SetPips sets={record.sets} current={state.currentSetIndex} perHand={exercise.perHand} />
          )}
        </div>

        {/* The −15s/+15s pair hugs the clock it moves, so a short screen keeps its rows. */}
        <div className="mt-1 flex shrink-0 items-center gap-2">
          {bigSlot && (
            <p data-testid="stage-big" className={`font-gym tabular-nums ${bigClass}`} role="status">
              {exercise && bigSlot === repsText(exercise.reps) ? <RepsTarget reps={exercise.reps} /> : bigSlot}
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
        {/* A manual set already says this: the reps are the big number, the weight is in
            the stepper. Auto (a clock up there) and the preview still need the line. */}
        {(inSet || isReady) && exercise && bigSlot !== repsText(exercise.reps) && (
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

        {/* The exercise break previews the next lift: the plan with the next exercise lit
            up, then its drawing under that label. The drawing takes whatever height the
            list leaves, so a short list does not leave a void and a long one still fits. */}
        {inExerciseBreak && nextExercise && (
          <div data-testid="rest-cue" className="mt-2 flex min-h-0 flex-1 flex-col">
            {restIsTimed && (
              <p className="text-3xl font-semibold uppercase tracking-[0.3em] text-muted">Rest</p>
            )}
            {/* The next three are enough to plan the break; the rest would squeeze the
                drawing to a smudge on a small phone. The ready screen has the full plan. */}
            <ExerciseOverview
              className="mt-2 shrink-0"
              exercises={state.program.exercises.slice(
                state.currentExerciseIndex + 1,
                state.currentExerciseIndex + 1 + BREAK_LIST_MAX,
              )}
              firstNumber={state.currentExerciseIndex + 2}
              activeId={nextExercise.id}
            />
            {laterCount > 0 && (
              <p className="shrink-0 pt-1 text-xs text-muted">+{laterCount} more</p>
            )}
            <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
              {nextSlug ? (
                <ExerciseMotion slug={nextSlug} className="h-full max-h-56 w-full" />
              ) : (
                <ExerciseImage
                  src={nextExercise.imageUrl}
                  alt={nextExercise.name}
                  className="h-full max-h-56 w-full"
                />
              )}
            </div>
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
          <Button variant="primary" className={PRIMARY_BTN} onClick={startWorkout}>
            Start
          </Button>
        )}

        {state.status === 'exercise_active' && exercise && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="primary"
                className={PRIMARY_BTN}
                disabled={primaryDisabled}
                onClick={() => {
                  const action = {
                    type: 'COMPLETE_SET',
                    reps: state.draft?.reps ?? exercise.reps.min,
                    weightKg: state.draft?.weightKg ?? exercise.weightKg ?? null,
                  } as const;
                  if (holdRef.current) return;
                  if (side !== 'right') return dispatch(action);
                  holdRef.current = true;
                  setFlashDone(true);
                  window.setTimeout(() => {
                    holdRef.current = false;
                    setFlashDone(false);
                    dispatch(action);
                  }, HAND_TICK_MS);
                }}
              >
                {auto ? 'Done now' : side ? `Complete ${side} hand` : 'Complete set'}
              </Button>
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
            </div>
            <TransportRow state={state} dispatch={dispatch} />
          </div>
        )}
      </footer>

      <SessionMenu
        menuRef={menuDialog}
        auto={auto}
        autoAvailable={!!state && RUNNING.includes(state.status)}
        started={!isReady}
        keepAwake={keepAwake}
        wake={wake}
        onKeepAwake={toggleKeepAwake}
        onAuto={() => dispatch({ type: auto ? 'STOP_AUTO' : 'START_AUTO' })}
        sound={sound}
        vibrate={vibrate}
        onSound={toggleSound}
        onVibrate={toggleVibrate}
        onEnd={() => {
          menuDialog.current?.close();
          endDialog.current?.showModal();
        }}
        onRestart={() => {
          menuDialog.current?.close();
          if (confirm('Restart this workout from the first set? Today’s progress is lost.')) {
            restart();
          }
        }}
      />

      {/* A native modal: it dims the screen, traps focus, and Esc or a tap outside closes it. */}
      <dialog
        ref={endDialog}
        aria-label="End this session?"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] mt-auto w-[calc(100%-2.5rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-white"
      >
        <div className="p-4">
          <p className="mb-3 text-sm font-semibold">End this session?</p>
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
          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => endDialog.current?.close()}
          >
            Keep going
          </Button>
        </div>
      </dialog>

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
