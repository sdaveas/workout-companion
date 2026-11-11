import { parseProgram } from '../schemas/program';
import type { Program } from '../engine/types';

/**
 * The program as it was when the brief was copied. A diff compares the coach's reply
 * against this, not against the row on disk: anything the user changed in between was
 * not the coach's doing and must not be shown as one.
 */

const KEY = 'coach:brief';

export function stashProgram(store: Storage, program: Program): void {
  try {
    store.setItem(KEY, JSON.stringify({ id: program.id, raw: program.raw }));
  } catch {
    // No storage: the diff falls back to the saved program.
  }
}

export function stashedProgram(store: Storage, id: string): Program | null {
  try {
    const value = JSON.parse(store.getItem(KEY) ?? 'null') as { id?: string; raw?: string } | null;
    if (!value || value.id !== id || typeof value.raw !== 'string') return null;
    const parsed = parseProgram(value.raw);
    return parsed.ok ? parsed.program : null;
  } catch {
    return null;
  }
}
