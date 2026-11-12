import type { ProgramExercise } from './types';

export function draftFor(e: ProgramExercise): { reps: number; weightKg: number | null } {
  return { reps: e.reps.min, weightKg: e.weightKg };
}

let counter = 0;

/** crypto.randomUUID with a fallback for iOS < 15.4. */
export function newSessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  counter += 1;
  return `s${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The one wall clock. Everything that stamps a time imports this, so
 * `grep Date.now src` stays a short list and a test can see where time enters.
 */
export function now(): number {
  return Date.now();
}
