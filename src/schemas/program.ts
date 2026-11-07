import { z } from 'zod';
import type { Program, ProgramExercise, Weekday } from '../engine/types';

export interface ProgramIssue {
  path: string;
  message: string;
}

export type ParseError =
  | { kind: 'invalid_json'; message: string }
  | { kind: 'unsupported_version'; received: unknown }
  | { kind: 'schema'; issues: ProgramIssue[] };

export type ParseResult = { ok: true; program: Program } | { ok: false; error: ParseError };

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const satisfies readonly Weekday[];

const httpUrl = z
  .string()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a valid http(s) URL.');

const repsSchema = z.strictObject({
  min: z.number().int().positive('Minimum reps must be greater than zero.'),
  max: z.number().int().positive('Maximum reps must be greater than zero.'),
});

const weightSchema = z.strictObject({
  value: z.number().nonnegative('Weight must be non-negative.'),
  unit: z.enum(['kg', 'lb']),
  per_hand: z.boolean().optional(),
});

const exerciseSchema = z
  .strictObject({
    id: z.string().min(1, 'Exercise id is required.'),
    name: z.string().min(1, 'Exercise name is required.'),
    sets: z.number().int().positive('Expected a positive integer.'),
    reps: repsSchema,
    weight: weightSchema.optional(),
    // A per-hand movement needs no weight of its own (bodyweight, bands, a single dumbbell).
    per_hand: z.boolean().optional(),
    rest_seconds: z
      .number()
      .int()
      .min(0, 'Rest must be between 0 and 600 seconds.')
      .max(600, 'Rest must be between 0 and 600 seconds.'),
    instructions: z.array(z.string()).optional(),
    common_mistakes: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    muscle_groups: z.array(z.string()).optional(),
    image_url: httpUrl.optional(),
  })
  .superRefine((e, ctx) => {
    if (e.reps.max < e.reps.min) {
      ctx.addIssue({
        code: 'custom',
        path: ['reps', 'max'],
        message: 'Maximum reps must be greater than or equal to minimum reps.',
      });
    }
  });

const programSchema = z.strictObject({
  schema_version: z.literal(1),
  id: z.string().min(1, 'Program id is required.'),
  name: z.string().min(1, 'Program name is required.'),
  description: z.string().optional(),
  schedule: z
    .strictObject({
      // One day was the only option in v1; new files carry the whole week.
      day: z.enum(WEEKDAYS).optional(),
      days: z.array(z.enum(WEEKDAYS)).max(7).optional(),
    })
    .optional(),
  estimated_duration_minutes: z.number().int().positive().optional(),
  exercises: z
    .array(exerciseSchema)
    .min(1, 'A program needs at least one exercise.')
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((ex, i) => {
        if (seen.has(ex.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'id'],
            message: `Duplicate exercise id "${ex.id}".`,
          });
        }
        seen.add(ex.id);
      });
    }),
});

export const SUPPORTED_SCHEMA_VERSION = 1;

/** `["exercises", 2, "sets"]` → `"exercises[2].sets"` */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (acc, seg) =>
      typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg),
    '',
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeExercise(e: z.infer<typeof exerciseSchema>): ProgramExercise {
  const weightKg = e.weight
    ? round2(e.weight.unit === 'lb' ? e.weight.value * 0.45359237 : e.weight.value)
    : null;
  return {
    id: e.id,
    name: e.name,
    sets: e.sets,
    reps: { min: e.reps.min, max: e.reps.max },
    weightKg,
    perHand: e.per_hand ?? e.weight?.per_hand ?? false,
    restSeconds: e.rest_seconds,
    instructions: e.instructions ?? [],
    commonMistakes: e.common_mistakes ?? [],
    equipment: e.equipment ?? [],
    muscleGroups: e.muscle_groups ?? [],
    imageUrl: e.image_url ?? null,
  };
}

export function parseProgram(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'invalid_json', message: (err as Error).message },
    };
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return {
      ok: false,
      error: { kind: 'invalid_json', message: 'Expected a JSON object at the top level.' },
    };
  }

  // Version gate before Zod: a literal can't echo the value the user sent.
  const version = (json as Record<string, unknown>).schema_version;
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    return { ok: false, error: { kind: 'unsupported_version', received: version } };
  }

  const parsed = programSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        issues: parsed.error.issues.map((i) => ({
          path: formatPath(i.path),
          message: i.message,
        })),
      },
    };
  }

  const d = parsed.data;
  return {
    ok: true,
    program: {
      id: d.id,
      name: d.name,
      description: d.description ?? null,
      scheduleDays: [
        ...new Set([
          ...(d.schedule?.days ?? []),
          ...(d.schedule?.day ? [d.schedule.day] : []),
        ]),
      ],
      estimatedDurationMinutes: d.estimated_duration_minutes ?? null,
      exercises: d.exercises.map(normalizeExercise),
      raw: text,
    },
  };
}

export function describeError(error: ParseError): ProgramIssue[] {
  switch (error.kind) {
    case 'invalid_json':
      return [{ path: '', message: `Not valid JSON: ${error.message}` }];
    case 'unsupported_version':
      return [
        {
          path: 'schema_version',
          message: `Unsupported schema version ${JSON.stringify(error.received)} — this build understands version ${SUPPORTED_SCHEMA_VERSION}.`,
        },
      ];
    case 'schema':
      return error.issues;
  }
}
