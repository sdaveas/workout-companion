import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { diffPrograms } from './diffProgram';

function program(over: Partial<Program> = {}): Program {
  return {
    id: 'upper-a',
    name: 'Upper A',
    description: null,
    scheduleDays: [],
    estimatedDurationMinutes: null,
    raw: '{}',
    exercises: [
      {
        id: 'bench',
        name: 'Bench Press',
        sets: 3,
        reps: { min: 6, max: 10 },
        weightKg: 60,
        perHand: false,
        restSeconds: 120,
        instructions: [],
        commonMistakes: [],
        equipment: [],
        muscleGroups: [],
        imageUrl: null,
      },
      {
        id: 'face-pull',
        name: 'Face Pull',
        sets: 3,
        reps: { min: 12, max: 15 },
        weightKg: null,
        perHand: false,
        restSeconds: 60,
        instructions: [],
        commonMistakes: [],
        equipment: [],
        muscleGroups: [],
        imageUrl: null,
      },
    ],
    ...over,
  };
}

const withBench = (over: Partial<Program['exercises'][number]>) =>
  program({
    exercises: [{ ...program().exercises[0], ...over }, program().exercises[1]],
  });

describe('diffPrograms', () => {
  it('says nothing when nothing changed', () => {
    expect(diffPrograms(program(), program())).toEqual([]);
  });

  it('names the exercise and both numbers when sets or reps move', () => {
    expect(diffPrograms(program(), withBench({ sets: 4 }))).toEqual(['Bench Press: 3 sets → 4 sets']);
    expect(diffPrograms(program(), withBench({ reps: { min: 5, max: 8 } }))).toEqual([
      'Bench Press: 6–10 reps → 5–8 reps',
    ]);
  });

  it('shows weight either side, and bodyweight as a word', () => {
    expect(diffPrograms(program(), withBench({ weightKg: 62.5 }))).toEqual([
      'Bench Press: 60 kg → 62.5 kg',
    ]);
    const bodyweight = program({
      exercises: [{ ...program().exercises[0], weightKg: null }, program().exercises[1]],
    });
    expect(diffPrograms(bodyweight, program())).toEqual(['Bench Press: bodyweight → 60 kg']);
  });

  it('shows rest and the per-hand switch', () => {
    expect(diffPrograms(program(), withBench({ restSeconds: 90 }))).toEqual([
      'Bench Press: 120s rest → 90s rest',
    ]);
    expect(diffPrograms(program(), withBench({ perHand: true }))).toEqual([
      'Bench Press: 60 kg → 60 kg per hand',
    ]);
  });

  it('adds, removes and renames', () => {
    const shorter = program({ exercises: [program().exercises[0]] });
    expect(diffPrograms(program(), shorter)).toEqual(['Face Pull: removed']);

    const longer = program({
      exercises: [...program().exercises, { ...program().exercises[0], id: 'row', name: 'Row' }],
    });
    expect(diffPrograms(program(), longer)).toEqual(['Row: added']);

    expect(diffPrograms(program(), { ...program(), name: 'Upper Body A' })).toEqual([
      'Name: "Upper A" → "Upper Body A"',
    ]);
  });

  it('reports a reorder once, not per exercise', () => {
    const swapped = program({ exercises: [...program().exercises].reverse() });
    expect(diffPrograms(program(), swapped)).toEqual(['Order of the exercises changed']);
  });
});
