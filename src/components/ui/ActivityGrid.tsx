import { activityGrid, dayKey, monthLabels, type DayCell } from '../../lib/activity';

const TONES = ['bg-line', 'bg-accent/30', 'bg-accent/60', 'bg-accent'] as const;
const WEEKS = 18;
const CELL = 14;

function tone(count: number): string {
  return TONES[Math.min(count, TONES.length - 1)];
}

function label(cell: DayCell): string {
  const date = new Date(cell.day).toLocaleDateString();
  if (cell.count === 0) return `${date} · rest`;
  return `${date} · ${cell.count} session${cell.count === 1 ? '' : 's'}`;
}

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * Training days, GitHub style: one column per week, Monday at the top, months
 * along the top edge. A cell is a button: tapping a day filters the list under
 * it, tapping it again clears.
 */
export function ActivityGrid({
  sessions,
  now,
  selected = null,
  onSelect,
}: {
  sessions: Array<{ finishedAt: number | null }>;
  now: number;
  selected?: number | null;
  /** Absent means the grid is a picture, not a filter. */
  onSelect?: (day: number) => void;
}) {
  const grid = activityGrid(sessions, now, WEEKS);
  const months = monthLabels(grid);
  const today = dayKey(now);

  return (
    <section aria-label="Training days" className="shrink-0">
      <div className="flex gap-2">
        <div
          className="flex flex-col gap-[2px] pt-[18px] text-[10px] leading-none text-muted"
          aria-hidden
        >
          {WEEKDAYS.map((name, i) => (
            <span key={i} style={{ height: CELL }} className="flex items-center">
              {name}
            </span>
          ))}
        </div>

        <div className="min-w-0">
          <div
            className="grid h-4 gap-[2px] text-[10px] leading-none text-muted"
            style={{ gridTemplateColumns: `repeat(${WEEKS}, ${CELL}px)` }}
            aria-hidden
          >
            {months.map((month) => (
              <span
                key={month.index}
                style={{ gridColumn: `${month.index + 1} / span 3` }}
                className="whitespace-nowrap"
              >
                {month.label}
              </span>
            ))}
          </div>

          <div
            className="grid grid-flow-col gap-[2px]"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }}
          >
            {grid.flat().map((cell) => {
              const look = `rounded-[3px] ${tone(cell.count)} ${
                selected === cell.day ? 'ring-1 ring-accent' : ''
              } ${cell.day > today ? 'invisible' : ''}`;
              return onSelect ? (
                <button
                  key={cell.day}
                  type="button"
                  onClick={() => onSelect(cell.day)}
                  aria-label={label(cell)}
                  aria-pressed={selected === cell.day}
                  style={{ width: CELL, height: CELL }}
                  className={look}
                />
              ) : (
                <div
                  key={cell.day}
                  title={label(cell)}
                  style={{ width: CELL, height: CELL }}
                  className={look}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
