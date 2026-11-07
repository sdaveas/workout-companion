import { useEffect, useState } from 'react';
import type { Program, Weekday } from '../engine/types';
import { describeError } from '../schemas/program';
import { usePrograms } from '../store/programsStore';
import { conflictingProgram, renameProgram, suggestedName } from '../lib/identity';
import { decodeProgram } from '../lib/share';
import { saveProgram } from '../storage/programs';
import { formatDay } from '../lib/format';
import { NameConflict } from '../components/programs/NameConflict';

const DAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; program: Program };

/**
 * The days live in the program's own JSON, so a backup or a re-export carries them.
 * `raw` is what a backup writes, so patching only the object would lose the schedule.
 */
function withDays(program: Program, days: Weekday[]): Program {
  const raw = JSON.parse(program.raw) as Record<string, unknown>;
  if (days.length > 0) raw.schedule = { days };
  else delete raw.schedule;
  return { ...program, scheduleDays: days, raw: JSON.stringify(raw) };
}

function DayPicker({ days, onChange }: { days: Weekday[]; onChange: (d: Weekday[]) => void }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-widest text-muted">Train it</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Train it">
        <button
          type="button"
          aria-pressed={days.length === 0}
          onClick={() => onChange([])}
          className={`min-h-11 rounded-full border px-3 text-xs ${
            days.length === 0
              ? 'border-accent bg-accent font-semibold text-ink'
              : 'border-line text-muted'
          }`}
        >
          One-off
        </button>
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}
              className={`min-h-11 rounded-full border px-3 text-xs ${
                on ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted'
              }`}
            >
              {formatDay(d).slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {days.length === 0
          ? 'One-off: it waits in your list until you start it.'
          : 'Home shows it every week on the days you picked.'}
      </p>
    </div>
  );
}

/**
 * `#/add/<payload>` — a whole program inside the link. Nothing is written until the
 * user says so, and the week is theirs to choose: links never carry a schedule.
 */
export function AddShared({ payload }: { payload: string }) {
  const programs = usePrograms((s) => s.programs);
  const loaded = usePrograms((s) => s.loaded);
  const load = usePrograms((s) => s.load);
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Weekday[]>([]);

  useEffect(() => {
    let alive = true;
    void decodeProgram(payload).then((result) => {
      if (!alive) return;
      setState(
        result.ok
          ? { kind: 'ready', program: result.program }
          : {
              kind: 'error',
              message: describeError(result.error)[0]?.message ?? 'That link is not readable.',
            },
      );
    });
    return () => {
      alive = false;
    };
  }, [payload]);

  async function add(program: Program, name?: string) {
    setBusy(true);
    setError(null);
    try {
      let target = program;
      if (name !== undefined) {
        const renamed = renameProgram(program, name, programs);
        if (!renamed.ok) {
          setError(renamed.error);
          return;
        }
        target = renamed.program;
      }
      await saveProgram(withDays(target, days));
      await load();
      usePrograms.setState({ notice: `Added “${target.name}” to your routines.` });
      location.hash = '#/programs';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const clash =
    state.kind === 'ready' && loaded ? conflictingProgram(state.program, programs) : null;

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="flex min-h-11 min-w-11 items-center text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">Shared program</h1>
        <span className="w-12" />
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {state.kind === 'loading' && <p className="mt-6 text-sm text-muted">Reading the link…</p>}

      {state.kind === 'error' && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-danger">This link is not a program</p>
          <p className="mt-1 text-sm text-muted">{state.message}</p>
          <p className="mt-2 text-xs text-muted">Ask again for the full link — messages sometimes cut it.</p>
        </section>
      )}

      {state.kind === 'ready' && !loaded && (
        <p className="mt-6 text-sm text-muted">Checking your programs…</p>
      )}

      {state.kind === 'ready' && loaded && !clash && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-accent">Someone shared this</p>
          <p className="mt-2 text-lg font-semibold">{state.program.name}</p>
          <p className="mt-1 text-sm text-muted">
            {state.program.exercises.length} exercise
            {state.program.exercises.length === 1 ? '' : 's'}
          </p>
          {state.program.description && (
            <p className="mt-2 text-sm text-muted">{state.program.description}</p>
          )}
          <ul className="mt-3 space-y-1">
            {state.program.exercises.map((e) => (
              <li key={e.id} className="flex justify-between text-sm">
                <span className="truncate">{e.name}</span>
                <span className="ml-2 shrink-0 text-muted">
                  {e.sets}×{e.reps.min === e.reps.max ? e.reps.min : `${e.reps.min}–${e.reps.max}`}
                </span>
              </li>
            ))}
          </ul>
          <DayPicker days={days} onChange={setDays} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void add(state.program)}
            className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
          >
            Add to my routines
          </button>
          <a href="#/" className="mt-2 flex h-11 items-center justify-center text-xs text-muted underline">
            Don’t add it
          </a>
          <p className="text-center text-xs text-muted">Nothing is saved until you add it.</p>
        </section>
      )}

      {state.kind === 'ready' && loaded && clash && (
        <>
          <section className="mt-6 rounded-xl border border-line bg-surface p-4">
            <p className="text-lg font-semibold">{state.program.name}</p>
            <p className="mt-1 text-sm text-muted">
              {state.program.exercises.length} exercise
              {state.program.exercises.length === 1 ? '' : 's'}
            </p>
            <p className="mt-2 text-sm">You already have a program with this name.</p>
          </section>
          <DayPicker days={days} onChange={setDays} />
          <NameConflict
            taken={clash.name}
            existingNames={programs.map((p) => p.name)}
            suggested={suggestedName(state.program, programs)}
            busy={busy}
            onSave={(name) => void add(state.program, name)}
          />
        </>
      )}
    </main>
  );
}
