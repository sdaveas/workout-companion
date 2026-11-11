import type { Program } from '../engine/types';

/**
 * What a coach's reply would change, in words a lifter reads on a phone. One line per
 * exercise that moves, and one for the name. Order changes collapse into a single line:
 * naming every index would be a wall of numbers nobody reads.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

const repsLabel = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);
const weightLabel = (kg: number | null, perHand: boolean) => {
  if (kg == null) return 'bodyweight';
  return `${round2(kg)} kg${perHand ? ' per hand' : ''}`;
};
const restLabel = (seconds: number) => (seconds === 0 ? 'no rest' : `${seconds}s rest`);

export function diffPrograms(before: Program, after: Program): string[] {
  const lines: string[] = [];
  if (before.name !== after.name) lines.push(`Name: "${before.name}" → "${after.name}"`);

  const old = new Map(before.exercises.map((e) => [e.id, e]));

  for (const exercise of after.exercises) {
    const was = old.get(exercise.id);
    if (!was) {
      lines.push(`${exercise.name}: added`);
      continue;
    }
    old.delete(exercise.id);

    const parts: string[] = [];
    if (was.sets !== exercise.sets) parts.push(`${was.sets} sets → ${exercise.sets} sets`);
    if (was.reps.min !== exercise.reps.min || was.reps.max !== exercise.reps.max) {
      parts.push(`${repsLabel(was.reps.min, was.reps.max)} reps → ${repsLabel(exercise.reps.min, exercise.reps.max)} reps`);
    }
    const beforeWeight = weightLabel(was.weightKg, was.perHand);
    const afterWeight = weightLabel(exercise.weightKg, exercise.perHand);
    if (beforeWeight !== afterWeight) parts.push(`${beforeWeight} → ${afterWeight}`);
    if (was.restSeconds !== exercise.restSeconds) {
      parts.push(`${restLabel(was.restSeconds)} → ${restLabel(exercise.restSeconds)}`);
    }
    if (parts.length > 0) lines.push(`${exercise.name}: ${parts.join(', ')}`);
  }

  for (const gone of old.values()) lines.push(`${gone.name}: removed`);

  const afterIds = after.exercises.map((e) => e.id);
  const beforeIds = before.exercises.map((e) => e.id);
  const sharedAfter = afterIds.filter((id) => beforeIds.includes(id));
  const sharedBefore = beforeIds.filter((id) => afterIds.includes(id));
  if (sharedAfter.join() !== sharedBefore.join()) lines.push('Order of the exercises changed');

  return lines;
}
