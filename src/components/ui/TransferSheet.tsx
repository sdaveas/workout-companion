import { useEffect, useRef, useState } from 'react';
import { exportParts, importFromDrive, importParts, type Parts } from '../../lib/transfer';

function Check({
  on,
  label,
  hint,
  onChange,
}: {
  on: boolean;
  label: string;
  hint: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex h-14 cursor-pointer items-center gap-3 rounded-xl border border-line px-4">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Import or export, in one place: tick what travels, then pick the door. The
 * checkboxes decide both the file name and what is read back, so a
 * programs-only copy can never overwrite the one with history in it.
 */
export function TransferSheet({
  mode,
  now,
  initial,
  onClose,
}: {
  mode: 'import' | 'export';
  now: number;
  /** What is already ticked; a history screen starts with history only. */
  initial?: Parts;
  onClose: () => void;
}) {
  const [programs, setPrograms] = useState(initial?.programs ?? true);
  const [history, setHistory] = useState(initial?.history ?? true);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  // A native modal bottom sheet: it traps focus, dims the page and gives Esc, a tap
  // outside and focus return for free. The parent unmounts it on close, so the opener
  // has to be remembered here: the browser's own restore needs the dialog to survive.
  useEffect(() => {
    const dialog = sheet.current;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog) return;
    // StrictMode runs this twice; a second showModal on an open dialog throws.
    if (!dialog.open) dialog.showModal();
    return () => opener?.focus();
  }, []);

  const parts: Parts = { programs, history };
  const none = !programs && !history;
  const busyNow = busy !== null;

  async function run(what: string, work: () => Promise<string | null>) {
    setError(null);
    setResult(null);
    setBusy(what);
    try {
      const message = await work();
      setResult(message ?? 'There is no copy in Google Drive for that yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={sheet}
      aria-label={mode === 'import' ? 'Import' : 'Export'}
      // Esc and the backdrop both land here; the parent owns whether the sheet exists.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] mt-auto w-[calc(100%-2.5rem)] max-w-md rounded-2xl border border-line bg-surface p-0 [&::backdrop]:bg-black/60"
    >
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest">
            {mode === 'import' ? 'Import' : 'Export'}
          </h2>
          <button type="button" onClick={() => sheet.current?.close()} className="text-sm text-muted">
            Cancel
          </button>
        </div>

        <p className="mt-3 text-xs uppercase tracking-widest text-muted">What</p>
        <div className="mt-2 space-y-2">
          <Check
            on={programs}
            label="Programs"
            hint="Names, exercises, sets and the schedule"
            onChange={setPrograms}
          />
          <Check on={history} label="History" hint="Every finished session" onChange={setHistory} />
        </div>

        <p className="mt-3 text-xs uppercase tracking-widest text-muted">
          {mode === 'import' ? 'From' : 'To'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={none || busyNow}
            onClick={() =>
              void run('drive', () =>
                mode === 'export' ? exportParts(parts, 'drive', now) : importFromDrive(parts),
              )
            }
            className="h-12 rounded-xl bg-accent text-sm font-semibold text-ink disabled:opacity-40"
          >
            {busy === 'drive' ? 'Working…' : 'Google Drive'}
          </button>
          <button
            type="button"
            disabled={none || busyNow}
            onClick={() => {
              if (mode === 'export') void run('file', () => exportParts(parts, 'file', now));
              else fileInput.current?.click();
            }}
            className="h-12 rounded-xl border border-line text-sm disabled:opacity-40"
          >
            {busy === 'file' ? 'Working…' : 'File'}
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void run('file', () => importParts(parts, file));
          }}
        />

        {result && (
          <p role="status" className="mt-3 rounded-xl border border-accent/50 px-3 py-2 text-sm">
            {result}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-danger/50 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
