import { formatWeight } from '../../lib/format';
import type { ProgramExercise } from '../../engine/types';

interface Props {
  exercise: ProgramExercise;
  draft: { reps: number; weightKg: number | null };
  onChange: (draft: { reps: number; weightKg: number | null }) => void;
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
      <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-12 w-12 rounded-xl border border-line bg-surface text-xl"
        >
          −
        </button>
        <span className="min-w-24 text-center text-2xl font-semibold tabular-nums">{display}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="h-12 w-12 rounded-xl border border-line bg-surface text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SetEntry({ exercise, draft, onChange }: Props) {
  const hasWeight = draft.weightKg != null || exercise.weightKg != null;

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
          <span className="text-xs uppercase tracking-widest text-muted">Weight</span>
          <span className="text-sm text-muted">Bodyweight</span>
        </div>
      )}
    </div>
  );
}
