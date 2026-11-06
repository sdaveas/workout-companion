import { useEffect, useRef, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { buildBackup, parseBackup } from '../lib/backup';
import { downloadJson } from '../lib/exportHistory';
import { mergeBackup } from '../storage/backup';
import { countSessions, loadAllSessions } from '../storage/sessions';
import { Banner } from '../components/ui/Banner';

export function Settings() {
  const programs = usePrograms((s) => s.programs);
  const loadPrograms = usePrograms((s) => s.load);
  const loadHistory = useSession((s) => s.loadHistory);
  const [sessions, setSessions] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void countSessions().then(setSessions).catch(() => setSessions(null));
  }, [programs.length]);

  async function exportBackup() {
    setError(null);
    try {
      const rows = await loadAllSessions();
      downloadJson(
        'workout-companion-backup.json',
        buildBackup(programs, rows, now),
      );
      setNotice(
        `Exported ${programs.length} program${programs.length === 1 ? '' : 's'} and ${rows.length} session${
          rows.length === 1 ? '' : 's'
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importFile(file: File) {
    setError(null);
    setNotice(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      const counts = await mergeBackup(parsed.programs, parsed.sessions);
      await loadPrograms();
      await loadHistory();
      setSessions(await countSessions());
      setNotice(
        `Imported ${counts.programs} program${counts.programs === 1 ? '' : 's'} and ${counts.sessions} session${
          counts.sessions === 1 ? '' : 's'
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="flex min-h-11 min-w-11 items-center text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">Settings</h1>
        <span className="w-12" />
      </header>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">On this phone</p>
        <p className="mt-2 text-sm">
          {programs.length} program{programs.length === 1 ? '' : 's'} ·{' '}
          {sessions == null ? '…' : sessions} session{sessions === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-xs text-muted">
          Everything is stored locally. A backup is the only way to move it.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">Backup</p>
        <p className="mt-2 text-sm text-muted">
          The file holds every program and every session. Importing merges by id: new items are
          added, matching ones are updated, nothing is deleted.
        </p>

        <button
          type="button"
          onClick={() => void exportBackup()}
          className="mt-4 h-14 w-full rounded-xl bg-accent font-semibold text-ink"
        >
          Export backup
        </button>

        <input
          ref={fileInput}
          id="backup-file"
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
        <label
          htmlFor="backup-file"
          className="mt-2 flex h-14 w-full items-center justify-center rounded-xl border border-line text-sm"
        >
          Import a file
        </label>
        <p className="mt-2 text-center text-xs text-muted">
          A backup, or a single program JSON
        </p>
      </section>

      {error && <Banner message={error} onDismiss={() => setError(null)} />}

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-accent/50 bg-surface px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}

      <a href="#/programs" className="mt-6 flex h-11 items-center justify-center text-xs text-muted underline">
        Manage programs
      </a>
      <a href="#/history" className="mt-1 flex h-11 items-center justify-center text-xs text-muted underline">
        Session history
      </a>
    </main>
  );
}
