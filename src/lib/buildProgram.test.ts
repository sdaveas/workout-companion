import { describe, expect, it } from 'vitest';
import { emptyDraft, emptyExercise, buildProgramJson } from './buildProgram';
import { parseProgram } from '../schemas/program';

describe('buildProgramJson', () => {
  it('produces JSON the importer accepts', () => {
    const draft = emptyDraft();
    draft.name = 'Workout C';
    draft.day = 'tuesday';
    draft.exercises = [
      { ...emptyExercise(), name: 'Goblet Squat', sets: 4, repsMin: 6, repsMax: 10, weightKg: '20', perHand: true, restSeconds: 120 },
      { ...emptyExercise(), name: 'Push-ups' },
    ];

    const result = parseProgram(buildProgramJson(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.program.id).toBe('workout-c');
    expect(result.program.scheduleDay).toBe('tuesday');
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

  it('drops blank exercise rows instead of failing the import', () => {
    const draft = emptyDraft();
    draft.name = 'Solo';
    draft.exercises = [{ ...emptyExercise() }, { ...emptyExercise(), name: 'Plank' }];

    const result = parseProgram(buildProgramJson(draft));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.program.exercises.map((e) => e.name)).toEqual(['Plank']);
  });

  it('falls back to a stable id for names with no usable characters', () => {
    const draft = emptyDraft();
    draft.name = '!!!';
    draft.exercises = [{ ...emptyExercise(), name: 'Squat' }];
    expect(JSON.parse(buildProgramJson(draft)).id).toBe('program');
  });
});
