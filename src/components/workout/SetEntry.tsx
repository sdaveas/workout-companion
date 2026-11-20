import { formatWeight } from '../../lib/format';
import type { ProgramExercise } from '../../engine/types';

interface Props {
  exercise: ProgramExercise;
  draft: { reps: number; weightKg: number | null };
  onChange: (draft: { reps: number; weightKg: number | null }) => void;
  /** Two columns with the label above; fits a 390 px screen without scrolling. */
  compact?: boolean;
}

function Stepper({
  label,
  value,
  display,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  step: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-label uppercase tracking-label text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-12 w-12 shrink-0 rounded-xl border border-line bg-surface text-screen"
        >
          −
        </button>
        <span className="min-w-24 text-center text-screen font-semibold tabular-nums">{display}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="h-12 w-12 shrink-0 rounded-xl border border-line bg-surface text-screen"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CompactStepper({
  label,
  value,
  display,
  step,
  min,
  onChange,
  showLabel = true,
  stacked = false,
}: {
  label: string;
  value: number;
  display: string;
  step: number;
  min: number;
  onChange: (next: number) => void;
  /** The weight column's display already carries its unit; a visible label only
      wraps inside the narrow second column. */
  showLabel?: boolean;
  /** Label above the buttons: two steppers side by side need the width for the row. */
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? 'flex flex-col gap-0.5' : 'flex items-center justify-between gap-1'}>
      <span
        className={
          showLabel
            ? `text-label uppercase tracking-label text-muted ${stacked ? 'pl-1' : ''}`
            : 'sr-only'
        }
      >
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-11 w-11 shrink-0 rounded-lg border border-line bg-surface text-screen"
        >
          −
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-screen font-semibold tabular-nums">{display}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="h-11 w-11 shrink-0 rounded-lg border border-line bg-surface text-screen"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SetEntry({ exercise, draft, onChange, compact = false }: Props) {
  const hasWeight = draft.weightKg != null || exercise.weightKg != null;

  if (compact) {
    return (
      <div className={`grid gap-3 ${hasWeight ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <CompactStepper
          label="Reps"
          value={draft.reps}
          display={String(draft.reps)}
          step={1}
          min={0}
          onChange={(reps) => onChange({ ...draft, reps })}
        />
        {hasWeight ? (
          <CompactStepper
            label={exercise.perHand ? 'Weight / hand' : 'Weight'}
            value={draft.weightKg ?? 0}
            // The compact column is ~149px wide: a bare `kg` keeps the display on one
            // line; the per-hand form lives in the target line above.
            display={formatWeight(draft.weightKg, false)}
            step={0.5}
            min={0}
            onChange={(weightKg) => onChange({ ...draft, weightKg })}
            showLabel={false}
          />
        ) : (
          <p className="self-center text-body text-muted">Bodyweight</p>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      <Stepper
        label="Reps"
        value={draft.reps}
        display={String(draft.reps)}
        step={1}
        min={0}
        onChange={(reps) => onChange({ ...draft, reps })}
      />
      {hasWeight ? (
        <Stepper
          label={exercise.perHand ? 'Weight / hand' : 'Weight'}
          value={draft.weightKg ?? 0}
          display={formatWeight(draft.weightKg, exercise.perHand)}
          step={0.5}
          min={0}
          onChange={(weightKg) => onChange({ ...draft, weightKg })}
        />
      ) : (
        <div className="flex items-center justify-between py-2">
          <span className="text-label uppercase tracking-label text-muted">Weight</span>
          <span className="text-body text-muted">Bodyweight</span>
        </div>
      )}
    </div>
  );
}
