import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { db } from './db';
import { deleteProgram, DuplicateProgramId, listPrograms, saveProgram } from './programs';

const program = (over: Partial<Program> = {}): Program => ({
  id: 'workout-b',
  name: 'Workout B',
  description: null,
  scheduleDay: 'saturday',
  estimatedDurationMinutes: 40,
  exercises: [],
  raw: '{}',
  ...over,
});

describe('programs storage', () => {
  beforeEach(async () => {
    await db.programs.clear();
  });

  it('saves and lists programs', async () => {
    await saveProgram(program());
    expect((await listPrograms()).map((p) => p.id)).toEqual(['workout-b']);
  });

  it('refuses a duplicate id unless replacing', async () => {
    await saveProgram(program());
    await expect(saveProgram(program())).rejects.toBeInstanceOf(DuplicateProgramId);
    await saveProgram(program({ name: 'Renamed' }), { replace: true });
    expect((await listPrograms())[0].name).toBe('Renamed');
  });

  it('deletes a program', async () => {
    await saveProgram(program());
    await deleteProgram('workout-b');
    expect(await listPrograms()).toEqual([]);
  });
});
