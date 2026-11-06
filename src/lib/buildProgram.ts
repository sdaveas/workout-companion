import type { Weekday } from '../engine/types';

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
  name: '',
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
 * Draft → the exact JSON the importer accepts. The builder never bypasses the schema,
 * so a program that cannot be created by hand also cannot be created here.
 */
export function buildProgramJson(draft: ProgramDraft): string {
  const program = {
    schema_version: 1,
    id: slug(draft.name),
    name: draft.name.trim(),
    ...(draft.day ? { schedule: { day: draft.day } } : {}),
    exercises: draft.exercises
      .filter((e) => e.name.trim())
      .map((e, i) => ({
        id: slug(e.name) || `exercise-${i + 1}`,
        name: e.name.trim(),
        sets: e.sets,
        reps: { min: e.repsMin, max: e.repsMax },
        ...(e.weightKg.trim()
          ? {
              weight: {
                value: Number(e.weightKg),
                unit: 'kg',
                ...(e.perHand ? { per_hand: true } : {}),
              },
            }
          : {}),
        rest_seconds: e.restSeconds,
      })),
  };

  return JSON.stringify(program, null, 2);
}
