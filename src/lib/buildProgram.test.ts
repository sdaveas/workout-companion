import { describe, expect, it } from 'vitest';
import { emptyDraft, emptyExercise, buildProgramJson, draftFromProgram } from './buildProgram';
import { parseProgram } from '../schemas/program';

describe('buildProgramJson', () => {
  it('starts a new program with nothing in it', () => {
    const draft = emptyDraft();
    expect(draft.exercises).toEqual([]);
    // and an empty program is refused rather than saved
    expect(parseProgram(buildProgramJson({ ...draft, name: 'Empty' })).ok).toBe(false);
  });

  it('produces JSON the importer accepts', () => {
    const draft = emptyDraft();
    draft.name = 'Workout C';
    draft.days = ['tuesday', 'thursday'];
    draft.exercises = [
      { ...emptyExercise(), name: 'Goblet Squat', sets: 4, repsMin: 6, repsMax: 10, weightKg: '20', perHand: true, restSeconds: 120 },
      { ...emptyExercise(), name: 'Push-ups' },
    ];

    const result = parseProgram(buildProgramJson(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.program.id).toBe('workout-c');
    expect(result.program.scheduleDays).toEqual(['tuesday', 'thursday']);
    expect(result.program.exercises).toHaveLength(2);
    expect(result.program.exercises[0]).toMatchObject({
      sets: 4,
      reps: { min: 6, max: 10 },
      weightKg: 20,
      perHand: true,
      restSeconds: 120,
    });
    expect(result.program.exercises[1].weightKg).toBeNull();
  });

  it('accepts "bodyweight" and "20kg" in the weight field', () => {
    const draft = emptyDraft();
    draft.exercises = [
      { ...emptyExercise(), name: 'Push-ups', weightKg: 'bodyweight' },
      { ...emptyExercise(), name: 'Row', weightKg: '20kg' },
      { ...emptyExercise(), name: 'Bench', weightKg: 'BW' },
      { ...emptyExercise(), name: 'Curl', weightKg: '5,6' },
    ];

    const result = parseProgram(buildProgramJson(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program.exercises[0].weightKg).toBeNull();
    expect(result.program.exercises[1].weightKg).toBe(20);
    expect(result.program.exercises[2].weightKg).toBeNull();
    expect(result.program.exercises[3].weightKg).toBe(5.6);
  });

  it('round-trips an existing program through the builder, keeping its id', () => {
    const draft = emptyDraft();
    draft.name = 'Old name';
    draft.days = ['friday'];
    draft.exercises = [{ ...emptyExercise(), name: 'Row', sets: 4, repsMin: 8, repsMax: 10, weightKg: '5,6' }];
    const original = parseProgram(buildProgramJson(draft));
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const edited = draftFromProgram(original.program);
    edited.name = 'New name';
    const result = parseProgram(buildProgramJson(edited, original.program.id));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.program.id).toBe(original.program.id);
    expect(result.program.name).toBe('New name');
    expect(result.program.exercises[0]).toMatchObject({ sets: 4, reps: { min: 8, max: 10 }, weightKg: 5.6 });
  });

  it('drops blank exercise rows instead of failing the import', () => {    const draft = emptyDraft();
    draft.name = 'Solo';
    draft.exercises = [{ ...emptyExercise() }, { ...emptyExercise(), name: 'Plank' }];

    const result = parseProgram(buildProgramJson(draft));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.program.exercises.map((e) => e.name)).toEqual(['Plank']);
  });

  it('keeps the fields the form does not edit when updating a saved program', () => {
    const original = parseProgram(
      JSON.stringify({
        schema_version: 1,
        id: 'base',
        name: 'Base',
        description: 'Day 1 of 3',
        estimated_duration_minutes: 45,
        exercises: [
          {
            id: 'squat',
            name: 'Squat',
            sets: 3,
            reps: { min: 5, max: 5 },
            rest_seconds: 90,
            instructions: ['Brace hard.'],
          },
        ],
      }),
    );
    if (!original.ok) throw new Error('fixture must parse');

    const draft = { ...draftFromProgram(original.program), name: 'Base, renamed' };
    const result = parseProgram(buildProgramJson(draft, original.program.id, original.program));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program.id).toBe('base');
    expect(result.program.name).toBe('Base, renamed');
    expect(result.program.description).toBe('Day 1 of 3');
    expect(result.program.estimatedDurationMinutes).toBe(45);
    expect(result.program.exercises[0].instructions).toEqual(['Brace hard.']);
  });

  it('falls back to a stable id for names with no usable characters', () => {
    const draft = emptyDraft();
    draft.name = '!!!';
    draft.exercises = [{ ...emptyExercise(), name: 'Squat' }];
    expect(JSON.parse(buildProgramJson(draft)).id).toBe('program');
  });
});
