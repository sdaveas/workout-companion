import { useRef, useState, type KeyboardEvent } from 'react';
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

/** One day up or down, one week left or right. */
const STEPS: Record<string, number> = {
  ArrowUp: -1,
  ArrowDown: 1,
  ArrowLeft: -7,
  ArrowRight: 7,
};

/**
 * Training days, GitHub style: one column per week, Monday at the top, months
 * along the top edge. A cell is a button: tapping a day filters the list under
 * it, tapping it again clears.
 *
 * The grid is one tab stop, not 126: only the cursor cell is in the tab order and
 * the arrows walk it, so History's first row is a Tab away instead of 130 of them.
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
  const cells = grid.flat();
  // Today is the last day there is anything to say about; later cells are invisible.
  const last = cells.reduce((found, cell, i) => (cell.day <= today ? i : found), 0);
  const [cursor, setCursor] = useState(last);
  const board = useRef<HTMLDivElement>(null);

  // Nothing has been logged yet: 126 grey squares would be the loudest thing on the
  // screen, and the screen already has a sentence saying there is nothing here.
  if (!sessions.some((session) => session.finishedAt != null)) return null;

  const at = Math.min(cursor, last);

  function move(event: KeyboardEvent) {
    const step = STEPS[event.key];
    if (step == null) return;
    event.preventDefault();
    const next = Math.min(Math.max(at + step, 0), last);
    setCursor(next);
    board.current?.querySelector<HTMLElement>(`[data-i="${next}"]`)?.focus();
  }

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
                // Pinned to the single label row: auto-placement would wrap one to a
                // second row, which then printed through the cells below.
                style={{
                  gridColumn: `${month.index + 1} / span 3`,
                  gridRow: 1,
                }}
                className="whitespace-nowrap"
              >
                {month.label}
              </span>
            ))}
          </div>

          <div
            ref={board}
            className="grid grid-flow-col gap-[2px]"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }}
            onKeyDown={move}
            // Clicking or tabbing a cell moves the cursor with it, so the next Tab
            // comes back here rather than to today.
            onFocus={(event) => {
              const i = Number((event.target as HTMLElement).dataset.i);
              if (!Number.isNaN(i)) setCursor(i);
            }}
          >
            {cells.map((cell, i) => {
              const look = `rounded-[3px] ${tone(cell.count)} ${
                selected === cell.day ? 'ring-1 ring-accent' : ''
              } ${cell.day > today ? 'invisible' : ''}`;
              return onSelect ? (
                <button
                  key={cell.day}
                  type="button"
                  data-i={i}
                  tabIndex={i === at ? 0 : -1}
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
