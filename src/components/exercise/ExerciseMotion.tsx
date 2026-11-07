/**
 * The start and end frame of an exercise, flipped on a loop. Two photos beat a
 * stick figure: the flip reads as motion and works offline because both frames
 * are ordinary files next to the app (see src/data/exerciseFigures.ts).
 */
export function ExerciseMotion({ slug }: { slug: string }) {
  const base = `exercises/${slug}`;
  return (
    <div
      aria-hidden
      className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <img src={`${base}-0.jpg`} alt="" className="h-full w-full object-cover" />
      <img
        src={`${base}-1.jpg`}
        alt=""
        className="exercise-flip absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
