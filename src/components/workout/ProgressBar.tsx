interface Part {
  value: number;
  ticks?: number[];
  /** Relative width, e.g. how many sets the exercise holds. */
  weight: number;
}

function Track({ value, ticks = [], weight }: { value: number; ticks?: number[]; weight?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="relative h-1 overflow-hidden rounded-full bg-line"
      style={weight == null ? { width: '100%' } : { flexGrow: weight, flexBasis: 0 }}
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      {ticks.map((at) => (
        <span
          key={at}
          aria-hidden
          data-testid="tick"
          className="absolute inset-y-0 w-px bg-ink/50"
          style={{ left: `${at * 100}%` }}
        />
      ))}
    </div>
  );
}

/**
 * One bar for the whole session. With `parts` it becomes a row of chunks — one per
 * exercise, sized by its set count — so the gaps mark where each exercise starts.
 */
export function ProgressBar({
  value,
  label,
  ticks = [],
  parts,
}: {
  value: number;
  label: string;
  ticks?: number[];
  parts?: Part[];
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={label}
      className={parts ? 'flex gap-1' : 'relative h-1 w-full overflow-hidden rounded-full bg-line'}
    >
      {parts ? (
        parts.map((part, i) => (
          <Track key={i} value={part.value} ticks={part.ticks} weight={part.weight} />
        ))
      ) : (
        <Track value={value} ticks={ticks} />
      )}
    </div>
  );
}
