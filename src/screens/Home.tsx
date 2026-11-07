import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { nextUp, weekView } from '../engine/schedule';
import { getWorkoutProgress } from '../engine/selectors';
import { summarize } from '../engine/summary';
import { elapsedMs } from '../engine/time';
import { formatDate, formatDay, formatDays, formatDuration } from '../lib/format';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { InstallHint } from '../components/ui/InstallHint';

export function Home() {
  const programs = usePrograms((s) => s.programs);
  const state = useSession((s) => s.state);
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const [starting, setStarting] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const active =
    state && state.status !== 'completed' && state.status !== 'abandoned' && state.status !== 'ready'
      ? state
      : null;
  const sessions = history.map((h) => ({ programId: h.programId, finishedAt: h.finishedAt }));
  const next = nextUp(programs, sessions, now, active ? { programId: active.programId } : null);
  /** The card above features one program; the rest must stay startable. */
  const featuredId = 'program' in next ? next.program.id : null;
  const otherPrograms = programs.filter((p) => p.id !== featuredId);
  const week = weekView(programs, sessions, now);
  const last = history[0] ?? null;
  const lastSummary = last ? summarize(last.state, last.finishedAt ?? last.state.updatedAt) : null;

  async function start(programId: string) {
    setStarting(programId);
    const ok = await prepareWorkout(programId);
    setStarting(null);
    if (ok) navigate('#/session');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Workout Companion</p>
      <h1 className="mt-3 text-3xl font-semibold">Ready to train</h1>

      {error && <Banner message={error} onDismiss={clearError} />}

      {active && (
        <section className="mt-8 rounded-2xl border border-accent/50 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-accent">In progress</p>
          <h2 className="mt-2 text-2xl font-semibold">{active.program.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {getWorkoutProgress(active).done} of {getWorkoutProgress(active).total} sets ·{' '}
            {formatDuration(elapsedMs(active, now))} elapsed
          </p>
          <Button
            variant="primary"
            className="mt-4 h-14 w-full text-base"
            onClick={() => navigate('#/session')}
          >
            Resume workout
          </Button>
        </section>
      )}

      {!active && next.kind === 'today' && (
        <section className="mt-8 rounded-2xl border border-accent/50 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-accent">Today</p>
          <h2 className="mt-2 text-2xl font-semibold">{next.program.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {next.program.exercises.length} exercises
            {next.program.estimatedDurationMinutes
              ? ` · ~${next.program.estimatedDurationMinutes} min`
              : ''}
          </p>
          <Button
            variant="primary"
            className="mt-4 h-14 w-full text-base"
            disabled={starting != null}
            onClick={() => void start(next.program.id)}
          >
            {starting ? 'Starting…' : 'Start workout'}
          </Button>
        </section>
      )}

      {!active && next.kind === 'upcoming' && (
        <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-muted">
            Next · {formatDay(next.weekday)}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{next.program.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {next.program.exercises.length} exercises
            {next.program.estimatedDurationMinutes
              ? ` · ~${next.program.estimatedDurationMinutes} min`
              : ''}
          </p>
          <Button
            className="mt-4 h-14 w-full"
            disabled={starting != null}
            onClick={() => void start(next.program.id)}
          >
            {starting ? 'Starting…' : 'Start anyway'}
          </Button>
        </section>
      )}

      {!active && next.kind === 'done_today' && (
        <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-accent">✓ Done for today</p>
          <h2 className="mt-2 text-2xl font-semibold">{next.program.name}</h2>
          <p className="mt-1 text-sm text-muted">Logged. Extras are optional.</p>
          <Button
            className="mt-4 h-14 w-full"
            disabled={starting != null}
            onClick={() => void start(next.program.id)}
          >
            {starting ? 'Starting…' : 'Do it again'}
          </Button>
        </section>
      )}

      {!active && next.kind === 'none' && (
        <section className="mt-8 rounded-2xl bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-muted">Get started</p>
          {programs.length === 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">Build a workout program to begin.</p>
              <a
                href="#/programs/build"
                className="mt-4 flex h-12 items-center justify-center rounded-xl bg-accent font-semibold text-ink"
              >
                Build a program
              </a>
            </>
          ) : (
            <>
              {/* Nothing is on today's schedule (or nothing is scheduled at all): the
                  programs are still startable, so offer them instead of hiding them. */}
              <p className="mt-2 text-sm text-muted">No program is scheduled. Start one anyway:</p>
              <ul className="mt-3 space-y-2">
                {programs.map((p) => (
                  <li key={p.id}>
                    <Button
                      className="flex h-14 w-full items-center justify-between"
                      disabled={starting != null}
                      onClick={() => void start(p.id)}
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-muted">{p.exercises.length} exercises</span>
                    </Button>
                  </li>
                ))}
              </ul>
              <a href="#/programs" className="mt-3 flex h-11 items-center justify-center text-xs text-muted underline">
                Manage programs
              </a>
            </>
          )}
        </section>
      )}

      {!active && next.kind !== 'none' && otherPrograms.length > 0 && (
        <section className="mt-4">
          <p className="text-xs uppercase tracking-widest text-muted">Also available</p>
          <ul className="mt-3 space-y-2">
            {otherPrograms.map((p) => (
              <li key={p.id}>
                <Button
                  className="flex h-14 w-full items-center justify-between"
                  disabled={starting != null}
                  onClick={() => void start(p.id)}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted">
                    {formatDays(p.scheduleDays)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {programs.length > 0 && (
        <section className="mt-8">
          <p className="text-xs uppercase tracking-widest text-muted">This week</p>
          <ul className="mt-3 space-y-1">
            {week.map((day) => {
              const today = new Date(now).toDateString() === new Date(day.date).toDateString();
              return (
                <li
                  key={day.weekday}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    today ? 'bg-surface' : ''
                  }`}
                >
                  <span className={`text-sm capitalize ${today ? 'text-white' : 'text-muted'}`}>
                    {day.weekday}
                  </span>
                  <span className="text-sm">
                    {day.programs.length === 0 ? (
                      <span className="text-muted">Rest</span>
                    ) : (
                      day.programs.map(({ program, done }) => (
                        <span key={program.id} className="ml-2">
                          {program.name}
                          {done && <span className="text-accent"> ✓ done</span>}
                        </span>
                      ))
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {last && (
        <section className="mt-8">
          <p className="text-xs uppercase tracking-widest text-muted">Last session</p>
          <a
            href={`#/summary/${last.id}`}
            className="mt-3 block rounded-xl border border-line bg-surface px-4 py-4"
          >
            <p className="font-medium">{last.programName}</p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDate(last.finishedAt)} · {formatDuration(lastSummary?.durationMs ?? 0)} ·{' '}
              {lastSummary?.setsCompleted ?? 0} sets
            </p>
          </a>
        </section>
      )}



      <InstallHint />

      <nav className="mt-auto flex overflow-hidden rounded-xl border border-line bg-surface">
        {[
          ['#/programs', 'Programs'],
          ['#/history', 'History'],
          ['#/settings', 'Settings'],
        ].map(([href, label], i) => (
          <a
            key={href}
            href={href}
            className={`flex h-12 flex-1 items-center justify-center text-sm ${
              i > 0 ? 'border-l border-line' : ''
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
