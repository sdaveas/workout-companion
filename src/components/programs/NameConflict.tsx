import { useState } from 'react';
import { sameName } from '../../lib/identity';

/**
 * Shown whenever a save would reuse a name that is already saved. The user picks the name;
 * the program is written beside the existing one instead of replacing it.
 */
export function NameConflict({
  taken,
  existingNames,
  suggested,
  busy,
  onSave,
}: {
  taken: string;
  existingNames: readonly string[];
  suggested: string;
  busy?: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(suggested);
  const trimmed = name.trim();
  const clash = trimmed.length > 0 && existingNames.some((n) => sameName(n, trimmed));

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm">
        A program called <span className="font-semibold">{taken}</span> already exists.
      </p>
      <p className="mt-1 text-xs text-muted">
        Give this one another name and it is saved next to the original — nothing is overwritten.
      </p>

      <label className="mt-3 block">
        <span className="text-[10px] uppercase tracking-widest text-muted">New name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={clash}
          className="mt-1 h-12 w-full rounded-lg bg-field px-3 outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      {clash && <p className="mt-2 text-xs text-danger">“{trimmed}” is taken as well.</p>}

      <button
        type="button"
        disabled={!trimmed || clash || busy}
        onClick={() => onSave(trimmed)}
        className="mt-3 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
      >
        Save with this name
      </button>
    </section>
  );
}
