import type { MotionPattern } from './exercises';

/**
 * Two-frame photos from the free-exercise-db dataset (public domain, Unlicense):
 * github.com/yuhonas/free-exercise-db. Each exercise has a start frame and an end
 * frame, which we flip between so it reads like a GIF without shipping one.
 *
 * Files live in public/exercises/<slug>-0.jpg and -1.jpg, cropped to 420×280.
 * Unknown exercises fall back to a photo of the same movement pattern, so a
 * hand-typed "Smith Bench" still shows something honest.
 */
const SLUGS: Record<string, string> = {
  'bench press': 'bench-press',
  'dumbbell floor press': 'dumbbell-floor-press',
  'overhead press': 'overhead-press',
  'push-up': 'push-up',
  'incline press': 'incline-press',
  'triceps pushdown': 'triceps-pushdown',
  'dumbbell row': 'dumbbell-row',
  'lat pulldown': 'lat-pulldown',
  'pull-up': 'pull-up',
  'seated cable row': 'seated-cable-row',
  'face pull': 'face-pull',
  'back squat': 'back-squat',
  'goblet squat': 'goblet-squat',
  'leg press': 'leg-press',
  'bulgarian split squat': 'bulgarian-split-squat',
  lunge: 'lunge',
  'calf raise': 'calf-raise',
  deadlift: 'deadlift',
  'romanian deadlift': 'romanian-deadlift',
  'hip thrust': 'hip-thrust',
  'kettlebell swing': 'kettlebell-swing',
  'back extension': 'back-extension',
  'bicep curl': 'bicep-curl',
  'hammer curl': 'hammer-curl',
  'lateral raise': 'lateral-raise',
  'front raise': 'front-raise',
  plank: 'plank',
  'side plank': 'plank',
  'hanging leg raise': 'hanging-leg-raise',
  crunch: 'crunch',
};

const PATTERN_SLUG: Record<MotionPattern, string> = {
  push: 'bench-press',
  pull: 'dumbbell-row',
  squat: 'goblet-squat',
  hinge: 'deadlift',
  curl: 'bicep-curl',
  raise: 'lateral-raise',
  core: 'plank',
};

export function figureSlug(name: string, pattern: MotionPattern | null): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return SLUGS[key] ?? (pattern ? PATTERN_SLUG[pattern] : null);
}
