import { libraryExercise } from './exercises';

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

/**
 * A name the library does not carry gets the nearest drawing we actually ship. The
 * first rule that matches wins, so the specific lifts sit above the families.
 *
 * `null` means the closest drawing would be a lie — a leg curl is not a bicep curl,
 * and a blank card reads better than a picture of a different lift. This is the bug
 * that made the workout show something random.
 */
export const FAMILY: Array<[RegExp, string | null]> = [
  // Legs
  [/calf/i, 'calf-raise'],
  [/bulgarian|split squat/i, 'bulgarian-split-squat'],
  [/lunge/i, 'walking-lunge'],
  [/hip thrust|glute bridge/i, 'hip-thrust'],
  [/leg ?curl|hamstring|nordic|leg extension/i, null],
  [/romanian deadlift|\brdl\b/i, 'romanian-deadlift'],
  [/kettlebell swing|\bswing\b/i, 'kettlebell-swing'],
  [/back extension|hyperextension/i, 'back-extension'],
  [/deadlift|good morning|rack pull|pull.?through/i, 'deadlift'],
  [/squat|leg press|step.?up|pistol|skater|sissy|hack/i, 'squat'],
  // Push
  [/incline (bench|dumbbell|.*press)|incline push/i, 'incline-bench-press'],
  [
    /overhead press|shoulder press|military|arnold|standing dumbbell press|seated dumbbell press|push press|handstand|landmine press/i,
    'overhead-press',
  ],
  [/bench press|chest press|floor press|smith machine press|machine press/i, 'bench-press'],
  [/push.?up/i, 'push-up'],
  [/^((assisted|weighted|bench|chest|chair|tricep|triceps|parallel bar) )?dips?$/i, 'bench-press'],
  // Pull
  [/pull.?up|chin.?up/i, 'pull-up'],
  [/pulldown/i, 'lat-pulldown'],
  [/face pull|rear delt|reverse fly|rear fly/i, 'face-pull'],
  [/upright row/i, 'lateral-raise'],
  [/row/i, 'seated-row'],
  // Shoulders
  [/front raise/i, 'front-raise'],
  [/lateral raise|side raise/i, 'lateral-raise'],
  // Arms
  [/hammer curl/i, 'hammer-curl'],
  [/overhead tricep|tricep extension|triceps extension|skull ?crusher|french press/i, 'overhead-tricep-extension'],
  [/pushdown|kickback/i, 'tricep-pushdown'],
  [/curl/i, 'bicep-curl'],
  // Core, then the catch-alls
  [/side plank/i, 'side-plank'],
  [
    /plank|crunch|sit.?up|leg raise|knee raise|hollow|tuck|v-up|russian twist|ab wheel|dead bug|mountain climber|bird dog|superman|flutter|toe touch/i,
    'plank',
  ],
  [/\braise\b/i, 'lateral-raise'],
];

export function figureSlug(name: string): string | null {
  const slug = libraryExercise(name)?.slug;
  if (slug && SHIPPED[slug]) return slug;
  for (const [re, target] of FAMILY) if (re.test(name)) return target;
  return null;
}

/**
 * The exercise's own art, with no pattern fallback. Used where showing a
 * different lift's drawing would be a lie — e.g. the picker's info sheet.
 */
export function ownFigure(name: string): string | null {
  const slug = libraryExercise(name)?.slug;
  return slug && SHIPPED[slug] ? slug : null;
}

/** Exported for the test that keeps this list honest against public/exercises. */
export const SHIPPED_SLUGS = Object.keys(SHIPPED);

/**
 * Easter egg: one biceps visit in ten gets the meme instead of the drawing.
 * `roll` is 0..1, so the caller can be tested without waiting for luck.
 *
 * The GIF is 1 MB, so it is left out of the service worker's precache and fetched
 * on first use; offline it simply falls back to the drawing.
 */
export function easterEggFor(slug: string, roll: number): string | null {
  return slug === 'bicep-curl' && roll < 1 / 10 ? 'easter/biceps.gif' : null;
}
