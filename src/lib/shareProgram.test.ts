import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import { MAX_ROWS, dose, shareMessage } from './shareProgram';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

describe('share message', () => {
  it('prints the program’s own sets and reps, not a sample', () => {
    const first = program.exercises[0];
    const text = shareMessage(program, 'https://example.com/x');
    expect(text.startsWith(`${program.name} — ${program.exercises.length} exercises`)).toBe(true);
    expect(text).toContain(`· ${first.name} ${first.sets}×${first.reps.min}–${first.reps.max}`);
  });

  it('ends with the link on its own line', () => {
    const lines = shareMessage(program, 'https://example.com/x').split('\n');
    expect(lines.at(-1)).toBe('https://example.com/x');
    expect(lines.at(-2)).toBe('');
  });

  it('keeps a fixed rep count as one number', () => {
    expect(dose({ ...program.exercises[0], sets: 3, reps: { min: 12, max: 12 } })).toBe('3×12');
  });

  it('collapses a long program and counts the rest', () => {
    const long: Program = {
      ...program,
      exercises: Array.from({ length: MAX_ROWS + 4 }, (_, i) => ({ ...program.exercises[0], id: `e${i}` })),
    };
    const lines = shareMessage(long, 'u').split('\n');
    expect(lines).toContain('· and 4 more');
    expect(lines).toHaveLength(1 + MAX_ROWS + 1 + 2);
  });
});
