import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EXERCISE_LIBRARY,
  MUSCLE_GROUP_ORDER,
  PATTERN_CUE,
  type LibraryExercise,
  type MuscleGroup,
} from '../../data/exercises';
import { ownFigure } from '../../data/exerciseFigures';
import { fuzzyScore } from '../../lib/fuzzy';
import { formatClock } from '../../lib/format';
import { ExerciseMotion } from '../exercise/ExerciseMotion';

/**
 * The exercise picker: type to filter fzf-style, tap muscle groups to narrow, tap
 * a row to add it. A native <select> cannot do either, and 280 options in a wheel
 * was the thing that made this screen unusable.
 *
 * The ⓘ on each row opens a sheet with the figure, what it works, the default
 * prescription and two lines on how to move — a native <dialog>, so Escape and
 * focus handling come from the browser.
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
  const [preview, setPreview] = useState<LibraryExercise | null>(null);
  /** The row just added: highlighted in the list and named in a toast at the bottom. */
  const [added, setAdded] = useState<{ name: string; at: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (preview && !el.open) el.showModal();
    if (!preview && el.open) el.close();
  }, [preview]);

  const rows = useMemo(() => {
    const matches = EXERCISE_LIBRARY.filter((e) => groups.length === 0 || groups.includes(e.group))
      .map((e) => ({ exercise: e, score: fuzzyScore(query, e.name) }))
      .filter((r): r is { exercise: LibraryExercise; score: number } => r.score !== null);

    matches.sort(
      (a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name),
    );
    return matches.map((r) => r.exercise);
  }, [query, groups]);

  const toggle = (group: MuscleGroup) =>
    setGroups((g) => (g.includes(group) ? g.filter((x) => x !== group) : [...g, group]));

  const add = (name: string) => {
    onPick(name);
    setQuery('');
    setPreview(null);
    // A new object each time, so tapping the same exercise twice still flashes.
    setAdded({ name, at: Date.now() });
  };

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

      <button
        type="button"
        onClick={onNew}
        className="mt-3 h-11 w-full rounded-xl border border-dashed border-line text-sm text-muted"
      >
        + New exercise (my own)
      </button>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing matches “{query.trim()}”. Add it as your own →
        </p>
      ) : (
        <ul
          aria-label="Exercises"
          className="mt-3 max-h-[min(85vh,960px)] divide-y divide-line overflow-y-auto rounded-xl border border-line"
        >
          {rows.map((e) => (
            <li
              key={e.name}
              className={`flex items-stretch transition-colors ${
                added?.name === e.name ? 'bg-accent/15' : 'bg-surface'
              }`}
            >
              <button
                type="button"
                aria-label={e.name}
                onClick={() => add(e.name)}
                className="flex min-h-11 flex-1 items-center justify-between gap-3 py-2 pl-3 text-left text-sm"
              >
                <span className={added?.name === e.name ? 'font-semibold text-accent' : ''}>
                  {e.name}
                </span>
                <span aria-hidden className="shrink-0 text-[11px] text-muted">
                  {e.muscle}
                </span>
              </button>
              <button
                type="button"
                aria-label={`How to do ${e.name}`}
                onClick={() => setPreview(e)}
                className="my-1 mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted"
              >
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-full border border-current text-[11px] font-semibold"
                >
                  i
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {added && (
        <p
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <span className="block rounded-xl bg-field px-3 py-2 text-center text-sm text-accent shadow-lg ring-1 ring-line">
            {added.name} added
          </span>
        </p>
      )}

      <dialog
        ref={dialog}
        aria-label={preview ? `How to do ${preview.name}` : 'Exercise'}
        onClose={() => setPreview(null)}
        onCancel={() => setPreview(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPreview(null);
        }}
        className="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-6 text-[#f5f6f7]"
      >
        {preview && (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{preview.name}</h2>
                <p className="text-xs text-muted">
                  {[preview.muscle, ...preview.also].filter(Boolean).join(' · ')}
                  {preview.equipment && ` — ${preview.equipment}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPreview(null)}
                className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-muted"
              >
                ×
              </button>
            </div>

            {ownFigure(preview.name) && (
              <div className="mx-auto mt-3 max-w-[220px]">
                <ExerciseMotion slug={ownFigure(preview.name)!} />
              </div>
            )}

            <p className="mt-3 text-xs uppercase tracking-widest text-muted">
              {preview.sets} × {preview.repsMin}
              {preview.repsMax > preview.repsMin ? `–${preview.repsMax}` : ''}
              {' · '}
              {formatClock(preview.restSeconds * 1000)} rest
              {preview.perHand && ' · each side'}
            </p>

            <h3 className="mt-4 text-[10px] uppercase tracking-widest text-muted">
              {preview.howto ? 'How to do it' : `Basic ${preview.pattern ?? 'movement'} pattern`}
            </h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
              {(preview.howto ?? (preview.pattern ? PATTERN_CUE[preview.pattern] : [])).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => add(preview.name)}
              className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink"
            >
              Add {preview.name}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
