import type { CSSProperties } from 'react';

/**
 * Two poses of the same lift, taking turns on a loop. The art is line-only, so it
 * is drawn as a CSS mask and coloured by the surrounding text colour — it stays
 * crisp at any size and matches the theme instead of glowing white.
 *
 * Source: bryllim/workout-guide (CC BY-SA 4.0), built on Everkinetic poses.
 * Files live in public/exercises/<slug>-0.svg and -1.svg.
 */
const mask = (url: string): CSSProperties => ({
  maskImage: `url(${url})`,
  WebkitMaskImage: `url(${url})`,
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
});

export function ExerciseMotion({ slug }: { slug: string }) {
  const base = `exercises/${slug}`;
  return (
    <div
      aria-hidden
      className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border border-line bg-surface text-muted"
    >
      <div className="exercise-frame exercise-frame-base absolute inset-3" style={mask(`${base}-0.svg`)} />
      <div className="exercise-frame exercise-flip absolute inset-3" style={mask(`${base}-1.svg`)} />
    </div>
  );
}
