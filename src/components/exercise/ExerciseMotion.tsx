import { useState, type CSSProperties } from 'react';
import { easterEggFor } from '../../data/exerciseFigures';

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

export function ExerciseMotion({
  slug,
  className = 'aspect-[3/2] w-full',
}: {
  slug: string;
  className?: string;
}) {
  const base = `exercises/${slug}`;
  const [egg, setEgg] = useState(() => easterEggFor(slug, Math.random()));

  if (egg) {
    return (
      <img
        src={egg}
        alt=""
        onError={() => setEgg(null)}
        className={`rounded-2xl border border-line object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-2xl border border-line bg-surface text-muted ${className}`}
    >
      <div className="exercise-frame exercise-frame-base absolute inset-3" style={mask(`${base}-0.svg`)} />
      <div className="exercise-frame exercise-flip absolute inset-3" style={mask(`${base}-1.svg`)} />
    </div>
  );
}
