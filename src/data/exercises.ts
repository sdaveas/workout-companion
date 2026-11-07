/**
 * The built-in exercise library: names the builder can offer, each with the movement
 * pattern that drives its animation. Nothing is fetched — the app works offline.
 */

export type MotionPattern = 'push' | 'pull' | 'squat' | 'hinge' | 'curl' | 'raise' | 'core';

export interface LibraryExercise {
  name: string;
  pattern: MotionPattern;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  perHand?: boolean;
}

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // push
  { name: 'Bench Press', pattern: 'push', sets: 3, repsMin: 6, repsMax: 10, restSeconds: 150 },
  { name: 'Dumbbell Floor Press', pattern: 'push', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 },
  { name: 'Overhead Press', pattern: 'push', sets: 3, repsMin: 6, repsMax: 10, restSeconds: 120 },
  { name: 'Push-up', pattern: 'push', sets: 3, repsMin: 10, repsMax: 20, restSeconds: 60 },
  { name: 'Incline Press', pattern: 'push', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 120 },
  { name: 'Triceps Pushdown', pattern: 'push', sets: 3, repsMin: 10, repsMax: 15, restSeconds: 60 },
  // pull
  { name: 'Dumbbell Row', pattern: 'pull', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, perHand: true },
  { name: 'Lat Pulldown', pattern: 'pull', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Pull-up', pattern: 'pull', sets: 3, repsMin: 5, repsMax: 10, restSeconds: 120 },
  { name: 'Seated Cable Row', pattern: 'pull', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Face Pull', pattern: 'pull', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
  // squat
  { name: 'Back Squat', pattern: 'squat', sets: 3, repsMin: 5, repsMax: 8, restSeconds: 180 },
  { name: 'Goblet Squat', pattern: 'squat', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
  { name: 'Leg Press', pattern: 'squat', sets: 3, repsMin: 10, repsMax: 15, restSeconds: 90 },
  {
    name: 'Bulgarian Split Squat',
    pattern: 'squat',
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    perHand: true,
  },
  { name: 'Lunge', pattern: 'squat', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 60, perHand: true },
  { name: 'Calf Raise', pattern: 'raise', sets: 3, repsMin: 12, repsMax: 20, restSeconds: 60 },
  // hinge
  { name: 'Deadlift', pattern: 'hinge', sets: 3, repsMin: 3, repsMax: 6, restSeconds: 180 },
  { name: 'Romanian Deadlift', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 10, restSeconds: 120 },
  { name: 'Hip Thrust', pattern: 'hinge', sets: 3, repsMin: 8, repsMax: 12, restSeconds: 120 },
  { name: 'Kettlebell Swing', pattern: 'hinge', sets: 3, repsMin: 15, repsMax: 20, restSeconds: 90 },
  { name: 'Back Extension', pattern: 'hinge', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60 },
  // curl
  { name: 'Bicep Curl', pattern: 'curl', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 60, perHand: true },
  { name: 'Hammer Curl', pattern: 'curl', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 60, perHand: true },
  // raise
  { name: 'Lateral Raise', pattern: 'raise', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60, perHand: true },
  { name: 'Front Raise', pattern: 'raise', sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60, perHand: true },
  // core
  { name: 'Plank', pattern: 'core', sets: 3, repsMin: 30, repsMax: 60, restSeconds: 60 },
  { name: 'Side Plank', pattern: 'core', sets: 2, repsMin: 30, repsMax: 45, restSeconds: 60, perHand: true },
  { name: 'Hanging Leg Raise', pattern: 'core', sets: 3, repsMin: 10, repsMax: 15, restSeconds: 60 },
  { name: 'Crunch', pattern: 'core', sets: 3, repsMin: 12, repsMax: 20, restSeconds: 60 },
];

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

const normalise = (name: string) => name.trim().toLowerCase();

/** The library entry for a name, if the name is one of ours. */
export function libraryExercise(name: string): LibraryExercise | undefined {
  return EXERCISE_LIBRARY.find((e) => normalise(e.name) === normalise(name));
}

/** Which animation an exercise name gets; `null` when nothing sensible is known. */
export function patternFor(name: string): MotionPattern | null {
  const known = libraryExercise(name);
  if (known) return known.pattern;
  const text = normalise(name);
  for (const [re, pattern] of KEYWORDS) if (re.test(text)) return pattern;
  return null;
}
