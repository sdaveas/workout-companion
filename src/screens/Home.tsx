import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { nextUp } from '../engine/schedule';
import { getWorkoutProgress } from '../engine/selectors';
import { summarize } from '../engine/summary';
import { elapsedMs } from '../engine/time';
import { exerciseCount, formatDate, formatDay, formatDays, formatDuration } from '../lib/format';
import { shareProgram } from '../lib/shareProgram';
import { ActivityGrid } from '../components/ui/ActivityGrid';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { InstallHint } from '../components/ui/InstallHint';
import { ScreenHeader } from '../components/ui/ScreenHeader';

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <path d="M12 3v11" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

/**
 * One page: what is on today, every program, every finished session, and a
 * training-day grid. The page itself does not scroll; the middle column does, so
 * the heatmap and the next workout stay put.
 */
export function Home() {
  const programs = usePrograms((s) => s.programs);
  const state = useSession((s) => s.state);
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const removeSession = useSession((s) => s.removeSession);
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const [starting, setStarting] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
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

  // A session outlives its program: a deleted or renamed program simply has no
  // link to send, so match by id and let the button disappear.
  async function share(programId: string) {
    setShared(null);
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    try {
      const note = await shareProgram(program);
      if (note) setShared(note);
    } catch (err) {
      setShared(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">Programs</h1>}
        actions={
          <a
            href="#/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
          >
            <GearIcon />
          </a>
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
            onClick={() =>
              active ? navigate('#/session') : void start(card.programId)
            }
          >
            {starting ? 'Starting…' : card.action}
          </Button>
        </section>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <section>
          <p className="text-xs uppercase tracking-widest text-muted">Programs</p>
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
          <a
            href="#/programs"
            className="mt-1 flex h-9 items-center justify-center text-xs text-muted underline"
          >
            Manage programs
          </a>
        </section>

        <section className="mt-4">
          <p className="text-xs uppercase tracking-widest text-muted">History</p>
          {shared && (
            <p role="status" className="mt-2 text-xs text-accent">
              {shared}
            </p>
          )}
          {loaded && history.length === 0 && (
            <p className="mt-6 text-center text-sm text-muted">No finished sessions yet.</p>
          )}
          <ul className="mt-2 space-y-2">
            {history.map((row) => {
              const s = summarize(row.state, row.finishedAt ?? row.state.updatedAt);
              const canShare = programs.some((p) => p.id === row.programId);
              return (
                <li key={row.id} className="flex items-stretch gap-2">
                  <a
                    href={`#/summary/${row.id}`}
                    className="block min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-medium">{row.programName}</p>
                      <p className="shrink-0 text-xs text-muted">{formatDate(row.finishedAt)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatDuration(s.durationMs)} · {s.setsCompleted} sets
                      {s.volumeKg > 0 && ` · ${Math.round(s.volumeKg)} kg`}
                      {s.endedEarly && <span className="text-danger"> · ended early</span>}
                    </p>
                  </a>
                  {canShare && (
                    <button
                      type="button"
                      aria-label={`Share ${row.programName} from ${formatDate(row.finishedAt)}`}
                      onClick={() => void share(row.programId)}
                      className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted"
                    >
                      <ShareIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${row.programName} from ${formatDate(row.finishedAt)}`}
                    onClick={() => {
                      if (!confirm('Delete this session? It cannot be recovered.')) return;
                      void removeSession(row.id);
                    }}
                    className="w-11 shrink-0 rounded-xl border border-line bg-surface text-lg text-danger"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <InstallHint />

      <ActivityGrid sessions={history} now={now} />
    </main>
  );
}
