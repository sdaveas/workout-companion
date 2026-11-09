import { useState } from 'react';
import { useHashRoute } from '../hooks/useHashRoute';
import type { Program } from '../engine/types';
import { usePrograms } from '../store/programsStore';
import { formatDays } from '../lib/format';
import { ProgramBuilder } from '../components/programs/ProgramBuilder';
import { AddProgram } from './AddProgram';
import { SyncFromDisk } from '../components/programs/SyncFromDisk';
import { NameConflict } from '../components/programs/NameConflict';
import { suggestedName } from '../lib/identity';
import { shareProgram } from '../lib/shareProgram';

export function Programs() {
  const programs = usePrograms((s) => s.programs);
  const remove = usePrograms((s) => s.remove);
  const clear = usePrograms((s) => s.clear);
  const notice = usePrograms((s) => s.notice);
  const issues = usePrograms((s) => s.issues);
  const conflict = usePrograms((s) => s.conflict);
  const preview = usePrograms((s) => s.preview);
  const save = usePrograms((s) => s.save);
  const [editing, setEditing] = useState<Program | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const route = useHashRoute();
  // #/programs/build is the builder, #/programs/new the three ways in,
  // #/programs is the list of saved programs.
  const building = route.param === 'build';
  const adding = route.param === 'new';
  const others = editing ? programs.filter((p) => p.id !== editing.id) : programs;

  const build = (program?: Program) => {
    setEditing(program ?? null);
    window.location.hash = '#/programs/build';
  };

  async function share(program: Program) {
    setShared(null);
    try {
      const note = await shareProgram(program);
      if (note) setShared(note);
    } catch (err) {
      setShared(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a
          href={building && !editing ? '#/programs/new' : adding || building ? '#/programs' : '#/'}
          onClick={() => setEditing(null)}
          className="flex min-h-11 min-w-11 items-center text-sm text-muted"
        >
          {building && !editing ? '← Add a program' : adding || building ? '← Programs' : '← Home'}
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">
          {building ? (editing ? 'Edit program' : 'New program') : adding ? 'Add a program' : 'Programs'}
        </h1>
        {building || adding ? (
          <span className="w-12" />
        ) : (
          <a
            href="#/programs/new"
            aria-label="Add a program"
            onClick={() => setEditing(null)}
            className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xl leading-none ${
              programs.length === 0
                ? 'border-accent bg-accent font-semibold text-ink'
                : 'border-line text-accent'
            }`}
          >
            +
          </a>
        )}
      </header>

      {adding && <AddProgram />}

      {building && (
        <ProgramBuilder
          key={editing?.id ?? 'new'}
          initial={editing ?? undefined}
          onDone={() => {
            setEditing(null);
            window.location.hash = '#/programs';
          }}
        />
      )}

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

      {building && conflict && preview && (
        <NameConflict
          taken={conflict}
          // Only the program being edited is not a clash with itself.
          existingNames={others.map((p) => p.name)}
          suggested={suggestedName(preview, others)}
          busy={busy}
          onSave={(name) => {
            setBusy(true);
            void save({ update: editing != null, name })
              .then((ok) => {
                // land on the list so the new copy is visible straight away
                if (ok) {
                  setEditing(null);
                  window.location.hash = '#/programs';
                }
              })
              .finally(() => setBusy(false));
          }}
        />
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
                window.location.hash = '#/programs/new';
              }}
              className="h-11 flex-1 rounded-lg border border-line text-sm"
            >
              Add another
            </button>
          </div>
        </section>
      )}

      {!building && !adding && <SyncFromDisk />}

      {!building && !adding && (
      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-muted">Saved ({programs.length})</p>
        {shared && (
          <p role="status" className="mt-2 text-xs text-accent">
            {shared}
          </p>
        )}
        {programs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing saved yet. Tap + to add one.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {programs.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <a href={`#/program/${p.id}`} className="min-w-0 flex-1 py-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.exercises.length} exercises · {formatDays(p.scheduleDays)}
                  </p>
                </a>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void share(p)}
                    className="h-11 rounded-lg border border-line px-3 text-xs"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => build(p)}
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
      )}
    </main>
  );
}
