import workoutA from '../fixtures/workout-a.json';
import workoutB from '../fixtures/workout-b.json';
import { parseProgram } from '../schemas/program';
import { db } from './db';

const SEEDED = 'seeded';

/**
 * A fresh install (new phone, cleared Safari data) starts with the bundled programs so the
 * app is never an empty shell. Runs once per browser profile: the flag is set even when the
 * list is empty, so deleting a program stays deleted. Seeding goes through `parseProgram`,
 * the same importer as a paste.
 */
export async function seedIfEmpty(): Promise<void> {
  if (await db.settings.get(SEEDED)) return;
  const existing = await db.programs.count();
  if (existing === 0) {
    for (const source of [workoutA, workoutB]) {
      const parsed = parseProgram(JSON.stringify(source));
      if (parsed.ok) await db.programs.put(parsed.program);
    }
  }
  await db.settings.put({ key: SEEDED, value: '1' });
}
