import { useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { figureSlug } from '../data/exerciseFigures';
import { ExerciseMotion } from '../components/exercise/ExerciseMotion';
import { Banner } from '../components/ui/Banner';
import { formatDays, formatWeight } from '../lib/format';

/**
 * A saved program, read-only: what is in it, what it looks like, and a way to start.
 * The drawing is a static frame — this is a list, not a workout.
 */
export function ProgramDetail({ id }: { id: string }) {
  const program = usePrograms((s) => s.programs.find((p) => p.id === id) ?? null);
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (!program) return;
    setStarting(true);
    const ok = await prepareWorkout(program.id);
    setStarting(false);
    if (ok) navigate('#/session');
  }

  if (!program) {
    return (
      <main className="mx-auto max-w-md px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <a href="#/programs" className="flex min-h-11 items-center text-sm text-muted">
          ← Programs
        </a>
        <p className="mt-6 text-sm text-muted">That program is not saved here.</p>
      </main>
    );
  }

  const sets = program.exercises.reduce((n, e) => n + e.sets, 0);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <a href="#/programs" className="flex min-h-11 items-center text-sm text-muted">
        ← Programs
      </a>
      <h1 className="mt-3 text-2xl font-semibold">{program.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {program.exercises.length} exercise{program.exercises.length === 1 ? '' : 's'} · {sets} sets ·{' '}
        {program.scheduleDays.length > 0 ? formatDays(program.scheduleDays) : 'no fixed day'}
      </p>
      {program.description && <p className="mt-3 text-sm text-muted">{program.description}</p>}

      {error && <Banner message={error} onDismiss={clearError} />}

      <ul className="mt-5 space-y-3">
        {program.exercises.map((exercise) => {
          const slug = figureSlug(exercise.name);
          return (
            <li key={exercise.id} className="rounded-xl border border-line bg-surface p-3">
              {slug ? (
                <ExerciseMotion slug={slug} />
              ) : (
                <div
                  aria-hidden
                  className="flex aspect-[3/2] w-full items-center justify-center rounded-2xl border border-line bg-ink text-muted"
                >
                  <svg viewBox="0 0 64 64" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M8 32h48M14 24v16M50 24v16M22 28v8M42 28v8" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              <div className="mt-3 min-w-0">
                <p className="font-medium leading-tight">{exercise.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {exercise.sets} ×{' '}
                  {exercise.reps.min === exercise.reps.max
                    ? exercise.reps.min
                    : `${exercise.reps.min}–${exercise.reps.max}`}
                </p>
                <p className="text-xs text-muted">
                  {formatWeight(exercise.weightKg, exercise.perHand)} · {exercise.restSeconds}s rest
                </p>
                {exercise.instructions.length > 0 && (
                  <details className="mt-1">
                    <summary className="min-h-11 cursor-pointer text-xs text-accent">How</summary>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {exercise.instructions.join(' ')}
                    </p>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={starting}
        onClick={() => void start()}
        className="mt-5 h-14 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
      >
        {starting ? 'Getting ready…' : 'Start this program'}
      </button>
    </main>
  );
}
