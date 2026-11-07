import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import { MAX_ROWS, cardRows, dose } from './shareCard';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

describe('share card rows', () => {
  it('prints the program’s own sets and reps, not a sample', () => {
    const first = program.exercises[0];
    const rows = cardRows(program);
    expect(rows[0].name).toBe(first.name);
    expect(rows[0].dose).toBe(
      `${first.sets} × ${first.reps.min}${first.reps.min === first.reps.max ? '' : `–${first.reps.max}`}`,
    );
  });

  it('collapses a long program to the row limit', () => {
    const long: Program = {
      ...program,
      exercises: Array.from({ length: MAX_ROWS + 4 }, (_, i) => ({ ...program.exercises[0], id: `e${i}` })),
    };
    expect(cardRows(long)).toHaveLength(MAX_ROWS);
  });

  it('keeps a fixed rep count as one number and marks per-hand work', () => {
    const one = { ...program.exercises[0], sets: 3, reps: { min: 12, max: 12 }, perHand: false };
    expect(dose(one)).toBe('3 × 12');
    expect(dose({ ...one, perHand: true })).toBe('3 × 12 / hand');
  });
});
