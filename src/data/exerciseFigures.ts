import { libraryExercise, type MotionPattern } from './exercises';

/**
 * Illustrations come from bryllim/workout-guide (CC BY-SA 4.0), which builds on
 * the Everkinetic drawings: two poses per lift, 512×512 line art. The pair flips
 * on a loop so it reads like a GIF, and it is drawn through a CSS mask so it
 * takes the colour of the theme.
 *
 * We only ship art for the exercises below (~1.2 MB). Anything else falls back to
 * a photo-finish of its movement pattern, so a hand-typed "Smith Bench" still
 * shows a bench press.
 */
const SHIPPED: Record<string, true> = Object.fromEntries(
  [
    'back-extension',
    'bench-press',
    'bicep-curl',
    'bulgarian-split-squat',
    'calf-raise',
    'crunch',
    'deadlift',
    'face-pull',
    'front-raise',
    'goblet-squat',
    'hammer-curl',
    'hanging-leg-raise',
    'hip-thrust',
    'incline-bench-press',
    'kettlebell-swing',
    'lat-pulldown',
    'lateral-raise',
    'leg-press',
    'one-arm-dumbbell-row',
    'overhead-press',
    'overhead-tricep-extension',
    'plank',
    'pull-up',
    'push-up',
    'romanian-deadlift',
    'seated-row',
    'side-plank',
    'squat',
    'tricep-pushdown',
    'walking-lunge',
  ].map((slug) => [slug, true as const]),
);

const PATTERN_SLUG: Record<MotionPattern, string> = {
  push: 'bench-press',
  pull: 'one-arm-dumbbell-row',
  squat: 'goblet-squat',
  hinge: 'deadlift',
  curl: 'bicep-curl',
  raise: 'lateral-raise',
  core: 'plank',
};

export function figureSlug(name: string, pattern: MotionPattern | null): string | null {
  const slug = libraryExercise(name)?.slug;
  if (slug && SHIPPED[slug]) return slug;
  return pattern ? PATTERN_SLUG[pattern] : null;
}

/** Exported for the test that keeps this list honest against public/exercises. */
export const SHIPPED_SLUGS = Object.keys(SHIPPED);

/**
 * Easter egg: one biceps visit in three gets the meme instead of the drawing.
 * `roll` is 0..1, so the caller can be tested without waiting for luck.
 */
export function easterEggFor(slug: string, roll: number): string | null {
  return slug === 'bicep-curl' && roll < 1 / 3 ? 'easter/biceps.png' : null;
}
