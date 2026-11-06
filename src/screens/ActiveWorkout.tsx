import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { useWakeLock } from '../hooks/useWakeLock';
import { useSession } from '../store/sessionStore';
import { getCurrentExercise, getCurrentRecord, getNextExercise, getWorkoutProgress } from '../engine/selectors';
import { remainingMs } from '../engine/rest';
import { elapsedMs } from '../engine/time';
import { formatClock } from '../lib/format';
import { ExerciseCard } from '../components/exercise/ExerciseCard';
import { RestTimer } from '../components/workout/RestTimer';
import { SetEntry } from '../components/workout/SetEntry';
import { ProgressBar } from '../components/workout/ProgressBar';
import { NextUp } from '../components/workout/NextUp';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';

export function ActiveWorkout() {
  const state = useSession((s) => s.state);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const dispatch = useSession((s) => s.dispatch);
  const [ending, setEnding] = useState(false);

  const pausedInRest = state?.status === 'paused' && state.pausedFrom === 'resting';
  const now = useNow(1000, !!state);
  const restNow = useNow(250, state?.status === 'resting' || pausedInRest);

  useEffect(() => {
    if (!state) navigate('#/');
  }, [state]);

  useEffect(() => {
    if (state?.status === 'completed') navigate(`#/summary/${state.sessionId}`);
    if (state?.status === 'abandoned') navigate('#/');
  }, [state?.status, state?.sessionId]);

  useWakeLock(
    state?.status === 'exercise_active' || state?.status === 'resting' || state?.status === 'paused',
  );

  if (!state) return null;

  const exercise = getCurrentExercise(state);
  const record = getCurrentRecord(state);
  const nextExercise = getNextExercise(state);
  const progress = getWorkoutProgress(state);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{state.program.name}</p>
            <p className="text-2xl font-semibold tabular-nums" aria-label="elapsed time">
              {formatClock(elapsedMs(state, now))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnding((v) => !v)}
            aria-expanded={ending}
            className="h-11 rounded-xl border border-line px-4 text-sm text-muted"
          >
            End
          </button>
        </div>
        <div className="mt-3">
          <ProgressBar value={progress.ratio} label={`${progress.done} of ${progress.total} sets`} />
        </div>
        {ending && (
          <div className="mt-3 flex gap-2 rounded-xl border border-line bg-surface p-3">
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
        )}
      </header>

      {error && <Banner message={error} onDismiss={clearError} />}

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-6">
        {state.status === 'exercise_active' && exercise && record && (
          <>
            <ExerciseCard
              exercise={exercise}
              index={state.currentExerciseIndex}
              total={state.program.exercises.length}
              setNumber={state.currentSetIndex + 1}
              totalSets={record.sets.length}
            />
            <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-2">
              {state.draft && (
                <SetEntry
                  exercise={exercise}
                  draft={state.draft}
                  onChange={(draft) => dispatch({ type: 'SET_DRAFT', ...draft })}
                />
              )}
            </div>
            {nextExercise && <div className="mt-4"><NextUp name={nextExercise.name} /></div>}
          </>
        )}

        {state.status === 'resting' && <RestTimer state={state} now={restNow} />}

        {state.status === 'paused' && (
          <div className="pt-8 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Paused</p>
            {pausedInRest && (
              <p className="mt-4 text-6xl font-semibold tabular-nums">
                {formatClock(remainingMs(state, restNow))}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">Timer is frozen. Resume when you are ready.</p>
          </div>
        )}

        {state.status === 'exercise_complete' && record && (
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">Exercise complete</p>
            <h1 className="mt-2 text-2xl font-semibold">{record.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {record.sets.filter((x) => x.completed).length} / {record.sets.length} sets completed
              {record.skipped ? ' · exercise skipped' : ''}
            </p>
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs uppercase tracking-widest text-muted">
                {nextExercise ? 'Next exercise' : 'Last exercise done'}
              </p>
              <p className="mt-2 text-xl font-semibold">{nextExercise?.name ?? 'Finish the workout'}</p>
              {nextExercise && (
                <p className="mt-1 text-sm text-muted">
                  {nextExercise.sets} × {nextExercise.reps.min}–{nextExercise.reps.max}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 border-t border-line bg-ink px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {state.status === 'exercise_active' && record && (
          <div className="space-y-2">
            <Button
              variant="primary"
              className="h-16 w-full text-base"
              onClick={() =>
                dispatch({
                  type: 'COMPLETE_SET',
                  reps: state.draft?.reps ?? exercise?.reps.min ?? 0,
                  weightKg: state.draft?.weightKg ?? null,
                })
              }
            >
              Complete set
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => dispatch({ type: 'SKIP_SET' })}>
                Skip set
              </Button>
              <Button variant="ghost" onClick={() => dispatch({ type: 'SKIP_EXERCISE' })}>
                Skip exercise
              </Button>
            </div>
          </div>
        )}

        {state.status === 'resting' &&
          (remainingMs(state, restNow) === 0 ? (
            <Button
              variant="primary"
              className="h-16 w-full text-base"
              onClick={() => dispatch({ type: 'REST_DONE' })}
            >
              Start set
            </Button>
          ) : (
            <Button className="h-14 w-full" onClick={() => dispatch({ type: 'SKIP_REST' })}>
              Skip rest
            </Button>
          ))}

        {state.status === 'paused' && (
          <Button
            variant="primary"
            className="h-16 w-full text-base"
            onClick={() => dispatch({ type: 'RESUME' })}
          >
            Resume
          </Button>
        )}

        {state.status === 'exercise_complete' && (
          <Button
            variant="primary"
            className="h-16 w-full text-base"
            onClick={() => dispatch({ type: 'NEXT_EXERCISE' })}
          >
            {nextExercise ? 'Continue' : 'Finish workout'}
          </Button>
        )}
      </footer>
    </main>
  );
}
