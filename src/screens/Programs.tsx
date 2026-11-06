import { useState } from 'react';
import type { Program } from '../engine/types';
import { usePrograms } from '../store/programsStore';
import { formatDay } from '../lib/format';
import { ProgramBuilder } from '../components/programs/ProgramBuilder';
import { SyncFromDisk } from '../components/programs/SyncFromDisk';

export function Programs() {
  const programs = usePrograms((s) => s.programs);
  const remove = usePrograms((s) => s.remove);
  const clear = usePrograms((s) => s.clear);
  const notice = usePrograms((s) => s.notice);
  const issues = usePrograms((s) => s.issues);
  const duplicateId = usePrograms((s) => s.duplicateId);
  const save = usePrograms((s) => s.save);
  const [editing, setEditing] = useState<Program | null>(null);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="flex min-h-11 min-w-11 items-center text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">Programs</h1>
        <span className="w-12" />
      </header>

      <ProgramBuilder
        key={editing?.id ?? 'new'}
        initial={editing ?? undefined}
        onDone={() => setEditing(null)}
      />

      <SyncFromDisk />

      {issues.length > 0 && (
        <section className="mt-5 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">Invalid program</p>
          <ul className="mt-2 space-y-1">
            {issues.map((i, n) => (
              <li key={n} className="font-mono text-xs text-danger/90">
                {i.path ? `${i.path}: ${i.message}` : i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {duplicateId && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm">
            A program with id <span className="font-mono">{duplicateId}</span> already exists.
          </p>
          <button
            type="button"
            onClick={() => void save(true)}
            className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-ink"
          >
            Replace it
          </button>
        </section>
      )}

      {notice && (
        <section
          role="status"
          aria-live="polite"
          className="mt-5 rounded-xl border border-accent/50 bg-surface p-4"
        >
          <p className="text-sm">{notice}</p>
          <div className="mt-3 flex gap-2">
            <a
              href="#/"
              className="flex h-11 flex-1 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-ink"
            >
              Back home
            </a>
            <button
              type="button"
              onClick={() => {
                clear();
                setEditing(null);
              }}
              className="h-11 flex-1 rounded-lg border border-line text-sm"
            >
              Add another
            </button>
          </div>
        </section>
      )}

      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-muted">Saved ({programs.length})</p>
        {programs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {programs.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.exercises.length} exercises · {formatDay(p.scheduleDay)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="h-11 rounded-lg border border-line px-3 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? Session history is kept.`)) {
                        void remove(p.id);
                      }
                    }}
                    className="h-11 rounded-lg border border-line px-3 text-xs text-danger"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
