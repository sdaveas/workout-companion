import type { Weekday } from '../../engine/types';
import { formatDay } from '../../lib/format';

const DAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** Monday-first day chips; tapping a day toggles it. Empty means "no fixed routine". */
export function DayChips({
  days,
  onChange,
  readOnly = false,
}: {
  days: Weekday[];
  onChange: (days: Weekday[]) => void;
  /** Same chips, same size, not tappable — the read view keeps the slot the edit view uses. */
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scheduled day">
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}
              className={`min-h-11 min-w-11 rounded-full border px-3 text-xs disabled:opacity-100 ${
                on ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted'
              }`}
            >
              {formatDay(d).slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {days.length === 0
          ? 'Any day — no fixed routine.'
          : readOnly
            ? 'Scheduled days.'
            : 'Tap again to remove a day.'}
      </p>
    </div>
  );
}
