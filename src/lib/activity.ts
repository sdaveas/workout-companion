export interface DayCell {
  /** Local midnight of the day. */
  day: number;
  count: number;
}

export function dayKey(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar arithmetic, not +86_400_000: a DST day is 23 or 25 hours long. */
function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

/**
 * One column per week, Monday first, oldest week on the left. Finished sessions
 * only: a session still in progress has no day to claim yet.
 */
export function activityGrid(
  sessions: Array<{ finishedAt: number | null }>,
  now: number,
  weeks = 18,
): DayCell[][] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    if (s.finishedAt == null) continue;
    const key = dayKey(s.finishedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = dayKey(now);
  const backToMonday = (new Date(today).getDay() + 6) % 7;
  const start = addDays(today, -backToMonday - (weeks - 1) * 7);

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      return { day, count: counts.get(day) ?? 0 };
    }),
  );
}

/** A month label is three columns wide. */
const LABEL_COLUMNS = 3;

/**
 * The month a column starts in, once per month, so the axis stays readable.
 *
 * A month that starts a column or two after the last label is dropped: its text would
 * sit on top of the previous one, and in the grid it wrapped onto a second row and
 * printed through the cells below.
 */
export function monthLabels(grid: DayCell[][]): Array<{ index: number; label: string }> {
  const labels: Array<{ index: number; label: string }> = [];
  let last = -1;
  for (const [index, column] of grid.entries()) {
    const first = column[0].day;
    const month = new Date(first).getMonth();
    if (month === last) continue;
    // The month is noted either way; only the label is skipped.
    last = month;
    if (labels.length > 0 && index - labels[labels.length - 1].index < LABEL_COLUMNS) continue;
    labels.push({
      index,
      label: new Date(first).toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return labels;
}
