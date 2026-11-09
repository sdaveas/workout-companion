import { formatWeight } from '../../lib/format';
import type { ProgramExercise } from '../../engine/types';
import { ExerciseDetails } from './ExerciseDetails';
import { ExerciseImage } from './ExerciseImage';
import { ExerciseMotion } from './ExerciseMotion';
import { muscleSummary } from '../../data/exercises';
import { figureSlug } from '../../data/exerciseFigures';

export function ExerciseCard({
  exercise,
  index,
  total,
  setNumber,
  totalSets,
  side = null,
}: {
  exercise: ProgramExercise;
  index: number;
  total: number;
  setNumber: number;
  totalSets: number;
  side?: 'left' | 'right' | null;
}) {
  const slug = figureSlug(exercise.name);
  const muscles = muscleSummary(exercise.name);
  return (
    <section aria-label={exercise.name}>
      <p className="text-xs uppercase tracking-[0.2em] text-muted">
        Exercise {index + 1} of {total}
      </p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight">{exercise.name}</h1>
      {muscles && <p className="mt-1 text-sm text-muted">{muscles}</p>}

      <div className="mt-4">
        {slug ? (
          <ExerciseMotion slug={slug} />
        ) : (
          <ExerciseImage src={exercise.imageUrl} alt={exercise.name} />
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-muted">Set</span>
        <span className="text-2xl font-semibold tabular-nums">
          {side ? (
            `${Math.ceil(setNumber / 2)} / ${Math.ceil(totalSets / 2)}`
          ) : (
            <>
              {setNumber} <span className="text-muted">/ {totalSets}</span>
            </>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-muted">Target reps</span>
        <span className="text-2xl font-semibold tabular-nums">
          {exercise.reps.min}–{exercise.reps.max}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-muted">Prescribed</span>
        <span className="text-sm">{formatWeight(exercise.weightKg, exercise.perHand)}</span>
      </div>

      <ExerciseDetails exercise={exercise} />
    </section>
  );
}
