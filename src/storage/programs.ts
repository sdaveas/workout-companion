import { db } from './db';
import type { Program, Weekday } from '../engine/types';

export class DuplicateProgramId extends Error {
  constructor(public readonly id: string) {
    super(`A program with id "${id}" already exists.`);
  }
}

/** Programs saved before a workout could hold more than one day carry a single `scheduleDay`. */
type StoredProgram = Program & { scheduleDay?: Weekday | null; scheduleDays?: Weekday[] };

function withDays(row: StoredProgram): Program {
  if (Array.isArray(row.scheduleDays)) return row;
  const { scheduleDay, ...rest } = row;
  return { ...rest, scheduleDays: scheduleDay ? [scheduleDay] : [] };
}

export async function saveProgram(program: Program, opts: { replace?: boolean } = {}) {
  await db.transaction('rw', db.programs, async () => {
    const existing = await db.programs.get(program.id);
    if (existing && !opts.replace) throw new DuplicateProgramId(program.id);
    await db.programs.put(program);
  });
}

export async function listPrograms(): Promise<Program[]> {
  const rows = (await db.programs.toArray()) as StoredProgram[];
  return rows.map(withDays);
}

export async function getProgram(id: string): Promise<Program | undefined> {
  const row = (await db.programs.get(id)) as StoredProgram | undefined;
  return row && withDays(row);
}

export async function deleteProgram(id: string): Promise<void> {
  await db.programs.delete(id);
}
