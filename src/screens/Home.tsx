import { useEffect, useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { nextUp } from '../engine/schedule';
import { getWorkoutProgress } from '../engine/selectors';
import { elapsedMs } from '../engine/time';
import { exerciseCount, formatDay, formatDays, formatDuration } from '../lib/format';
import { dayKey } from '../lib/activity';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { InstallHint } from '../components/ui/InstallHint';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ActivityGrid } from '../components/ui/ActivityGrid';
import { SessionRow } from '../components/ui/SessionRow';
import { TransferSheet } from '../components/ui/TransferSheet';
import { ExportIcon, ImportIcon } from '../components/ui/icons';

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
  /** A day picked on the grid; null means the last session's day. */
  const [picked, setPicked] = useState<number | null>(null);
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
  // Same filter as History, but it always has a day: the last session, until the
  // grid is tapped.
  const latestDay = latest?.finishedAt != null ? dayKey(latest.finishedAt) : null;
  const day = picked ?? latestDay;
  const shown =
    day === null
      ? history
      : history.filter((row) => row.finishedAt != null && dayKey(row.finishedAt) === day);

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
      }
    : next.kind === 'today'
      ? {
          eyebrow: 'Today',
          name: next.program.name,
          meta: meta(next.program),
          action: 'Start workout',
          programId: next.program.id,
        }
      : next.kind === 'upcoming'
        ? {
            eyebrow: `Next · ${formatDay(next.weekday)}`,
            name: next.program.name,
            meta: meta(next.program),
            action: 'Start anyway',
            programId: next.program.id,
          }
        : next.kind === 'done_today'
          ? {
              eyebrow: '✓ Done for today',
              name: next.program.name,
              meta: 'Logged. Extras are optional.',
              action: 'Do it again',
              programId: next.program.id,
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
        title={
          <div className="flex items-center gap-2">
            <a
              href="#/credits"
              aria-label="Credits"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-muted"
            >
              {/* A drawn glyph, not the emoji: Apple's ℹ️ is a blue tile that fights the theme. */}
              <span aria-hidden className="font-serif text-screen italic leading-none">
                i
              </span>
            </a>
            <h1 className="truncate text-label font-semibold uppercase tracking-label">
              My Workouts
            </h1>
          </div>
        }
        actions={
          <>
            <button
              type="button"
              aria-label="Import"
              onClick={() => setSheet('import')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
            >
              <ImportIcon />
            </button>
            <button
              type="button"
              aria-label="Export"
              onClick={() => setSheet('export')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
            >
              <ExportIcon />
            </button>
          </>
        }
      />

      {error && <Banner message={error} onDismiss={clearError} />}

      {card && (
        <section
          className="mt-3 shrink-0 rounded-2xl border border-line bg-surface p-4"
        >
          <p className="text-label uppercase tracking-label text-muted">{card.eyebrow}</p>
          <h2 className="mt-1 truncate text-screen font-semibold">{card.name}</h2>
          <p className="mt-0.5 text-body text-muted">{card.meta}</p>
          <Button
            variant="primary"
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
          {/* Both boxes are 44 tall so the targets are. The words keep the y they had
              (the old 12 px pad only fitted a 20 px box), and the list under them
              starts 24 px lower: nothing else moves. */}
          <div className="flex items-start justify-between">
            {/* The heading is the way to the list: Select and Delete only live there. */}
            <a
              href="#/programs"
              className="flex h-11 items-start pt-1 text-label uppercase tracking-label text-muted"
            >
              Programs ›
            </a>
            <a
              href="#/programs/new"
              className="ml-auto flex h-11 min-w-11 items-start justify-end text-body text-muted underline underline-offset-4"
            >
              Add +
            </a>
          </div>
          {programs.length === 0 ? (
            <a
              href="#/programs/new"
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-accent text-body font-gym text-ink"
            >
              Build your first program
            </a>
          ) : (
            <ul className="mt-2 space-y-2">
              {programs.map((p) => (
                <li key={p.id}>
                  {/* Tapping a program opens it; starting is a decision, not a link. */}
                  <a
                    href={`#/program/${p.id}`}
                    className="flex h-12 w-full items-center justify-between rounded-lg border border-line bg-surface px-4"
                  >
                    <span className="truncate text-row">{p.name}</span>
                    <span className="ml-3 shrink-0 text-body text-muted">
                      {p.scheduleDays.length > 0
                        ? formatDays(p.scheduleDays)
                        : exerciseCount(p.exercises.length)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 pb-2">
          <div className="flex items-baseline justify-between">
            <p className="text-label uppercase tracking-label text-muted">History</p>
            {/* 44 tall with pt exactly cancelling -mt: the words sit where they always
                did, and the hit area fills the 20 px above them (empty) and the 4 px
                below (the month labels, which are not tappable). */}
            <a
              href="#/history"
              className="-mt-5 -mb-1 flex min-h-11 min-w-11 items-start justify-end pb-1 pt-5 text-body text-muted underline underline-offset-4"
            >
              More
            </a>
          </div>
          <div className="mt-2">
            <ActivityGrid
              sessions={history}
              now={now}
              selected={day}
              onSelect={(next) => setPicked(next === day ? null : next)}
            />
          </div>
          {shown.length > 0 && (
            <ul className="mt-2 space-y-2">
              {/* SessionRow is its own <li>; wrapping it here nested two of them. */}
              {shown.slice(0, 5).map((row) => (
                <SessionRow key={row.id} row={row} actions={false} />
              ))}
            </ul>
          )}
          {loaded && shown.length === 0 && (
            <p className="mt-3 text-center text-body text-muted">
              {day === null ? 'No finished sessions yet.' : 'Nothing logged that day.'}
            </p>
          )}
        </section>
      </div>

      <InstallHint />

      {sheet && <TransferSheet mode={sheet} now={now} onClose={() => setSheet(null)} />}
    </main>
  );
}
