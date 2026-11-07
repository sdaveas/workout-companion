import type { Program, Weekday } from './types';

export const WEEK_ORDER: readonly Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface CompletedSession {
  programId: string;
  finishedAt: number | null;
}

export type NextUp =
  | { kind: 'resume' }
  | { kind: 'today'; program: Program }
  | { kind: 'upcoming'; program: Program; weekday: Weekday }
  | { kind: 'done_today'; program: Program }
  | { kind: 'none' };

const DAY_MS = 86_400_000;

function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function weekdayName(now: number): Weekday {
  const idx = new Date(now).getDay(); // 0 = Sunday
  return WEEK_ORDER[(idx + 6) % 7];
}

function startOfWeek(now: number): number {
  const mondayOffset = (new Date(now).getDay() + 6) % 7;
  return startOfDay(now) - mondayOffset * DAY_MS;
}

export function nextUp(
  programs: Program[],
  sessions: CompletedSession[],
  now: number,
  activeSession: { programId: string } | null = null,
): NextUp {
  if (activeSession) return { kind: 'resume' };

  const today = startOfDay(now);
  const doneToday = new Set(
    sessions.filter((s) => (s.finishedAt ?? 0) >= today).map((s) => s.programId),
  );

  const scheduled = programs.filter((p) => p.scheduleDays.length > 0);
  const todayPrograms = scheduled.filter((p) => p.scheduleDays.includes(weekdayName(now)));

  const pendingToday = todayPrograms.find((p) => !doneToday.has(p.id));
  if (pendingToday) return { kind: 'today', program: pendingToday };

  if (todayPrograms.length > 0) {
    return { kind: 'done_today', program: todayPrograms[0] };
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = WEEK_ORDER[(WEEK_ORDER.indexOf(weekdayName(now)) + offset) % 7];
    const program = scheduled.find((p) => p.scheduleDays.includes(day));
    if (program) return { kind: 'upcoming', program, weekday: day };
  }

  return { kind: 'none' };
}

export interface WeekEntry {
  weekday: Weekday;
  date: number;
  programs: Array<{ program: Program; done: boolean }>;
}

export function weekView(
  programs: Program[],
  sessions: CompletedSession[],
  now: number,
): WeekEntry[] {
  const monday = startOfWeek(now);

  return WEEK_ORDER.map((weekday, i) => {
    const date = monday + i * DAY_MS;
    const dayEnd = date + DAY_MS;
    return {
      weekday,
      date,
      programs: programs
        .filter((p) => p.scheduleDays.includes(weekday))
        .map((program) => ({
          program,
          done: sessions.some(
            (s) =>
              s.programId === program.id &&
              (s.finishedAt ?? 0) >= date &&
              (s.finishedAt ?? 0) < dayEnd,
          ),
        })),
    };
  });
}
