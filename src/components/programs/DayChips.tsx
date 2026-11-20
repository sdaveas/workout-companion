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
      {/* U11: six 44 px chips plus gaps is 368 in a 350 gutter, so Sunday wrapped to a
          second line and the row cost 50 px it did not have. Seven equal columns keep
          the week on one line at every viewport; 45 px is still a full thumb target. */}
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Scheduled day">
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}
              className={`min-h-11 min-w-0 rounded-full border px-0 text-label disabled:opacity-100 ${
                on ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted'
              }`}
            >
              {formatDay(d).slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-body text-muted">
        {days.length === 0
          ? 'Any day — no fixed routine.'
          : readOnly
            ? 'Scheduled days.'
            : 'Tap again to remove a day.'}
      </p>
    </div>
  );
}
