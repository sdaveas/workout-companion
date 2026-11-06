import type { Program } from '../engine/types';
import type { SessionRow } from './db';
import { db } from './db';

/**
 * Merge by id: new ids are added, existing ids are updated, nothing is deleted.
 * One transaction so a failure cannot leave programs without their sessions.
 */
export async function mergeBackup(
  programs: Program[],
  sessions: SessionRow[],
): Promise<{ programs: number; sessions: number }> {
  await db.transaction('rw', db.programs, db.sessions, async () => {
    if (programs.length > 0) await db.programs.bulkPut(programs);
    if (sessions.length > 0) await db.sessions.bulkPut(sessions);
  });
  return { programs: programs.length, sessions: sessions.length };
}
