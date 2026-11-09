import { useRef, useState } from 'react';
import { usePrograms } from '../store/programsStore';
import { importBackupFile } from '../lib/importFile';

/**
 * The three ways a program gets here, behind the list's "+": a coach that interviews
 * you, a builder, or a file. Each one is a destination, so this screen is just a door.
 */
export function AddProgram() {
  const load = usePrograms((s) => s.load);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const note = await importBackupFile(file);
      await load();
      usePrograms.setState({ notice: note });
      window.location.hash = '#/programs';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <a
        href="#/paste"
        className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
      >
        <span>
          <span className="block font-medium">Talk to a ChatGPT</span>
          <span className="block text-xs text-muted">
            It interviews you, then sends one link per training day.
          </span>
        </span>
        <span aria-hidden className="text-muted">
          →
        </span>
      </a>

      <a
        href="#/programs/build"
        className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
      >
        <span>
          <span className="block font-medium">Build your own</span>
          <span className="block text-xs text-muted">
            Pick the exercises, set the sets and the days.
          </span>
        </span>
        <span aria-hidden className="text-muted">
          →
        </span>
      </a>

      <button
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left disabled:text-muted"
      >
        <span>
          <span className="block font-medium">Import a program</span>
          <span className="block text-xs text-muted">
            {busy ? 'Reading the file…' : 'A program json, or a whole backup.'}
          </span>
        </span>
        <span aria-hidden className="text-muted">
          ↑
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="A program or backup file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = '';
        }}
      />

      {error && (
        <p
          role="alert"
          className="whitespace-pre-line rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <p className="pt-1 text-xs text-muted">
        Nothing is uploaded. Every program stays in this browser.
      </p>
    </div>
  );
}
