import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useEffect, useState } from 'react';
import { navigate, useHashRoute } from '../hooks/useHashRoute';
import { useSession } from '../store/sessionStore';
import { loadSession } from '../storage/sessions';
import type { SessionRow } from '../storage/db';
import { summarize } from '../engine/summary';
import type { WorkoutAction } from '../engine/types';
import { formatClock, formatDate } from '../lib/format';
import { planProgramUpdate } from '../lib/programUpdate';
import { shareSession } from '../lib/shareProgram';
import { ShareIcon } from '../components/ui/icons';
import { usePrograms } from '../store/programsStore';
import { Button } from '../components/ui/Button';

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function Summary() {
  const { param } = useHashRoute();
  const live = useSession((s) => s.state);
  const dispatch = useSession((s) => s.dispatch);
  const editStored = useSession((s) => s.editStored);
  const reset = useSession((s) => s.reset);
  const [row, setRow] = useState<SessionRow | null>(null);
  const [notes, setNotes] = useState('');
  const programs = usePrograms((s) => s.programs);
  const setText = usePrograms((s) => s.setText);
  const saveProgram = usePrograms((s) => s.save);
  const [updateState, setUpdateState] = useState<'idle' | 'busy' | 'applied' | 'dismissed'>('idle');
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    if (!param) return;
    if (useSession.getState().state?.sessionId === param) {
      setRow(null);
      return;
    }
    void loadSession(param).then((r) => setRow(r ?? null));
  }, [param]);

  const source = live?.sessionId === param ? live : (row?.state ?? null);
  const summary = source ? summarize(source, source.finishedAt ?? source.updatedAt) : null;

  // Only the session that just ended offers to rewrite the program it came from.
  const liveJustFinished = live != null && live.sessionId === param && updateState === 'idle';
  const storedProgram = source ? (programs.find((p) => p.id === source.programId) ?? null) : null;
  // Auto sessions record the timed target, not measured reps: offering to rewrite the
  // program from them would bake a budget into the prescription. An early finish marks
  // every lift not reached as skipped, which would read as "remove it" for each one.
  const update =
    liveJustFinished &&
    source?.status === 'completed' &&
    source.mode !== 'auto' &&
    !source.endedEarly &&
    storedProgram
      ? planProgramUpdate(source, storedProgram)
      : null;

  // The link carries this session's snapshot and its numbers, so it works for a
  // workout whose program was edited or deleted since.
  async function shareIt() {
    if (!source) return;
    try {
      setShareNote(await shareSession(source));
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyUpdate() {
    if (!update) return;
    setUpdateState('busy');
    setText(update.json);
    const ok = await saveProgram({ update: true });
    setUpdateState(ok ? 'applied' : 'dismissed');
  }

  useEffect(() => {
    setNotes(source?.notes ?? '');
    // ponytail: seed notes once per session; later updates come from the store.
  }, [param, row?.id, live?.sessionId]);

  async function apply(action: WorkoutAction) {
    if (live?.sessionId === param) {
      dispatch(action);
      return;
    }
    if (!row) return;
    const next = await editStored(row.id, action);
    if (next) setRow({ ...row, state: next, status: next.status });
  }

  if (!param) {
    return (
      <main className="mx-auto max-w-md px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <ScreenHeader back={{ to: '#/history', label: 'History', compact: true }} />
        <p className="mt-16 text-center text-muted">No session selected.</p>
        <div className="mt-4 text-center">
          <Button onClick={() => navigate('#/history')}>History</Button>
        </div>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="mx-auto max-w-md px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <ScreenHeader back={{ to: '#/history', label: 'History', compact: true }} />
        <p className="mt-16 text-center text-muted">Loading session…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/history', label: 'History', compact: true }}
        actions={
          <button
            type="button"
            aria-label="Share this workout"
            onClick={() => void shareIt()}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
          >
            <ShareIcon />
          </button>
        }
      />
      {shareNote && (
        <p role="status" className="mt-2 text-xs text-accent">
          {shareNote}
        </p>
      )}
      <p className="mt-4 text-xs uppercase tracking-widest text-accent">
        {summary.endedEarly ? 'Ended early' : 'Session complete'}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{summary.programName}</h1>
      <p className="mt-1 text-sm text-muted">
        {formatDate(summary.finishedAt)} · {summary.exercisesCompleted} of{' '}
        {summary.exercises.length} exercises
      </p>
      {source?.mode === 'auto' && (
        <p className="mt-2 text-xs text-muted">Auto session · reps are the timed target.</p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-2">
        <Stat label="Duration" value={formatClock(summary.durationMs)} />
        <Stat label="Sets" value={`${summary.setsCompleted}`} unit={`of ${summary.exercises.reduce((n, e) => n + e.sets.length, 0)}`} />
        <Stat label="Reps" value={String(summary.totalReps)} />
        {summary.volumeKg > 0 && (
          <Stat label="Volume" value={String(Math.round(summary.volumeKg))} unit="kg" />
        )}
      </section>

      {summary.setsSkipped > 0 && (
        <p className="mt-3 text-sm text-muted">
          {summary.setsSkipped} sets {summary.endedEarly ? 'not done' : 'skipped'}.
        </p>
      )}

      <section className="mt-6">
        <p className="text-xs uppercase tracking-widest text-muted">Exercises</p>
        <ul className="mt-3 space-y-2">
          {summary.exercises.map((ex) => {
            const done = ex.sets.filter((x) => x.completed).length;
            return (
              <li key={ex.exerciseId} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{ex.name}</p>
                  <p className="shrink-0 text-xs text-muted">
                    {ex.skipped
                      ? summary.endedEarly && done === 0
                        ? 'not done'
                        : 'skipped'
                      : `${done} / ${ex.sets.length} sets`}
                  </p>
                </div>
                {!ex.skipped && (
                  <p className="mt-1 font-mono text-xs leading-relaxed text-muted">
                    {ex.sets
                      .map((s) =>
                        s.completed
                          ? `${s.actualReps ?? 0}${
                              s.actualWeightKg ? `×${s.actualWeightKg}` : ''
                            }`
                          : s.skipped
                            ? 'skip'
                            : '—',
                      )
                      .join('  ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {update && (
        <section className="mt-6 rounded-2xl border border-accent/50 bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-accent">Keep today's numbers?</p>
          <p className="mt-2 text-sm text-muted">
            Update “{update.name}” with what you actually did:
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {update.lines.map((line) => (
              <li key={line} className="leading-snug">
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            <Button
              variant="primary"
              className="h-12 w-full"
              disabled={updateState === 'busy'}
              onClick={() => void applyUpdate()}
            >
              Update the program
            </Button>
            <Button className="w-full" onClick={() => setUpdateState('dismissed')}>
              Keep it as it was
            </Button>
          </div>
        </section>
      )}

      {updateState === 'applied' && (
        <p role="status" className="mt-4 text-sm text-accent">
          Program updated with today's numbers.
        </p>
      )}

      <section className="mt-6">
        <p className="text-xs uppercase tracking-widest text-muted">How hard was it?</p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
            const selected = summary.rpe === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => void apply({ type: 'SET_RPE', rpe: selected ? null : value })}
                className={`h-11 rounded-lg border text-sm tabular-nums ${
                  selected
                    ? 'border-accent bg-accent font-semibold text-ink'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <label htmlFor="notes" className="text-xs uppercase tracking-widest text-muted">
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== summary.notes) void apply({ type: 'SET_NOTES', notes });
          }}
          rows={3}
          placeholder="How did it feel?"
          className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-accent"
        />
      </section>

      <div className="mt-8 space-y-2">
        <Button
          variant="primary"
          className="h-14 w-full text-base"
          onClick={() => {
            reset();
            navigate('#/');
          }}
        >
          Done
        </Button>
        <Button className="w-full" onClick={() => navigate('#/history')}>
          History
        </Button>
      </div>
    </main>
  );
}
