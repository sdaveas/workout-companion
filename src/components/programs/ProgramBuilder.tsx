import { useState } from 'react';
import type { Weekday } from '../../engine/types';
import { usePrograms } from '../../store/programsStore';
import {
  buildProgramJson,
  emptyDraft,
  emptyExercise,
  type DraftExercise,
  type ProgramDraft,
} from '../../lib/buildProgram';

const DAYS: Array<Weekday | ''> = [
  '',
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
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-2 text-center tabular-nums outline-none focus:border-accent"
      />
    </label>
  );
}

export function ProgramBuilder({ onDone }: { onDone: () => void }) {
  const setText = usePrograms((s) => s.setText);
  const save = usePrograms((s) => s.save);
  const [draft, setDraft] = useState<ProgramDraft>(emptyDraft);

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

  const ready = draft.name.trim().length > 0 && draft.exercises.some((e) => e.name.trim());

  async function create() {
    setText(buildProgramJson(draft));
    await save();
    setDraft(emptyDraft());
    onDone();
  }

  return (
    <section className="mt-6">
      <p className="text-xs uppercase tracking-widest text-accent">Build a program</p>
      <p className="mt-1 text-sm text-muted">
        No JSON needed. It is validated by the same importer, then saved.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Program name</span>
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Workout C"
            className="mt-1 h-12 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Scheduled day</span>
          <select
            value={draft.day}
            onChange={(e) => patch({ day: e.target.value as Weekday | '' })}
            className="mt-1 h-12 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent"
          >
            {DAYS.map((d) => (
              <option key={d || 'none'} value={d}>
                {d === '' ? 'No fixed day' : d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-5 space-y-3">
        {draft.exercises.map((ex, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-start gap-2">
              <label className="block flex-1">
                <span className="text-[10px] uppercase tracking-widest text-muted">
                  Exercise {i + 1}
                </span>
                <input
                  value={ex.name}
                  onChange={(e) => patchExercise(i, { name: e.target.value })}
                  placeholder="Goblet Squat"
                  className="mt-1 h-12 w-full rounded-lg border border-line bg-ink px-3 outline-none focus:border-accent"
                />
              </label>
              <div className="mt-5 flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${ex.name || `exercise ${i + 1}`} up`}
                  disabled={i === 0}
                  onClick={() => moveExercise(i, -1)}
                  className="h-12 w-9 rounded-lg border border-line text-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${ex.name || `exercise ${i + 1}`} down`}
                  disabled={i === draft.exercises.length - 1}
                  onClick={() => moveExercise(i, 1)}
                  className="h-12 w-9 rounded-lg border border-line text-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${ex.name || `exercise ${i + 1}`}`}
                  onClick={() => removeExercise(i)}
                  className="h-12 w-9 rounded-lg border border-line text-danger"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <Num label="Sets" value={ex.sets} min={1} onChange={(sets) => patchExercise(i, { sets })} />
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

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted">Weight kg</span>
                <input
                  inputMode="decimal"
                  value={ex.weightKg}
                  onChange={(e) => patchExercise(i, { weightKg: e.target.value })}
                  placeholder="bodyweight"
                  className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-2 text-center tabular-nums outline-none focus:border-accent"
                />
              </label>
              <Num
                label="Rest s"
                value={ex.restSeconds}
                max={600}
                onChange={(restSeconds) => patchExercise(i, { restSeconds })}
              />
              <label className="flex min-h-11 flex-col justify-end pb-1 text-xs">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ex.perHand}
                    onChange={(e) => patchExercise(i, { perHand: e.target.checked })}
                    className="h-5 w-5 accent-accent"
                  />
                  Per hand
                </span>
              </label>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setDraft((d) => ({ ...d, exercises: [...d.exercises, emptyExercise()] }))}
        className="mt-3 h-12 w-full rounded-xl border border-dashed border-line text-sm text-muted"
      >
        + Add exercise
      </button>

      <button
        type="button"
        disabled={!ready}
        onClick={() => void create()}
        className="mt-4 h-14 w-full rounded-xl bg-accent font-semibold text-ink disabled:opacity-40"
      >
        Create program
      </button>
    </section>
  );
}
