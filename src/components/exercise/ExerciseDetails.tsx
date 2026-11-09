import type { ProgramExercise } from '../../engine/types';

export function ExerciseDetails({
  exercise,
  open,
}: {
  exercise: ProgramExercise;
  /** Force-expanded, e.g. inside the instructions overlay. */
  open?: boolean;
}) {
  const hasDetails =
    exercise.instructions.length > 0 ||
    exercise.commonMistakes.length > 0 ||
    exercise.equipment.length > 0 ||
    exercise.muscleGroups.length > 0;

  if (!hasDetails) return null;

  return (
    <details open={open} className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted">
        How to do it
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {exercise.instructions.length > 0 && (
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            {exercise.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        )}
        {exercise.commonMistakes.length > 0 && (
          <p className="text-muted">
            <span className="text-xs uppercase tracking-widest">Avoid: </span>
            {exercise.commonMistakes.join('; ')}
          </p>
        )}
        {(exercise.muscleGroups.length > 0 || exercise.equipment.length > 0) && (
          <p className="text-xs text-muted">
            {[...exercise.muscleGroups, ...exercise.equipment].join(' · ')}
          </p>
        )}
      </div>
    </details>
  );
}
