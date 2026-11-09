import type { Program, Weekday } from '../engine/types';

/**
 * The days live in the program's own JSON, so a backup or a re-export carries them.
 * `raw` is what a backup writes, so patching only the object would lose the schedule.
 */
export function withDays(program: Program, days: Weekday[]): Program {
  const raw = JSON.parse(program.raw) as Record<string, unknown>;
  if (days.length > 0) raw.schedule = { days };
  else delete raw.schedule;
  return { ...program, scheduleDays: days, raw: JSON.stringify(raw) };
}
