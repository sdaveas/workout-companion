import type { Program, WorkoutState } from '../engine/types';

/**
 * After a workout, the numbers the user actually used are better than the ones on paper.
 * This turns a finished session into a proposed program edit — nothing is written until
 * the summary screen asks.
 *
 * Kept deliberately narrow: the plan carries sets, reps, weight and rest. Anything richer
 * (photos, instructions) is copied straight from the current program, so an edit made
 * after the workout started is never clobbered by stale session data.
 */

export interface ProgramUpdate {
  name: string;
  /** Human-readable lines, one per exercise that would change. */
  lines: string[];
  /** The updated program JSON, ready for the importer. */
  json: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const KG_PER_LB = 0.45359237;

const repsLabel = (min: number, max: number) => (min === max ? `${min} reps` : `${min}–${max} reps`);
const weightLabel = (kg: number | null) => (kg == null ? 'bodyweight' : `${round2(kg)} kg`);
const restLabel = (s: number) => `${s}s rest`;

interface RawExercise {
  id: string;
  name?: string;
  reps?: { min: number; max: number };
  weight?: { value: number; unit: 'kg' | 'lb'; per_hand?: boolean };
  rest_seconds?: number;
  [key: string]: unknown;
}

export function planProgramUpdate(session: WorkoutState, program: Program): ProgramUpdate | null {
  const records = new Map(session.exerciseRecords.map((r) => [r.exerciseId, r]));
  const restUsed = session.restUsed ?? [];
  const lines: string[] = [];

  let doc: { exercises?: RawExercise[]; [key: string]: unknown };
  try {
    doc = JSON.parse(program.raw) as typeof doc;
  } catch {
    return null;
  }
  if (!Array.isArray(doc.exercises)) return null;

  const kept: RawExercise[] = [];
  doc.exercises.forEach((raw, i) => {
    const record = records.get(raw.id);
    if (!record) {
      kept.push(raw);
      return;
    }

    const completed = record.sets.filter((s) => s.completed);
    if (record.skipped) {
      // A skipped exercise is a decision about the program, not just about today.
      lines.push(`${record.name}: remove it (you skipped it)`);
      return;
    }
    if (completed.length === 0) {
      kept.push(raw);
      return;
    }

    const parts: string[] = [];

    const weights = completed.map((s) => s.actualWeightKg).filter((w): w is number => w != null);
    const sameWeight = weights.length === completed.length && new Set(weights).size === 1;
    const target = program.exercises.find((e) => e.id === raw.id)?.weightKg ?? null;
    if (sameWeight && round2(weights[0]) !== round2(target ?? -1)) {
      const kg = round2(weights[0]);
      const perHand = raw.weight?.per_hand === true;
      raw.weight = {
        // Keep the unit the program was written in.
        ...(raw.weight?.unit === 'lb'
          ? { value: round2(kg / KG_PER_LB), unit: 'lb' as const }
          : { value: kg, unit: 'kg' as const }),
        ...(perHand ? { per_hand: true } : {}),
      };
      parts.push(`${weightLabel(target)} → ${weightLabel(kg)}`);
    }

    const reps = completed.map((s) => s.actualReps ?? 0).filter((n) => n > 0);
    if (reps.length === completed.length) {
      const min = Math.min(...reps);
      const max = Math.max(...reps);
      const before = raw.reps;
      // Reps inside the prescribed range are the plan working; only a miss rewrites it.
      const missed = !before || min < before.min || max > before.max;
      if (missed) {
        raw.reps = { min, max };
        parts.push(
          `${before ? repsLabel(before.min, before.max) : 'reps'} → ${repsLabel(min, max)}`,
        );
      }
    }

    const chosen = restUsed[i];
    if (chosen != null && chosen !== raw.rest_seconds) {
      parts.push(`${restLabel(raw.rest_seconds ?? 0)} → ${restLabel(chosen)}`);
      raw.rest_seconds = chosen;
    }

    if (parts.length > 0) lines.push(`${record.name}: ${parts.join(', ')}`);
    kept.push(raw);
  });

  // Never propose a program with nothing left in it.
  if (kept.length === 0 || lines.length === 0) return null;
  doc.exercises = kept;

  return {
    name: program.name,
    lines,
    json: JSON.stringify(doc, null, 2),
  };
}
