import { useRef, useState } from 'react';
import type { Program } from '../engine/types';
import { usePrograms } from '../store/programsStore';
import { ProgramBuilder } from '../components/programs/ProgramBuilder';
import { SyncFromDisk } from '../components/programs/SyncFromDisk';

function weightLabel(e: Program['exercises'][number]): string {
  if (e.weightKg == null) return 'bodyweight';
  return `${e.weightKg} kg${e.perHand ? ' / hand' : ''}`;
}

export function Programs() {
  const { programs, text, preview, issues, duplicateId, notice } = usePrograms();
  const setText = usePrograms((s) => s.setText);
  const save = usePrograms((s) => s.save);
  const remove = usePrograms((s) => s.remove);
  const clear = usePrograms((s) => s.clear);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'paste' | 'build'>('paste');

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">Programs</h1>
        <span className="w-12" />
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2" role="tablist" aria-label="Program source">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'paste'}
          onClick={() => setMode('paste')}
          className={`h-11 rounded-xl border text-sm ${
            mode === 'paste' ? 'border-accent text-white' : 'border-line text-muted'
          }`}
        >
          Paste JSON
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'build'}
          onClick={() => setMode('build')}
          className={`h-11 rounded-xl border text-sm ${
            mode === 'build' ? 'border-accent text-white' : 'border-line text-muted'
          }`}
        >
          Build it
        </button>
      </div>

      {mode === 'build' && <ProgramBuilder onDone={() => setMode('paste')} />}

      <SyncFromDisk />

      {mode === 'paste' && (
        <section className="mt-6">
          <label htmlFor="json" className="text-xs uppercase tracking-widest text-muted">
            Paste program JSON
          </label>
          <textarea
            id="json"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={8}
            placeholder='{ "schema_version": 1, ... }'
            className="mt-2 w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="h-11 flex-1 rounded-xl border border-line bg-surface text-sm"
            >
              Load file
            </button>
            <button
              type="button"
              onClick={clear}
              className="h-11 flex-1 rounded-xl border border-line bg-surface text-sm"
            >
              Clear
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
              e.target.value = '';
            }}
          />
        </section>
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
        <p className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm">{notice}</p>
      )}

      {preview && (
        <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-accent">Preview</p>
          <h2 className="mt-2 text-2xl font-semibold">{preview.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {preview.scheduleDay ? `${preview.scheduleDay} · ` : ''}
            {preview.exercises.length} exercises
            {preview.estimatedDurationMinutes ? ` · ~${preview.estimatedDurationMinutes} min` : ''}
          </p>
          {preview.description && <p className="mt-2 text-sm text-muted">{preview.description}</p>}
          <ul className="mt-4 divide-y divide-line">
            {preview.exercises.map((e) => (
              <li key={e.id} className="py-3">
                <p className="font-medium">{e.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {e.sets} × {e.reps.min}–{e.reps.max} · {weightLabel(e)} · rest {e.restSeconds}s
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void save()}
            className="mt-4 h-14 w-full rounded-xl bg-accent font-semibold text-ink"
          >
            Save program
          </button>
        </section>
      )}

      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-muted">
          Saved ({programs.length})
        </p>
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
                    {p.exercises.length} exercises · {p.scheduleDay ?? 'unscheduled'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setText(p.raw)}
                    className="h-9 rounded-lg border border-line px-3 text-xs"
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
                    className="h-9 rounded-lg border border-line px-3 text-xs text-danger"
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
