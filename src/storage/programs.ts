import { db } from './db';
import type { Program } from '../engine/types';

export class DuplicateProgramId extends Error {
  constructor(public readonly id: string) {
    super(`A program with id "${id}" already exists.`);
  }
}

export async function saveProgram(program: Program, opts: { replace?: boolean } = {}) {
  await db.transaction('rw', db.programs, async () => {
    const existing = await db.programs.get(program.id);
    if (existing && !opts.replace) throw new DuplicateProgramId(program.id);
    await db.programs.put(program);
  });
}

export function listPrograms(): Promise<Program[]> {
  return db.programs.toArray();
}

export function getProgram(id: string): Promise<Program | undefined> {
  return db.programs.get(id);
}

export function deleteProgram(id: string): Promise<void> {
  return db.programs.delete(id);
}
