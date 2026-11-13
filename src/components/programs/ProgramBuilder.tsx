import { useEffect, useRef, useState } from 'react';
import type { Program, Weekday } from '../../engine/types';
import { formatDay } from '../../lib/format';
import { usePrograms } from '../../store/programsStore';
import { libraryExercise } from '../../data/exercises';
import { ExercisePicker } from './ExercisePicker';
import {
  buildProgramJson,
  draftFromProgram,
  emptyDraft,
  emptyExercise,
  type DraftExercise,
  type ProgramDraft,
} from '../../lib/buildProgram';

const DAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function Num({
  label,
  value,
  onChange,
  min = 0,
  max,
  inputRef,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-11 w-full rounded-lg bg-field px-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}

export function ProgramBuilder({
  initial,
  onDone,
}: { initial?: Program; onDone?: () => void } = {}) {
  const setText = usePrograms((s) => s.setText);
  const save = usePrograms((s) => s.save);
  const [draft, setDraft] = useState<ProgramDraft>(() =>
    initial ? draftFromProgram(initial) : emptyDraft(),
  );
  /**
   * The row just added: scroll to it and put the cursor where the next tap would go.
   * A library pick arrives with a name, so the cursor starts at Sets; a row added by
   * hand has no name yet and starts there.
   */
  const nameRefs = useRef<Array<HTMLInputElement | null>>([]);
  const setRefs = useRef<Array<HTMLInputElement | null>>([]);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [focus, setFocus] = useState<{ index: number; field: 'name' | 'sets' } | null>(null);
  useEffect(() => {
    if (!focus) return;
    const row = rowRefs.current[focus.index];
    const el = (focus.field === 'name' ? nameRefs : setRefs).current[focus.index];
    setFocus(null);
    // The whole row to the top of the screen, so "Exercise N" is the first line under
    // the status bar and everything below it is the new exercise.
    row?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, [focus]);

  const patch = (p: Partial<ProgramDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchExercise = (i: number, p: Partial<DraftExercise>) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, n) => (n === i ? { ...e, ...p } : e)) }));
  const removeExercise = (i: number) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, n) => n !== i) }));
  const moveExercise = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.exercises];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row);
      return { ...d, exercises: next };
    });

  /** A library pick fills a row with name, sets, reps, rest and the per-hand flag. */
  const addFromLibrary = (name: string) => {
    const known = libraryExercise(name);
    if (!known) return;
    // blank rows are never saved, so they would only sit above the new exercise
    const kept = draft.exercises.filter((e) => e.name.trim());
    setDraft((d) => ({
      ...d,
      exercises: [
        ...d.exercises.filter((e) => e.name.trim()),
        {
          name: known.name,
          sets: known.sets,
          repsMin: known.repsMin,
          repsMax: known.repsMax,
          weightKg: '',
          perHand: known.perHand ?? false,
          restSeconds: known.restSeconds,
        },
      ],
    }));
    setFocus({ index: kept.length, field: 'sets' });
  };

  const ready = draft.name.trim().length > 0 && draft.exercises.some((e) => e.name.trim());

  async function create() {
    setText(buildProgramJson(draft, initial?.id));
    // Only clear the form when the program was actually written, or the user loses
    // everything they typed on a validation error.
    if (await save({ update: initial != null })) {
      setDraft(emptyDraft());
      onDone?.();
    }
  }

  return (
    <section className="mt-6">
      <p className="text-xs uppercase tracking-widest text-accent">
        {initial ? `Editing "${initial.name}"` : 'Build a program'}
      </p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Program name</span>
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Workout C"
            className="mt-1 h-12 w-full rounded-lg bg-field px-3 outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        <div className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Days</span>
          <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Scheduled day">
            {DAYS.map((d) => {
              const on = draft.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    patch({
                      days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d],
                    })
                  }
                  className={`min-h-11 min-w-11 rounded-full border px-3 text-xs ${
                    on ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted'
                  }`}
                >
                  {formatDay(d).slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {draft.days.length === 0 ? 'Any day — no fixed routine.' : 'Tap again to remove a day.'}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-4">
        {draft.exercises.map((ex, i) => (
          <li
            key={i}
            ref={(node) => {
              rowRefs.current[i] = node;
            }}
            className="border-t border-line pt-4 first:border-0 first:pt-0"
          >
            <div className="flex items-start gap-2">
              <label className="block flex-1">
                <span className="text-[10px] uppercase tracking-widest text-muted">
                  Exercise {i + 1}
                </span>
                <input
                  ref={(el) => {
                    nameRefs.current[i] = el;
                  }}
                  value={ex.name}
                  onChange={(e) => patchExercise(i, { name: e.target.value })}
                  placeholder="Type exercise name"
                  className="mt-1 h-12 w-full rounded-lg bg-field px-3 outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <div className="mt-5 flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${ex.name || `exercise ${i + 1}`} up`}
                  disabled={i === 0}
                  onClick={() => moveExercise(i, -1)}
                  className="h-12 w-11 rounded-lg bg-field text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${ex.name || `exercise ${i + 1}`} down`}
                  disabled={i === draft.exercises.length - 1}
                  onClick={() => moveExercise(i, 1)}
                  className="h-12 w-11 rounded-lg bg-field text-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${ex.name || `exercise ${i + 1}`}`}
                  onClick={() => removeExercise(i)}
                  className="h-12 w-11 rounded-lg bg-field text-danger"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Num
                inputRef={(el) => {
                  setRefs.current[i] = el;
                }}
                label="Sets"
                value={ex.sets}
                min={1}
                onChange={(sets) => patchExercise(i, { sets })}
              />
              <Num
                label="Reps min"
                value={ex.repsMin}
                min={1}
                onChange={(repsMin) => patchExercise(i, { repsMin })}
              />
              <Num
                label="Reps max"
                value={ex.repsMax}
                min={1}
                onChange={(repsMax) => patchExercise(i, { repsMax })}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted">Weight kg</span>
                <input
                  inputMode="decimal"
                  value={ex.weightKg}
                  onChange={(e) => patchExercise(i, { weightKg: e.target.value })}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="bodyweight"
                  className="mt-1 h-11 w-full rounded-lg bg-field px-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <Num
                label="Rest s"
                value={ex.restSeconds}
                max={600}
                onChange={(restSeconds) => patchExercise(i, { restSeconds })}
              />
              <label className="flex min-h-11 flex-col justify-end pb-1 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ex.perHand}
                    onChange={(e) => patchExercise(i, { perHand: e.target.checked })}
                    className="h-6 w-6 shrink-0 appearance-none rounded border border-line bg-field accent-accent checked:border-accent checked:bg-accent"
                  />
                  Per hand ×2
                </span>
              </label>
            </div>
          </li>
        ))}
      </ul>

      <ExercisePicker
        onPick={addFromLibrary}
        onNew={() => {
          setDraft((d) => ({ ...d, exercises: [...d.exercises, emptyExercise()] }));
          setFocus({ index: draft.exercises.length, field: 'name' });
        }}
      />

      <button
        type="button"
        disabled={!ready}
        onClick={() => void create()}
        className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
      >
        {initial ? 'Update program' : 'Create program'}
      </button>
    </section>
  );
}
