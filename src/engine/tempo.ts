import { patternFor, type MotionPattern } from '../data/exercises';
import type { ProgramExercise } from './types';

/**
 * Seconds per rep: a time budget for auto mode, derived from how the movement is
 * performed. It is not a prescription — it only has to be close enough that a set's
 * clock ends near the last rep.
 *
 * Evidence: controlled reps live in roughly 2–8 s (GymAware, "Slow vs Fast reps");
 * tempo studies compare 2–3 s per phase (Sports Medicine review, PMC8310485); the
 * common default is a controlled ~2 s eccentric with an intent-driven concentric
 * (Brookbush Institute). Hypertrophy is similar across tempos at equal effort, so
 * these are budgets, not rules.
 */
const PATTERN_SECONDS: Record<MotionPattern, number> = {
  curl: 2.5, // short range, small joint
  raise: 2.5, // short lever
  push: 3,
  pull: 3,
  core: 3,
  squat: 4,
  hinge: 4.5,
};

const DEFAULT_SECONDS = 3;

/** `reps` already means seconds for these. */
const HOLD =
  /\b(side plank|plank|hollow( body)? hold|l-sit hold|pallof hold|superman hold|plate pinch hold|pinch hold|static hold|dead hang|active hang|bar hang|farmer'?s? carry|suitcase carry|wall sit)\b/;

/** Dynamic plank work is reps, not a hold. */
const DYNAMIC_PLANK = /\bplank (hip )?(jack|shoulder tap|walk|walkout|up|dip)\b/;

/** Ordered: first match wins, so the narrower "romanian deadlift" precedes "deadlift". */
const OVERRIDES: Array<[RegExp, number]> = [
  [/\b(romanian deadlift|rdl)\b/, 4.5],
  [/\bdeadlift\b/, 5], // floor reset between reps
  [/\b(kettlebell )?swing\b/, 2],
];

export function secondsPerRep(name: string): number {
  const text = name.toLowerCase();
  if (HOLD.test(text) && !DYNAMIC_PLANK.test(text)) return 1;
  for (const [re, seconds] of OVERRIDES) if (re.test(text)) return seconds;
  const pattern = patternFor(name);
  return pattern ? PATTERN_SECONDS[pattern] : DEFAULT_SECONDS;
}

/** Time budget for one set, in seconds. Never shorter than 5 s. */
export function setBudgetSeconds(exercise: Pick<ProgramExercise, 'name' | 'reps'>): number {
  return Math.max(5, Math.round(exercise.reps.max * secondsPerRep(exercise.name)));
}
