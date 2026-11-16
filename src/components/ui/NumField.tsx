/**
 * A small number input: 44px tall so a thumb can hit it, centred digits so a column of
 * them reads as a table, and select-on-focus so typing replaces instead of appending.
 */
export function NumField({
  label,
  value,
  onChange,
  min = 0,
  max,
  inputRef,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-11 w-full rounded-lg bg-field px-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}
