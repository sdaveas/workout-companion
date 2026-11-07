import { CATALOG } from './catalog';

/**
 * The built-in exercise library. Two layers:
 *
 * 1. Every exercise in the illustration set (src/data/catalog.ts) — name, art,
 *    muscles, equipment. That is the complete list the builder offers.
 * 2. A curated few dozen on top, which carry a hand-tuned prescription (sets,
 *    reps, rest, per-hand) and the names this app has always used.
 *
 * Nothing is fetched — the app works offline.
 */

export type MotionPattern = 'push' | 'pull' | 'squat' | 'hinge' | 'curl' | 'raise' | 'core';

/** Coarse buckets, for browsing. The specific muscle is what the UI shows. */
export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Legs'
  | 'Glutes'
  | 'Mobility';

export interface LibraryExercise {
  name: string;
  /** Art folder under public/exercises, when the exercise has one. */
  slug?: string;
  pattern: MotionPattern | null;
  /** Primary muscle, e.g. "Chest". */
  muscle: string;
  /** Secondary muscles, most relevant first. */
  also: string[];
  group: MuscleGroup;
  equipment: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  perHand?: boolean;
}

interface Curated {
  name: string;
  slug?: string;
  pattern: MotionPattern;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  perHand?: boolean;
}

/** Hand-tuned prescriptions. Everything else the catalog offers gets a default. */
const CURATED: Curated[] = [
  // push
  { name: 'Bench Press', slug: 'bench-press', pattern: 'push', sets: 3, repsMin: 6, repsMax: 10, restSeconds: 150 },
  { name: 'Dumbbell Floor Press', pattern: 'push', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 },
  { name: 'Overhead Press', slug: 'overhead-press', pattern: 'push', sets: 3, repsMin: 6, repsMax: 10, restSeconds: 120 },
  { name: 'Push-up', slug: 'push-up', pattern: 'push', sets: 3, repsMin: 10, repsMax: 20, restSeconds: 60 },
  {
    name: 'Incline Press',
    slug: 'incline-bench-press',
    pattern: 'push',
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 120,
  },
  {
    name: 'Triceps Pushdown',
    slug: 'tricep-pushdown',
    pattern: 'push',
    sets: 3,
    repsMin: 10,
    repsMax: 15,
    restSeconds: 60,
  },
  // pull
  {
    name: 'Dumbbell Row',
    slug: 'one-arm-dumbbell-row',
    pattern: 'pull',
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    perHand: true,
  },
  { name: 'Lat Pulldown', slug: 'lat-pulldown', pattern: 'pull', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Pull-up', slug: 'pull-up', pattern: 'pull', sets: 3, repsMin: 5, repsMax: 10, restSeconds: 120 },
  { name: 'Seated Cable Row', slug: 'seated-row', pattern: 'pull', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Face Pull', slug: 'face-pull', pattern: 'pull', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
  // squat
  { name: 'Back Squat', slug: 'squat', pattern: 'squat', sets: 3, repsMin: 5, repsMax: 8, restSeconds: 180 },
  { name: 'Goblet Squat', slug: 'goblet-squat', pattern: 'squat', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Leg Press', slug: 'leg-press', pattern: 'squat', sets: 3, repsMin: 10, repsMax: 15, restSeconds: 90 },
  {
    name: 'Bulgarian Split Squat',
    slug: 'bulgarian-split-squat',
    pattern: 'squat',
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    perHand: true,
  },
  {
    name: 'Lunge',
    slug: 'walking-lunge',
    pattern: 'squat',
    sets: 3,
    repsMin: 10,
    repsMax: 12,
    restSeconds: 60,
    perHand: true,
  },
  { name: 'Calf Raise', slug: 'calf-raise', pattern: 'raise', sets: 3, repsMin: 12, repsMax: 20, restSeconds: 60 },
  // hinge
  { name: 'Deadlift', slug: 'deadlift', pattern: 'hinge', sets: 3, repsMin: 3, repsMax: 6, restSeconds: 180 },
  {
    name: 'Romanian Deadlift',
    slug: 'romanian-deadlift',
    pattern: 'hinge',
    sets: 3,
    repsMin: 8,
    repsMax: 10,
    restSeconds: 120,
  },
  { name: 'Hip Thrust', slug: 'hip-thrust', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 120 },
  {
    name: 'Kettlebell Swing',
    slug: 'kettlebell-swing',
    pattern: 'hinge',
    sets: 3,
    repsMin: 15,
    repsMax: 20,
    restSeconds: 90,
  },
  { name: 'Back Extension', slug: 'back-extension', pattern: 'hinge', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
  // curl
  {
    name: 'Bicep Curl',
    slug: 'bicep-curl',
    pattern: 'curl',
    sets: 3,
    repsMin: 10,
    repsMax: 12,
    restSeconds: 60,
    perHand: true,
  },
  {
    name: 'Hammer Curl',
    slug: 'hammer-curl',
    pattern: 'curl',
    sets: 3,
    repsMin: 10,
    repsMax: 12,
    restSeconds: 60,
    perHand: true,
  },
  // raise
  {
    name: 'Lateral Raise',
    slug: 'lateral-raise',
    pattern: 'raise',
    sets: 3,
    repsMin: 12,
    repsMax: 15,
    restSeconds: 60,
    perHand: true,
  },
  {
    name: 'Front Raise',
    slug: 'front-raise',
    pattern: 'raise',
    sets: 3,
    repsMin: 12,
    repsMax: 15,
    restSeconds: 60,
    perHand: true,
  },
  // core
  { name: 'Plank', slug: 'plank', pattern: 'core', sets: 3, repsMin: 30, repsMax: 60, restSeconds: 60 },
  {
    name: 'Side Plank',
    slug: 'side-plank',
    pattern: 'core',
    sets: 2,
    repsMin: 30,
    repsMax: 45,
    restSeconds: 60,
    perHand: true,
  },
  {
    name: 'Hanging Leg Raise',
    slug: 'hanging-leg-raise',
    pattern: 'core',
    sets: 3,
    repsMin: 10,
    repsMax: 15,
    restSeconds: 60,
  },
  { name: 'Crunch', slug: 'crunch', pattern: 'core', sets: 3, repsMin: 12, repsMax: 20, restSeconds: 60 },
];

/** [sets, repsMin, repsMax, restSeconds] for a movement with no hand-tuned entry. */
const PATTERN_DEFAULTS: Record<MotionPattern, [number, number, number, number]> = {
  push: [3, 8, 12, 90],
  pull: [3, 8, 12, 90],
  squat: [3, 8, 12, 90],
  hinge: [3, 8, 10, 120],
  curl: [3, 10, 12, 60],
  raise: [3, 12, 15, 60],
  core: [3, 10, 15, 60],
};

const GENERIC: [number, number, number, number] = [3, 10, 12, 90];

/** Exercises that are in the library but not in the illustration catalog. */
const EXTRA: Array<[name: string, muscle: string, also: string[], equipment: string]> = [
  ['Dumbbell Floor Press', 'Chest', ['Triceps', 'Shoulders'], 'Dumbbell'],
];

/** Names programs and people use for an exercise the library spells differently. */
const ALIASES: Record<string, string> = {
  'biceps curl': 'Bicep Curl',
  'biceps curls': 'Bicep Curl',
  'push ups': 'Push-up',
  pushup: 'Push-up',
  pushups: 'Push-up',
  'shoulder press': 'Overhead Press',
  'overhead triceps extension': 'Overhead Tricep Extension',
  'triceps extension': 'Overhead Tricep Extension',
  'dumbbell row': 'Dumbbell Row',
  'one arm dumbbell row': 'Dumbbell Row',
};

const MUSCLE_GROUPS: Array<[MuscleGroup, string[]]> = [
  ['Chest', ['Chest']],
  ['Back', ['Back', 'Lats', 'Upper Back', 'Lower Back', 'Posterior Chain']],
  ['Shoulders', ['Shoulders', 'Rear Delts']],
  ['Arms', ['Biceps', 'Triceps', 'Forearms']],
  ['Core', ['Core']],
  ['Legs', ['Legs', 'Quads', 'Hamstrings', 'Calves', 'Adductors']],
  ['Glutes', ['Glutes', 'Hips']],
  ['Mobility', ['Mobility']],
];

/** Order the picker lists groups in. */
export const MUSCLE_GROUP_ORDER: MuscleGroup[] = MUSCLE_GROUPS.map(([group]) => group);

function groupOf(muscle: string): MuscleGroup {
  for (const [group, muscles] of MUSCLE_GROUPS) if (muscles.includes(muscle)) return group;
  return 'Mobility';
}

/** `Push-ups` and `Push-ups!` and `Plank (30 sec)` all fold to one key. */
function key(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Name fragments, most specific first, for exercises typed by hand or imported. */
const KEYWORDS: Array<[RegExp, MotionPattern]> = [
  [/curl|extension(?! es)/i, 'curl'],
  [/raise|raise[sd]?\b|calf|shrug|abduction|fly/i, 'raise'],
  [/squat|lunge|leg press|step.?up|split squat/i, 'squat'],
  [/deadlift|hinge|hip thrust|swing|good morning|back extension/i, 'hinge'],
  [/row|pull.?up|pulldown|chin.?up|face pull|pulley/i, 'pull'],
  [/plank|crunch|sit.?up|leg raise|hollow|ab wheel/i, 'core'],
  [/press|push.?up|dip|bench|chest|triceps|overhead/i, 'push'],
];

function patternOf(text: string): MotionPattern | null {
  for (const [re, pattern] of KEYWORDS) if (re.test(text)) return pattern;
  return null;
}

const bySlug = new Map(CATALOG.map((c) => [c.slug, c]));
const extraFacts = new Map(
  EXTRA.map(([name, muscle, also, equipment]) => [key(name), { name, muscle, also, equipment }]),
);

/** Muscles and equipment for a name, when we know it. */
function facts(name: string, slug?: string) {
  return bySlug.get(slug ?? '') ?? extraFacts.get(key(name)) ?? null;
}

function unilateral(name: string): boolean {
  return /\b(one|single)[ -](arm|leg)\b/i.test(name);
}

function build(): LibraryExercise[] {
  const curatedSlugs = new Set(CURATED.map((c) => c.slug).filter((s): s is string => Boolean(s)));
  const curatedKeys = new Set(CURATED.map((c) => key(c.name)));

  const list: LibraryExercise[] = CURATED.map((c) => {
    const f = facts(c.name, c.slug);
    return {
      ...c,
      muscle: f?.muscle ?? '',
      also: f?.also ?? [],
      group: groupOf(f?.muscle ?? ''),
      equipment: f?.equipment ?? '',
    };
  });

  for (const row of CATALOG) {
    if (curatedSlugs.has(row.slug) || curatedKeys.has(key(row.name))) continue;
    const pattern = patternOf(row.name);
    const [sets, repsMin, repsMax, restSeconds] = pattern ? PATTERN_DEFAULTS[pattern] : GENERIC;
    list.push({
      name: row.name,
      slug: row.slug,
      pattern,
      muscle: row.muscle,
      also: row.also,
      group: groupOf(row.muscle),
      equipment: row.equipment,
      sets,
      repsMin,
      repsMax,
      restSeconds,
      perHand: unilateral(row.name) || undefined,
    });
  }

  return list;
}

/** Every exercise the builder can offer, curated ones first. */
export const EXERCISE_LIBRARY: LibraryExercise[] = build();

const byKey = new Map(EXERCISE_LIBRARY.map((e) => [key(e.name), e]));
for (const [alias, name] of Object.entries(ALIASES)) {
  const target = byKey.get(key(name));
  if (target) byKey.set(alias, target);
}

/** The library entry for a name, if we know the exercise — aliases included. */
export function libraryExercise(name: string): LibraryExercise | undefined {
  return byKey.get(key(name));
}

/** Which movement an exercise name is, for the figure fallback. */
export function patternFor(name: string): MotionPattern | null {
  const known = libraryExercise(name);
  if (known) return known.pattern;
  return patternOf(name);
}

/** "Chest · Triceps · Shoulders" — what the exercise works, when we know. */
export function muscleSummary(name: string): string | null {
  const known = libraryExercise(name);
  if (!known || !known.muscle) return null;
  return [known.muscle, ...known.also.slice(0, 2)].join(' · ');
}
