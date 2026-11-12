import { activityGrid, type DayCell } from '../../lib/activity';

const TONES = ['bg-line', 'bg-accent/30', 'bg-accent/60', 'bg-accent'] as const;

function tone(count: number): string {
  return TONES[Math.min(count, TONES.length - 1)];
}

function label(cell: DayCell): string {
  const date = new Date(cell.day).toLocaleDateString();
  if (cell.count === 0) return `${date} · rest`;
  return `${date} · ${cell.count} session${cell.count === 1 ? '' : 's'}`;
}

/**
 * Training days, GitHub style: one column per week, Monday at the top. It sits at
 * the end of the page and never scrolls, so a glance says whether the week
 * happened.
 */
export function ActivityGrid({
  sessions,
  now,
  weeks = 24,
}: {
  sessions: Array<{ finishedAt: number | null }>;
  now: number;
  weeks?: number;
}) {
  const grid = activityGrid(sessions, now, weeks);
  const total = sessions.filter((s) => s.finishedAt != null).length;

  return (
    <section aria-label="Training days" className="shrink-0 border-t border-line pt-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">Last {weeks} weeks</p>
        <p className="text-xs text-muted">
          {total} session{total === 1 ? '' : 's'}
        </p>
      </div>
      <div
        className="mt-2 grid grid-flow-col justify-start gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, 10px)' }}
      >
        {grid.flat().map((cell) => (
          <div
            key={cell.day}
            title={label(cell)}
            className={`h-2.5 w-2.5 rounded-[2px] ${tone(cell.count)}`}
          />
        ))}
      </div>
    </section>
  );
}
