interface Props {
  value: number;
  label: string;
  /** Faint notches: one per set. They only show once the fill has reached them. */
  ticks?: number[];
  /** Strong notches: one per exercise. */
  marks?: number[];
}

export function ProgressBar({ value, label, ticks = [], marks = [] }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={label}
      className="relative h-1 w-full overflow-hidden rounded-full bg-line"
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      {ticks.map((at) => (
        <span
          key={`t${at}`}
          aria-hidden
          data-testid="tick"
          className="absolute inset-y-0 w-px bg-ink/50"
          style={{ left: `${at * 100}%` }}
        />
      ))}
      {marks.map((at) => (
        <span
          key={`m${at}`}
          aria-hidden
          data-testid="mark"
          className="absolute inset-y-0 w-px bg-ink"
          style={{ left: `${at * 100}%` }}
        />
      ))}
    </div>
  );
}
