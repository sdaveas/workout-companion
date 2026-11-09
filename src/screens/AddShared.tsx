import { useEffect, useState } from 'react';
import type { Program, Weekday } from '../engine/types';
import { describeError } from '../schemas/program';
import { usePrograms } from '../store/programsStore';
import { conflictingProgram, renameProgram, suggestedName, uniqueId, uniqueName, withIdentity } from '../lib/identity';
import { decodePrograms } from '../lib/share';
import { saveProgram } from '../storage/programs';
import { exerciseCount, formatDay } from '../lib/format';
import { withDays } from '../lib/schedule';
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
  | { kind: 'ready'; programs: Program[] };

/**
 * The days live in the program's own JSON, so a backup or a re-export carries them.
 * `raw` is what a backup writes, so patching only the object would lose the schedule.
 */
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
    void decodePrograms(payload).then((result) => {
      if (!alive) return;
      setState(
        result.ok
          ? { kind: 'ready', programs: result.programs }
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

  const shared = state.kind === 'ready' ? state.programs : [];
  const single = shared.length === 1 ? shared[0] : null;
  const clash = single && loaded ? conflictingProgram(single, programs) : null;

  /** Several at once: same names as the sender unless taken, then numbered. */
  async function addAll() {
    setBusy(true);
    setError(null);
    try {
      const names = programs.map((p) => p.name);
      const ids = programs.map((p) => p.id);
      for (const offer of shared) {
        const name = uniqueName(offer.name, names);
        const program = withIdentity(offer, name, uniqueId(name, ids));
        await saveProgram(program);
        names.push(name);
        ids.push(program.id);
      }
      await load();
      usePrograms.setState({ notice: `${shared.length} programs added.` });
      location.hash = '#/programs';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="flex min-h-11 min-w-11 items-center text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">
          {shared.length > 1 ? 'Shared programs' : 'Shared program'}
        </h1>
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

      {shared.length > 1 && loaded && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-accent">Someone shared these</p>
          <ul className="mt-2 space-y-2">
            {shared.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {exerciseCount(p.exercises.length)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Set their days on Home once they are in.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addAll()}
            className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
          >
            Add all {shared.length}
          </button>
          <a href="#/" className="mt-2 flex h-11 items-center justify-center text-xs text-muted underline">
            Don’t add them
          </a>
          <p className="text-center text-xs text-muted">Nothing is saved until you add them.</p>
        </section>
      )}

      {single && loaded && !clash && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-accent">Someone shared this</p>
          <p className="mt-2 text-lg font-semibold">{single.name}</p>
          <p className="mt-1 text-sm text-muted">
            {single.exercises.length} exercise
            {single.exercises.length === 1 ? '' : 's'}
          </p>
          {single.description && (
            <p className="mt-2 text-sm text-muted">{single.description}</p>
          )}
          <ul className="mt-3 space-y-1">
            {single.exercises.map((e) => (
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
            onClick={() => void add(single)}
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

      {single && loaded && clash && (
        <>
          <section className="mt-6 rounded-xl border border-line bg-surface p-4">
            <p className="text-lg font-semibold">{single.name}</p>
            <p className="mt-1 text-sm text-muted">
              {single.exercises.length} exercise
              {single.exercises.length === 1 ? '' : 's'}
            </p>
            <p className="mt-2 text-sm">You already have a program with this name.</p>
          </section>
          <DayPicker days={days} onChange={setDays} />
          <NameConflict
            taken={clash.name}
            existingNames={programs.map((p) => p.name)}
            suggested={suggestedName(single, programs)}
            busy={busy}
            onSave={(name) => void add(single, name)}
          />
        </>
      )}
    </main>
  );
}
