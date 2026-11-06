import type { Program, Weekday } from '../engine/types';

export interface DraftExercise {
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  weightKg: string;
  perHand: boolean;
  restSeconds: number;
}

export interface ProgramDraft {
  name: string;
  day: Weekday | '';
  exercises: DraftExercise[];
}

export const emptyExercise = (): DraftExercise => ({
  name: '',
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  weightKg: '',
  perHand: false,
  restSeconds: 90,
});

export const emptyDraft = (): ProgramDraft => ({
  name: 'My workout',
  day: '',
  exercises: [emptyExercise()],
});

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'program';

/**
 * The weight field is free text so "bodyweight" can be typed as written on a program.
 * Returns null for bodyweight/empty, a number for "20" and "20kg", and the raw text for
 * anything else — the importer then says "expected number, received string" instead of the
 * meaningless "received null" that NaN turns into when JSON-encoded.
 */
function parseWeight(raw: string): number | string | null {
  // A Greek/European keyboard types "5,6"; the importer only speaks JSON numbers.
  const text = raw.trim().toLowerCase().replace(/kg$/, '').replace(',', '.').trim();
  if (!text || ['bw', 'bodyweight', 'body weight', 'body-weight'].includes(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : raw.trim();
}

/**
 * Draft → the exact JSON the importer accepts. The builder never bypasses the schema,
 * so a program that cannot be created by hand also cannot be created here.
 */
/** An existing program → the builder's form, so Edit can reuse the same screen. */
export function draftFromProgram(program: Program): ProgramDraft {
  return {
    name: program.name,
    day: program.scheduleDay ?? '',
    exercises: program.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      repsMin: e.reps.min,
      repsMax: e.reps.max,
      weightKg: e.weightKg == null ? '' : String(e.weightKg),
      perHand: e.perHand,
      restSeconds: e.restSeconds,
    })),
  };
}

export function buildProgramJson(draft: ProgramDraft, id?: string): string {
  const program = {
    schema_version: 1,
    // Keep the existing id when updating, even if the name changed.
    id: id ?? slug(draft.name),
    name: draft.name.trim(),
    ...(draft.day ? { schedule: { day: draft.day } } : {}),
    exercises: draft.exercises
      .filter((e) => e.name.trim())
      .map((e, i) => {
        const kg = parseWeight(e.weightKg);
        return {
          id: slug(e.name) || `exercise-${i + 1}`,
          name: e.name.trim(),
          sets: e.sets,
          reps: { min: e.repsMin, max: e.repsMax },
          ...(kg != null
            ? {
                weight: {
                  value: kg,
                  unit: 'kg',
                  ...(e.perHand ? { per_hand: true } : {}),
                },
              }
            : {}),
          rest_seconds: e.restSeconds,
        };
      }),
  };

  return JSON.stringify(program, null, 2);
}
