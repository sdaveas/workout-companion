import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { nextUp } from '../engine/schedule';
import { getWorkoutProgress } from '../engine/selectors';
import { elapsedMs } from '../engine/time';
import { exerciseCount, formatDay, formatDays, formatDuration } from '../lib/format';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { InstallHint } from '../components/ui/InstallHint';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ActivityGrid } from '../components/ui/ActivityGrid';
import { SessionRow } from '../components/ui/SessionRow';
import { TransferSheet } from '../components/ui/TransferSheet';

/**
 * One page: what is on today, every program, the last few sessions, and two doors
 * for moving data. The page does not scroll; the middle column does, so the card
 * and the header stay put.
 */
export function Home() {
  const programs = usePrograms((s) => s.programs);
  const state = useSession((s) => s.state);
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const [starting, setStarting] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<'import' | 'export' | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void loadHistory().then(() => setLoaded(true));
  }, [loadHistory]);

  const active =
    state && state.status !== 'completed' && state.status !== 'abandoned' && state.status !== 'ready'
      ? state
      : null;
  const sessions = history.map((h) => ({ programId: h.programId, finishedAt: h.finishedAt }));
  const next = nextUp(programs, sessions, now, active ? { programId: active.programId } : null);
  const progress = active ? getWorkoutProgress(active) : null;
  const latest = history[0] ?? null;

  const meta = (program: { exercises: unknown[]; estimatedDurationMinutes?: number | null }) =>
    `${exerciseCount(program.exercises.length)}${
      program.estimatedDurationMinutes ? ` · ~${program.estimatedDurationMinutes} min` : ''
    }`;

  const card = active
    ? {
        eyebrow: 'In progress',
        name: active.program.name,
        meta: `${progress?.done ?? 0} of ${progress?.total ?? 0} sets · ${formatDuration(
          elapsedMs(active, now),
        )} elapsed`,
        action: 'Resume workout',
        programId: active.programId,
        primary: true,
      }
    : next.kind === 'today'
      ? {
          eyebrow: 'Today',
          name: next.program.name,
          meta: meta(next.program),
          action: 'Start workout',
          programId: next.program.id,
          primary: true,
        }
      : next.kind === 'upcoming'
        ? {
            eyebrow: `Next · ${formatDay(next.weekday)}`,
            name: next.program.name,
            meta: meta(next.program),
            action: 'Start anyway',
            programId: next.program.id,
            primary: false,
          }
        : next.kind === 'done_today'
          ? {
              eyebrow: '✓ Done for today',
              name: next.program.name,
              meta: 'Logged. Extras are optional.',
              action: 'Do it again',
              programId: next.program.id,
              primary: false,
            }
          : null;

  async function start(programId: string) {
    setStarting(programId);
    const ok = await prepareWorkout(programId);
    setStarting(null);
    if (ok) navigate('#/session');
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">My Workouts</h1>}
        actions={
          <>
            <button
              type="button"
              onClick={() => setSheet('import')}
              className="h-11 rounded-xl border border-line px-3 text-xs text-muted"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => setSheet('export')}
              className="h-11 rounded-xl border border-line px-3 text-xs text-muted"
            >
              Export
            </button>
          </>
        }
      />

      {error && <Banner message={error} onDismiss={clearError} />}

      {card && (
        <section
          className={`mt-3 shrink-0 rounded-2xl border bg-surface p-4 ${
            card.primary ? 'border-accent/50' : 'border-line'
          }`}
        >
          <p
            className={`text-xs uppercase tracking-widest ${
              card.primary ? 'text-accent' : 'text-muted'
            }`}
          >
            {card.eyebrow}
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold">{card.name}</h2>
          <p className="mt-0.5 text-xs text-muted">{card.meta}</p>
          <Button
            variant={card.primary ? 'primary' : 'secondary'}
            className="mt-3 h-12 w-full"
            disabled={starting != null}
            onClick={() => (active ? navigate('#/session') : void start(card.programId))}
          >
            {starting ? 'Starting…' : card.action}
          </Button>
        </section>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <section>
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-widest text-muted">Programs</p>
            <a href="#/programs" className="text-xs text-muted underline underline-offset-4">
              Manage
            </a>
          </div>
          {programs.length === 0 ? (
            <a
              href="#/programs/new"
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-accent font-semibold text-ink"
            >
              Build your first program
            </a>
          ) : (
            <ul className="mt-2 space-y-2">
              {programs.map((p) => (
                <li key={p.id}>
                  <Button
                    className="flex h-12 w-full items-center justify-between"
                    disabled={starting != null}
                    onClick={() => void start(p.id)}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted">
                      {p.scheduleDays.length > 0
                        ? formatDays(p.scheduleDays)
                        : exerciseCount(p.exercises.length)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

      <InstallHint />

      {/* Pinned: the shape of the last months, the last thing done, and the way in. */}
      <div className="mt-2 shrink-0">
        <ActivityGrid sessions={history} now={now} />
        {latest && (
          <ul className="mt-2">
            <SessionRow row={latest} actions={false} />
          </ul>
        )}
        {loaded && !latest && (
          <p className="mt-3 text-center text-sm text-muted">No finished sessions yet.</p>
        )}
        <a
          href="#/history"
          className="mt-2 flex h-11 items-center justify-center rounded-xl border border-line text-sm text-muted"
        >
          Manage
        </a>
      </div>

      {sheet && <TransferSheet mode={sheet} now={now} onClose={() => setSheet(null)} />}
    </main>
  );
}
