import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { db } from './db';
import { listPrograms, saveProgram } from './programs';
import { mergeBackup } from './backup';

const program = (over: Partial<Program> = {}): Program => ({
  id: 'workout-a',
  name: 'Workout A',
  description: null,
  scheduleDays: ['monday'],
  estimatedDurationMinutes: 40,
  exercises: [],
  raw: '{}',
  ...over,
});

describe('mergeBackup', () => {
  beforeEach(async () => {
    await db.programs.clear();
    await db.sessions.clear();
  });

  it('adds programs that are not on the device', async () => {
    const counts = await mergeBackup([program()], []);
    expect(counts).toEqual({ programs: 1, sessions: 0 });
    expect((await listPrograms()).map((p) => p.id)).toEqual(['workout-a']);
  });

  it('updates a program with the same id instead of duplicating it', async () => {
    await saveProgram(program());
    await mergeBackup([program({ name: 'Renamed' })], []);
    const rows = await listPrograms();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Renamed');
  });

  it('never deletes what is already stored', async () => {
    await saveProgram(program({ id: 'kept', name: 'Kept' }));
    await mergeBackup([program({ id: 'new', name: 'New' })], []);
    expect((await listPrograms()).map((p) => p.id).sort()).toEqual(['kept', 'new']);
  });

  it('stores session rows alongside their programs', async () => {
    const counts = await mergeBackup(
      [],
      [
        {
          id: 's1',
          stateVersion: 1,
          programId: 'workout-a',
          programName: 'Workout A',
          status: 'completed',
          startedAt: 1,
          finishedAt: 2,
          state: { sessionId: 's1' } as never,
        },
      ],
    );
    expect(counts.sessions).toBe(1);
    expect(await db.sessions.count()).toBe(1);
  });
});
