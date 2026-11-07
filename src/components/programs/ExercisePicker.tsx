import { useMemo, useState } from 'react';
import {
  EXERCISE_LIBRARY,
  MUSCLE_GROUP_ORDER,
  type MuscleGroup,
} from '../../data/exercises';
import { fuzzyScore } from '../../lib/fuzzy';

const VISIBLE = 20;

/**
 * The exercise picker: type to filter fzf-style, tap muscle groups to narrow, tap
 * a row to add it. A native <select> cannot do either, and 280 options in a wheel
 * was the thing that made this screen unusable.
 */
export function ExercisePicker({
  onPick,
  onNew,
}: {
  onPick: (name: string) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<MuscleGroup[]>([]);

  const rows = useMemo(() => {
    const matches = EXERCISE_LIBRARY.filter((e) => groups.length === 0 || groups.includes(e.group))
      .map((e) => ({ exercise: e, score: fuzzyScore(query, e.name) }))
      .filter((r): r is { exercise: (typeof EXERCISE_LIBRARY)[number]; score: number } => r.score !== null);

    matches.sort(
      (a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name),
    );
    return matches.map((r) => r.exercise);
  }, [query, groups]);

  const toggle = (group: MuscleGroup) =>
    setGroups((g) => (g.includes(group) ? g.filter((x) => x !== group) : [...g, group]));

  return (
    <div className="mt-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted">Add an exercise</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
          placeholder={`Search ${EXERCISE_LIBRARY.length} exercises…`}
          autoComplete="off"
          className="mt-1 h-12 w-full rounded-lg bg-field px-3 outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by muscle group">
        {MUSCLE_GROUP_ORDER.map((group) => {
          const on = groups.includes(group);
          return (
            <button
              key={group}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(group)}
              className={`min-h-11 rounded-full border px-3 text-xs ${
                on ? 'border-accent bg-accent font-semibold text-ink' : 'border-line text-muted'
              }`}
            >
              {group}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing matches “{query.trim()}”. Add it as your own →
        </p>
      ) : (
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {rows.slice(0, VISIBLE).map((e) => (
            <li key={e.name}>
              <button
                type="button"
                aria-label={e.name}
                onClick={() => {
                  onPick(e.name);
                  setQuery('');
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 bg-surface px-3 py-2 text-left text-sm"
              >
                <span>{e.name}</span>
                <span aria-hidden className="shrink-0 text-[11px] text-muted">
                  {e.muscle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > VISIBLE && (
        <p className="mt-1 text-center text-[11px] text-muted">
          {rows.length - VISIBLE} more — keep typing or pick a muscle group
        </p>
      )}

      <button
        type="button"
        onClick={onNew}
        className="mt-2 h-11 w-full rounded-xl border border-dashed border-line text-sm text-muted"
      >
        + New exercise (my own)
      </button>
    </div>
  );
}
