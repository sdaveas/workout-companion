import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { seedIfEmpty } from './seed';

beforeEach(async () => {
  await db.programs.clear();
  await db.settings.clear();
});

describe('seedIfEmpty', () => {
  it('bundles the two starter programs on a fresh profile', async () => {
    await seedIfEmpty();
    const ids = (await db.programs.toArray()).map((p) => p.id).sort();
    expect(ids).toEqual(['workout-a', 'workout-b']);
  });

  it('never resurrects a program the user deleted', async () => {
    await seedIfEmpty();
    await db.programs.delete('workout-a');
    await seedIfEmpty();
    expect((await db.programs.toArray()).map((p) => p.id)).toEqual(['workout-b']);
  });

  it('keeps the user programs when data already exists', async () => {
    await db.programs.put({
      id: 'mine',
      name: 'Mine',
      description: null,
      scheduleDay: null,
      estimatedDurationMinutes: null,
      raw: '{}',
      exercises: [],
    });
    await seedIfEmpty();
    expect((await db.programs.toArray()).map((p) => p.id)).toEqual(['mine']);
  });
});
