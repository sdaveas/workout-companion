import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import {
  conflictingProgram,
  renameProgram,
  sameName,
  suggestedName,
  uniqueId,
} from './identity';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

const other: Program = { ...program, id: 'other-id', name: 'Leg day', raw: program.raw };

describe('program identity', () => {
  it('treats names as equal when only case or spaces differ', () => {
    expect(sameName('Workout B', '  workout b ')).toBe(true);
    expect(sameName('Workout B', 'Workout A')).toBe(false);
  });

  it('finds a clash by name even when the id differs', () => {
    const clash = conflictingProgram({ ...program, id: 'fresh-id' }, [other, program]);
    expect(clash?.id).toBe(program.id);
  });

  it('finds a clash by id when a new program would reuse one', () => {
    expect(conflictingProgram({ ...program, name: 'New name' }, [program])?.id).toBe(program.id);
  });

  it('ignores the program being edited', () => {
    expect(conflictingProgram(program, [program], program.id)).toBeNull();
  });

  it('suggests a name that is not taken', () => {
    expect(suggestedName(program, [])).toBe('Workout B');
    expect(suggestedName(program, [program])).toBe('Workout B (2)');
    expect(suggestedName(program, [program, { ...other, name: 'Workout B (2)' }])).toBe('Workout B (3)');
  });

  it('derives a free id from the name', () => {
    expect(uniqueId('Leg day', [])).toBe('leg-day');
    expect(uniqueId('Leg day', ['leg-day'])).toBe('leg-day-2');
  });

  it('stores a clashing create beside the others, never over them', () => {
    const result = renameProgram({ ...program, id: 'fresh-id' }, 'Workout B (2)', [program]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program.id).toBe('workout-b-2');
    expect(result.program.name).toBe('Workout B (2)');
    const stored = JSON.parse(result.program.raw) as { id: string; name: string };
    expect(stored).toEqual(expect.objectContaining({ id: 'workout-b-2', name: 'Workout B (2)' }));
  });

  it('keeps the id when renaming an existing program in place', () => {
    const result = renameProgram(program, 'Leg day 2', [program], { keepId: true });
    expect(result.ok && result.program.id).toBe(program.id);
  });

  it('refuses a name that is still taken', () => {
    const result = renameProgram(program, 'Leg day', [other, program]);
    expect(result.ok).toBe(false);
  });

  it('refuses an empty name', () => {
    expect(renameProgram(program, '   ', []).ok).toBe(false);
  });
});
